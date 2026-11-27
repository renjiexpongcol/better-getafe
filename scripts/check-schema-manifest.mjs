import { migrationFiles,expectedSchema } from '../server/src/database/maintenance.js';
import { digest } from '../server/src/database/catalog.js';
const migrations=await migrationFiles(),manifest=await expectedSchema();
if(!manifest||manifest.migrationDigest!==digest(migrations.map(({version,checksum})=>({version,checksum}))))throw new Error('The complete schema reference must match every version-controlled migration. Generate it in a verified empty test database.');
if(!manifest.catalog.tables.length||!manifest.catalog.columns.length)throw new Error('The schema reference is incomplete.');
console.info(JSON.stringify({migrations:migrations.length,tables:manifest.catalog.tables.length,objects:Object.values(manifest.catalog).reduce((sum,rows)=>sum+rows.length,0),schemaReference:'matched'}));
