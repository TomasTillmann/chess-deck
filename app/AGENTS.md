# App Agent Notes

This folder contains the Docker Compose application: the Woodpecker API server,
its SQLite volume, and the React/Vite UI.

## Commands

- Start the full app with UI hot reload: `docker compose up --build`
- Start with Compose rebuild watch for package/Dockerfile changes: `docker compose up --build --watch`
- Stop the app: `docker compose down`
- Reset the database volume: `docker compose down -v`
- Check running services: `docker compose ps`

Run these commands from `app/`.

## Ports

- UI: `http://localhost:5174`
- API healthcheck: `http://localhost:3001/healthcheck`
- API base URL: `http://localhost:3001`

The Compose UI service maps host port `5174` to the Vite dev server and mounts
UI source/config files for default hot reload. Do not use `http://localhost:3000`
for the Docker app unless the compose port mapping has been changed.

If Docker reports permission denied for `/var/run/docker.sock`, refresh the
current shell's docker group membership with `newgrp docker`, then rerun Compose.

## Layout

- `server/`: Node/TypeScript API and SQLite persistence.
- `ui/`: React/Vite frontend. See `ui/AGENTS.md` for frontend-specific checks.

Generated files under `node_modules/`, `dist/`, `data/`, `test-results/`, and
`playwright-report/` are intentionally ignored.
