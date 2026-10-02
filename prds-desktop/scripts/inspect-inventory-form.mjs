import xlsx from 'xlsx';
import path from 'path';

const clientDataDir = 'd:/prds/documentation/6-ClientData';
const filePath = path.join(clientDataDir, 'InventoryForm.xlsx');
const workbook = xlsx.readFile(filePath);

console.log('Sheet Names:', workbook.SheetNames);
for (const sName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sName];
  console.log(`\n=== SHEET: ${sName} ===`);
  console.log('Range:', sheet['!ref']);
  console.log('Merges:', JSON.stringify(sheet['!merges']));
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  for (let i = 0; i < Math.min(data.length, 18); i++) {
    console.log(`Row ${i + 1} (${data[i].length} cols):`, JSON.stringify(data[i]));
  }
}
