# PostgreSQL 17 integration

The application connects through the backend pool in `src/services/cloudSql.js`; browser code never receives a PostgreSQL credential or connection URL. The existing repository API remains the application boundary, so switching providers does not change business logic.

For the local Docker database, configure the server process (PowerShell example; do not commit the password):

```powershell
$env:DB_PROVIDER = 'postgresql'
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '5432'
$env:DB_NAME = 'getafe_portal'
$env:DB_USER = 'getafe_app'
$env:DB_PASSWORD = '<secret>'
$env:DB_SSL = 'false'
```

Run the versioned schema before starting the application:

```powershell
npm run migrate:postgres
npm start
```

The settings UI uses the same server-side configuration. A saved password is encrypted with `SETTINGS_ENCRYPTION_KEY` in development or stored in the configured secret manager in production. It is never included in a settings response, audit record, frontend bundle, or browser storage.

Back up and restore the Docker database from the host:

```powershell
docker exec getafe-postgres pg_dump -U getafe_app -d getafe_portal -Fc > getafe_portal.backup
Get-Content .\getafe_portal.backup -Encoding Byte | docker exec -i getafe-postgres pg_restore -U getafe_app -d getafe_portal --clean --if-exists
```

To move to Azure Database for PostgreSQL, change only `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_SSL=true` (or use `DATABASE_URL`); run the same migrations and keep application repositories unchanged.
