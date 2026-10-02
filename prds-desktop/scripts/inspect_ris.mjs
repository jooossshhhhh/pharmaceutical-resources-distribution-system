import * as XLSX from 'xlsx';
import fs from 'fs';

const buf = fs.readFileSync('./src/frontend/assets/templates-excel/request-issuance-slip.xlsx');
const wb = XLSX.read(buf, { type: 'buffer', cellStyles: true });

console.log('Sheet names:', wb.SheetNames);

wb.SheetNames.forEach(name => {
  console.log('\n==============================');
  console.log('Sheet:', name);
  console.log('==============================');
  const ws = wb.Sheets[name];
  console.log('Range:', ws['!ref']);
  console.log('Merges:', ws['!merges']?.map(m => XLSX.utils.encode_range(m)));
  
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z55');
  for (let R = range.s.r; R <= Math.min(range.e.r, 55); ++R) {
    let rowCells = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
      const cell = ws[cellRef];
      if (cell && cell.v !== undefined && cell.v !== '') {
        rowCells.push(`${cellRef}: ${JSON.stringify(cell.v)}`);
      }
    }
    if (rowCells.length > 0) {
      console.log(`Row ${R + 1}: ${rowCells.join(' | ')}`);
    }
  }
});
