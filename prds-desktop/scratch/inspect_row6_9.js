import * as XLSX from 'xlsx';
import fs from 'fs';

const defaultExport = Reflect.get(XLSX, 'default');
const cfb = XLSX.CFB || defaultExport?.CFB;

const buf = fs.readFileSync('d:/prds/documentation/6-ClientData/InventoryForm.xlsx');
const zip = cfb.read(buf, { type: 'buffer' });
const s1Entry = cfb.find(zip, 'sheet1.xml') || cfb.find(zip, '/xl/worksheets/sheet1.xml');
const xml = new TextDecoder('utf-8').decode(s1Entry.content);

console.log('--- ENTIRE ROW 6 XML ---');
const r6 = xml.match(/<row r="6"[\s\S]*?<\/row>/)?.[0];
console.log(r6);

console.log('--- ENTIRE ROW 9 XML (TOTAL) ---');
const r9 = xml.match(/<row r="9"[\s\S]*?<\/row>/)?.[0];
console.log(r9);

console.log('--- D4, I4, AE4 in ROW 4 XML ---');
const r4 = xml.match(/<row r="4"[\s\S]*?<\/row>/)?.[0];
console.log('D4 cell in XML:', r4.match(/<c r="D4"[\s\S]*?<\/c>/)?.[0]);
console.log('I4 cell in XML:', r4.match(/<c r="I4"[\s\S]*?<\/c>/)?.[0]);
console.log('AE4 cell in XML:', r4.match(/<c r="AE4"[\s\S]*?<\/c>/)?.[0]);
