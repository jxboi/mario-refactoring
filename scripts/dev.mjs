import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {config} from "dotenv";

config({path: [".env.local", ".env"], quiet: true});

const vercel = fileURLToPath(new URL("../node_modules/vercel/dist/index.js", import.meta.url));
const child = spawn(process.execPath, [vercel, "dev", "--listen", "5180"], {
  stdio: "inherit",
  env: {...process.env, NODE_ENV: "development"},
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
