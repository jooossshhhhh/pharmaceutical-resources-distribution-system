const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Users/laroa/AppData/Roaming/com.prds.naga/prds.db');

const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log('TABLES AND RECORD COUNTS IN LOCAL SQLITE MIRROR:');
for (const t of tables) {
  try {
    const c = db.prepare('SELECT count(*) as count FROM ' + t.name).get().count;
    console.log(`- ${t.name}: ${c} records`);
  } catch (err) {
    console.log(`- ${t.name}: error reading (${err.message})`);
  }
}
