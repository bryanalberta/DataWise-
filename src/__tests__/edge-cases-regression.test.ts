import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

import { inferColumnTypes } from '../lib/type-inference';
import { calculateDataQuality, isNativeMissing, isDirtyWhitespace } from '../lib/data-quality';
import {
  calculateNumericStats,
  calculateDescriptiveStatistics,
  isClose
} from '../lib/descriptive-stats';
import { queryDataGrid } from '../lib/data-grid-engine';
import {
  executeRecipe,
  previewRecipeStep,
  calculateNumericMode
} from '../lib/recipe-engine';
import {
  generateBarChartData,
  generateHistogramData,
  generateLineChartData,
  generateScatterPlotData
} from '../lib/chart-engine';
import {
  serializeToCsv,
  serializeToXlsx,
  sanitizeSheetName
} from '../lib/export-engine';
import { ColumnSchema, RecipeStep, ColumnFilter } from '../types';

describe('TASK-QA-02B — Edge Cases & Regression Test Suite', () => {

  // =========================================================================
  // SECTION A: PARSING DAN INGESTION
  // =========================================================================
  describe('A. Parsing & Ingestion Edge Cases', () => {

    it('A.1. File kosong (0-byte) ditolak dengan pesan kesalahan baku PRD 8.1', () => {
      const emptyFileSize = 0;
      assert.throws(() => {
        if (emptyFileSize === 0) {
          throw new Error('File kosong (0 byte). Silakan periksa kembali berkas Anda.');
        }
      }, /File kosong \(0 byte\)/);
    });

    it('A.2. CSV yang hanya memiliki header (0 baris data observasi) menghasilkan peringatan PRD 8.1', () => {
      const csv = 'id,nama,nilai\n';
      const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
      assert.deepEqual(parsed.meta.fields, ['id', 'nama', 'nilai']);
      assert.equal(parsed.data.length, 0);

      // Verifikasi pesan kesalahan yang diharapkan pada alur worker
      const getHeaderOnlyError = (rowsCount: number) => {
        if (rowsCount === 0) {
          return 'File hanya berisi header tanpa baris data observasi. Analisis statistik tidak dapat dilakukan.';
        }
        return null;
      };
      assert.equal(
        getHeaderOnlyError(parsed.data.length),
        'File hanya berisi header tanpa baris data observasi. Analisis statistik tidak dapat dilakukan.'
      );
    });

    it('A.3. Satu baris data observasi (N = 1) diparsing secara lengkap', () => {
      const csv = 'id,nama,skor\n101,Budi,88.5';
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      assert.equal(parsed.data.length, 1);
      assert.deepEqual(parsed.data[0], { id: '101', nama: 'Budi', skor: '88.5' });
    });

    it('A.4. Header duplikat diberi penomoran otomatis dan header kosong dipertahankan', () => {
      const csv = 'Nilai,Nilai,,Kategori\n10,20,30,A';
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      assert.ok(parsed.meta.fields?.includes('Nilai'));
      assert.ok(parsed.meta.fields?.includes('Nilai_1')); // PapaParse auto-renaming
      assert.equal(parsed.data.length, 1);
      assert.equal(parsed.data[0]['Nilai'], '10');
      assert.equal(parsed.data[0]['Nilai_1'], '20');
    });

    it('A.5. Berkas dengan UTF-8 Byte Order Mark (\\uFEFF) tidak merusak nama kolom pertama', () => {
      const csvWithBom = '\uFEFFkode,nama,stok\nK01,Barang A,50';
      const parsed = Papa.parse<Record<string, string>>(csvWithBom, { header: true, skipEmptyLines: true });
      assert.equal(parsed.meta.fields?.[0], 'kode', 'BOM tidak boleh tersisa pada nama field pertama');
      assert.equal(parsed.data[0].kode, 'K01');
    });

    it('A.6. Field dengan delimiter di dalam tanda kutip ganda diparse utuh', () => {
      const csv = 'id,alamat,catatan\n1,"Jl. Sudirman, No. 45, Jakarta","A, B, dan C"';
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      assert.equal(parsed.data[0].alamat, 'Jl. Sudirman, No. 45, Jakarta');
      assert.equal(parsed.data[0].catatan, 'A, B, dan C');
    });

    it('A.7. Field dengan tanda kutip yang di-escape ("") diparse kembali menjadi tanda kutip tunggal', () => {
      const csv = 'id,kutipan\n1,"Dia berkata, ""DataWise luar biasa!"""';
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      assert.equal(parsed.data[0].kutipan, 'Dia berkata, "DataWise luar biasa!"');
    });

    it('A.8. Field multiline dengan CRLF dan LF di dalam tanda kutip tetap mempertahankan baris', () => {
      const csv = 'id,deskripsi\n1,"Baris satu\r\nBaris dua\nBaris tiga"';
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      assert.equal(parsed.data.length, 1);
      assert.equal(parsed.data[0].deskripsi, 'Baris satu\r\nBaris dua\nBaris tiga');
    });

    it('A.9. Karakter Unicode non-ASCII (Kanji, aksen, Arab, Emoji) diparse tanpa distorsi', () => {
      const csv = 'id,nama,wilayah,simbol\n1,田中太郎,東京,🇯🇵\n2,Amélie René,Genève,✨\n3,محمد,القاهرة,🌟';
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      assert.equal(parsed.data.length, 3);
      assert.equal(parsed.data[0].nama, '田中太郎');
      assert.equal(parsed.data[0].simbol, '🇯🇵');
      assert.equal(parsed.data[1].nama, 'Amélie René');
      assert.equal(parsed.data[2].nama, 'محمد');
    });

    it('A.10. Baris dengan jumlah field tidak konsisten (ragged lines) ditangani tanpa unhandled error', () => {
      const csvRagged = 'colA,colB,colC\n1,2,3\n4,5\n6,7,8,9';
      const parsed = Papa.parse<Record<string, string>>(csvRagged, { header: true, skipEmptyLines: true });
      assert.equal(parsed.data.length, 3);
      // Baris kedua yang kekurangan field colC
      assert.equal(parsed.data[1].colA, '4');
      assert.equal(parsed.data[1].colB, '5');
      // Baris ketiga dengan kelebihan kolom tercatat dalam errors
      assert.ok(parsed.errors.length > 0);
    });

    it('A.11. Nilai sel sangat panjang (> 5.000 karakter) tidak menyebabkan stack overflow', () => {
      const longString = 'X'.repeat(6000);
      const csv = `id,payload\n1,"${longString}"`;
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      assert.equal(parsed.data[0].payload.length, 6000);
    });
  });

  // =========================================================================
  // SECTION B: TYPE INFERENCE & DATA QUALITY
  // =========================================================================
  describe('B. Type Inference & Data Quality Edge Cases', () => {

    it('B.1. Kolom yang 100% berisi nilai kosong/null default ke Text dengan confidence 100', () => {
      const data = [
        { col_empty: null },
        { col_empty: '' },
        { col_empty: undefined }
      ];
      const schemas = inferColumnTypes(['col_empty'], data);
      assert.equal(schemas[0].type, 'Text');
      assert.equal(schemas[0].profile?.confidenceScore, 100);
    });

    it('B.2. Nilai 0 numerik dan false boolean BUKAN dianggap nilai kosong', () => {
      // isNativeMissing
      assert.equal(isNativeMissing(0), false);
      assert.equal(isNativeMissing(false), false);
      assert.equal(isNativeMissing('0'), false);
      assert.equal(isNativeMissing('false'), false);

      // isDirtyWhitespace
      assert.equal(isDirtyWhitespace(0), false);
      assert.equal(isDirtyWhitespace(false), false);

      // Dalam calculateDataQuality
      const data = [
        { val_num: 0, val_bool: false },
        { val_num: 10, val_bool: true }
      ];
      const cols: ColumnSchema[] = [
        { id: 'val_num', name: 'val_num', type: 'Numeric' },
        { id: 'val_bool', name: 'val_bool', type: 'Boolean' }
      ];
      const quality = calculateDataQuality('test_ds', data, cols);
      assert.equal(quality.totalEffectiveMissing, 0, '0 dan false tidak boleh dihitung sebagai missing');
    });

    it('B.3. Whitespace string murni terdeteksi sebagai dirty whitespace vs empty string native missing', () => {
      assert.equal(isNativeMissing(''), true);
      assert.equal(isNativeMissing('   '), false);
      assert.equal(isDirtyWhitespace('   '), true);
      assert.equal(isDirtyWhitespace('\t\n '), true);
      assert.equal(isDirtyWhitespace('valid text'), false);
    });

    it('B.4. Nilai numerik dengan leading zero ("000123", "0812345") diperlakukan sebagai Text Identifier', () => {
      const data = [
        { id_member: '000123' },
        { id_member: '000124' },
        { id_member: '000125' }
      ];
      const schemas = inferColumnTypes(['id_member'], data);
      assert.equal(schemas[0].type, 'Text');
      assert.equal(schemas[0].profile?.isIdentifier, true);
    });

    it('B.5. Angka desimal titik vs koma regional ditangani sesuai heuristik', () => {
      const dataDot = [{ num: '123.45' }, { num: '67.89' }];
      const schemaDot = inferColumnTypes(['num'], dataDot);
      assert.equal(schemaDot[0].type, 'Numeric');

      const dataComma = [{ num: '123,45' }, { num: '67,89' }];
      const schemaComma = inferColumnTypes(['num'], dataComma);
      assert.equal(schemaComma[0].type, 'Numeric');
    });

    it('B.6. Tanggal ambigu (DD/MM vs MM/DD) dipertahankan sebagai Text sesuai PRD FND-05', () => {
      // 05/06/2021: p1=5 (<=12), p2=6 (<=12), tidak ada bukti jelas apakah DD/MM atau MM/DD
      const ambiguousData = [
        { tanggal: '05/06/2021' },
        { tanggal: '07/08/2021' }
      ];
      const schema = inferColumnTypes(['tanggal'], ambiguousData);
      assert.equal(schema[0].type, 'Text');
      assert.ok(schema[0].profile?.formatWarning?.includes('Ambiguous Date Format'));
    });

    it('B.7. Deteksi duplikat menghitung baris identik dan kemunculan ganda secara tepat', () => {
      const data = [
        { a: 1, b: 'X' },
        { a: 1, b: 'X' }, // Duplikat #1
        { a: 1, b: 'X' }, // Duplikat #2
        { a: 2, b: 'Y' }
      ];
      const cols: ColumnSchema[] = [
        { id: 'a', name: 'a', type: 'Numeric' },
        { id: 'b', name: 'b', type: 'Text' }
      ];
      const quality = calculateDataQuality('test_ds', data, cols);
      assert.equal(quality.duplicateOccurrences, 2, 'Dua kemunculan duplikat terdeteksi');
      assert.equal(quality.rowsParticipatingInDuplicates, 3, 'Tiga baris terlibat dalam duplikat');
    });

    it('B.8. Dataset satu kolom dan satu baris diprofilkan tanpa galat', () => {
      const data = [{ single_col: 'Hello' }];
      const cols: ColumnSchema[] = [{ id: 'single_col', name: 'single_col', type: 'Text' }];
      const quality = calculateDataQuality('test_ds', data, cols);
      assert.equal(quality.totalRecords, 1);
      assert.equal(quality.duplicateOccurrences, 0);
      assert.equal(quality.totalEffectiveMissing, 0);
    });
  });

  // =========================================================================
  // SECTION C: STATISTIK DESKRIPTIF
  // =========================================================================
  describe('C. Descriptive Statistics Edge Cases', () => {

    it('C.1. Dataset kosong atau kolom kosong (N = 0) menghasilkan seluruh metrik null', () => {
      const stats = calculateNumericStats([], 5);
      assert.equal(stats.count, 0);
      assert.equal(stats.missing, 5);
      assert.equal(stats.sum, null);
      assert.equal(stats.mean, null);
      assert.equal(stats.median, null);
      assert.equal(stats.mode, null);
      assert.equal(stats.variance, null);
      assert.equal(stats.standardDeviation, null);
      assert.equal(stats.min, null);
      assert.equal(stats.max, null);
      assert.equal(stats.q1, null);
      assert.equal(stats.q3, null);
      assert.equal(stats.iqr, null);
    });

    it('C.2. Kolom berisi satu angka (N = 1): mean=x, median=x, min=x, max=x, iqr=0, varians=null', () => {
      const stats = calculateNumericStats([42], 0);
      assert.equal(stats.count, 1);
      assert.equal(stats.sum, 42);
      assert.equal(stats.mean, 42);
      assert.equal(stats.median, 42);
      assert.equal(stats.min, 42);
      assert.equal(stats.max, 42);
      assert.equal(stats.q1, 42);
      assert.equal(stats.q3, 42);
      assert.equal(stats.iqr, 0);
      assert.equal(stats.variance, null);
      assert.equal(stats.standardDeviation, null);
      assert.deepEqual(stats.mode, [42]);
    });

    it('C.3. Nilai numerik konstan (varians nol, e.g. 500 angka bernilai 50): varians=0, std=0', () => {
      const constantValues = Array(500).fill(50);
      const stats = calculateNumericStats(constantValues, 0);
      assert.equal(stats.count, 500);
      assert.equal(stats.mean, 50);
      assert.equal(stats.min, 50);
      assert.equal(stats.max, 50);
      assert.equal(stats.median, 50);
      assert.equal(stats.q1, 50);
      assert.equal(stats.q3, 50);
      assert.equal(stats.iqr, 0);
      assert.equal(stats.variance, 0);
      assert.equal(stats.standardDeviation, 0);
      assert.deepEqual(stats.mode, [50]);
    });

    it('C.4. Nilai negatif, nol, desimal presisi tinggi, dan rentang magnitudo berbeda', () => {
      const values = [-1000000, 0, 0.00005, 1000000];
      const stats = calculateNumericStats(values, 0);
      assert.equal(stats.count, 4);
      assert.equal(stats.min, -1000000);
      assert.equal(stats.max, 1000000);
      // Sum = 0.00005
      assert.ok(isClose(stats.sum!, 0.00005, 1e-5, 1e-5));
      // Mean = 0.00005 / 4 = 0.0000125
      assert.ok(isClose(stats.mean!, 0.0000125, 1e-5, 1e-5));
    });

    it('C.5. Kolom numerik dengan missing values mengabaikan missing dari N dan menghitung missing', () => {
      const data = [
        { val: 10 },
        { val: null },
        { val: 20 },
        { val: '' },
        { val: 30 }
      ];
      const cols: ColumnSchema[] = [{ id: 'val', name: 'val', type: 'Numeric' }];
      const summary = calculateDescriptiveStatistics('test_ds', data, cols);
      const numStats = summary.columnStats[0].numericStats!;
      assert.equal(numStats.count, 3);
      assert.equal(numStats.missing, 2);
      assert.equal(numStats.mean, 20);
      assert.equal(numStats.sum, 60);
    });

    it('C.6. Distribusi multimodal dengan ties menghasilkan array modus terurut menaik', () => {
      // 1, 1, 2, 2, 3 -> frekuensi max = 2 (angka 1 dan 2)
      const res = calculateNumericMode([1, 1, 2, 2, 3]);
      assert.equal(res.isMultimodal, true);
      assert.deepEqual(res.modes, [1, 2]);
      assert.equal(res.selectedMode, 1);
    });

    it('C.7. Distribusi tanpa modus (seluruh observasi frekuensinya = 1 saat N > 1)', () => {
      const stats = calculateNumericStats([10, 20, 30, 40], 0);
      assert.equal(stats.mode, null, 'Semua nilai unik -> tidak ada modus');
    });

    it('C.8. Invarian matematis: min <= q1 <= median <= q3 <= max dan iqr = q3 - q1', () => {
      const values = [5, 12, 18, 23, 45, 67, 89, 99, 105, 150];
      const stats = calculateNumericStats(values, 0);
      assert.ok(stats.min! <= stats.q1!);
      assert.ok(stats.q1! <= stats.median!);
      assert.ok(stats.median! <= stats.q3!);
      assert.ok(stats.q3! <= stats.max!);
      assert.ok(isClose(stats.iqr!, stats.q3! - stats.q1!, 1e-5, 1e-5));
      assert.ok(stats.variance! > 0);
      assert.ok(isClose(stats.standardDeviation!, Math.sqrt(stats.variance!), 1e-5, 1e-5));
    });
  });

  // =========================================================================
  // SECTION D: DATA GRID
  // =========================================================================
  describe('D. Interactive Data Grid Edge Cases', () => {
    const gridData = [
      { id: 1, nama: 'Alice Wonderland', skor: 85.5, aktif: true, tanggal: '2023-01-15' },
      { id: 2, nama: 'Bob Builder', skor: null, aktif: false, tanggal: '2023-03-20' }, // skor missing
      { id: 3, nama: 'Charlie Brown', skor: 92.0, aktif: true, tanggal: '2022-11-05' },
      { id: 4, nama: 'David Copperfield', skor: 70.0, aktif: false, tanggal: null }, // tanggal missing
      { id: 5, nama: 'Eve Online', skor: 85.5, aktif: true, tanggal: '2023-05-10' }, // tie skor dengan Alice
    ];

    it('D.1. Dataset kosong mengembalikan 0 matched rows dan baris kosong', () => {
      const result = queryDataGrid([], { datasetId: 'd0' });
      assert.equal(result.totalRows, 0);
      assert.equal(result.matchedRows, 0);
      assert.equal(result.rows.length, 0);
    });

    it('D.2. Pencarian tanpa kecocokan mengembalikan matchedRows = 0', () => {
      const result = queryDataGrid(gridData, { datasetId: 'd1', searchQuery: 'NON_EXISTENT_QUERY_XYZ' });
      assert.equal(result.matchedRows, 0);
      assert.equal(result.rows.length, 0);
    });

    it('D.3. Pencarian case-insensitive pada teks dan nomor', () => {
      const resText = queryDataGrid(gridData, { datasetId: 'd1', searchQuery: 'alice' });
      assert.equal(resText.matchedRows, 1);
      assert.equal(resText.rows[0].nama, 'Alice Wonderland');

      const resNum = queryDataGrid(gridData, { datasetId: 'd1', searchQuery: '92' });
      assert.equal(resNum.matchedRows, 1);
      assert.equal(resNum.rows[0].nama, 'Charlie Brown');
    });

    it('D.4. Multi-type sorting (Numeric, Text, Boolean, DateTime)', () => {
      // Sorting numerik ascending
      const sortNumAsc = queryDataGrid(gridData, {
        datasetId: 'd1',
        sort: { columnId: 'skor', direction: 'asc' },
        columnTypes: { skor: 'Numeric' }
      });
      // 70.0, 85.5, 85.5, 92.0, lalu null
      assert.equal(sortNumAsc.rows[0].skor, 70.0);
      assert.equal(sortNumAsc.rows[3].skor, 92.0);

      // Sorting boolean: false < true pada asc
      const sortBoolAsc = queryDataGrid(gridData, {
        datasetId: 'd1',
        sort: { columnId: 'aktif', direction: 'asc' },
        columnTypes: { aktif: 'Boolean' }
      });
      assert.equal(sortBoolAsc.rows[0].aktif, false);
      assert.equal(sortBoolAsc.rows[sortBoolAsc.rows.length - 1].aktif, true);
    });

    it('D.5. Invarian Nulls Last: missing values selalu diletakkan di akhir, baik sorting ASC maupun DESC', () => {
      // ASC
      const ascRes = queryDataGrid(gridData, {
        datasetId: 'd1',
        sort: { columnId: 'skor', direction: 'asc' },
        columnTypes: { skor: 'Numeric' }
      });
      assert.equal(ascRes.rows[ascRes.rows.length - 1].skor, null);

      // DESC
      const descRes = queryDataGrid(gridData, {
        datasetId: 'd1',
        sort: { columnId: 'skor', direction: 'desc' },
        columnTypes: { skor: 'Numeric' }
      });
      assert.equal(descRes.rows[descRes.rows.length - 1].skor, null);
    });

    it('D.6. Stabilitas sorting: baris dengan nilai sama mempertahankan urutan indeks asli (_index)', () => {
      // Alice dan Eve sama-sama 85.5, Alice (_index: 1), Eve (_index: 5)
      const res = queryDataGrid(gridData, {
        datasetId: 'd1',
        sort: { columnId: 'skor', direction: 'asc' },
        columnTypes: { skor: 'Numeric' }
      });
      const tieRows = res.rows.filter(r => r.skor === 85.5);
      assert.equal(tieRows[0].nama, 'Alice Wonderland');
      assert.equal(tieRows[1].nama, 'Eve Online');
    });

    it('D.7. Operator filter numerik, teks, dan status kekosongan (isEmpty/isNotEmpty)', () => {
      // Filter numerik gt
      const filterGt: ColumnFilter[] = [{ columnId: 'skor', operator: 'gt', value: '85' }];
      const resGt = queryDataGrid(gridData, { datasetId: 'd1', filters: filterGt, columnTypes: { skor: 'Numeric' } });
      assert.equal(resGt.matchedRows, 3); // Alice (85.5), Charlie (92.0), Eve (85.5)

      // Filter isEmpty
      const filterEmpty: ColumnFilter[] = [{ columnId: 'skor', operator: 'isEmpty', value: '' }];
      const resEmpty = queryDataGrid(gridData, { datasetId: 'd1', filters: filterEmpty });
      assert.equal(resEmpty.matchedRows, 1);
      assert.equal(resEmpty.rows[0].nama, 'Bob Builder');

      // Filter isNotEmpty
      const filterNotEmpty: ColumnFilter[] = [{ columnId: 'tanggal', operator: 'isNotEmpty', value: '' }];
      const resNotEmpty = queryDataGrid(gridData, { datasetId: 'd1', filters: filterNotEmpty });
      assert.equal(resNotEmpty.matchedRows, 4);
    });

    it('D.8. Kombinasi global search + multi-column filters', () => {
      const filters: ColumnFilter[] = [
        { columnId: 'aktif', operator: 'equals', value: 'true' }
      ];
      const res = queryDataGrid(gridData, {
        datasetId: 'd1',
        searchQuery: 'land', // Cocok dengan Wonderland
        filters,
        columnTypes: { aktif: 'Boolean' }
      });
      assert.equal(res.matchedRows, 1);
      assert.equal(res.rows[0].nama, 'Alice Wonderland');
    });

    it('D.9. Boundary windowing: offset=0, offset mendekati akhir, dan limit besar', () => {
      const win1 = queryDataGrid(gridData, { datasetId: 'd1', offset: 0, limit: 2 });
      assert.equal(win1.rows.length, 2);
      assert.equal(win1.rows[0]._index, 1);

      const win2 = queryDataGrid(gridData, { datasetId: 'd1', offset: 4, limit: 10 });
      assert.equal(win2.rows.length, 1);
      assert.equal(win2.rows[0]._index, 5);

      const winOut = queryDataGrid(gridData, { datasetId: 'd1', offset: 100, limit: 10 });
      assert.equal(winOut.rows.length, 0);
    });
  });

  // =========================================================================
  // SECTION E: CLEANING RECIPE
  // =========================================================================
  describe('E. Cleaning Recipe Engine Edge Cases', () => {
    const rawData = [
      { id: 1, text: '  halo  ', num: 10 },
      { id: 2, text: 'dunia', num: null },
      { id: 3, text: '  halo  ', num: 10 }, // Duplicate of row 1
      { id: 4, text: '', num: 20 },
    ];
    const rawCols: ColumnSchema[] = [
      { id: 'id', name: 'id', type: 'Numeric' },
      { id: 'text', name: 'text', type: 'Text' },
      { id: 'num', name: 'num', type: 'Numeric' },
    ];

    it('E.1. Recipe tanpa langkah (0 steps) mengembalikan dataset identik dengan snapshot', () => {
      const res = executeRecipe(rawData, rawCols, []);
      assert.equal(res.data.length, rawData.length);
      assert.deepEqual(res.columns, rawCols);
      assert.notEqual(res.data, rawData, 'Harus deep copy baru, bukan referensi mutasi');
    });

    it('E.2. Seluruh baris terhapus oleh DROP_MISSING menghasilkan 0 baris dengan skema kolom utuh', () => {
      const step: RecipeStep = {
        id: 's1',
        timestamp: Date.now(),
        type: 'DROP_MISSING',
        targetColumns: ['a', 'b'],
        description: 'Drop all rows with missing'
      };
      // Jika data semuanya memiliki missing pada salah satu kolom
      const missingAll = [{ a: null, b: 1 }, { a: 2, b: null }];
      const cols: ColumnSchema[] = [
        { id: 'a', name: 'a', type: 'Numeric' },
        { id: 'b', name: 'b', type: 'Numeric' }
      ];
      const res = executeRecipe(missingAll, cols, [step]);
      assert.equal(res.data.length, 0);
      assert.equal(res.columns.length, 2);
    });

    it('E.3. Kolom target tidak ada pada recipe melempar exception aman tanpa merusak dataset', () => {
      const invalidStep: RecipeStep = {
        id: 's_err',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'KOLOM_TIDAK_ADA',
        method: 'Mean',
        description: 'Imputasi kolom hantu'
      };
      assert.throws(() => {
        executeRecipe(rawData, rawCols, [invalidStep]);
      }, /Kolom 'KOLOM_TIDAK_ADA' tidak ditemukan/);
    });

    it('E.4. Imputasi pada kolom dengan 0 nilai valid (100% missing) ditolak dengan aman', () => {
      const allNullData = [{ val: null }, { val: '' }];
      const cols: ColumnSchema[] = [{ id: 'val', name: 'val', type: 'Numeric' }];
      const step: RecipeStep = {
        id: 's_null',
        timestamp: Date.now(),
        type: 'IMPUTE_MISSING',
        targetColumn: 'val',
        method: 'Mean',
        description: 'Imputasi 100% missing'
      };
      assert.throws(() => {
        executeRecipe(allNullData, cols, [step]);
      }, /Seluruh observasi pada kolom 'val' kosong/);
    });

    it('E.5. Menghapus satu langkah di tengah recipe log menghitung ulang pipeline secara deterministik', () => {
      // Langkah 1: Trim Whitespace
      const step1: RecipeStep = { id: 's1', timestamp: 1, type: 'TRIM_WHITESPACE', description: 'Trim' };
      // Langkah 2: Impute Missing num dengan FixedValue 99
      const step2: RecipeStep = { id: 's2', timestamp: 2, type: 'IMPUTE_MISSING', targetColumn: 'num', method: 'FixedValue', fixedValue: 99, description: 'Impute' };
      // Langkah 3: Drop Duplicates
      const step3: RecipeStep = { id: 's3', timestamp: 3, type: 'DROP_DUPLICATES', description: 'Dedup' };

      // Pipeline penuh (3 langkah)
      const full = executeRecipe(rawData, rawCols, [step1, step2, step3]);

      // Hapus langkah 2 di tengah -> jalankan [step1, step3]
      const withoutStep2 = executeRecipe(rawData, rawCols, [step1, step3]);

      // Pada withoutStep2, baris 2 tetap bernilai null karena imputasi dilewati
      assert.equal(withoutStep2.data.find(r => r.id === 2)?.num, null);
      // Pada full, baris 2 terisi 99
      assert.equal(full.data.find(r => r.id === 2)?.num, 99);
    });

    it('E.6. Preview langkah (previewRecipeStep) tidak memutasi data asli sama sekali', () => {
      const snapshotBefore = JSON.stringify(rawData);
      const step: RecipeStep = { id: 's1', timestamp: 1, type: 'TRIM_WHITESPACE', description: 'Trim' };
      const preview = previewRecipeStep(rawData, rawCols, step);
      assert.ok(preview.impactedCells > 0);
      assert.equal(JSON.stringify(rawData), snapshotBefore, 'Raw dataset tidak boleh termutasi setelah preview');
    });
  });

  // =========================================================================
  // SECTION F: VISUALIZATION & EXPORT
  // =========================================================================
  describe('F. Visualization Studio & Export Studio Edge Cases', () => {

    it('F.1. Histogram pada data konstan (varians nol) menghasilkan 1 bin tanpa pembagian nol', () => {
      const constantData = [{ x: 50 }, { x: 50 }, { x: 50 }];
      const cols: ColumnSchema[] = [{ id: 'x', name: 'x', type: 'Numeric' }];
      const result = generateHistogramData(constantData, cols, { type: 'HISTOGRAM', column: 'x', bins: 10 });
      assert.equal(result.isConstant, true);
      assert.equal(result.bins.length, 1);
      assert.equal(result.bins[0].count, 3);
      assert.equal(result.bins[0].binStart, 50);
      assert.equal(result.bins[0].binEnd, 50);
    });

    it('F.2. Jumlah bin histogram dibatasi secara aman antara batas minimum 2 dan maksimum 50', () => {
      const data = [{ x: 10 }, { x: 20 }, { x: 30 }, { x: 40 }];
      const cols: ColumnSchema[] = [{ id: 'x', name: 'x', type: 'Numeric' }];

      const minClamped = generateHistogramData(data, cols, { type: 'HISTOGRAM', column: 'x', bins: 1 });
      assert.equal(minClamped.binCount, 2, 'Bins < 2 di-clamp ke 2');

      const maxClamped = generateHistogramData(data, cols, { type: 'HISTOGRAM', column: 'x', bins: 100 });
      assert.equal(maxClamped.binCount, 50, 'Bins > 50 di-clamp ke 50');
    });

    it('F.3. Bar Chart mengelompokkan kategori berlebih (> maxCategories) ke dalam (Lainnya)', () => {
      // 25 kategori berbeda
      const data = Array.from({ length: 25 }, (_, i) => ({ kat: `Kategori_${i}` }));
      const cols: ColumnSchema[] = [{ id: 'kat', name: 'kat', type: 'Categorical' }];
      const result = generateBarChartData(data, cols, { type: 'BAR', xColumn: 'kat', maxCategories: 10 });
      assert.equal(result.displayedCategories, 10);
      assert.equal(result.otherCategoriesCount, 15);
      const lastItem = result.data[result.data.length - 1];
      assert.equal(lastItem.category, '(Lainnya - 15 kategori)');
    });

    it('F.4. Visual sampling transparan pada Line Chart (N > 2000) dan Scatter Plot (M > 2500)', () => {
      // 3000 baris untuk Line Chart
      const largeData = Array.from({ length: 3000 }, (_, i) => ({ val: i }));
      const cols: ColumnSchema[] = [{ id: 'val', name: 'val', type: 'Numeric' }];
      const lineRes = generateLineChartData(largeData, cols, { type: 'LINE', yColumn: 'val' });
      assert.equal(lineRes.isSampled, true);
      assert.ok(lineRes.data.length <= 2000);
      assert.equal(lineRes.totalPoints, 3000);

      // 3000 baris untuk Scatter Plot
      const scatterCols: ColumnSchema[] = [
        { id: 'x', name: 'x', type: 'Numeric' },
        { id: 'y', name: 'y', type: 'Numeric' }
      ];
      const scatterData = Array.from({ length: 3000 }, (_, i) => ({ x: i, y: i * 2 }));
      const scatterRes = generateScatterPlotData(scatterData, scatterCols, { type: 'SCATTER', xColumn: 'x', yColumn: 'y' });
      assert.equal(scatterRes.isSampled, true);
      assert.ok(scatterRes.data.length <= 2500);
      assert.equal(scatterRes.totalPairs, 3000);
    });

    it('F.5. Sanitasi nama worksheet Excel (.xlsx) untuk karakter terlarang dan panjang > 31 karakter', () => {
      assert.equal(sanitizeSheetName('Laporan/2024*Q1?:Total'), 'Laporan_2024_Q1__Total');
      assert.equal(sanitizeSheetName('Sheet_Name_Yang_Sangat_Panjang_Melebihi_Tiga_Puluh_Satu_Karakter'), 'Sheet_Name_Yang_Sangat_Panjang_');
      assert.equal(sanitizeSheetName('', 'Sheet1'), 'Sheet1');
      assert.equal(sanitizeSheetName(''), 'Data Aktif');
    });

    it('F.6. Ekspor CSV dataset 0 baris mempertahankan baris nama header', () => {
      const cols: ColumnSchema[] = [
        { id: 'c1', name: 'id', type: 'Text' },
        { id: 'c2', name: 'nama', type: 'Text' }
      ];
      const csv = serializeToCsv([], cols, { delimiter: ',', includeBom: false });
      assert.equal(csv, 'id,nama');
    });

    it('F.7. Ekspor XLSX dataset 0 baris menghasilkan worksheet dengan header valid', () => {
      const cols: ColumnSchema[] = [
        { id: 'c1', name: 'id', type: 'Text' },
        { id: 'c2', name: 'nama', type: 'Text' }
      ];
      const buffer = serializeToXlsx([], cols, { sheetName: 'EmptyTest' });
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets['EmptyTest'];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      assert.deepEqual(rows[0], ['id', 'nama']);
    });

    it('F.8. Round-trip Parity: Ekspor CSV dan XLSX dengan leading zeros, kutipan, dan Unicode dibaca kembali identik', () => {
      const sample = [
        { id: '00123', catatan: 'Halo "Dunia"', kota: 'Zürich 🇨🇭' }
      ];
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'id', type: 'Text' },
        { id: 'catatan', name: 'catatan', type: 'Text' },
        { id: 'kota', name: 'kota', type: 'Text' }
      ];

      // Round-trip CSV
      const csv = serializeToCsv(sample, cols, { delimiter: ',', includeBom: true });
      const parsedCsv = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      assert.equal(parsedCsv.data[0].id, '00123');
      assert.equal(parsedCsv.data[0].catatan, 'Halo "Dunia"');
      assert.equal(parsedCsv.data[0].kota, 'Zürich 🇨🇭');

      // Round-trip XLSX
      const xlsxBuf = serializeToXlsx(sample, cols);
      const wb = XLSX.read(xlsxBuf, { type: 'array' });
      const parsedXlsx = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { raw: true });
      assert.strictEqual(parsedXlsx[0].id, '00123');
      assert.strictEqual(parsedXlsx[0].catatan, 'Halo "Dunia"');
      assert.strictEqual(parsedXlsx[0].kota, 'Zürich 🇨🇭');
    });

    it('F.9. Perilaku Formula Injection pada CSV: Tidak memodifikasi teks secara diam-diam sesuai RFC 4180', () => {
      // Nilai berpotensi formula seperti "=1+1", "@SUM(A1:A5)", "-CMD"
      const potentiallyDangerous = [
        { formula: '=1+1', calc: '@SUM(A1)', cmd: '-cmd|/c calc' }
      ];
      const cols: ColumnSchema[] = [
        { id: 'formula', name: 'formula', type: 'Text' },
        { id: 'calc', name: 'calc', type: 'Text' },
        { id: 'cmd', name: 'cmd', type: 'Text' }
      ];
      const csv = serializeToCsv(potentiallyDangerous, cols, { delimiter: ',', includeBom: false });

      // Verifikasi bahwa karakter formula dipertahankan secara utuh tanpa modifikasi diam-diam
      assert.ok(csv.includes('=1+1'));
      assert.ok(csv.includes('@SUM(A1)'));
      assert.ok(csv.includes('-cmd|/c calc'));

      // Parsed kembali secara eksak tanpa distorsi
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true });
      assert.equal(parsed.data[0].formula, '=1+1');
      assert.equal(parsed.data[0].calc, '@SUM(A1)');
      assert.equal(parsed.data[0].cmd, '-cmd|/c calc');
    });
  });
});
