import * as XLSX from 'xlsx';
import fs from 'fs';

const defaultExport = Reflect.get(XLSX, 'default');
const cfb = XLSX.CFB || defaultExport?.CFB;

const buf = fs.readFileSync('d:/prds/documentation/6-ClientData/InventoryForm.xlsx');
const zip = cfb.read(buf, { type: 'buffer' });
const s1Entry = cfb.find(zip, 'sheet1.xml') || cfb.find(zip, '/xl/worksheets/sheet1.xml');
console.log('Found sheet1.xml entry:', !!s1Entry?.name);

const xml = new TextDecoder('utf-8').decode(s1Entry.content);
console.log('XML total length:', xml.length);

// Let's print rows 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17
for (const r of [2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17]) {
  const match = xml.match(new RegExp(`<row r="${r}"[\\s\\S]*?<\\/row>`));
  if (match) {
    console.log(`\n--- ROW ${r} (length: ${match[0].length}) ---`);
    console.log(match[0].slice(0, 500));
  }
}
