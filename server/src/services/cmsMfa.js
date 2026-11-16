import { getCmsPool } from './database.js'

export async function saveCmsMfa(userId,{enabled,secret,recoveryCodes,verifiedAt,expectedUpdatedAt}) {
  const [,result]=await (await getCmsPool()).execute(`UPDATE users SET mfa_enabled=?,mfa_secret_encrypted=?,mfa_recovery_codes=?::jsonb,mfa_verified_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? ${expectedUpdatedAt?'AND date_trunc(\'milliseconds\',updated_at)=?::timestamptz AND mfa_enabled=?':''}`,[enabled,secret,JSON.stringify(recoveryCodes),verifiedAt,userId,...(expectedUpdatedAt?[expectedUpdatedAt,!enabled]:[])])
  if(result.rowCount!==1)throw Object.assign(new Error('Your account changed. Refresh security settings before trying again.'),{status:409})
}

export async function consumeCmsRecoveryCode(userId,code,matches) {
  const connection=await (await getCmsPool()).getConnection()
  try {
    await connection.beginTransaction()
    const [[user]]=await connection.execute('SELECT mfa_recovery_codes FROM users WHERE id=? AND mfa_enabled=TRUE FOR UPDATE',[userId])
    const codes=Array.isArray(user?.mfa_recovery_codes)?user.mfa_recovery_codes:[]
    const index=codes.findIndex(hash=>matches(code,hash))
    if(index<0){await connection.commit();return false}
    codes.splice(index,1)
    await connection.execute('UPDATE users SET mfa_recovery_codes=?::jsonb WHERE id=?',[JSON.stringify(codes),userId])
    await connection.commit();return true
  } catch(error){await connection.rollback();throw error} finally{connection.release()}
}
