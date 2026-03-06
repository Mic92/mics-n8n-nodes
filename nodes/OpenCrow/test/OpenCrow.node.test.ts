import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { writeToFifo } from "../OpenCrow.node";

describe("writeToFifo", () => {
  let tmpDir: string;
  let pipePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencrow-test-"));
    pipePath = path.join(tmpDir, "trigger.pipe");
    child_process.execSync(`mkfifo ${pipePath}`);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a message through the FIFO", async () => {
    // Open read end in background so write doesn't block/ENXIO
    const readFd = fs.openSync(pipePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);

    await writeToFifo(pipePath, "hello from n8n\n");

    const buf = Buffer.alloc(256);
    const bytesRead = fs.readSync(readFd, buf);
    fs.closeSync(readFd);

    expect(buf.subarray(0, bytesRead).toString()).toBe("hello from n8n\n");
  });

  it("fails with ENXIO when no reader is attached", async () => {
    await expect(writeToFifo(pipePath, "nobody home\n")).rejects.toThrow(
      /not running/,
    );
  });

  it("fails with ENOENT for missing path", async () => {
    await expect(
      writeToFifo("/nonexistent/path/trigger.pipe", "x\n"),
    ).rejects.toThrow(/not found/);
  });
});
