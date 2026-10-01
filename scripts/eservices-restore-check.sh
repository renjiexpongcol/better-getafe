#!/bin/sh
set -eu
database=getafe_eservices_restore_check
archive=$(find /backups -maxdepth 1 -name 'getafe-*.dump' -type f | sort | tail -n 1)
test -n "$archive"
# createdb fails if the name already exists. Cleanup is installed only after
# successful creation, so an existing database is never overwritten or deleted.
createdb "$database"
trap 'dropdb getafe_eservices_restore_check' EXIT
pg_restore --exit-on-error --no-owner --dbname="$database" "$archive"
psql --dbname="$database" --no-psqlrc --set=ON_ERROR_STOP=1 --command="SELECT count(*) AS restored_eservice_tables FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('services','service_requests','payment_orders','payments','request_documents');"
echo 'Disposable database restore check passed.'
