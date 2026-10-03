import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { provisionEmployee } from '../server/src/services/employeeProvisioning.js';
dotenv.config({ quiet:true });

test('PostgreSQL employee migration, concurrent allocation, identity protection and atomic rollback', async () => {
  const schema = `employee_test_${crypto.randomBytes(8).toString('hex')}`;
  const pool = new pg.Pool(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000 } : { host:process.env.DB_HOST || '127.0.0.1',port:Number(process.env.DB_PORT || 5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionTimeoutMillis:5000 });
  let created = false;
  const connection = await pool.connect();
  const adapter = { getConnection:async () => {
    const client = await pool.connect();
    await client.query(`SET search_path TO ${schema},public`);
    return { beginTransaction:() => client.query('BEGIN'),commit:() => client.query('COMMIT'),rollback:() => client.query('ROLLBACK'),release:() => client.release(),execute:async (sql,values=[]) => { let index=0; const result=await client.query(sql.replace(/\?/g,() => `$${++index}`),values); return [result.rows,result]; } };
  } };
  try {
    await connection.query(`CREATE SCHEMA ${schema}`); created=true;
    await connection.query(`SET search_path TO ${schema},public`);
    await connection.query('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL,updated_at TIMESTAMPTZ NOT NULL)');
    const legacyId = crypto.randomUUID();
    await connection.query("INSERT INTO users VALUES($1,'Legacy employee','legacy@example.com','encoded','staff',now(),now())",[legacyId]);
    await connection.query('CREATE TABLE existing_relationship(user_id TEXT REFERENCES users(id),note TEXT)');
    await connection.query("INSERT INTO existing_relationship VALUES($1,'Preserved')",[legacyId]);
    await connection.query(await fs.readFile('database/migrations/postgresql/022_employee_profiles.sql','utf8'));
    const legacy = (await connection.query('SELECT * FROM employee_profiles WHERE user_id=$1',[legacyId])).rows[0];
    assert.equal(legacy.eid,'000001'); assert.equal(legacy.user_id,legacyId);
    assert.equal((await connection.query('SELECT user_id FROM existing_relationship')).rows[0].user_id,legacyId);
    await connection.query('CREATE TABLE auth_groups(id TEXT PRIMARY KEY,enabled BOOLEAN,archived_at TIMESTAMPTZ); CREATE TABLE auth_user_bootstrap(user_id TEXT PRIMARY KEY,created_at TIMESTAMPTZ); CREATE TABLE auth_user_groups(user_id TEXT,group_id TEXT,created_at TIMESTAMPTZ,created_by TEXT,PRIMARY KEY(user_id,group_id)); CREATE TABLE auth_audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,target_type TEXT,target_id TEXT,previous_value JSONB,new_value JSONB,correlation_id TEXT,created_at TIMESTAMPTZ)');
    await connection.query("INSERT INTO auth_groups VALUES('support',TRUE,NULL)");
    const values = index => ({ name:`Employee ${index}`,email:`employee${index}@example.com`,role:'staff',department:'IT',position:'Officer',group_ids:['support'] });
    const employees = await Promise.all(Array.from({ length:12 },(_,index) => provisionEmployee(values(index),null,{ id:legacyId },adapter)));
    assert.equal(new Set(employees.map(employee => employee.eid)).size,12);
    assert.deepEqual(employees.map(employee => employee.eid).sort(),Array.from({ length:12 },(_,index) => String(index+2).padStart(6,'0')));
    const first = employees[0];
    await provisionEmployee({ ...values(0),name:'Renamed',role:'admin',department:'Finance',position:'Director' },first.id,{ id:legacyId },adapter);
    assert.equal((await connection.query('SELECT eid FROM employee_profiles WHERE user_id=$1',[first.id])).rows[0].eid,first.eid);
    await assert.rejects(connection.query("UPDATE employee_profiles SET eid='123456' WHERE user_id=$1",[first.id]),/immutable/);
    await assert.rejects(provisionEmployee({ ...values('bad'),group_ids:['missing'] },null,{ id:legacyId },adapter),/unavailable/);
    assert.equal((await connection.query("SELECT count(*)::int AS count FROM users WHERE email='employeebad@example.com'")).rows[0].count,0);
    await connection.query("CREATE FUNCTION reject_employee_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failure'; END $$; CREATE TRIGGER reject_audit BEFORE INSERT ON auth_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_employee_audit()");
    await assert.rejects(provisionEmployee(values('audit'),null,{ id:legacyId },adapter),/audit failure/);
    assert.equal((await connection.query("SELECT count(*)::int AS count FROM users WHERE email='employeeaudit@example.com'")).rows[0].count,0);
    await connection.query('DROP TRIGGER reject_audit ON auth_audit_logs');
    await connection.query('DELETE FROM users WHERE id=$1',[first.id]);
    const replacement=await provisionEmployee(values('replacement'),null,{ id:legacyId },adapter);
    assert.ok(Number(replacement.eid)>13);
    await connection.query("SELECT setval('employee_eid_seq',999998)");
    assert.equal((await provisionEmployee(values('last'),null,{ id:legacyId },adapter)).eid,'999999');
    await assert.rejects(provisionEmployee(values('overflow'),null,{ id:legacyId },adapter),/maximum value/);
    assert.equal((await connection.query("SELECT count(*)::int AS count FROM users WHERE email='employeeoverflow@example.com'")).rows[0].count,0);
    const profile = (await connection.query('SELECT * FROM employee_profiles WHERE user_id=$1',[employees[1].id])).rows[0];
    assert.equal(profile.created_by,legacyId); assert.equal(profile.employment_status,'Active');
    assert.equal((await connection.query('SELECT password_setup_required,last_login_at FROM users WHERE id=$1',[employees[1].id])).rows[0].password_setup_required,true);
  } finally {
    if (created) await connection.query(`DROP SCHEMA ${schema} CASCADE`);
    connection.release(); await pool.end();
  }
});
