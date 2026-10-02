import xlsx from 'xlsx';
import path from 'path';

const clientDataDir = 'd:/prds/documentation/6-ClientData';

for (const f of ['Dispensing.xlsx', 'ListOfMedicine.xlsx']) {
  console.log(`\n================== ${f} ==================`);
  const wb = xlsx.readFile(path.join(clientDataDir, f));
  console.log('Sheets:', wb.SheetNames);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    if (data[i].some(c => c !== '')) {
      console.log(`R${i + 1}:`, JSON.stringify(data[i]));
    }
  }
}
