import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from 'redis';
import { BlobServiceClient } from '@azure/storage-blob';
import { saveLocalEnvironment } from '../server/src/database/operator.js';

const env=dotenv.parse(await fs.readFile('.env.development.local'));
const apply=process.argv.includes('--apply');
const confirm=process.argv[process.argv.indexOf('--confirm-ref')+1];
if(apply&&(confirm!==env.SUPABASE_PROJECT_REF||confirm==='wrgbfwexraarwxpoqzpv'))throw new Error('Confirm the isolated development/Preview project before provisioning.');
const report={databaseInstance:env.DATABASE_INSTANCE_ID,redis:{state:'not_configured'},azure:{state:'not_configured'}};
const raw=env.MY_REDIS_REDIS_URL||env.REDIS_URL;
if(raw) {
  const url=new URL(raw);url.protocol='rediss:';
  const client=createClient({url:url.toString(),socket:{connectTimeout:4000,reconnectStrategy:()=>false},disableOfflineQueue:true});client.on('error',()=>{});
  try {
    await client.connect();await client.ping();
    const key=`getafe:db:${env.DATABASE_INSTANCE_ID}:recovery-probe:${randomUUID()}`;
    await client.set(key,'verified',{EX:20});const value=await client.get(key);await client.del(key);
    if(value!=='verified')throw Error('Probe failed.');
    report.redis={state:'verified',tls:true,namespaceIsolation:true};
    if(apply)await saveLocalEnvironment({MY_REDIS_REDIS_URL:url.toString(),...(env.REDIS_URL?{REDIS_URL:url.toString()}:{})});
  }catch(error){report.redis={state:'requires_provider_tls_configuration',tls:false,code:error.code||'CONNECTION_FAILED'};}
  finally{if(client.isOpen)client.destroy();}
}
if(env.AZURE_STORAGE_CONNECTION_STRING&&env.DATABASE_INSTANCE_ID) {
  const service=BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING,{retryOptions:{maxTries:2,tryTimeoutInMs:8000}});
  const name='getafe-preview-'+env.DATABASE_INSTANCE_ID.replaceAll('-','');const container=service.getContainerClient(name);
  try {
    if(apply)await container.createIfNotExists({metadata:{getafeinstallation:env.DATABASE_INSTANCE_ID,purpose:'isolated-preview'},abortSignal:AbortSignal.timeout(10000)});
    const properties=await container.getProperties({abortSignal:AbortSignal.timeout(8000)});
    if(properties.blobPublicAccess||properties.metadata?.getafeinstallation!==env.DATABASE_INSTANCE_ID)throw Error('Private installation ownership not verified.');
    if(apply) {
      const blob=container.getBlockBlobClient('_health/'+randomUUID());const bytes=Buffer.from(randomUUID());let etag;
      try {etag=(await blob.uploadData(bytes,{conditions:{ifNoneMatch:'*'}})).etag;if(!(await blob.downloadToBuffer()).equals(bytes))throw Error('Storage read-back mismatch.');}
      finally{if(etag)await blob.delete({conditions:{ifMatch:etag}});}
      await saveLocalEnvironment({AZURE_STORAGE_CONTAINER_NAME:name,AZURE_STORAGE_INSTALLATION_ID:env.DATABASE_INSTANCE_ID,CMS_MEDIA_PROVIDER:'azure'});
    }
    report.azure={state:'verified',container:name,private:true,installationOwned:true,readWriteProbe:apply};
  }catch(error){report.azure={state:'unavailable',code:error.code||'PRIVATE_CONTAINER_NOT_VERIFIED'};}
}
if(apply&&report.redis.state==='verified'&&report.azure.state==='verified')await saveLocalEnvironment({PREVIEW_DATA_ISOLATED:'true'});
await fs.mkdir('artifacts/recovery',{recursive:true});await fs.writeFile('artifacts/recovery/infrastructure.json',JSON.stringify(report,null,2)+'\n');
console.info(JSON.stringify(report,null,2));
if(report.redis.state!=='verified'||report.azure.state!=='verified')process.exitCode=1;
