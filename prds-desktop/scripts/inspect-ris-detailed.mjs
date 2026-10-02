import xlsx from 'xlsx';
import path from 'path';

const clientDataDir = 'd:/prds/documentation/6-ClientData';
const filePath = path.join(clientDataDir, 'RequestIssuanceSlip.xlsx');
const wb = xlsx.readFile(filePath, { cellFormula: true });

for (const sName of wb.SheetNames) {
  console.log(`\n================== RIS SHEET: ${sName} ==================`);
  const sheet = wb.Sheets[sName];
  console.log('Range:', sheet['!ref']);
  console.log('Merges:', JSON.stringify(sheet['!merges']));
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  data.forEach((row, idx) => {
    if (row.some(c => c !== '')) {
      console.log(`R${idx + 1}:`, JSON.stringify(row));
    }
  });
}
