import { execSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const d1StateDir = join(process.cwd(), ".wrangler", "state", "v3", "d1");

if (existsSync(d1StateDir)) {
  rmSync(d1StateDir, { recursive: true, force: true });
  console.log("Removed local D1 state.");
} else {
  console.log("No local D1 state found.");
}

execSync("npx wrangler d1 migrations apply commhub-db --local", {
  stdio: "inherit",
  cwd: process.cwd(),
});

console.log("Local database reset complete. Start the app with: npm run dev:clean");
