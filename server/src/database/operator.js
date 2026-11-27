import fs from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { identifier } from './catalog.js';
import { withMigrationLock } from './maintenance.js';
import { hashPassword } from '../services/passwordHashing.js';
import { generateTotpSecret,encryptMfaSecret,decryptMfaSecret,generateRecoveryCodes,hashRecoveryCode } from '../services/mfa.js';
import { CredentialVault } from '../integrationHub/security.js';

export async function saveLocalEnvironment(values) {
  const file='.env.development.local';let text=await fs.readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
  for(const [key,value] of Object.entries(values)) {
    if(!/^[A-Z][A-Z0-9_]*$/.test(key)||typeof value!=='string')throw new Error('Environment entries need a valid name and string value.');
    const delimiter=!value.includes("'")?"'":!value.includes('`')?'`':null;
    if(!delimiter)throw new Error('This value requires direct secret-store configuration because it contains both supported literal delimiters.');
    const entry=key+'='+delimiter+value+delimiter;
    const pattern=new RegExp('^'+key+'=.*$','m');
    text=pattern.test(text)?text.replace(pattern,()=>entry):text.trimEnd()+'\n'+entry+'\n';
    process.env[key]=value;
  }
  await fs.writeFile(file,text,{mode:0o600});
}
export async function configureFreshInstallation(client) {
  const existing=dotenv.parse(await fs.readFile('.env.development.local'));
  const identity=(await client.query('SELECT id FROM getafe_database_identity WHERE singleton=TRUE')).rows[0]?.id;
  if(!identity)throw new Error('Initialize the database before configuring bootstrap settings.');
  const saved=(await client.query("SELECT count(*)::int AS count FROM system_settings WHERE value::jsonb ? 'encrypted'")).rows[0].count;
  if(!existing.SETTINGS_ENCRYPTION_KEY&&saved)throw new Error('Existing encrypted settings require their original key; no replacement was generated.');
  const values={DATABASE_INSTANCE_ID:identity};
  const usable=value=>typeof value==='string'&&value.length>=32&&!/SENSITIVE|replace-with|change-this|your-|fixture|example/i.test(value);
  if(!existing.SETTINGS_ENCRYPTION_KEY) {
    const fileKey=await fs.readFile('data/.settings-encryption-key','utf8').catch(()=>null);
    values.SETTINGS_ENCRYPTION_KEY=fileKey?.trim()||randomBytes(32).toString('base64');
  }
  if(!usable(existing.AUTH_SESSION_SECRET)&&!usable(existing.CMS_SESSION_SECRET)) {
    const accounts=(await client.query('SELECT id,mfa_secret_encrypted FROM users WHERE mfa_secret_encrypted IS NOT NULL')).rows;
    const fresh=(await client.query("SELECT 1 FROM getafe_database_operations WHERE report->>'previousState'='empty' LIMIT 1")).rowCount;
    if(accounts.length&&!fresh)throw new Error('Existing MFA secrets require their original signing/encryption key.');
    const decoded=accounts.map(account=>({...account,secret:decryptMfaSecret(account.mfa_secret_encrypted)}));
    values.AUTH_SESSION_SECRET=randomBytes(48).toString('base64url');
    if(decoded.length&&!usable(existing.MFA_ENCRYPTION_KEY)) {
      values.MFA_ENCRYPTION_KEY=randomBytes(48).toString('base64url');
      const previous=process.env.MFA_ENCRYPTION_KEY;
      process.env.MFA_ENCRYPTION_KEY=values.MFA_ENCRYPTION_KEY;
      await client.query('BEGIN');
      try {for(const account of decoded)await client.query('UPDATE users SET mfa_secret_encrypted=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',[encryptMfaSecret(account.secret),account.id]);await client.query('COMMIT');}
      catch(error){await client.query('ROLLBACK');if(previous===undefined)delete process.env.MFA_ENCRYPTION_KEY;else process.env.MFA_ENCRYPTION_KEY=previous;throw error;}
    }
  }
  if(!existing.CRON_SECRET)values.CRON_SECRET=randomBytes(40).toString('base64url');
  try{new CredentialVault(existing).keys();}catch{
    if((await client.query('SELECT 1 FROM integration_installations WHERE credential IS NOT NULL LIMIT 1')).rowCount)throw new Error('Existing integration credentials need their original vault keys; no replacement was generated.');
    values.INTEGRATION_VAULT_KEYS=JSON.stringify({'1':randomBytes(32).toString('base64')});values.INTEGRATION_VAULT_VERSION='1';
  }
  await saveLocalEnvironment(values);
  return {instance:identity,configured:Object.keys(values),file:'.env.development.local'};
}
export async function provisionInitialAdministrator(client,{name,email,projectRef,confirmed}) {
  if(!confirmed)throw new Error('Explicit --confirm-first-admin is required.');
  if(!name?.trim()||!/^\S+@\S+\.\S+$/.test(email||''))throw new Error('Provide the authorized operator name and email.');
  return withMigrationLock(client,async()=>{
    const exists=await client.query("SELECT id FROM users WHERE role IN ('admin','super_admin') LIMIT 1");
    if(exists.rowCount||(await client.query('SELECT 1 FROM getafe_administrator_setup')).rowCount)throw new Error('Initial administrator setup is already disabled; use existing account recovery.');
    const file='data/first-administrator-setup.json';
    await fs.mkdir('data',{recursive:true});
    const password=randomBytes(36).toString('base64url')+'!Aa7',secret=generateTotpSecret(),recovery=generateRecoveryCodes();
    const issuer='Municipality of Getafe';
    const uri=`otpauth://totp/${encodeURIComponent(issuer+':'+email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    const setup={projectRef,name,email,password,authenticatorUri:uri,recoveryCodes:recovery,instructions:'Import the authenticator URI into your authenticator, sign in with the one-time password and current code, then replace the password. Keep this file private and remove it after completing enrollment.'};
    await fs.writeFile(file,JSON.stringify(setup,null,2)+'\n',{mode:0o600,flag:'wx'});
    const id=randomUUID();
    await client.query('BEGIN');
    try {
      await client.query(`INSERT INTO users(id,name,email,password,role,created_at,updated_at,password_setup_required,mfa_enabled,mfa_secret_encrypted,mfa_recovery_codes)
        VALUES($1,$2,$3,$4,'super_admin',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,TRUE,TRUE,$5,$6::jsonb)`,[id,name.trim(),email.trim().toLowerCase(),await hashPassword(password),encryptMfaSecret(secret),JSON.stringify(recovery.map(code=>hashRecoveryCode(code)))]);
      await client.query("INSERT INTO auth_user_groups(user_id,group_id,created_at,created_by) SELECT $1,id,CURRENT_TIMESTAMP,'authorized-operator' FROM auth_groups WHERE name='System_Administrator'",[id]);
      await client.query('INSERT INTO auth_user_bootstrap(user_id,created_at) VALUES($1,CURRENT_TIMESTAMP)',[id]);
      await client.query('INSERT INTO getafe_administrator_setup(singleton,user_id) VALUES(TRUE,$1)',[id]);
      await client.query(`INSERT INTO auth_audit_logs(id,actor_id,action,target_type,target_id,new_value,correlation_id,created_at) VALUES($1,$2,'INITIAL_ADMINISTRATOR_PROVISIONED','user',$2,$3::jsonb,$4,CURRENT_TIMESTAMP)`,[randomUUID(),id,JSON.stringify({name,email,mfaRequired:true,source:'authorized-operator-cli'}),randomUUID()]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');await fs.unlink(file).catch(()=>{});throw error;}
    return{id,name,email,mfaRequired:true,initialSetupDisabled:true,credentialFile:file};
  });
}

export async function provisionRuntimeRole(client,{projectRef}) {
  const identity=(await client.query('SELECT id FROM getafe_database_identity WHERE singleton=TRUE')).rows[0]?.id;
  if(!identity)throw new Error('Database identity is missing.');
  const role='getafe_app_'+identity.replaceAll('-','').slice(0,10),quoted=identifier(role);
  const existing=await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role]);
  if(existing.rowCount) {
    const env=dotenv.parse(await fs.readFile('.env.development.local'));
    if(env.GETAFE_RUNTIME_ROLE===role){await ensureRuntimePrivileges(client,role);return{role,reused:true,unrestrictedDDL:false};}
    throw new Error('The runtime role already exists; recover its existing credentials or explicitly rotate them.');
  }
  const password=randomBytes(36).toString('base64url');
  const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
  await client.query('BEGIN');
  try {
    await client.query(`CREATE ROLE ${quoted} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await ensureRuntimePrivileges(client,role,tables);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  const env=dotenv.parse(await fs.readFile('.env.development.local'));
  const url=new URL(env.DIRECT_DATABASE_URL||env.DATABASE_URL);url.username=role+'.'+projectRef;url.password=password;
  await saveLocalEnvironment({DATABASE_URL:url.toString(),DATABASE_INSTANCE_ID:identity,GETAFE_RUNTIME_ROLE:role});
  return{role,unrestrictedDDL:false,connectionFile:'.env.development.local'};
}

export async function ensureRuntimePrivileges(client,role,providedTables) {
  if(!/^getafe_app_[a-f0-9]{10}$/.test(role||''))throw new Error('Unexpected runtime role.');
  const quoted=identifier(role);
  const tables=providedTables||(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
  const existing=new Set((await client.query("SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='getafe_backend'")).rows.map(row=>row.tablename));
  const policies=tables.filter(({tablename})=>!existing.has(tablename)).map(({tablename})=>`CREATE POLICY getafe_backend ON public.${identifier(tablename)} TO ${quoted} USING(TRUE) WITH CHECK(TRUE)`);
  if(policies.length)await client.query(policies.join(';'));
  await client.query(`GRANT USAGE ON SCHEMA public,portal_api,extensions TO ${quoted};GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${quoted};GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoted};GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${quoted};REVOKE INSERT,UPDATE,DELETE ON schema_migrations,getafe_database_identity,getafe_administrator_setup FROM ${quoted};REVOKE UPDATE,DELETE ON getafe_database_operations,audit_logs,auth_audit_logs,integration_audit,ai_audit_logs FROM ${quoted}`);
  await client.query(`ALTER POLICY getafe_backend ON getafe_database_operations WITH CHECK(state='requested' AND operation IN ('repair','seed','rebuild-derived','reconcile','migrate'))`);
}
