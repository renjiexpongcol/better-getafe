import { createHash } from 'node:crypto';

export const identifier = value => '"' + String(value).replaceAll('"', '""') + '"';
export const qualified = (schema, name) => `${identifier(schema)}.${identifier(name)}`;
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value.replaceAll('\r\n', '\n') : JSON.stringify(value)).digest('hex');

export async function readCatalog(client) {
  const rows = async sql => (await client.query(sql)).rows;
  const tables = await rows(`SELECT n.nspname AS schema,c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY 1,2`);
  const columns = await rows(`SELECT n.nspname AS schema,c.relname AS table,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,
    a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS "default",a.attidentity AS identity,a.attgenerated AS generated,a.attnum AS ordinal
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,a.attnum`);
  const constraints = await rows(`SELECT n.nspname AS schema,c.relname AS table,k.conname AS name,k.contype AS type,pg_get_constraintdef(k.oid,true) AS definition
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY 1,2,3`);
  const indexes = await rows(`SELECT schemaname AS schema,tablename AS table,indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2,3`);
  const functions = await rows(`SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','portal_api') AND p.prokind IN ('f','p')
    AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY 1,2,3`);
  const triggers = await rows(`SELECT n.nspname AS schema,c.relname AS table,t.tgname AS name,pg_get_triggerdef(t.oid,true) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2,3`);
  const views = await rows(`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,pg_get_viewdef(c.oid,true) AS definition,c.reloptions AS options
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','portal_api') AND c.relkind IN ('v','m') ORDER BY 1,2`);
  const sequences = await rows(`SELECT n.nspname AS schema,c.relname AS name,format_type(s.seqtypid,NULL) AS type,s.seqstart::text AS start,s.seqincrement::text AS increment,
    s.seqmin::text AS min,s.seqmax::text AS max,s.seqcache::text AS cache,s.seqcycle AS cycle
    FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY 1,2`);
  const enums = await rows(`SELECT n.nspname AS schema,t.typname AS name,array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' GROUP BY 1,2 ORDER BY 1,2`);
  const policies = await rows(`SELECT schemaname AS schema,tablename AS table,policyname AS name,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2,3`);
  const extensions = await rows(`SELECT e.extname AS name,n.nspname AS schema,e.extversion AS version FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1`);
  const grants = await rows(`SELECT n.nspname AS schema,c.relname AS table,COALESCE(r.rolname,'PUBLIC') AS grantee,a.privilege_type
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee
    WHERE n.nspname IN ('public','portal_api') AND c.relkind IN ('r','p','v','m') AND (a.grantee=0 OR r.rolname IN ('anon','authenticated')) ORDER BY 1,2,3,4`);
  return { tables, columns, constraints, indexes, functions, triggers, views, sequences, enums, policies, extensions, grants };
}

const objectKey = row => [row.schema || '', row.table || '', row.name, row.arguments || ''].join('.');
// PostgreSQL redistributes a binary-compatible varchar[] -> text[] cast to
// individual literals when its own deparsed CHECK is replayed. Normalize that
// precise equivalence while preserving every quoted identifier/literal byte.
export function canonicalConstraint(definition) {
  const literals=[];
  let sql=String(definition).replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g,value=>{const index=literals.push(value)-1;return `__literal${index}__`;});
  sql=sql.replace(/::character varying\b(?!\s*\()/g,'::text');
  sql=sql.replace(/(?:::text){2,}/g,'::text');
  sql=sql.replace(/ARRAY\[([^\]]+)\]::text\[\]/g,(original,items)=>items.split(',').every(item=>/^\s*(?:__literal\d+__|NULL)::text\s*$/.test(item))?`ARRAY[${items}]`:original);
  return JSON.stringify({sql:sql.replace(/\s+/g,' ').trim(),literals});
}
export function compareCatalog(expected, actual) {
  const missing = [], drift = [];
  for (const kind of ['tables','columns','constraints','indexes','functions','triggers','views','sequences','enums','policies']) {
    const found = new Map((actual[kind] || []).map(row => [objectKey(row), row]));
    for (const object of expected[kind] || []) {
      const current = found.get(objectKey(object));
      if (!current) { missing.push({ ...object, ...(kind==='views'?{viewKind:object.kind}:{}), kind }); continue; }
      const properties = { tables: ['rls','force_rls'], columns: ['type','not_null','default','identity','generated'], constraints: ['definition'], indexes: ['definition'], functions: ['definition'], triggers: ['definition'], views: ['definition','kind','options'], sequences: ['type','start','increment','min','max','cache','cycle'], enums: ['labels'], policies: ['permissive','roles','cmd','qual','with_check'] }[kind];
      const changed = properties.filter(key => kind==='constraints'&&key==='definition'?canonicalConstraint(object[key])!==canonicalConstraint(current[key]):JSON.stringify(object[key]) !== JSON.stringify(current[key]));
      if (changed.length) drift.push({ kind, schema: object.schema, table: object.table, name: object.name, changed });
    }
  }
  for (const extension of expected.extensions || []) if (!(actual.extensions || []).some(item => item.name === extension.name)) missing.push({ kind: 'extensions', ...extension });
  const exposed = (actual.grants || []).filter(grant => !(expected.grants || []).some(item => JSON.stringify(item) === JSON.stringify(grant)));
  if (exposed.length) drift.push({ kind: 'grants', unexpectedExposure: exposed });
  return { missing, drift, expectedObjects: Object.entries(expected).filter(([,value]) => Array.isArray(value)).reduce((sum,[,rows]) => sum+rows.length,0) };
}
