import { spawn } from "node:child_process";
import fs from "node:fs";
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

// Automatically load local Minisign update signing key if available
const keyPath = path.join(process.cwd(), "src-tauri", "prds-update.key");
if (!env.TAURI_SIGNING_PRIVATE_KEY && fs.existsSync(keyPath)) {
  try {
    const rawKey = fs.readFileSync(keyPath, "utf8").trim();
    if (rawKey) {
      env.TAURI_SIGNING_PRIVATE_KEY = rawKey;
      env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD =
        env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || "prds-naga-update-key-2026";
    }
  } catch (err) {
    console.warn("Could not auto-read local update signing key:", err);
  }
}

const args = process.argv.slice(2);
const isBuild = args.includes("build");

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

  if (code === 0 && isBuild) {
    try {
      generateLatestManifest();
    } catch (err) {
      console.warn("Notice: Manifest generation skipped:", err?.message || err);
    }
  }

  process.exit(code ?? 0);
});

/**
 * Generate latest.json manifest for GitHub Releases based on built signature
 */
function generateLatestManifest() {
  const tauriConfPath = path.join(process.cwd(), "src-tauri", "tauri.conf.json");
  if (!fs.existsSync(tauriConfPath)) return;

  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
  const version = tauriConf.version || "1.0.0";

  const nsisDir = path.join(
    process.cwd(),
    "src-tauri",
    "target",
    "release",
    "bundle",
    "nsis"
  );
  if (!fs.existsSync(nsisDir)) return;

  const files = fs.readdirSync(nsisDir);
  const sigFile = files.find((f) => f.endsWith(".sig"));
  const exeFile = files.find(
    (f) => f.endsWith("-setup.exe") || f.endsWith(".exe")
  );

  if (sigFile && exeFile) {
    const signature = fs.readFileSync(path.join(nsisDir, sigFile), "utf8").trim();
    const encodedExe = encodeURIComponent(exeFile);

    const manifest = {
      version,
      notes: `PRDS Naga Desktop Release v${version}. Official release for the City Health Office and all 28 Barangay Health Stations.`,
      pub_date: new Date().toISOString(),
      platforms: {
        "windows-x86_64": {
          signature,
          url: `https://github.com/jooossshhhhh/pharmaceutical-resources-distribution-system/releases/download/v${version}/${encodedExe}`,
        },
      },
    };

    const manifestContent = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(path.join(nsisDir, "latest.json"), manifestContent, "utf8");
    fs.writeFileSync(
      path.join(
        process.cwd(),
        "src-tauri",
        "target",
        "release",
        "bundle",
        "latest.json"
      ),
      manifestContent,
      "utf8"
    );
    console.log(`\n✔ Generated latest.json for version ${version} in bundle/nsis/`);
  }
}
