
import { getPortalPool } from './src/services/cloudSql.js';
import fs from 'fs';

async function checkAndCreate() {
  const pool = await getPortalPool();
  if (!pool) {
    console.log("No pool configured.");
    process.exit(1);
  }
  
  try {
    const [rows] = await pool.execute("SHOW TABLES LIKE 'portal_users'");
    if (rows.length === 0) {
      console.log("Table portal_users does not exist. Creating it...");
      const sql = fs.readFileSync('./database/cloudsql-users-schema.sql', 'utf8');
      await pool.query(sql);
      console.log("Table created successfully.");
    } else {
      console.log("Table portal_users already exists.");
    }
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}

checkAndCreate();
