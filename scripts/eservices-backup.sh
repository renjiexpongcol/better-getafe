#!/bin/sh
set -eu
umask 077
mkdir -p /backups
while true; do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="/backups/getafe-${stamp}.dump"
  if pg_dump --format=custom --exclude-schema='eservice_test_*' --file="${target}.partial" && pg_restore --list "${target}.partial" >/dev/null; then
    mv "${target}.partial" "$target"
    date -u +%FT%TZ > /backups/last-success
    find /backups -name 'getafe-*.dump' -type f -mtime "+${BACKUP_RETENTION_DAYS:-30}" -delete
    echo "Database backup verified: ${stamp}"
  else
    rm -f "${target}.partial"
    echo "Database backup failed" >&2
  fi
  sleep "${BACKUP_INTERVAL_SECONDS:-86400}"
done
