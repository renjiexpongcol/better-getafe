import fs from 'node:fs/promises';
import { BlobServiceClient } from '@azure/storage-blob';
import { identifier,qualified } from './catalog.js';

export async function reconcileStorage(client,{output='data/recovery/azure-reconciliation.json'}={}) {
  if(!process.env.AZURE_STORAGE_CONNECTION_STRING)throw new Error('Azure credentials are not configured.');
  const service=BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING,{retryOptions:{maxTries:2,tryTimeoutInMs:10000}});
  const containers=[],blobs=[];
  for await(const container of service.listContainers()) {
    const target=service.getContainerClient(container.name),properties=await target.getProperties();
    containers.push({name:container.name,private:!properties.blobPublicAccess});
    for await(const blob of target.listBlobsFlat({includeMetadata:true}))blobs.push({container:container.name,key:blob.name,bytes:blob.properties.contentLength,type:blob.properties.contentType,metadata:blob.metadata||{},references:[],status:'unmatched_private_object'});
  }
  const columns=(await client.query(`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND (column_name~*'(path|url|image|avatar|attachment|file|document|storage)' OR data_type IN ('json','jsonb')) ORDER BY table_name,column_name`)).rows;
  const keys=new Map();for(const blob of blobs){if(!keys.has(blob.key))keys.set(blob.key,[]);keys.get(blob.key).push(blob);}
  const inspect=(value,location)=>{
    if(typeof value==='string') {
      const candidate=value.split('?')[0];
      for(const [key,matches]of keys)if(candidate===key||candidate.endsWith('/'+key))for(const blob of matches){blob.references.push(location);blob.status='referenced';}
    }else if(Array.isArray(value))value.forEach(item=>inspect(item,location));
    else if(value&&typeof value==='object'&&!value.encrypted&&!value.ciphertext)Object.values(value).forEach(item=>inspect(item,location));
  };
  for(const column of columns) {
    const result=await client.query(`SELECT ${identifier(column.column_name)} AS value FROM ${qualified('public',column.table_name)} WHERE ${identifier(column.column_name)} IS NOT NULL`);
    for(const row of result.rows)inspect(row.value,{table:column.table_name,column:column.column_name});
  }
  const report={containers,blobs,scannedColumns:columns.length,imported:0,unmatched:blobs.filter(blob=>!blob.references.length).length,policy:'Read-only inventory. No ownership, captions, permissions or relationships were fabricated; no blobs were modified or published. Unknown/private objects require verified historical records and operator authorization before import.'};
  await fs.mkdir('data/recovery',{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  return{containers:containers.length,blobs:blobs.length,unmatched:report.unmatched,imported:0,reportFile:output};
}

export async function rebuildDerivedData(client) {
  const indexes=(await client.query("SELECT schemaname,indexname FROM pg_indexes WHERE schemaname='public' AND indexdef~*'using (gin|gist|hnsw|ivfflat)' ORDER BY indexname")).rows;
  for(const index of indexes)await client.query(`REINDEX INDEX ${qualified(index.schemaname,index.indexname)}`);
  const views=(await client.query("SELECT schemaname,matviewname FROM pg_matviews WHERE schemaname='public'")).rows;
  for(const view of views)await client.query(`REFRESH MATERIALIZED VIEW ${qualified(view.schemaname,view.matviewname)}`);
  const sources=(await client.query('SELECT source_key FROM ai_knowledge_sources WHERE enabled=TRUE AND approved=TRUE')).rows;
  let queued=0;
  for(const source of sources){const result=await client.query("INSERT INTO ai_knowledge_jobs(source_key,source_record_id,operation,status) VALUES($1,'*','rebuild','pending') ON CONFLICT(source_key,source_record_id) WHERE status IN ('pending','processing') DO NOTHING",[source.source_key]);queued+=result.rowCount;}
  const jobs=(await client.query("SELECT count(*)::int AS count FROM ai_knowledge_jobs WHERE status='pending'")).rows[0].count;
  return{reindexed:indexes.length,materializedViews:views.length,approvedKnowledgeSources:sources.length,queuedKnowledgeRebuilds:queued,pendingKnowledgeJobs:jobs,embeddings:'Not fabricated; approved source indexing requires the configured AI provider and managed worker.',analytics:'Existing aggregates are preserved. Missing historical aggregates cannot be reconstructed without their source events.'};
}
