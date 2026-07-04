import path from "node:path";

export type ServerConfig = {
  readonly host: string;
  readonly port: number;
  readonly databasePath: string;
};

function readPort(value: string | undefined): number {
  if (!value) return 3001;

  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: env.HOST ?? "127.0.0.1",
    port: readPort(env.PORT),
    databasePath: env.DATABASE_URL ?? path.resolve(process.cwd(), "data", "woodpecker.sqlite"),
  };
}
