# Query Service (MVP)

Companion backend for APPLEDAX Query Workspace.

## Endpoints

- `POST /api/query/auth/exchange`
- `POST /api/query/auth/refresh`
- `POST /api/query/workspaces`
- `POST /api/query/datasets`
- `POST /api/query/preflight`
- `POST /api/query/execute`
- `POST /api/query/benchmark`
- `POST /api/query/trace/start` (stub)
- `POST /api/query/trace/run` (stub)
- `POST /api/query/trace/stop` (stub)

## Run

```bash
cd apps/query-service
npm install
npm run build
npm start
```

Service listens on `PORT` (default `8787`).

## Notes

- Delegated token mode is implemented.
- Service principal mode is supported behind env configuration.
- Basic in-memory rate limiting and audit logging are enabled.
- To enable service principal mode:
  - `ENABLE_SERVICE_PRINCIPAL=true`
  - `SP_TENANT_ID=<tenant-id>`
  - `SP_CLIENT_ID=<app-id>`
  - `SP_CLIENT_SECRET=<secret>`
- To tune request throttling:
  - `RATE_LIMIT_WINDOW_MS=60000`
  - `RATE_LIMIT_MAX=120`
- To expose XMLA trace placeholders (not implemented yet):
  - `ENABLE_XMLA_TRACE=true`
- Frontend still defaults to delegated mode.
