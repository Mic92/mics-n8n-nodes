import { execSync, spawn, type ChildProcess } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const RADICALE_DIR = join(__dirname, "..", ".radicale");
const RADICALE_PORT = 5232;
const RADICALE_HOST = "127.0.0.1";
const TEST_USERNAME = "test";
const TEST_PASSWORD = "test";

async function waitForServer(
  url: string,
  timeout: number = 30000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url, {
        method: "OPTIONS",
        headers: {
          Authorization: `Basic ${Buffer.from(`${TEST_USERNAME}:${TEST_PASSWORD}`).toString("base64")}`,
        },
      });

      if (response.ok || response.status === 401) {
        return;
      }
    } catch {
      // Server not ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Radicale did not start within ${timeout}ms`);
}

export default async function globalSetup(): Promise<void> {
  const collectionsDir = join(RADICALE_DIR, "collections");
  mkdirSync(collectionsDir, { recursive: true });

  // Create test user with htpasswd
  const usersFile = join(RADICALE_DIR, "users");
  if (!existsSync(usersFile)) {
    execSync(
      `htpasswd -Bbc "${usersFile}" "${TEST_USERNAME}" "${TEST_PASSWORD}"`,
      { stdio: "ignore" },
    );
  }

  // Write Radicale config
  const configFile = join(RADICALE_DIR, "config");
  writeFileSync(
    configFile,
    `[server]
hosts = ${RADICALE_HOST}:${RADICALE_PORT}

[auth]
type = htpasswd
htpasswd_filename = ${usersFile}
htpasswd_encryption = bcrypt

[storage]
filesystem_folder = ${collectionsDir}

[logging]
level = warning
`,
  );

  const radicaleProcess: ChildProcess = spawn(
    "radicale",
    ["--config", configFile],
    {
      stdio: "ignore",
      detached: false,
    },
  );

  // Store PID for teardown
  const pidFile = join(RADICALE_DIR, "radicale.pid");
  writeFileSync(pidFile, String(radicaleProcess.pid ?? ""));

  await waitForServer(`http://${RADICALE_HOST}:${RADICALE_PORT}`);
}
