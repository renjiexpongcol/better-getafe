import crypto from 'node:crypto';
import { getCmsPool } from './cloudSql.js';
import { hashPassword } from './passwordHashing.js';

export async function provisionEmployee(values, userId, actor, pool = null) {
  const connection = await (pool || await getCmsPool()).getConnection();
  const timestamp = new Date();
  const creating = !userId;
  let previous = null;
  userId ||= crypto.randomUUID();
  try {
    await connection.beginTransaction();
    await connection.execute("SELECT set_config('app.employee_creator',?,true)", [actor.id]);
    if (creating) {
      await connection.execute('INSERT INTO users(id,name,email,password,role,created_at,updated_at,password_setup_required) VALUES (?,?,?,?,?,?,?,TRUE)', [userId,values.name,values.email,await hashPassword(values.password || crypto.randomBytes(48).toString('base64url')),values.role,timestamp,timestamp]);
      await connection.execute('INSERT INTO auth_user_bootstrap(user_id,created_at) VALUES (?,?)', [userId,timestamp]);
      for (const groupId of new Set(values.group_ids || [])) {
        const [groups] = await connection.execute('SELECT id FROM auth_groups WHERE id=? AND enabled=TRUE AND archived_at IS NULL FOR SHARE', [groupId]);
        if (!groups.length) throw Object.assign(new Error('Selected permission group is unavailable.'), { status:422 });
        if (values.grantablePermissions) {
          const [grants] = await connection.execute('SELECT permission_id FROM auth_group_permissions WHERE group_id=? FOR SHARE', [groupId]);
          if (grants.some(grant => !values.grantablePermissions.includes(grant.permission_id))) throw Object.assign(new Error('You cannot grant permissions you do not hold.'), { status:403 });
        }
        await connection.execute('INSERT INTO auth_user_groups(user_id,group_id,created_at,created_by) VALUES (?,?,?,?)', [userId,groupId,timestamp,actor.id]);
      }
    } else {
      const [records] = await connection.execute('SELECT u.name,u.email,u.role,p.department,p.position FROM users u JOIN employee_profiles p ON p.user_id=u.id WHERE u.id=? FOR UPDATE', [userId]);
      if (!records.length) throw Object.assign(new Error('Employee not found.'), { status:404 });
      previous = records[0];
      await connection.execute('UPDATE users SET name=?,email=?,role=?,updated_at=? WHERE id=?', [values.name,values.email,values.role,timestamp,userId]);
    }
    await connection.execute('UPDATE employee_profiles SET department=?,position=? WHERE user_id=?', [values.department,values.position,userId]);
    const [profiles] = await connection.execute('SELECT eid FROM employee_profiles WHERE user_id=?', [userId]);
    if (!profiles.length) throw new Error('Employee profile provisioning failed.');
    await connection.execute('INSERT INTO auth_audit_logs(id,actor_id,action,target_type,target_id,previous_value,new_value,correlation_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [crypto.randomUUID(),actor.id,creating ? 'EMPLOYEE_CREATED' : 'EMPLOYEE_UPDATED','user',userId,previous ? JSON.stringify(previous) : null,JSON.stringify({ eid:profiles[0].eid,name:values.name,email:values.email,role:values.role,department:values.department,position:values.position,group_ids:values.group_ids }),crypto.randomUUID(),timestamp]);
    await connection.commit();
    return { id:userId,eid:profiles[0].eid };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function getEmployeeProfile(userId) {
  const pool = await getCmsPool();
  const [rows] = await pool.execute('SELECT p.*,p.hire_date::text AS hire_date,u.name,u.email,u.role,u.created_at AS account_created_at,u.updated_at AS account_updated_at,u.mfa_enabled,u.last_login_at,u.password_setup_required,u.avatar_storage_path,c.name AS creator_name,cp.eid AS creator_eid FROM employee_profiles p JOIN users u ON u.id=p.user_id LEFT JOIN users c ON c.id=p.created_by LEFT JOIN employee_profiles cp ON cp.user_id=c.id WHERE p.user_id=?', [userId]);
  if (!rows.length) return null;
  const [groups] = await pool.execute('SELECT g.id,g.name FROM auth_groups g JOIN auth_user_groups ug ON ug.group_id=g.id WHERE ug.user_id=? AND g.archived_at IS NULL ORDER BY g.name', [userId]);
  const profile = rows[0];
  return { ...profile,groups,account_status:profile.role === 'disabled' ? 'Disabled' : 'Active',password_status:profile.password_setup_required ? 'Password Setup Required' : 'Password Set',mfa_status:profile.mfa_enabled ? 'Enrolled' : 'Not Enrolled' };
}

export async function updateEmployeePersonnel(userId, values, actor) {
  const fields = ['phone','hire_date','employment_type','office_assignment','supervisor_id','employment_status'];
  if (!values || Object.keys(values).some(field => !fields.includes(field))) throw Object.assign(new Error('Only personnel fields can be edited here.'), { status:422 });
  for (const [field,value] of Object.entries(values)) {
    const max = field === 'phone' ? 32 : ['employment_type','employment_status'].includes(field) ? 64 : 160;
    if (value !== null && (typeof value !== 'string' || value.length > max)) throw Object.assign(new Error('Personnel details are invalid.'), { status:422 });
    if (field === 'hire_date' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) throw Object.assign(new Error('Enter a valid hire date.'), { status:422 });
    if (field === 'employment_status' && !value?.trim()) throw Object.assign(new Error('Employment status is required.'), { status:422 });
  }
  const connection = await (await getCmsPool()).getConnection();
  try {
    await connection.beginTransaction();
    const [previous] = await connection.execute('SELECT * FROM employee_profiles WHERE user_id=? FOR UPDATE', [userId]);
    if (!previous.length) throw Object.assign(new Error('Employee not found.'), { status:404 });
    for (const [field,value] of Object.entries(values)) await connection.execute(`UPDATE employee_profiles SET ${field}=? WHERE user_id=?`, [value || null,userId]);
    await connection.execute('INSERT INTO auth_audit_logs(id,actor_id,action,target_type,target_id,previous_value,new_value,correlation_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [crypto.randomUUID(),actor.id,'EMPLOYEE_PERSONNEL_UPDATED','user',userId,JSON.stringify(Object.fromEntries(Object.keys(values).map(field => [field,previous[0][field]]))),JSON.stringify(values),crypto.randomUUID(),new Date()]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
