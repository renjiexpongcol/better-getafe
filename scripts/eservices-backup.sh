#!/bin/sh
set -eu

: "${CMS_SUPABASE_DATABASE_URL:?Set CMS_SUPABASE_DATABASE_URL in the backend environment}"
umask 077
retention=${BACKUP_RETENTION_DAYS:-30}
interval=${BACKUP_INTERVAL_SECONDS:-86400}
case "$retention" in ''|*[!0-9]*|0) echo "[Backup] Retention must be a positive integer." >&2; exit 1 ;; esac
case "$interval" in ''|*[!0-9]*|0) echo "[Backup] Interval must be a positive integer." >&2; exit 1 ;; esac
mkdir -p /backups

while :; do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="/backups/better-getafe-${stamp}.dump"
  temporary="${target}.partial"
  if pg_dump --dbname="$CMS_SUPABASE_DATABASE_URL" --format=custom --no-owner --no-acl >"$temporary" 2>/dev/null; then
    mv "$temporary" "$target"
    touch /backups/last-success
    echo "[Backup] Supabase snapshot completed: $(basename "$target")."
    find /backups -maxdepth 1 -type f -name 'better-getafe-*.dump' -mtime "+$retention" -delete
  else
    rm -f "$temporary"
    echo "[Backup] Supabase snapshot failed; check the CMS_SUPABASE_DATABASE_URL and provider connectivity." >&2
  fi
  sleep "$interval"
done
