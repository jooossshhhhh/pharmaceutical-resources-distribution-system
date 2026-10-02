import * as XLSX from 'xlsx';
import fs from 'fs';

const defaultExport = Reflect.get(XLSX, 'default');
const cfb = XLSX.CFB || defaultExport?.CFB;

const buf = fs.readFileSync('d:/prds/documentation/6-ClientData/InventoryForm.xlsx');
const zip = cfb.read(buf, { type: 'buffer' });
const s1Entry = cfb.find(zip, 'sheet1.xml') || cfb.find(zip, '/xl/worksheets/sheet1.xml');
let xml = new TextDecoder('utf-8').decode(s1Entry.content);

// Let's inspect the sheet dimension, rows, mergeCells
console.log('Dimension in XML:', xml.match(/<dimension ref="[^"]*"/)?.[0]);
console.log('MergeCells in XML:', xml.match(/<mergeCells count="\d+">[\s\S]*?<\/mergeCells>/)?.[0]);
