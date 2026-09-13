import '../src/config/bootstrap.js';
import fs from 'node:fs/promises';
import { getConfigPool, closeConfigStore } from '../src/config/DatabaseSettingsProvider.js';
try {
  const pool = await getConfigPool();
  if (!pool) console.log('Local configuration uses a versioned JSON document; no SQL migration required.');
  else {
    const connection = await pool.getConnection();
    try {
      const [[lock]] = await connection.execute("SELECT GET_LOCK('getafe_settings_migration', 60) AS acquired");
      if (lock.acquired !== 1) throw new Error('Migration lock unavailable');
      for (const file of ['database/settings.sql', 'database/settings-runtime.sql']) {
        for (const statement of (await fs.readFile(file, 'utf8')).split(';').map(part => part.trim()).filter(Boolean)) await connection.query(statement);
      }
      console.log('Settings migrations applied successfully.');
    } finally { await connection.query("SELECT RELEASE_LOCK('getafe_settings_migration')"); connection.release(); }
  }
} catch { console.error('Settings migration failed. Check bootstrap database access and schema permissions.'); process.exitCode = 1; }
finally { await closeConfigStore(); }
