import * as XLSX from 'xlsx';
import fs from 'fs';

const defaultExport = Reflect.get(XLSX, 'default');
const cfb = XLSX.CFB || defaultExport?.CFB;

const buf = fs.readFileSync('d:/prds/documentation/6-ClientData/InventoryForm.xlsx');
const zip = cfb.read(buf, { type: 'buffer' });
const s1Entry = cfb.find(zip, 'sheet1.xml') || cfb.find(zip, '/xl/worksheets/sheet1.xml');
const xml = new TextDecoder('utf-8').decode(s1Entry.content);

const r6 = xml.match(/<row r="6"[\s\S]*?<\/row>/)?.[0];
const cells = r6.match(/<c r="[A-Z]+6"[^>]*>(?:[\s\S]*?<\/c>)?/g);
console.log('Total cells in Row 6:', cells.length);
cells.forEach(c => console.log(c));
