import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

// On Windows, PATH is often keyed as "Path" instead of "PATH"
const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const env = { ...process.env };

const pathKey =
  Object.keys(env).find((k) => k.toLowerCase() === "path") || "Path";
const currentPath = env[pathKey] || "";

if (!currentPath.includes(cargoBin)) {
  const updatedPath = `${cargoBin}${path.delimiter}${currentPath}`;
  env[pathKey] = updatedPath;
  env.PATH = updatedPath;
  env.Path = updatedPath;
}

const args = process.argv.slice(2);
const child = spawn("npx tauri " + args.join(" "), {
  stdio: "inherit",
  env,
  shell: true,
});

const handleSignal = () => {
  try {
    child.kill("SIGINT");
  } catch {}
  process.exit(0);
};

process.on("SIGINT", handleSignal);
process.on("SIGTERM", handleSignal);

child.on("exit", (code) => {
  // 0xc000013a (3221225786) is Windows STATUS_CONTROL_C_EXIT (Ctrl+C)
  if (code === 0xc000013a || code === 130) {
    process.exit(0);
  }
  process.exit(code ?? 0);
});
