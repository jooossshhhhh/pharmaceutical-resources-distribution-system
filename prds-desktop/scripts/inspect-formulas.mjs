import xlsx from 'xlsx';
import path from 'path';

const clientDataDir = 'd:/prds/documentation/6-ClientData';
const filePath = path.join(clientDataDir, 'InventoryForm.xlsx');
const workbook = xlsx.readFile(filePath, { cellFormula: true, cellStyles: true });
const sheet = workbook.Sheets['Sheet1'];

console.log('Cell formulas in InventoryForm:');
for (const cellAddress in sheet) {
  if (cellAddress.startsWith('!')) continue;
  const cell = sheet[cellAddress];
  if (cell.f) {
    console.log(`${cellAddress}: formula = "${cell.f}", val = "${cell.v}"`);
  }
}
