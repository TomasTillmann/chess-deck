# Woodpecker App

Docker Compose runs the Woodpecker API server, its SQLite database, and the React UI.

```bash
cd app
docker compose up --build
```

Run that from the repository root. If you are already in this directory, run only
`docker compose up --build`.

Open the Docker-served UI at:

```text
http://localhost:5173
```

The API is exposed at:

```text
http://localhost:3001
```

The UI container maps host port `5173` to nginx port `80`; `http://localhost:3000`
is not used by this Compose setup.

SQLite data is mounted from `server/data` into the server container at
`/data`, so the server reads `server/data/woodpecker.sqlite`.

To reset the app containers:

```bash
docker compose down
```

If Docker reports permission denied for `/var/run/docker.sock`, refresh the
current shell's docker group membership:

```bash
newgrp docker
```

That opens a shell with refreshed group membership. Stay in that shell and rerun
`docker compose up --build` from this directory.
