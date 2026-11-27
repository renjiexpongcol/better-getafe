import { getPostgresRuntime } from '../repositories/postgresRuntime.js'
import { getCmsUserById } from '../repositories/cmsUserRepository.js'
import { config } from '../config/index.js'
import { enqueueEmail } from './redisInfrastructure.js'
import {recoveryJobsAllowed} from '../database/workerRecovery.js'

export async function createStaffNotification(db, { userId, eventKey, title, message, applicationId = null, requestId = null }) {
  await db('INSERT INTO staff_notifications(user_id,event_key,title,message,application_id,request_id) VALUES(?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING',[userId,eventKey,title,message,applicationId,requestId])
}

// The inbox is committed with the business event. Email can retry independently
// after an unavailable provider/Redis queue and never rolls back staff actions.
export async function drainStaffNotifications({enqueue=enqueueEmail,lookup=getCmsUserById,emailEnabled=()=>config.get('notifications.enabled')&&config.get('notifications.emailEnabled')}={}) {
  if(!await recoveryJobsAllowed())return 0
  const runtime = await getPostgresRuntime('portal')
  await runtime.exec('BEGIN')
  try {
    const events = await runtime.prepare("SELECT * FROM staff_notifications WHERE email_status IN ('PENDING','FAILED') AND available_at<=now() ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED").all()
    for (const event of events) {
      try {
        const user = await lookup(event.user_id)
        if (!emailEnabled() || !user || !['staff','it_support','content_manager','admin','super_admin'].includes(user.role) || !user.email) {
          await runtime.prepare("UPDATE staff_notifications SET email_status='SUPPRESSED',attempts=attempts+1 WHERE id=?").run(event.id)
          continue
        }
        await enqueue({ to:user.email,subject:event.title,text:event.message,staffNotificationId:event.id })
        await runtime.prepare("UPDATE staff_notifications SET email_status='QUEUED',attempts=attempts+1 WHERE id=?").run(event.id)
      } catch(error) {
        console.warn(JSON.stringify({event:'staff_notification_email_deferred',notification_id:event.id,error_code:error.code||error.name||'delivery_failed'}))
        await runtime.prepare("UPDATE staff_notifications SET email_status='FAILED',attempts=attempts+1,available_at=now()+(LEAST(3600,30*power(2,LEAST(attempts,7)))::text||' seconds')::interval WHERE id=?").run(event.id)
      }
    }
    await runtime.exec('COMMIT')
    return events.length
  } catch (error) {await runtime.exec('ROLLBACK');throw error}
}

export async function markStaffEmailDelivery(id,sent) {
  if(!id)return;
  const runtime=await getPostgresRuntime('portal');
  await runtime.prepare("UPDATE staff_notifications SET email_status=?,available_at=now()+interval '1 hour' WHERE id=? AND email_status<>'SENT'").run(sent?'SENT':'FAILED',id);
}

export async function validateStaffEmailDelivery(id,email) {
  if(!id)return true
  const runtime=await getPostgresRuntime('portal')
  const event=await runtime.prepare('SELECT user_id,email_status FROM staff_notifications WHERE id=?').get(id)
  if(!event || event.email_status!=='QUEUED')return false
  const account=await getCmsUserById(event.user_id)
  const allowed=Boolean(config.get('notifications.enabled')&&config.get('notifications.emailEnabled')&&account&&['staff','it_support','content_manager','admin','super_admin'].includes(account.role)&&account.email===email)
  if(!allowed)await runtime.prepare("UPDATE staff_notifications SET email_status='SUPPRESSED' WHERE id=? AND email_status='QUEUED'").run(id)
  return allowed
}
