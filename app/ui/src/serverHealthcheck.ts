type HealthcheckResponse = {
  readonly ok: boolean;
  readonly server?: {
    readonly ok: boolean;
  };
  readonly database?: {
    readonly ok: boolean;
    readonly error?: string;
  };
};

const healthcheckUrl = new URL(
  "/healthcheck",
  import.meta.env.VITE_SERVER_URL ?? "http://127.0.0.1:3001",
).href;

const healthcheckIntervalMs = 30_000;
const healthcheckTimeoutMs = 3_000;

export function startServerHealthcheckLoop(): void {
  void checkServerHealth();
  window.setInterval(() => {
    void checkServerHealth();
  }, healthcheckIntervalMs);
}

async function checkServerHealth(): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), healthcheckTimeoutMs);

  try {
    const response = await fetch(healthcheckUrl, {
      method: "GET",
      signal: controller.signal,
    });
    const body = (await response.json()) as HealthcheckResponse;

    if (!response.ok || !body.ok || body.database?.ok === false) {
      console.error("Chess Deck server healthcheck failed", {
        status: response.status,
        body,
      });
    }
  } catch (error) {
    console.error("Chess Deck server is unhealthy", {
      reason:
        error instanceof DOMException && error.name === "AbortError"
          ? `Healthcheck timed out after ${healthcheckTimeoutMs}ms`
          : error instanceof Error
            ? error.message
            : "Unknown healthcheck error",
    });
  } finally {
    window.clearTimeout(timeout);
  }
}
