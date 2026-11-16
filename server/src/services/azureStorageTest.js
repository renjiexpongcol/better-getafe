import { randomUUID } from 'node:crypto';
import { ManagedIdentityCredential } from '@azure/identity';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';

export function azureCredential(values, account) {
  if (values['storage.azureAuthentication'] === 'managed-identity') return new ManagedIdentityCredential();
  const connectionString = values['storage.azureConnectionString'];
  if (!connectionString?.trim()) throw new Error('Set AZURE_STORAGE_CONNECTION_STRING or save the Azure connection string in Storage settings.');
  const fields = new Map(connectionString.split(';').filter(part => part.includes('=')).map(part => {
    const equals = part.indexOf('=');
    return [part.slice(0, equals).trim().toLowerCase(), part.slice(equals + 1).trim()];
  }));
  const key = fields.get('accountkey');
  const endpoint = fields.get('blobendpoint');
  if (fields.get('accountname') !== account || !key || !/^[A-Za-z0-9+/]+={0,2}$/.test(key)
      || (endpoint && ![ `https://${account}.blob.core.windows.net`, `https://${account}.blob.core.windows.net/` ].includes(endpoint))
      || (fields.has('endpointsuffix') && fields.get('endpointsuffix') !== 'core.windows.net')
      || (fields.has('defaultendpointsprotocol') && fields.get('defaultendpointsprotocol') !== 'https')) return null;
  return new StorageSharedKeyCredential(account, key);
}

function failureMessage(error) {
  if (error.statusCode === 404) return 'Check that the account and private container exist.';
  if (error.code === 'KeyBasedAuthenticationNotPermitted') return 'Shared Key access is disabled. Use Managed identity.';
  if ([401, 403].includes(error.statusCode) || error.name === 'CredentialUnavailableError') {
    return 'Check the connection string or grant the host identity Storage Blob Data Contributor on the container.';
  }
  return 'Check Azure network access, firewall rules, and the selected authentication method.';
}

export async function testAzureStorage(values, { createMissingContainer = false } = {}) {
  const operations = { write: 'skipped', read: 'skipped', delete: 'skipped' };
  const account = values['storage.azureAccount'];
  const containerName = values['storage.azureContainer'];
  if (!/^[a-z0-9]{3,24}$/.test(account || '') || !/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,61}[a-z0-9]$/.test(containerName || '')) {
    return { ok: false, operations, error: 'Save a valid storage account and container name first.' };
  }
  if (values['storage.azureAuthentication'] !== 'managed-identity' && !values['storage.azureConnectionString']?.trim()) {
    return { ok: false, operations, error: 'Set AZURE_STORAGE_CONNECTION_STRING or save the Azure connection string in Storage settings.' };
  }
  let blob;
  let attemptedWrite = false;
  let writtenETag;
  const errors = [];
  const payload = Buffer.from(randomUUID());
  try {
    const credential = azureCredential(values, account);
    if (!credential) return { ok: false, operations, error: 'Copy the full Connection string from Azure Portal → Access keys for the selected storage account. The separate account key cannot be used in this field.' };
    const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential, { retryOptions: { maxTries: 1 } });
    const container = service.getContainerClient(containerName);
    const getProperties = () => container.getProperties({ abortSignal: AbortSignal.timeout(8000) });
    let properties;
    try {
      properties = await getProperties();
    } catch (error) {
      const code = error.details?.errorCode || error.code;
      if (error.statusCode !== 404 || code !== 'ContainerNotFound') throw error;
      if (!createMissingContainer) {
        return { ok: false, operations, missingContainer: true, error: `Azure container "${containerName}" does not exist in "${account}". Create it as private to run the blob test.` };
      }
      try {
        // Omitting the public access level creates a private Azure container.
        await container.createIfNotExists({ abortSignal: AbortSignal.timeout(8000) });
      } catch (createError) {
        return { ok: false, operations, error: `Could not create the private Azure container. ${failureMessage(createError)}` };
      }
      properties = await getProperties();
    }
    if (properties.blobPublicAccess) {
      return { ok: false, operations, error: 'Set the Azure container access level to Private and test again.' };
    }
    blob = container.getBlockBlobClient(`.getafe-storage-test/${randomUUID()}.tmp`);
    attemptedWrite = true;
    operations.write = 'failed';
    const written = await blob.uploadData(payload, { conditions: { ifNoneMatch: '*' }, abortSignal: AbortSignal.timeout(8000) });
    writtenETag = written.etag;
    operations.write = 'succeeded';
    operations.read = 'failed';
    const download = await blob.download(0, payload.length, { conditions: { ifMatch: writtenETag }, abortSignal: AbortSignal.timeout(8000), maxRetryRequests: 0 });
    if (!download.readableStreamBody) throw new Error('Azure returned no read stream.');
    const chunks = [];
    for await (const chunk of download.readableStreamBody) chunks.push(chunk);
    if (!payload.equals(Buffer.concat(chunks))) errors.push('Read returned unexpected content.');
    else operations.read = 'succeeded';
  } catch (error) {
    if (operations.write === 'failed' && [409, 412].includes(error.statusCode)) attemptedWrite = false;
    errors.push(failureMessage(error));
  } finally {
    if (attemptedWrite) {
      try {
        const remove = () => blob.deleteIfExists({ conditions: { ifMatch: writtenETag }, abortSignal: AbortSignal.timeout(8000) });
        let result;
        try { result = await remove(); }
        catch (error) {
          if (error.statusCode && ![408, 429, 500, 502, 503, 504].includes(error.statusCode)) throw error;
          // A timed-out delete can have completed on Azure. The retry checks
          // the same key and ETag and treats an already-absent blob as clean.
          result = await remove();
        }
        operations.delete = result.succeeded || operations.write === 'succeeded' ? 'succeeded' : 'skipped';
      } catch (error) {
        operations.delete = 'failed';
        errors.push(`Cleanup failed. ${failureMessage(error)} Check for temporary blobs under .getafe-storage-test/.`);
      }
    }
  }
  return { ok: Object.values(operations).every(status => status === 'succeeded'), operations, error: errors.join(' ') };
}
