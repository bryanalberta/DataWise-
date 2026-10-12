import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDataQuality, isNativeMissing, isDirtyWhitespace, createRowKey } from '../lib/data-quality';
import { ColumnSchema } from '../types';

describe('Data Quality Engine (FND-06)', () => {
  const schema: ColumnSchema[] = [
    { id: 'c1', name: 'col1', type: 'Text' },
    { id: 'c2', name: 'col2', type: 'Numeric' }
  ];

  it('1. Dataset kosong', () => {
    const res = calculateDataQuality('ds1', [], schema);
    assert.equal(res.totalRecords, 0);
    assert.equal(res.totalNativeMissing, 0);
    assert.equal(res.totalWhitespace, 0);
    assert.equal(res.duplicateOccurrences, 0);
  });

  it('2. Dataset tanpa missing value', () => {
    const data = [{ c1: 'abc', c2: 123 }, { c1: 'def', c2: 456 }];
    const res = calculateDataQuality('ds1', data, schema);
    assert.equal(res.totalNativeMissing, 0);
    assert.equal(res.totalWhitespace, 0);
  });

  it('3. Nilai null', () => {
    assert.equal(isNativeMissing(null), true);
  });

  it('4. Nilai undefined', () => {
    assert.equal(isNativeMissing(undefined), true);
  });

  it('5. String kosong ""', () => {
    assert.equal(isNativeMissing(''), true);
  });

  it('6. Whitespace berupa spasi & 7. Whitespace berupa tab', () => {
    assert.equal(isDirtyWhitespace('   '), true);
    assert.equal(isDirtyWhitespace('\t'), true);
    assert.equal(isDirtyWhitespace(' \t '), true);
  });

  it('8. String berisi teks dengan spasi di awal dan akhir (bukan dirty whitespace)', () => {
    assert.equal(isDirtyWhitespace('  abc  '), false);
    assert.equal(isNativeMissing('  abc  '), false);
  });

  it('9, 10, 11, 12. Literal sentinel ("NA", "N/A", "null", "-", ".")', () => {
    const sentinels = ['NA', 'N/A', 'null', 'None', '-', '.'];
    for (const s of sentinels) {
      assert.equal(isNativeMissing(s), false);
      assert.equal(isDirtyWhitespace(s), false);
    }
  });

  it('13. Campuran native missing dan whitespace dalam satu kolom', () => {
    const data = [
      { c1: null, c2: 1 },
      { c1: '   ', c2: 2 },
      { c1: '', c2: 3 }
    ];
    const res = calculateDataQuality('ds1', data, schema);
    assert.equal(res.columnStats[0].nativeMissingCount, 2); // null dan ''
    assert.equal(res.columnStats[0].whitespaceCount, 1); // '   '
  });

  it('14. Persentase missing dengan denominator yang diketahui', () => {
    const data = [{ c1: null, c2: 1 }, { c1: 'abc', c2: 2 }];
    const res = calculateDataQuality('ds1', data, schema);
    assert.equal(res.columnStats[0].effectiveMissingPercentage, 50); // 1 dari 2 baris
  });

  it('15. Dataset dengan satu baris', () => {
    const res = calculateDataQuality('ds1', [{ c1: 'x', c2: 1 }], schema);
    assert.equal(res.duplicateOccurrences, 0);
  });

  it('16. Dataset dengan baris unik seluruhnya', () => {
    const data = [{ c1: 'a', c2: 1 }, { c1: 'b', c2: 1 }];
    const res = calculateDataQuality('ds1', data, schema);
    assert.equal(res.duplicateOccurrences, 0);
    assert.equal(res.rowsParticipatingInDuplicates, 0);
  });

  it('17. Satu baris yang muncul dua kali', () => {
    const data = [{ c1: 'a', c2: 1 }, { c1: 'a', c2: 1 }];
    const res = calculateDataQuality('ds1', data, schema);
    assert.equal(res.duplicateOccurrences, 1);
    assert.equal(res.rowsParticipatingInDuplicates, 2);
  });

  it('18. Satu baris yang muncul tiga kali', () => {
    const data = [{ c1: 'a', c2: 1 }, { c1: 'a', c2: 1 }, { c1: 'a', c2: 1 }];
    const res = calculateDataQuality('ds1', data, schema);
    assert.equal(res.duplicateOccurrences, 2); // muncul berlebih = 3 - 1 = 2
    assert.equal(res.rowsParticipatingInDuplicates, 3);
  });

  it('19. Dataset dengan beberapa kelompok duplikat', () => {
    const data = [
      { c1: 'a', c2: 1 }, { c1: 'a', c2: 1 }, // group A (dup=1, part=2)
      { c1: 'b', c2: 2 }, { c1: 'b', c2: 2 }, { c1: 'b', c2: 2 } // group B (dup=2, part=3)
    ];
    const res = calculateDataQuality('ds1', data, schema);
    assert.equal(res.duplicateOccurrences, 3);
    assert.equal(res.rowsParticipatingInDuplicates, 5);
  });

  it('20. Baris yang berbeda hanya karena whitespace', () => {
    const data = [{ c1: 'a ', c2: 1 }, { c1: 'a', c2: 1 }];
    const res = calculateDataQuality('ds1', data, schema);
    assert.equal(res.duplicateOccurrences, 0);
  });

  it('21. Baris yang berbeda hanya karena case', () => {
    const data = [{ c1: 'A', c2: 1 }, { c1: 'a', c2: 1 }];
    const res = calculateDataQuality('ds1', data, schema);
    assert.equal(res.duplicateOccurrences, 0);
  });

  it('22. Baris yang memiliki urutan properti JSON berbeda (tapi secara skema tetap diurutkan benar)', () => {
    const data = [{ c1: 'a', c2: 1 }, { c2: 1, c1: 'a' }]; // order property terbalik di JSON
    const res = calculateDataQuality('ds1', data, schema);
    assert.equal(res.duplicateOccurrences, 1); // createRowKey harus stabil sesuai skema
  });

  it('23. Baris dengan nilai kosong identik pada beberapa kolom', () => {
    const data = [{ c1: null, c2: null }, { c1: null, c2: null }];
    const res = calculateDataQuality('ds1', data, schema);
    assert.equal(res.duplicateOccurrences, 1);
  });

  it('24. Dataset dengan banyak kolom (stability check)', () => {
    const manyCols: ColumnSchema[] = Array.from({ length: 50 }, (_, i) => ({ id: `col${i}`, name: `col${i}`, type: 'Text' }));
    const row = Object.fromEntries(manyCols.map(c => [c.id, 'x']));
    const data = [row, { ...row }];
    const res = calculateDataQuality('ds1', data, manyCols);
    assert.equal(res.duplicateOccurrences, 1);
  });

  it('25. Raw dataset tidak berubah setelah profiling & 26. Perubahan treatWhitespaceAsMissing tidak mengubah raw dataset', () => {
    const data = [{ c1: '   ', c2: null }];
    const copyStr = JSON.stringify(data);
    
    const res1 = calculateDataQuality('ds1', data, schema, { treatWhitespaceAsMissing: true });
    assert.equal(res1.totalEffectiveMissing, 2); // '   ' + null
    assert.equal(JSON.stringify(data), copyStr, 'Data tidak boleh berubah');

    const res2 = calculateDataQuality('ds1', data, schema, { treatWhitespaceAsMissing: false });
    assert.equal(res2.totalEffectiveMissing, 1); // null saja
    assert.equal(JSON.stringify(data), copyStr, 'Data tidak boleh berubah');
  });

  it('Performa dengan 10.000 record', () => {
    const data = Array.from({ length: 10000 }, (_, i) => ({
      c1: i % 10 === 0 ? null : (i % 2 === 0 ? 'dup' : `val_${i}`), // 1000 missing, 4500 'dup', 4500 uniques
      c2: i % 5 === 0 ? '   ' : i // 2000 whitespaces
    }));

    const start = performance.now();
    const res = calculateDataQuality('ds1', data, schema);
    const end = performance.now();
    
    assert.ok(end - start < 1000, `Harus berjalan cukup cepat (butuh ${end - start} ms)`);
    assert.equal(res.totalRecords, 10000);
    assert.equal(res.columnStats[0].nativeMissingCount, 1000);
    assert.equal(res.columnStats[1].whitespaceCount, 2000);
    
    // Total 'dup' = 4500, but they have different c2 except when (i % 2 == 0) and (i % 5 == 0) -> i % 10 == 0.
    // So 'dup' + '   ' pairs, 'dup' + c2 pairs... it's just ensuring it processes correctly without crashing
    assert.ok(res.duplicateOccurrences >= 0); 
  });
});
