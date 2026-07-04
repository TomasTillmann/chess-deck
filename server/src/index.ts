import { readConfig } from "./config.js";
import { openDatabase } from "./database.js";
import { createApp } from "./http.js";

const config = readConfig();
const db = openDatabase(config.databasePath);
const server = createApp(config, db);

server.listen(config.port, config.host, () => {
  console.log(`Server listening on http://${config.host}:${config.port}`);
  console.log(`SQLite database: ${config.databasePath}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`Received ${signal}, shutting down`);

  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
