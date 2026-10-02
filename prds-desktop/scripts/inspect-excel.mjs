import xlsx from 'xlsx';
import path from 'path';

const files = [
  'InventoryForm.xlsx',
  'RequestIssuanceSlip.xlsx',
  'Dispensing.xlsx',
  'ListOfMedicine.xlsx'
];

const clientDataDir = 'd:/prds/documentation/6-ClientData';

for (const fileName of files) {
  const filePath = path.join(clientDataDir, fileName);
  console.log(`\n======================================================`);
  console.log(`FILE: ${fileName}`);
  console.log(`======================================================`);
  try {
    const workbook = xlsx.readFile(filePath);
    console.log(`Sheet Names:`, workbook.SheetNames);
    
    for (const sheetName of workbook.SheetNames) {
      console.log(`\n--- Sheet: "${sheetName}" ---`);
      const sheet = workbook.Sheets[sheetName];
      console.log(`Range:`, sheet['!ref']);
      if (sheet['!merges']) {
        console.log(`Merges count:`, sheet['!merges'].length);
        console.log(`Sample merges:`, sheet['!merges'].slice(0, 10));
      }
      
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      console.log(`Total Rows:`, data.length);
      console.log(`--- Rows Preview ---`);
      data.slice(0, 35).forEach((row, i) => {
        const nonNull = row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '');
        if (nonNull.some(c => c !== '')) {
          console.log(`R${i + 1}:`, JSON.stringify(nonNull));
        } else {
          console.log(`R${i + 1}: [EMPTY]`);
        }
      });
      if (data.length > 35) {
        console.log(`... (${data.length - 35} more rows) ...`);
        console.log(`--- Last 10 rows ---`);
        data.slice(-10).forEach((row, idx) => {
          const actualIdx = data.length - 10 + idx + 1;
          const nonNull = row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '');
          if (nonNull.some(c => c !== '')) {
            console.log(`R${actualIdx}:`, JSON.stringify(nonNull));
          }
        });
      }
    }
  } catch (err) {
    console.error(`Error reading ${fileName}:`, err.message);
  }
}
