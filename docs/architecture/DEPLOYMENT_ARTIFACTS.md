# Independent deployment artifacts

The portal can be deployed as three independently built browser surfaces behind one reverse proxy:

| Host | Surface |
| --- | --- |
| `public.getafe.local` | Public website |
| `resident.getafe.local` | Resident application |
| `admin.getafe.local` | Admin portal |

Every host forwards `/api/*` and `/api/v1/*` to the API container. The API is health-gated on Supabase schema readiness and Redis before the proxy starts accepting traffic.

## Build and start

```sh
npm run build:apps
npm run deploy:artifacts
docker compose -f docker-compose.apps.yml up -d --build
npm run deploy:smoke
```

The apps Compose file uses the configured managed Redis URL from its environment file.

Set `APP_PORT` to change the host port (default `8080`). In a local hosts file, map the three hostnames to `127.0.0.1` to exercise each surface through the proxy.

`npm run deploy:smoke` retries the proxy health endpoint, each surface root, and `/api/v1/ready`. Set `DEPLOYMENT_URL` when the proxy is hosted on another address.

## Health and reuse

Compose reuses existing containers by service name, restarts unhealthy services, and waits for Redis, Supabase-backed API readiness, and each static app health check before starting the reverse proxy. No database migration is run by this deployment artifact.

