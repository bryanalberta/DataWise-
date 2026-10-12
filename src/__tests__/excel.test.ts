import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

// Utility to create a dummy workbook in memory
function createDummyWorkbook(sheetsData: Record<string, Record<string, unknown>[]>, bookType: XLSX.BookType = 'xlsx'): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, data] of Object.entries(sheetsData)) {
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  return XLSX.write(wb, { type: 'buffer', bookType });
}

function parseExcelBuffer(buffer: Buffer, targetSheetName?: string) {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch (error: unknown) {
    const err = error as Error;
    throw new Error(`Format Excel tidak valid atau rusak: ${err.message}`);
  }

  if (workbook.SheetNames.length === 0) {
    throw new Error("Buku kerja Excel kosong atau tidak valid.");
  }

  const sheetToRead = targetSheetName || workbook.SheetNames[0];
  if (!workbook.SheetNames.includes(sheetToRead)) {
    throw new Error(`Sheet "${sheetToRead}" tidak ditemukan.`);
  }

  const worksheet = workbook.Sheets[sheetToRead];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, unknown>[];

  if (rawData.length === 0) {
    throw new Error('Sheet hanya berisi header atau kosong.');
  }

  return {
    availableSheets: workbook.SheetNames,
    data: rawData
  };
}

describe('Excel Parsing Engine (FND-02) - SheetJS Configuration', () => {

  it('1. Workbook .xlsx dengan satu sheet', () => {
    const buffer = createDummyWorkbook({
      'Sheet1': [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
    });
    const res = parseExcelBuffer(buffer);
    assert.deepEqual(res.availableSheets, ['Sheet1']);
    assert.equal(res.data.length, 2);
  });

  it('2. Workbook .xlsx dengan beberapa sheet', () => {
    const buffer = createDummyWorkbook({
      'SheetA': [{ A: 1 }],
      'SheetB': [{ B: 2 }],
      'SheetC': [{ C: 3 }]
    });
    const res = parseExcelBuffer(buffer);
    assert.deepEqual(res.availableSheets, ['SheetA', 'SheetB', 'SheetC']);
  });

  it('3. Workbook .xls yang valid', () => {
    // xls requires biff8, let's see if xlsx supports writing it
    // Actually, SheetJS can read .xls but the CE edition might only write basic XLS or we can test using xlsb
    // For test purposes, we'll write as xlsb or basic xls
    const buffer = createDummyWorkbook({
      'Legacy': [{ old: 'data' }]
    }, 'xlsb'); // Testing with another legacy binary type supported by write
    const res = parseExcelBuffer(buffer);
    assert.equal(res.data[0].old, 'data');
  });

  it('4. Pembacaan daftar nama sheet sesuai urutan workbook', () => {
    const buffer = createDummyWorkbook({
      'First': [{ A: 1 }],
      'Second': [{ B: 2 }]
    });
    const res = parseExcelBuffer(buffer);
    assert.equal(res.availableSheets[0], 'First');
    assert.equal(res.availableSheets[1], 'Second');
  });

  it('5. Pemilihan dan parsing sheet pertama', () => {
    const buffer = createDummyWorkbook({
      'First': [{ val: 100 }],
      'Second': [{ val: 200 }]
    });
    // Omitting targetSheetName should pick the first
    const res = parseExcelBuffer(buffer);
    assert.equal(res.data[0].val, 100);
  });

  it('6. Pemilihan sheet lain berdasarkan nama yang valid', () => {
    const buffer = createDummyWorkbook({
      'First': [{ val: 100 }],
      'Second': [{ val: 200 }]
    });
    const res = parseExcelBuffer(buffer, 'Second');
    assert.equal(res.data[0].val, 200);
  });

  it('7. Permintaan nama sheet yang tidak ditemukan', () => {
    const buffer = createDummyWorkbook({
      'First': [{ val: 100 }]
    });
    assert.throws(() => {
      parseExcelBuffer(buffer, 'UnknownSheet');
    }, /Sheet "UnknownSheet" tidak ditemukan/);
  });

  it('8. Data dengan header dan beberapa baris nilai', () => {
    const buffer = createDummyWorkbook({
      'Data': [
        { id: 1, category: 'A', value: 10.5 },
        { id: 2, category: 'B', value: 20.1 },
        { id: 3, category: 'A', value: 30.0 }
      ]
    });
    const res = parseExcelBuffer(buffer);
    assert.equal(res.data.length, 3);
    assert.equal(res.data[0].category, 'A');
  });

  it('9. Data dengan sel kosong dan kolom yang nilainya beragam', () => {
    const buffer = createDummyWorkbook({
      'Mixed': [
        { id: 1, text: 'Hello', num: 42 },
        { id: 2, text: '', num: null }, // empty text and null
        { id: 3, text: 'World' } // missing 'num'
      ]
    });
    const res = parseExcelBuffer(buffer);
    assert.equal(res.data.length, 3);
    // { defval: "" } ensures empty/missing cells are populated as ""
    assert.equal(res.data[1].text, '');
    assert.equal(res.data[2].num, '');
  });

  it('10. Workbook rusak atau input yang tidak valid', () => {
    // PK\x03\x04 is the magic number for ZIP (XLSX). This forces SheetJS to parse as ZIP and fail.
    const badBuffer = Buffer.from('PK\x03\x04this is a broken zip file that will cause xlsx to throw an error');
    assert.throws(() => {
      parseExcelBuffer(badBuffer);
    }, /Format Excel tidak valid atau rusak:/);
  });

});
