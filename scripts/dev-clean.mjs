import { execSync } from "node:child_process";
import { spawn } from "node:child_process";

const ports = [5173, 5174, 5175, 5176, 5177];

if (process.platform === "win32") {
  for (const port of ports) {
    try {
      const output = execSync(`netstat -ano | findstr ":${port}"`, { encoding: "utf8" });
      const pids = new Set(
        output
          .split(/\r?\n/)
          .map((line) => line.trim().split(/\s+/).pop())
          .filter((pid) => pid && /^\d+$/.test(pid)),
      );
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        } catch {
          // Process may already be gone.
        }
      }
    } catch {
      // Nothing listening on this port.
    }
  }
}

const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
});

child.on("exit", (code) => process.exit(code ?? 0));
