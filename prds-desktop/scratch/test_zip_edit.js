import * as XLSX from 'xlsx';
import fs from 'fs';

const defaultExport = Reflect.get(XLSX, 'default');
const cfb = XLSX.CFB || defaultExport?.CFB;

const buf = fs.readFileSync('d:/prds/documentation/6-ClientData/InventoryForm.xlsx');
const zip = cfb.read(buf, { type: 'buffer' });
const s1Entry = cfb.find(zip, 'sheet1.xml') || cfb.find(zip, '/xl/worksheets/sheet1.xml');
let xml = new TextDecoder('utf-8').decode(s1Entry.content);

// Replace D4, I4, AE4
const monthHeader = 'MONTH : JULY 31, 2026';
const begHeader = 'BEGINNING BALANCE AS OF                                                         JUNE 30, 2026';
const remHeader = 'REMAINING BALANCE  AS OF JULY 31, 2026';

xml = xml.replace(/<c r="D4"[^>]*>[\s\S]*?<\/c>/, `<c r="D4" s="75" t="inlineStr"><is><t>${monthHeader}</t></is></c>`);
xml = xml.replace(/<c r="I4"[^>]*>[\s\S]*?<\/c>/, `<c r="I4" s="76" t="inlineStr"><is><t>${begHeader}</t></is></c>`);
xml = xml.replace(/<c r="AE4"[^>]*>[\s\S]*?<\/c>/, `<c r="AE4" s="73" t="inlineStr"><is><t>${remHeader}</t></is></c>`);

s1Entry.content = new TextEncoder().encode(xml);
s1Entry.size = s1Entry.content.length;

const outBuf = cfb.write(zip, { fileType: 'zip', type: 'buffer' });
console.log('Successfully wrote zip buffer with cfb, length:', outBuf.length);

// Read back with XLSX to verify
const wb = XLSX.read(outBuf, { type: 'buffer', cellStyles: true });
const ws = wb.Sheets[wb.SheetNames[0]];
console.log('D4 value:', ws['D4']?.v);
console.log('I4 value:', ws['I4']?.v);
console.log('AE4 value:', ws['AE4']?.v);
