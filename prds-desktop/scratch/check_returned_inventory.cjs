const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Users/laroa/AppData/Roaming/com.prds.naga/prds.db');

const rows = db.prepare("SELECT id, medicine_id, batch_number, quantity, po_number, origin_facility_id, intake_type, supplier_id FROM inventory WHERE origin_facility_id IS NOT NULL OR intake_type = 'RETURN' OR po_number LIKE 'RET-%'").all();
console.log('Returned rows in inventory table count:', rows.length);
console.log(JSON.stringify(rows, null, 2));

const allInv = db.prepare("SELECT count(*) as count FROM inventory").get();
console.log('Total inventory rows in SQLite:', allInv.count);
