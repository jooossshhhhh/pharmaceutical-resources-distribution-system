import xlsx from 'xlsx';
import path from 'path';

const clientDataDir = 'd:/prds/documentation/6-ClientData';
const filePath = path.join(clientDataDir, 'InventoryForm.xlsx');
const workbook = xlsx.readFile(filePath);
const sheet = workbook.Sheets['Sheet1'];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

const r3 = data[2] || [];
const r4 = data[3] || [];
const r5 = data[4] || [];

console.log('COLUMN BREAKDOWN (Index: Col Letter | Header Group (R3) | Column Name (R4) | Sample Val (R5)):');
const maxLen = Math.max(r3.length, r4.length, r5.length);
for (let c = 0; c < maxLen; c++) {
  const colLetter = xlsx.utils.encode_col(c);
  console.log(`${c} (${colLetter}): [Group: "${r3[c] || ''}"] [Header: "${r4[c] || ''}"] [Val: "${r5[c] || ''}"]`);
}
