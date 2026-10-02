import * as XLSX from 'xlsx';
import fs from 'fs';

const defaultExport = Reflect.get(XLSX, 'default');
const cfb = XLSX.CFB || defaultExport?.CFB;

// Helper to escape XML
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const buf = fs.readFileSync('d:/prds/documentation/6-ClientData/InventoryForm.xlsx');
const zip = cfb.read(buf, { type: 'buffer' });
const s1Entry = cfb.find(zip, 'sheet1.xml') || cfb.find(zip, '/xl/worksheets/sheet1.xml');
let xml = new TextDecoder('utf-8').decode(s1Entry.content);

// Test data
const items = [
  {
    description: 'DICYCLOVERINE 10 MG /5ML, 60 ML',
    unit: 'BOTTLE',
    brand: 'MYRENTYL',
    lot: 'ZMN073',
    expiry: '2026-12-31',
    begQty: 54,
    unitCost: 35,
    addQty: 0,
    progQty: 2,
    progName: 'ANTI-RABIES MISSION',
    expQty: 0,
    remQty: 42,
  },
  {
    description: 'CHLORPROMAZINE 100 MG',
    unit: 'TABLET',
    brand: 'GLOBAZINE',
    lot: '05GE23T01',
    expiry: '2026-08-30',
    begQty: 1670,
    unitCost: 3.75,
    addQty: 0,
    progQty: 0,
    progName: '',
    expQty: 0,
    remQty: 1670,
  },
  {
    description: 'DONEPEZIL 10MG',
    unit: 'TABLET',
    brand: 'TORPEZIL 10',
    lot: 'BZ01K004',
    expiry: '2026-10-15',
    begQty: 200,
    unitCost: 34.98,
    addQty: 0,
    progQty: 0,
    progName: '',
    expQty: 0,
    remQty: 0,
  },
  {
    description: 'PARACETAMOL 500MG',
    unit: 'TABLET',
    brand: 'BIOGESIC',
    lot: 'PARA2026',
    expiry: '2027-01-01',
    begQty: 500,
    unitCost: 4.5,
    addQty: 100,
    progQty: 0,
    progName: '',
    expQty: 0,
    remQty: 450,
  },
];

console.log('Test items count:', items.length);
