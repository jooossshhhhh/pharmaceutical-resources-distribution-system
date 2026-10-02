import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const appData =
  process.env.APPDATA ||
  (process.platform === "darwin"
    ? `${process.env.HOME}/Library/Application Support`
    : `${process.env.HOME}/.config`);
const dbDir = path.join(appData, "com.prds.naga");
const dbPath = path.join(dbDir, "prds.db");
const inspectPath = path.join(dbDir, "prds_inspect.db");

if (!fs.existsSync(dbPath)) {
  console.log(`Database not found at: ${dbPath}`);
  process.exit(1);
}

try {
  const db = new DatabaseSync(dbPath);
  try {
    db.prepare("PRAGMA wal_checkpoint(PASSIVE)").get();
  } catch {}

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all();

  console.log("\n=======================================================");
  console.log("  PRDS Desktop Local SQLite Database Status");
  console.log("  Live Path:", dbPath);
  console.log("=======================================================\n");

  const tableData = [];
  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT count(*) as count FROM "${t.name}"`).get();
      tableData.push({ Table: t.name, Rows: row.count });
    } catch (e) {
      tableData.push({ Table: t.name, Rows: `Error (${e.message})` });
    }
  }
  console.table(tableData);

  // Create safe inspection copy
  fs.copyFileSync(dbPath, inspectPath);
  console.log("\n[SAFE INSPECTION COPY CREATED]");
  console.log("Inspect Copy Path:", inspectPath);
  console.log("You can safely open this copy in DB Browser for SQLite without any risk of app file locking or os error 32.\n");
} catch (err) {
  console.error("Failed to inspect database:", err);
}
