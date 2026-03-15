import { existsSync, readFileSync, rmSync, unlinkSync } from "fs";
import { join } from "path";

const RADICALE_DIR = join(__dirname, "..", ".radicale");

export default async function globalTeardown(): Promise<void> {
  const pidFile = join(RADICALE_DIR, "radicale.pid");

  if (existsSync(pidFile)) {
    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    if (pid && !isNaN(pid)) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Already dead
      }
    }
    unlinkSync(pidFile);
  }

  const collectionsDir = join(RADICALE_DIR, "collections");
  if (existsSync(collectionsDir)) {
    rmSync(collectionsDir, { recursive: true, force: true });
  }
}
