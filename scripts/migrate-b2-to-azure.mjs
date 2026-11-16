import { createHash } from 'node:crypto';
import { Transform, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import {
  S3Client, ListObjectsV2Command, GetObjectCommand,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { BlobServiceClient } from '@azure/storage-blob';
import { createBackblazeHttpsAgent } from '../server/src/services/b2HttpAgent.js';
import { azureCredential } from '../server/src/services/azureStorageTest.js';

const READ_CHUNK_SIZE = 4 * 1024 * 1024;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function required(settings, key, label) {
  const value = String(settings[key] || '').trim();
  if (!value) throw new Error(`Missing ${label} configuration.`);
  return value;
}

function makeClients(settings) {
  const endpoint = new URL(required(settings, 'storage.endpoint', 'Backblaze endpoint'));
  const region = required(settings, 'storage.region', 'Backblaze region');
  const bucket = required(settings, 'storage.bucket', 'Backblaze bucket');
  const account = required(settings, 'storage.azureAccount', 'Azure account');
  const containerName = required(settings, 'storage.azureContainer', 'Azure container');
  const keyId = required(settings, 'storage.keyId', 'Backblaze key ID');
  const applicationKey = required(settings, 'storage.applicationKey', 'Backblaze application key');
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== `s3.${region}.backblazeb2.com`) {
    throw new Error('Backblaze endpoint and region do not match.');
  }
  if (settings['storage.azureAuthentication'] !== 'connection-string') throw new Error('Azure migration requires connection-string authentication.');
  const credential = azureCredential(settings, account);
  if (!credential) throw new Error('Azure connection string does not match the configured storage account.');

  return {
    bucket,
    containerName,
    sourceOptions: {
      endpoint: endpoint.origin, region, forcePathStyle: true,
      credentials: { accessKeyId: keyId, secretAccessKey: applicationKey }, maxAttempts: 2,
      requestHandler: new NodeHttpHandler({ httpsAgent: createBackblazeHttpsAgent() }),
    },
    target: new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential, {
      retryOptions: { maxTries: 2 },
    }).getContainerClient(containerName),
  };
}

async function listSource(client, bucket) {
  const items = new Map();
  let continuationToken;
  do {
    const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }));
    for (const item of result.Contents || []) {
      if (item.Key) items.set(item.Key, { key: item.Key, size: Number(item.Size || 0), lastModified: item.LastModified?.toISOString() || null });
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return items;
}

async function listTarget(container) {
  const items = new Map();
  for await (const item of container.listBlobsFlat({ includeMetadata: true })) {
    items.set(item.name, {
      key: item.name,
      size: Number(item.properties.contentLength || 0),
      contentType: item.properties.contentType || '',
      cacheControl: item.properties.cacheControl || '',
      contentDisposition: item.properties.contentDisposition || '',
      contentEncoding: item.properties.contentEncoding || '',
      contentLanguage: item.properties.contentLanguage || '',
      metadata: item.metadata || {},
    });
  }
  return items;
}

async function hashStream(stream) {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    hash.update(bytes);
  }
  return { size, sha256: hash.digest('hex') };
}

function trackedStream(stream) {
  const hash = createHash('sha256');
  let size = 0;
  const output = new Transform({
    transform(chunk, _encoding, callback) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      hash.update(bytes);
      callback(null, bytes);
    },
  });
  output.result = () => ({ size, sha256: hash.digest('hex') });
  Readable.from(stream).pipe(output);
  return output;
}

async function sourceProperties(client, bucket, key) {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return { response, headers: {
    contentType: response.ContentType || '',
    cacheControl: response.CacheControl || '',
    contentDisposition: response.ContentDisposition || '',
    contentEncoding: response.ContentEncoding || '',
    contentLanguage: response.ContentLanguage || '',
    metadata: Object.fromEntries(Object.entries(response.Metadata || {}).map(([name, value]) => [name.toLowerCase(), value])),
  } };
}

function azureHeaders(headers) {
  return {
    blobContentType: headers.contentType || undefined,
    blobCacheControl: headers.cacheControl || undefined,
    blobContentDisposition: headers.contentDisposition || undefined,
    blobContentEncoding: headers.contentEncoding || undefined,
    blobContentLanguage: headers.contentLanguage || undefined,
  };
}

function normalizedHeaders(headers) {
  return JSON.stringify({
    contentType: headers.contentType || '', cacheControl: headers.cacheControl || '',
    contentDisposition: headers.contentDisposition || '', contentEncoding: headers.contentEncoding || '',
    contentLanguage: headers.contentLanguage || '',
    metadata: Object.fromEntries(Object.entries(headers.metadata || {}).sort(([a], [b]) => a.localeCompare(b))),
  });
}

async function verifyPair(sourceClient, container, bucket, key, destinationProperties) {
  const { response, headers } = await sourceProperties(sourceClient, bucket, key);
  const sourceHash = await hashStream(response.Body);
  const blob = container.getBlobClient(key);
  const destination = await blob.download();
  if (!destination.readableStreamBody) throw new Error('Azure returned no readable blob body.');
  const destinationHash = await hashStream(destination.readableStreamBody);
  const sameHeaders = normalizedHeaders(headers) === normalizedHeaders({
    contentType: destinationProperties.contentType,
    cacheControl: destinationProperties.cacheControl,
    contentDisposition: destinationProperties.contentDisposition,
    contentEncoding: destinationProperties.contentEncoding,
    contentLanguage: destinationProperties.contentLanguage,
    metadata: destinationProperties.metadata,
  });
  const ok = sourceHash.size === destinationHash.size && sourceHash.sha256 === destinationHash.sha256 && sameHeaders;
  return { ok, size: sourceHash.size, sha256: sourceHash.sha256, destinationSize: destinationHash.size };
}

async function copyOne(sourceClient, container, bucket, item) {
  const { response, headers } = await sourceProperties(sourceClient, bucket, item.key);
  const blob = container.getBlockBlobClient(item.key);
  const stream = trackedStream(response.Body);
  try {
    await blob.uploadStream(stream, READ_CHUNK_SIZE, 2, {
      blobHTTPHeaders: azureHeaders(headers),
      metadata: headers.metadata,
      conditions: { ifNoneMatch: '*' },
    });
    return stream.result();
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

function entry(key, size, status, extra = {}) {
  return { sourceKey: key, destinationKey: key, size: Number(size || 0), status, copied: status === 'copied', ...extra };
}

export async function migrateMediaToAzure({ copy = false } = {}, {
  settings,
  onStage = async () => {},
  onRecord = async () => {},
  ClientFactory = options => new S3Client(options),
} = {}) {
  if (!settings) throw new Error('Migration settings are required.');
  const clients = makeClients(settings);
  const source = ClientFactory(clients.sourceOptions);
  const container = clients.target;
  const totals = { sourceFiles: 0, sourceBytes: 0, copied: 0, copiedBytes: 0, verified: 0, verifiedBytes: 0, unresolved: 0, missing: 0 };
  const verifiedKeys = new Set();
  try {
    await onStage('Checking Backblaze and private Azure access');
    const containerProperties = await container.getProperties();
    if (containerProperties.blobPublicAccess) throw new Error('Azure migration target container must be private.');
    await onStage('Listing Backblaze source objects');
    const sourceItems = await listSource(source, clients.bucket);
    await onStage('Listing Azure destination objects');
    const targetItems = await listTarget(container);
    totals.sourceFiles = sourceItems.size;
    totals.sourceBytes = [...sourceItems.values()].reduce((sum, item) => sum + item.size, 0);

    for (const item of sourceItems.values()) {
      let record;
      const existing = targetItems.get(item.key);
      if (!existing && !copy) {
        totals.missing++;
        totals.unresolved++;
        record = entry(item.key, item.size, 'missing_in_azure');
      } else {
        try {
          if (!existing && copy) {
            const copied = await copyOne(source, container, clients.bucket, item);
            totals.copied++;
            totals.copiedBytes += copied.size;
            const properties = await container.getBlobClient(item.key).getProperties();
            const target = {
              size: Number(properties.contentLength || 0), contentType: properties.contentType || '',
              cacheControl: properties.cacheControl || '', contentDisposition: properties.contentDisposition || '',
              contentEncoding: properties.contentEncoding || '', contentLanguage: properties.contentLanguage || '',
              metadata: properties.metadata || {},
            };
            const verified = await verifyPair(source, container, clients.bucket, item.key, target);
            if (!verified.ok) throw new Error('Copied object did not match its Backblaze source.');
            totals.verified++;
            totals.verifiedBytes += verified.size;
            verifiedKeys.add(item.key);
            record = entry(item.key, verified.size, 'copied', { sha256: verified.sha256 });
          } else {
            const verified = await verifyPair(source, container, clients.bucket, item.key, existing);
            if (!verified.ok) {
              totals.unresolved++;
              record = entry(item.key, verified.size, 'collision_or_mismatch', { sha256: verified.sha256, destinationSize: existing.size });
            } else {
              totals.verified++;
              totals.verifiedBytes += verified.size;
              verifiedKeys.add(item.key);
              record = entry(item.key, verified.size, 'verified', { sha256: verified.sha256 });
            }
          }
        } catch (error) {
          totals.unresolved++;
          record = entry(item.key, item.size, 'error', { error: error?.name || 'MigrationError' });
        }
      }
      await onRecord(record);
    }

    for (const item of targetItems.values()) {
      if (sourceItems.has(item.key)) continue;
      totals.unresolved++;
      await onRecord(entry(item.key, item.size, 'azure_only'));
    }
    await onStage('Backblaze to Azure object verification complete');
    return { totals, verifiedKeys };
  } finally {
    source.destroy();
  }
}

async function runCli() {
  dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
  const args = process.argv.slice(2);
  const manifestIndex = args.indexOf('--manifest');
  const manifestPath = manifestIndex >= 0 ? args[manifestIndex + 1] : null;
  const copy = args.includes('--copy');
  const audit = args.includes('--audit-references');
  if (manifestIndex >= 0 && (!manifestPath || manifestPath.startsWith('--'))) throw new Error('Provide a file path after --manifest.');
  const { config } = await import('../server/src/config/index.js');
  const { prepareRuntime } = await import('../server/src/services/runtimeConfiguration.js');
  const { ensureSupabaseConfigured, checkBetterGetafeSchema } = await import('../server/src/config/supabaseSetup.js');
  const setup = await ensureSupabaseConfigured();
  if (setup.cancelled) return;
  await checkBetterGetafeSchema(setup.url);
  config.prepare = prepareRuntime;
  await config.load(true);
  const lines = [];
  const result = await migrateMediaToAzure({ copy }, {
    settings: config.values,
    onStage: stage => { console.info(`[Migration] ${stage}.`); },
    onRecord: record => { lines.push(record); },
  });
  if (manifestPath) {
    const target = path.resolve(manifestPath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, lines.map(line => JSON.stringify(line)).join('\n') + '\n', { mode: 0o600 });
    console.info(`[Migration] Manifest saved to ${target}. Object keys may identify private media; store it securely.`);
  }
  if (audit) {
    const { auditAzureMigrationReferences } = await import('../server/src/services/mediaMigration.js');
    const cms = await (await import('../server/src/services/database.js')).getCmsPool();
    const findings = await auditAzureMigrationReferences(result.verifiedKeys, config.values['storage.bucket'], config.values, cms);
    console.info(`[Migration] PostgreSQL reference findings: ${findings.findings.reduce((sum, item) => sum + item.count, 0)}.`);
  }
  console.info(`[Migration] Summary: ${JSON.stringify(result.totals)}`);
  if (result.totals.missing || result.totals.unresolved) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch(error => {
    console.error(`[Migration] ${error.message}`);
    process.exitCode = 1;
  });
}
