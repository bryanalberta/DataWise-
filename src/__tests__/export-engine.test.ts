import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  escapeCsvField,
  serializeToCsv,
  serializeToXlsx,
  sanitizeSheetName,
  sanitizeFileName,
} from '../lib/export-engine';
import { executeRecipe } from '../lib/recipe-engine';
import { ColumnSchema, RecipeStep } from '../types';

describe('TASK-FNC-06 — CSV/XLSX Export Studio & Serialization Engine', () => {
  const sampleColumns: ColumnSchema[] = [
    { id: 'c1', name: 'id_pegawai', type: 'Text' },
    { id: 'c2', name: 'nama_lengkap', type: 'Text' },
    { id: 'c3', name: 'gaji', type: 'Numeric' },
    { id: 'c4', name: 'aktif', type: 'Boolean' },
    { id: 'c5', name: 'alamat', type: 'Text' },
    { id: 'c6', name: 'catatan', type: 'Text' },
  ];

  const sampleData: Record<string, unknown>[] = [
    {
      id_pegawai: '007', // Leading zero
      nama_lengkap: 'James "Bond" Agent', // Quotes inside field
      gaji: 15000000.5,
      aktif: true,
      alamat: 'Jakarta, Indonesia', // Delimiter inside field
      catatan: 'Prioritas tinggi:\nPeriksa segera', // Multiline field
    },
    {
      id_pegawai: '012345', // Leading zero
      nama_lengkap: 'Budi Santoso ✨', // Unicode / Emoji
      gaji: 8000000,
      aktif: false,
      alamat: 'Surabaya; Jawa Timur',
      catatan: 'Pegawai berprestasi 2024',
    },
    {
      id_pegawai: '085700',
      nama_lengkap: 'Citra Lestari',
      gaji: null, // Missing value
      aktif: true,
      alamat: '',
      catatan: null, // Missing value
    },
  ];

  // =========================================================================
  // 1. CSV SERIALIZATION & RFC 4180 COMPLIANCE TESTS
  // =========================================================================
  describe('1. CSV Serialization & Escaping (RFC 4180)', () => {
    it('1.1. escapeCsvField meng-escape tanda kutip, delimiter, dan newline secara benar', () => {
      // Nilai null/undefined menjadi string kosong
      assert.equal(escapeCsvField(null), '');
      assert.equal(escapeCsvField(undefined), '');

      // Teks biasa tanpa karakter khusus tidak dibungkus kutip
      assert.equal(escapeCsvField('Jakarta'), 'Jakarta');
      assert.equal(escapeCsvField(12345), '12345');
      assert.equal(escapeCsvField(true), 'true');

      // Teks berisi koma dibungkus tanda kutip
      assert.equal(escapeCsvField('Jakarta, Barat', ','), '"Jakarta, Barat"');

      // Teks berisi tanda kutip di-escape menjadi ganda ("") dan dibungkus kutip
      assert.equal(escapeCsvField('Halo "Dunia"', ','), '"Halo ""Dunia"""');

      // Teks multiline dibungkus tanda kutip
      assert.equal(escapeCsvField('Baris 1\nBaris 2', ','), '"Baris 1\nBaris 2"');
    });

    it('1.2. serializeToCsv menyertakan UTF-8 BOM secara default untuk kompatibilitas Excel', () => {
      const csv = serializeToCsv(sampleData, sampleColumns);
      // Byte order mark UTF-8 (\uFEFF)
      assert.ok(csv.startsWith('\uFEFF'), 'CSV harus diawali dengan UTF-8 BOM');
    });

    it('1.3. Round-trip CSV: Papa Parse membaca kembali seluruh kolom, baris, quotes, newline, dan leading zeros', () => {
      const csv = serializeToCsv(sampleData, sampleColumns, { delimiter: ',', includeBom: true });

      // Parsing kembali menggunakan Papa Parse
      const parsed = Papa.parse<Record<string, string>>(csv, {
        header: true,
        skipEmptyLines: true,
      });

      assert.equal(parsed.errors.length, 0, 'Tidak boleh ada parsing errors');
      assert.equal(parsed.data.length, 3, 'Jumlah baris hasil parse harus tepat 3');

      // Periksa baris 1
      const row1 = parsed.data[0];
      assert.equal(row1.id_pegawai, '007', 'Leading zero pada ID harus tetap terjaga');
      assert.equal(row1.nama_lengkap, 'James "Bond" Agent', 'Tanda kutip internal harus ter-unescape sempurna');
      assert.equal(row1.gaji, '15000000.5');
      assert.equal(row1.aktif, 'true');
      assert.equal(row1.alamat, 'Jakarta, Indonesia', 'Koma di dalam alamat tidak memecah kolom');
      assert.equal(row1.catatan, 'Prioritas tinggi:\nPeriksa segera', 'Newline di dalam catatan tidak memecah baris');

      // Periksa baris 2 (Unicode & emoji)
      const row2 = parsed.data[1];
      assert.equal(row2.id_pegawai, '012345');
      assert.equal(row2.nama_lengkap, 'Budi Santoso ✨', 'Karakter Unicode / emoji terjaga 100%');

      // Periksa baris 3 (Missing values)
      const row3 = parsed.data[2];
      assert.equal(row3.id_pegawai, '085700');
      assert.equal(row3.gaji, '', 'Missing numeric diserialisasi menjadi field kosong');
      assert.equal(row3.catatan, '', 'Missing text diserialisasi menjadi field kosong');
    });

    it('1.4. Mendukung delimiter kustom titik koma (;) dan tab (\\t)', () => {
      // Titik koma
      const csvSemicolon = serializeToCsv(sampleData, sampleColumns, { delimiter: ';' });
      const parsedSemicolon = Papa.parse<Record<string, string>>(csvSemicolon, {
        header: true,
        delimiter: ';',
        skipEmptyLines: true,
      });
      assert.equal(parsedSemicolon.data.length, 3);
      assert.equal(parsedSemicolon.data[0].id_pegawai, '007');

      // Tab (TSV)
      const csvTab = serializeToCsv(sampleData, sampleColumns, { delimiter: '\t' });
      const parsedTab = Papa.parse<Record<string, string>>(csvTab, {
        header: true,
        delimiter: '\t',
        skipEmptyLines: true,
      });
      assert.equal(parsedTab.data.length, 3);
      assert.equal(parsedTab.data[0].alamat, 'Jakarta, Indonesia');
    });

    it('1.5. Menangani dataset kosong (0 baris) dengan mempertahankan baris header', () => {
      const csvEmpty = serializeToCsv([], sampleColumns);
      const parsed = Papa.parse(csvEmpty, { header: true });
      assert.deepEqual(parsed.meta.fields, sampleColumns.map((c) => c.name));
      assert.equal(parsed.data.length, 0);
    });
  });

  // =========================================================================
  // 2. EXCEL XLSX SERIALIZATION TESTS
  // =========================================================================
  describe('2. Excel XLSX Serialization & SheetJS Round-trip', () => {
    it('2.1. serializeToXlsx menghasilkan ArrayBuffer yang valid dan dapat dibaca SheetJS', () => {
      const buffer = serializeToXlsx(sampleData, sampleColumns, { sheetName: 'Karyawan Aktif' });
      assert.ok(buffer instanceof ArrayBuffer);
      assert.ok(buffer.byteLength > 0, 'Buffer workbook tidak boleh 0 byte');

      const workbook = XLSX.read(buffer, { type: 'array' });
      assert.deepEqual(workbook.SheetNames, ['Karyawan Aktif']);

      const worksheet = workbook.Sheets['Karyawan Aktif'];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        raw: true,
        defval: '',
      });

      assert.equal(rows.length, 3);

      // Baris 1: ID dengan leading zero harus bertipe string '007'
      const row1 = rows[0];
      assert.strictEqual(row1.id_pegawai, '007', 'ID pegawai harus tetap string dengan leading zero');
      assert.strictEqual(row1.nama_lengkap, 'James "Bond" Agent');
      assert.strictEqual(row1.gaji, 15000000.5, 'Nilai gaji harus tetap berupa angka floating point');
      assert.strictEqual(row1.aktif, true, 'Status aktif harus berupa boolean');
      assert.strictEqual(row1.alamat, 'Jakarta, Indonesia');
      assert.strictEqual(row1.catatan, 'Prioritas tinggi:\nPeriksa segera');

      // Baris 2: Unicode
      const row2 = rows[1];
      assert.strictEqual(row2.id_pegawai, '012345');
      assert.strictEqual(row2.nama_lengkap, 'Budi Santoso ✨');
      assert.strictEqual(row2.gaji, 8000000);
      assert.strictEqual(row2.aktif, false);

      // Baris 3: Missing
      const row3 = rows[2];
      assert.strictEqual(row3.id_pegawai, '085700');
      assert.strictEqual(row3.gaji, '', 'Missing value diisi default kosong');
    });

    it('2.2. Membersihkan nama sheet yang melanggar batasan Excel (panjang > 31 atau karakter terlarang)', () => {
      assert.equal(sanitizeSheetName('Data/Penjualan*2024:Q1?'), 'Data_Penjualan_2024_Q1_');
      assert.equal(sanitizeSheetName('Nama_Sheet_Yang_Sangat_Panjang_Sekali_Lebih_Dari_31_Karakter'), 'Nama_Sheet_Yang_Sangat_Panjang_');
      assert.equal(sanitizeSheetName('', 'Sheet1'), 'Sheet1');

      const buffer = serializeToXlsx(sampleData, sampleColumns, {
        sheetName: 'Laporan/[Tahunan]*2024',
      });
      const workbook = XLSX.read(buffer, { type: 'array' });
      assert.equal(workbook.SheetNames[0], 'Laporan__Tahunan__2024');
    });

    it('2.3. Menangani dataset kosong (0 baris) dengan mempertahankan header kolom di worksheet', () => {
      const buffer = serializeToXlsx([], sampleColumns, { sheetName: 'Kosong' });
      const workbook = XLSX.read(buffer, { type: 'array' });
      const worksheet = workbook.Sheets['Kosong'];

      // Ambil header
      const headers = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
      assert.equal(headers.length, 1);
      assert.deepEqual(headers[0], sampleColumns.map((c) => c.name));
    });
  });

  // =========================================================================
  // 3. INTEGRASI RECIPE CLEANING & PIPELINE INVARIANCE
  // =========================================================================
  describe('3. Integrasi Dataset Aktif Hasil Recipe (FNC-04)', () => {
    it('3.1. Ekspor mencerminkan perubahan recipe (imputasi, drop row, rename, drop column)', () => {
      const rawData: Record<string, unknown>[] = [
        { id: '1', kota: ' Jakarta ', skor: null },
        { id: '2', kota: 'Surabaya', skor: 85 },
        { id: '3', kota: null, skor: 90 },
      ];
      const rawColumns: ColumnSchema[] = [
        { id: 'c1', name: 'id', type: 'Text' },
        { id: 'c2', name: 'kota', type: 'Text' },
        { id: 'c3', name: 'skor', type: 'Numeric' },
      ];

      // Langkah 1: Imputasi Mean pada skor (nilai 85 dan 90 -> mean = 87.5)
      const step1: RecipeStep = {
        id: 's1',
        type: 'IMPUTE_MISSING',
        targetColumn: 'skor',
        method: 'Mean',
        timestamp: Date.now(),
        description: 'Imputasi skor dengan mean',
      };

      // Langkah 2: Trim Whitespace pada kota
      const step2: RecipeStep = {
        id: 's2',
        type: 'TRIM_WHITESPACE',
        targetColumns: ['kota'],
        timestamp: Date.now(),
        description: 'Trim kota',
      };

      // Langkah 3: Rename column kota -> nama_kota
      const step3: RecipeStep = {
        id: 's3',
        type: 'RENAME_COLUMN',
        targetColumn: 'kota',
        newName: 'nama_kota',
        timestamp: Date.now(),
        description: 'Rename kota',
      };

      // Langkah 4: Drop missing rows pada nama_kota (menghapus baris ke-3 yang kota: null)
      const step4: RecipeStep = {
        id: 's4',
        type: 'DROP_MISSING',
        targetColumns: ['nama_kota'],
        timestamp: Date.now(),
        description: 'Hapus baris missing nama_kota',
      };

      const recipeResult = executeRecipe(rawData, rawColumns, [step1, step2, step3, step4]);
      assert.equal(recipeResult.data.length, 2, 'Tersisa 2 baris setelah drop');

      // Ekspor ke CSV
      const csv = serializeToCsv(recipeResult.data, recipeResult.columns);
      const parsedCsv = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });

      assert.deepEqual(parsedCsv.meta.fields, ['id', 'nama_kota', 'skor'], 'Header kolom harus mencerminkan rename');
      assert.equal(parsedCsv.data.length, 2);
      assert.equal(parsedCsv.data[0].nama_kota, 'Jakarta', 'Spasi pada kota harus ter-trim');
      assert.equal(parsedCsv.data[0].skor, '87.5', 'Skor missing harus terimputasi 87.5');

      // Ekspor ke XLSX
      const xlsxBuffer = serializeToXlsx(recipeResult.data, recipeResult.columns, { sheetName: 'Cleaned' });
      const workbook = XLSX.read(xlsxBuffer, { type: 'array' });
      const xlsxRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Cleaned'], { raw: true });

      assert.equal(xlsxRows.length, 2);
      assert.strictEqual(xlsxRows[0].nama_kota, 'Jakarta');
      assert.strictEqual(xlsxRows[0].skor, 87.5);
    });

    it('3.2. Ekspor setelah Reset ke Data Asli menghasilkan data mentah awal yang 100% utuh', () => {
      const rawData = [
        { id: '1', nilai: null },
        { id: '2', nilai: 100 },
      ];
      const rawColumns: ColumnSchema[] = [
        { id: 'c1', name: 'id', type: 'Text' },
        { id: 'c2', name: 'nilai', type: 'Numeric' },
      ];

      // Jika di-reset (recipe kosong []), data yang diekspor kembali sama persis dengan rawData
      const csv = serializeToCsv(rawData, rawColumns);
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });

      assert.equal(parsed.data.length, 2);
      assert.equal(parsed.data[0].nilai, '', 'Nilai kembali null/kosong');
      assert.equal(parsed.data[1].nilai, '100');
    });
  });

  // =========================================================================
  // 4. SANITIZE FILE NAME UTILITIES
  // =========================================================================
  describe('4. File Name Sanitization', () => {
    it('4.1. sanitizeFileName membersihkan karakter ilegal file system pada berbagai OS', () => {
      assert.equal(sanitizeFileName('Laporan:Penjualan/2024*Q1?.csv'), 'Laporan_Penjualan_2024_Q1_.csv');
      assert.equal(sanitizeFileName('..hidden_file'), 'hidden_file');
      assert.equal(sanitizeFileName('   '), 'datawise_export');
      assert.equal(sanitizeFileName('Valid_Dataset_Name'), 'Valid_Dataset_Name');
    });
  });
});
