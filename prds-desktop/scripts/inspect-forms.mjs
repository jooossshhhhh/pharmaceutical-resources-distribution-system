import xlsx from 'xlsx';
import path from 'path';

const clientDataDir = 'd:/prds/documentation/6-ClientData';

function inspectFile(fileName) {
  const filePath = path.join(clientDataDir, fileName);
  console.log(`\n======================================================`);
  console.log(`DETAILED FILE INSPECTION: ${fileName}`);
  console.log(`======================================================`);
  const workbook = xlsx.readFile(filePath);
  
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n------------------------------------------------------`);
    console.log(`SHEET: "${sheetName}"`);
    console.log(`------------------------------------------------------`);
    const sheet = workbook.Sheets[sheetName];
    console.log(`Range:`, sheet['!ref']);
    console.log(`Merges:`, JSON.stringify(sheet['!merges'] || []));
    
    // Get all cells with formulas or values
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    console.log(`Total Rows:`, data.length);
    data.forEach((row, i) => {
      const nonNull = row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '');
      if (nonNull.some(c => c !== '')) {
        console.log(`R${i + 1}: ${JSON.stringify(nonNull)}`);
      }
    });
  }
}

inspectFile('InventoryForm.xlsx');
inspectFile('RequestIssuanceSlip.xlsx');
