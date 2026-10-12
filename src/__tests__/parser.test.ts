import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';

// We test the PapaParse configuration exactly as used in the worker.
// Since testing Web Worker communication in a Node environment requires 
// complex polyfills (for Web Workers, File, and Blob objects), we focus 
// this unit test on validating the parser configuration and delimiter detection 
// against the 10 PRD-mandated edge cases. 

function parseCsvBuffer(buffer: Buffer | string, delimiter?: string) {
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf-8');
  return new Promise<{ data: Record<string, unknown>[], meta: Papa.ParseMeta }>((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      delimiter: delimiter || "",
      complete: (results) => {
        resolve({
          data: results.data as Record<string, unknown>[],
          meta: results.meta
        });
      },
      error: (error: Error) => {
        reject(error);
      }
    });
  });
}

describe('CSV/TSV Parsing Engine (FND-01) - PapaParse Configuration', () => {

  it('1. CSV dengan delimiter koma', async () => {
    const csv = `id,name,age\n1,Alice,30\n2,Bob,25`;
    const res = await parseCsvBuffer(csv);
    assert.equal(res.meta.delimiter, ',');
    assert.equal(res.data.length, 2);
    assert.deepEqual(res.data[0], { id: '1', name: 'Alice', age: '30' });
  });

  it('2. CSV dengan delimiter titik koma', async () => {
    const csv = `id;name;age\n1;Alice;30\n2;Bob;25`;
    const res = await parseCsvBuffer(csv);
    assert.equal(res.meta.delimiter, ';');
    assert.equal(res.data.length, 2);
  });

  it('3. TSV dengan delimiter tab', async () => {
    const csv = `id\tname\tage\n1\tAlice\t30\n2\tBob\t25`;
    const res = await parseCsvBuffer(csv);
    assert.equal(res.meta.delimiter, '\t');
    assert.equal(res.data[1].name, 'Bob');
  });

  it('4. Field ber-quote yang mengandung koma', async () => {
    const csv = `id,name,address\n1,Alice,"New York, NY"\n2,Bob,"Boston, MA"`;
    const res = await parseCsvBuffer(csv);
    assert.equal(res.data[0].address, 'New York, NY');
    assert.deepEqual(res.meta.fields, ['id', 'name', 'address']);
  });

  it('5. Field ber-quote yang mengandung titik koma atau tab', async () => {
    const csv = `id;name;notes\n1;Alice;"Note 1; Note 2"\n2;Bob;"Tab\tSeparated"`;
    const res = await parseCsvBuffer(csv);
    assert.equal(res.meta.delimiter, ';');
    assert.equal(res.data[0].notes, 'Note 1; Note 2');
    assert.equal(res.data[1].notes, 'Tab\tSeparated');
  });

  it('6. Escaped double quote di dalam field', async () => {
    const csv = `id,name,quote\n1,Alice,"She said ""Hello!"""\n2,Bob,"""Hi"""`;
    const res = await parseCsvBuffer(csv);
    assert.equal(res.data[0].quote, 'She said "Hello!"');
    assert.equal(res.data[1].quote, '"Hi"');
  });

  it('7. Quoted field dengan newline di dalamnya', async () => {
    const csv = `id,name,notes\n1,Alice,"Line 1\nLine 2"\n2,Bob,None`;
    const res = await parseCsvBuffer(csv);
    assert.equal(res.data.length, 2);
    assert.equal(res.data[0].notes, 'Line 1\nLine 2');
  });

  it('8. File UTF-8 yang berisi karakter non-ASCII', async () => {
    const csv = `id,name,city\n1,Budi,Yogyakarta\n2,Amélie,Paris\n3,田中,Tokyo`;
    const res = await parseCsvBuffer(csv);
    assert.equal(res.data[1].name, 'Amélie');
    assert.equal(res.data[2].name, '田中');
  });

  it('9. File dengan UTF-8 BOM dan variasi line ending', async () => {
    const csv = '\uFEFFid,name\r\n1,Alice\r\n2,Bob\r\n3,Charlie\r\n';
    const res = await parseCsvBuffer(csv);
    assert.deepEqual(res.meta.fields, ['id', 'name']);
    assert.equal(res.data.length, 3);
  });

  it('10. File dengan nilai kosong atau tanpa newline di akhir file', async () => {
    const csv = `id,name,age\n1,Alice,\n2,,25`; 
    const res = await parseCsvBuffer(csv);
    assert.equal(res.data.length, 2);
    assert.equal(res.data[0].age, '');
    assert.equal(res.data[1].name, '');
  });

});
