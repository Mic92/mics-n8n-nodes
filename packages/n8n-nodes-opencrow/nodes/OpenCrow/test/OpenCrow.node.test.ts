import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { createMockExecuteFunctions } from "../../../../../test/helpers";
import { OpenCrow } from "../OpenCrow.node";

describe("OpenCrow node", () => {
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
    // Open read end so the write doesn't fail with ENXIO
    const readFd = fs.openSync(
      pipePath,
      fs.constants.O_RDONLY | fs.constants.O_NONBLOCK,
    );

    const node = new OpenCrow();
    const ctx = createMockExecuteFunctions({
      message: "hello from n8n",
      pipePath,
    });

    const [[result]] = await node.execute.call(ctx);

    const buf = Buffer.alloc(256);
    const bytesRead = fs.readSync(readFd, buf);
    fs.closeSync(readFd);

    expect(buf.subarray(0, bytesRead).toString()).toBe("hello from n8n\n");
    expect(result.json).toMatchObject({
      success: true,
      message: "hello from n8n",
    });
  });

  it("collapses multi-line messages to a single line", async () => {
    const readFd = fs.openSync(
      pipePath,
      fs.constants.O_RDONLY | fs.constants.O_NONBLOCK,
    );

    const node = new OpenCrow();
    const ctx = createMockExecuteFunctions({
      message: "line one\nline two\nline three",
      pipePath,
    });

    const [[result]] = await node.execute.call(ctx);

    const buf = Buffer.alloc(256);
    const bytesRead = fs.readSync(readFd, buf);
    fs.closeSync(readFd);

    expect(buf.subarray(0, bytesRead).toString()).toBe(
      "line one line two line three\n",
    );
    expect(result.json).toMatchObject({
      success: true,
      message: "line one line two line three",
    });
  });

  it("fails when no reader is attached to the pipe", async () => {
    const node = new OpenCrow();
    const ctx = createMockExecuteFunctions({
      message: "nobody home",
      pipePath,
    });

    await expect(node.execute.call(ctx)).rejects.toThrow(/not running/);
  });

  it("fails when the pipe path does not exist", async () => {
    const node = new OpenCrow();
    const ctx = createMockExecuteFunctions({
      message: "missing pipe",
      pipePath: "/nonexistent/path/trigger.pipe",
    });

    await expect(node.execute.call(ctx)).rejects.toThrow(/not found/);
  });
});
