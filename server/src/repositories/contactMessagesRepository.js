import crypto from 'node:crypto';
import { getPortalPool } from '../services/cloudSql.js';

export async function createContactMessage({ referenceNumber, name, email, category, subject, message }) {
  const pool = await getPortalPool();
  const id = crypto.randomUUID();
  await pool.execute(`
    INSERT INTO contact_messages
      (id, reference_number, name, email, category, subject, message, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
  `, [id, referenceNumber, name, email, category, subject, message]);
  return { id, referenceNumber };
}

export async function updateContactAcknowledgement(referenceNumber, status, sentAt = null) {
  const pool = await getPortalPool();
  await pool.execute(`UPDATE contact_messages SET acknowledgement_status = ?, acknowledgement_sent_at = ?, updated_at = CURRENT_TIMESTAMP WHERE reference_number = ?`, [status, sentAt, referenceNumber]);
}
