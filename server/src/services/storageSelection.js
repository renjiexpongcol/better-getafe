// One selection shared by configuration, runtime activation and migration guards.
// A committed cutover owns the media references even if an old environment
// variable still names B2. Never return to B2 when that Azure connection fails.
let cutoverStatus;
let journalUnavailable = false;
export function getVerifiedAzureStatus() { return cutoverStatus; }
export function setVerifiedAzureStatus(status) { cutoverStatus = status; }
export function storageJournalUnavailable() { return journalUnavailable; }
export async function refreshStorageSelection(db) {
  try {
    const [rows] = await db.execute("SELECT status FROM media_migration_runs WHERE status IN ('active', 'accepted') ORDER BY started_at DESC LIMIT 1");
    if (rows[0]) cutoverStatus = rows[0].status;
    journalUnavailable = false;
  } catch (error) {
    // Older installations have no cutover journal. Other errors must not
    // permit a possibly incorrect provider to serve or overwrite media.
    journalUnavailable = error.code !== '42P01' || Boolean(cutoverStatus);
  }
}
export function selectedStorageProvider(configured) {
  return cutoverStatus ? 'azure' : configured;
}
