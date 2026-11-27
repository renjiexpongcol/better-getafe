// All migrations use the centralized operator workflow.
process.argv.splice(2,0,'migrate');
await import('./database.mjs');
