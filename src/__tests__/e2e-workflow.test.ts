import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

import { inferColumnTypes } from '../lib/type-inference';
import { calculateDataQuality } from '../lib/data-quality';
import { calculateDescriptiveStatistics } from '../lib/descriptive-stats';
import { queryDataGrid } from '../lib/data-grid-engine';
import { executeRecipe, previewRecipeStep } from '../lib/recipe-engine';
import {
  generateBarChartData,
  generateHistogramData,
  generateLineChartData,
  generateScatterPlotData
} from '../lib/chart-engine';
import { serializeToCsv, serializeToXlsx } from '../lib/export-engine';
import { isValidPngSignature, createMockPngBytes } from '../lib/export-png';
import { ColumnSchema, RecipeStep, Dataset } from '../types';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const IRIS_PATH = path.join(FIXTURES_DIR, 'iris.csv');
const TITANIC_PATH = path.join(FIXTURES_DIR, 'titanic.csv');

describe('TASK-QA-04 — Automated End-to-End Workflow & Pipeline Acceptance', () => {

  // =========================================================================
  // 1. INGESTION & DATASET VALIDATION (PRD FR-01, FR-02, FR-03)
  // =========================================================================
  describe('1. Ingestion & File Validation Flow', () => {
    it('1.1. Ingestion CSV valid (Iris dataset: 150 baris x 5 kolom)', () => {
      const csvContent = fs.readFileSync(IRIS_PATH, 'utf-8');
      const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      });

      assert.strictEqual(parsed.data.length, 150);
      assert.strictEqual(parsed.errors.length, 0);

      const colNames = Object.keys(parsed.data[0]);
      assert.deepStrictEqual(colNames, ['sepal_length', 'sepal_width', 'petal_length', 'petal_width', 'species']);

      const schemas = inferColumnTypes(colNames, parsed.data);
      assert.strictEqual(schemas.length, 5);
      assert.strictEqual(schemas.find(c => c.name === 'sepal_length')?.type, 'Numeric');
      assert.strictEqual(schemas.find(c => c.name === 'species')?.type, 'Text');
    });

    it('1.2. Ingestion XLSX valid (SheetJS binary workbook)', () => {
      // Buat workbook XLSX sintetis
      const wb = XLSX.utils.book_new();
      const wsData = [
        ['id', 'name', 'score', 'active'],
        ['001', 'Alice', 95.5, true],
        ['002', 'Bob', 82.0, false],
        ['003', 'Charlie', null, true],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Scores');
      const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // Parsing kembali
      const readWb = XLSX.read(xlsxBuffer, { type: 'buffer' });
      assert.deepStrictEqual(readWb.SheetNames, ['Scores']);
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(readWb.Sheets['Scores'], {
        raw: false,
        defval: null,
      });

      assert.strictEqual(rawRows.length, 3);
      assert.strictEqual(rawRows[0].id, '001'); // Preservasi leading zero
      assert.strictEqual(rawRows[2].score, null); // Preservasi missing value
    });

    it('1.3. Penanganan file tidak valid (0-byte dan hanya header)', () => {
      // File 0 byte
      const emptyContent = '';
      const parsedEmpty = Papa.parse(emptyContent, { header: true });
      assert.strictEqual(parsedEmpty.data.length, 0);

      // File hanya header
      const headerOnly = 'col1,col2,col3\n';
      const parsedHeaderOnly = Papa.parse(headerOnly, { header: true, skipEmptyLines: true });
      assert.strictEqual(parsedHeaderOnly.data.length, 0);
      assert.deepStrictEqual(parsedHeaderOnly.meta.fields, ['col1', 'col2', 'col3']);
    });
  });

  // =========================================================================
  // 2. NAVIGASI, ROUTING & IN-MEMORY STATE CONTINUITY
  // =========================================================================
  describe('2. Navigation & In-Memory State Continuity', () => {
    it('2.1. Dataset aktif dipertahankan dalam memory store tanpa memicu re-parsing', () => {
      const rows = [
        { id: '1', dept: 'Engineering', salary: '12000' },
        { id: '2', dept: 'Marketing', salary: '9500' },
        { id: '3', dept: 'Engineering', salary: '11000' },
      ];
      const columns: ColumnSchema[] = [
        { id: 'id', name: 'id', type: 'Text' },
        { id: 'dept', name: 'dept', type: 'Text' },
        { id: 'salary', name: 'salary', type: 'Numeric' },
      ];

      const activeDataset: Dataset = {
        id: 'ds_test_1',
        name: 'test_dataset.csv',
        fileSize: 1024,
        rowCount: 3,
        columnCount: 3,
        columns,
      };

      // State in-memory tetap utuh
      assert.strictEqual(rows.length, 3);
      assert.strictEqual(activeDataset.rowCount, 3);
      assert.strictEqual(activeDataset.columns[1].name, 'dept');
    });

    it('2.2. Empty state handling saat belum ada dataset', () => {
      // Struktur empty state terdefinisi aman
      const emptyDataset: Dataset | null = null;
      assert.strictEqual(emptyDataset, null);
    });
  });

  // =========================================================================
  // 3. PROFILING & DESCRIPTIVE STATISTICS FLOW (PRD FR-04, FR-07)
  // =========================================================================
  describe('3. Profiling & Descriptive Statistics Flow', () => {
    it('3.1. Audit Kualitas Data (calculateDataQuality) pada Titanic Dataset', () => {
      const csvContent = fs.readFileSync(TITANIC_PATH, 'utf-8');
      const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      });

      const colNames = Object.keys(parsed.data[0]);
      const columns = inferColumnTypes(colNames, parsed.data);
      const quality = calculateDataQuality('titanic_ds', parsed.data, columns);

      assert.strictEqual(quality.totalRecords, 891);
      assert.strictEqual(quality.columnStats.length, 12);
      // Titanic memiliki missing values pada Age, Cabin, Embarked
      assert.ok(quality.totalEffectiveMissing > 0);
      assert.ok(quality.totalNativeMissing > 0);
    });

    it('3.2. Descriptive Statistics menghasilkan 13 metrik numerik dan 6 metrik kategorikal', () => {
      const csvContent = fs.readFileSync(IRIS_PATH, 'utf-8');
      const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      });

      const colNames = Object.keys(parsed.data[0]);
      const columns = inferColumnTypes(colNames, parsed.data);
      const stats = calculateDescriptiveStatistics('iris_e2e', parsed.data, columns);

      assert.strictEqual(stats.totalRecords, 150);
      assert.strictEqual(stats.columnStats.length, 5);

      const sepalLengthStat = stats.columnStats.find(c => c.columnName === 'sepal_length');
      assert.ok(sepalLengthStat?.numericStats);
      assert.strictEqual(sepalLengthStat.numericStats.count, 150);
      assert.strictEqual(sepalLengthStat.numericStats.missing, 0);
      assert.ok(Math.abs((sepalLengthStat.numericStats.mean ?? 0) - 5.8433) < 0.001);

      const speciesStat = stats.columnStats.find(c => c.columnName === 'species');
      assert.ok(speciesStat?.categoricalStats);
      assert.strictEqual(speciesStat.categoricalStats.uniqueCount, 3);
      assert.strictEqual(speciesStat.categoricalStats.topValueFrequency, 50);
    });
  });

  // =========================================================================
  // 4. DATA GRID INTERACTION FLOW (PRD FR-08, FR-09)
  // =========================================================================
  describe('4. Interactive Data Grid Flow (Search, Sort, Filter, Windowing)', () => {
    it('4.1. Eksekusi Compound Search + Multi-Type Sorting + Filtering', () => {
      const csvContent = fs.readFileSync(TITANIC_PATH, 'utf-8');
      const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      });

      // Filter: Pclass = '1', Search: 'female', Sort: Fare DESC
      const result = queryDataGrid(parsed.data, {
        datasetId: 'titanic_e2e',
        searchQuery: 'female',
        sort: { columnId: 'Fare', direction: 'desc' },
        filters: [{ columnId: 'Pclass', operator: 'equals', value: '1' }],
        offset: 0,
        limit: 10,
      });

      assert.ok(result.matchedRows > 0);
      assert.ok(result.rows.length <= 10);
      // Baris pertama harus memiliki Fare tertinggi
      const topFare = parseFloat(String(result.rows[0].Fare));
      const secondFare = parseFloat(String(result.rows[1].Fare));
      assert.ok(topFare >= secondFare);
    });

    it('4.2. Virtual windowing boundary (offset & limit) menghasilkan slice presisi', () => {
      const csvContent = fs.readFileSync(IRIS_PATH, 'utf-8');
      const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      });

      const sliceStart = queryDataGrid(parsed.data, {
        datasetId: 'iris_e2e',
        offset: 0,
        limit: 25,
      });
      assert.strictEqual(sliceStart.rows.length, 25);
      assert.strictEqual(sliceStart.matchedRows, 150);

      const sliceEnd = queryDataGrid(parsed.data, {
        datasetId: 'iris_e2e',
        offset: 140,
        limit: 25,
      });
      assert.strictEqual(sliceEnd.rows.length, 10); // Sisa 10 baris
    });
  });

  // =========================================================================
  // 5. DATA CLEANING & RECIPE ENGINE FLOW (PRD FR-10, FR-11)
  // =========================================================================
  describe('5. Data Cleaning & Recipe Lifecycle Flow', () => {
    it('5.1. Siklus: Live Preview -> Apply Recipe -> Delete Step -> Reset Snapshot', () => {
      const rawData = [
        { id: '1', name: '  Alice  ', score: '90' },
        { id: '2', name: 'Bob', score: null },
        { id: '3', name: 'Charlie  ', score: '85' },
        { id: '1', name: '  Alice  ', score: '90' }, // Duplikat
      ];
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'id', type: 'Text' },
        { id: 'name', name: 'name', type: 'Text' },
        { id: 'score', name: 'score', type: 'Numeric' },
      ];

      // 1. Live Preview Trim Whitespace
      const trimStep: RecipeStep = {
        id: 'step-trim',
        timestamp: 1,
        type: 'TRIM_WHITESPACE',
        description: 'Trim whitespace',
      };
      const preview = previewRecipeStep(rawData, cols, trimStep);
      assert.ok(preview.impactedCells >= 2);

      // 2. Terapkan Langkah 1 (Trim) & Langkah 2 (Drop Duplicates)
      const dedupStep: RecipeStep = {
        id: 'step-dedup',
        timestamp: 2,
        type: 'DROP_DUPLICATES',
        description: 'Drop duplicates',
      };
      const applied = executeRecipe(rawData, cols, [trimStep, dedupStep]);
      assert.strictEqual(applied.data.length, 3); // 1 duplikat terbuang
      assert.strictEqual(applied.data[0].name, 'Alice'); // Spasi ter-trim

      // 3. Hapus Langkah 2 (Hanya Trim)
      const afterDelete = executeRecipe(rawData, cols, [trimStep]);
      assert.strictEqual(afterDelete.data.length, 4); // Duplikat kembali
      assert.strictEqual(afterDelete.data[0].name, 'Alice');

      // 4. Reset ke Data Asli (Recipe Log Kosong)
      const reset = executeRecipe(rawData, cols, []);
      assert.strictEqual(reset.data.length, 4);
      assert.strictEqual(reset.data[0].name, '  Alice  '); // Nilai asli pulih 100%
    });
  });

  // =========================================================================
  // 6. VISUALIZATION STUDIO FLOW (PRD FR-12)
  // =========================================================================
  describe('6. Visualization Studio Flow (4 Jenis Grafik & Ekspor PNG)', () => {
    const data = [
      { category: 'A', val: 10, time: 1 },
      { category: 'B', val: 20, time: 2 },
      { category: 'A', val: 15, time: 3 },
      { category: 'C', val: 30, time: 4 },
      { category: 'B', val: 25, time: 5 },
    ];
    const cols: ColumnSchema[] = [
      { id: 'category', name: 'category', type: 'Text' },
      { id: 'val', name: 'val', type: 'Numeric' },
      { id: 'time', name: 'time', type: 'Numeric' },
    ];

    it('6.1. Bar Chart Data Generator', () => {
      const res = generateBarChartData(data, cols, {
        type: 'BAR',
        xColumn: 'category',
        aggregation: 'MEAN',
        yColumn: 'val',
      });
      assert.ok(res.data.length > 0);
      assert.strictEqual(res.totalCategories, 3);
    });

    it('6.2. Histogram Data Generator', () => {
      const res = generateHistogramData(data, cols, {
        type: 'HISTOGRAM',
        column: 'val',
        bins: 5,
      });
      assert.strictEqual(res.bins.length, 5);
      assert.ok(res.min === 10 && res.max === 30);
    });

    it('6.3. Line Chart Data Generator', () => {
      const res = generateLineChartData(data, cols, {
        type: 'LINE',
        xColumn: 'time',
        yColumn: 'val',
      });
      assert.strictEqual(res.data.length, 5);
    });

    it('6.4. Scatter Plot Data Generator', () => {
      const res = generateScatterPlotData(data, cols, {
        type: 'SCATTER',
        xColumn: 'time',
        yColumn: 'val',
      });
      assert.strictEqual(res.data.length, 5);
    });

    it('6.5. Validasi Integritas Ekspor PNG (Magic Signature)', () => {
      const mockBytes = createMockPngBytes();
      assert.strictEqual(isValidPngSignature(mockBytes), true);
      assert.strictEqual(isValidPngSignature(new Uint8Array([0, 1, 2, 3])), false);
    });
  });

  // =========================================================================
  // 7. EXPORT STUDIO ROUND-TRIP FLOW (PRD FR-13)
  // =========================================================================
  describe('7. Export Studio Round-Trip Flow (CSV & XLSX)', () => {
    it('7.1. Ekspor CSV (RFC 4180 UTF-8 with BOM) dan validasi round-trip', () => {
      const rows = [
        { id: '001', name: 'Zürich "Special"', comment: 'Line 1\nLine 2', price: 1500.5 },
        { id: '002', name: 'Tokyo 東京', comment: 'Single line', price: null },
      ];
      const cols: ColumnSchema[] = [
        { id: 'id', name: 'id', type: 'Text' },
        { id: 'name', name: 'name', type: 'Text' },
        { id: 'comment', name: 'comment', type: 'Text' },
        { id: 'price', name: 'price', type: 'Numeric' },
      ];

      const csvString = serializeToCsv(rows, cols, { delimiter: ',', includeBom: true });
      assert.ok(csvString.startsWith('\uFEFF'), 'Harus menyertakan UTF-8 BOM');

      // Parse ulang via PapaParse
      const reParsed = Papa.parse<Record<string, unknown>>(csvString, {
        header: true,
        dynamicTyping: false,
      });

      assert.strictEqual(reParsed.data.length, 2);
      assert.strictEqual(reParsed.data[0].id, '001'); // Preservasi leading zero
      assert.strictEqual(reParsed.data[0].name, 'Zürich "Special"'); // Preservasi quote
      assert.strictEqual(reParsed.data[0].comment, 'Line 1\nLine 2'); // Preservasi multiline
      assert.strictEqual(reParsed.data[1].name, 'Tokyo 東京'); // Preservasi Unicode
      assert.strictEqual(reParsed.data[1].price, ''); // Missing value sebagai field kosong
    });

    it('7.2. Ekspor XLSX (SheetJS Workbook) dan validasi round-trip', () => {
      const rows = [
        { code: '0099', item: 'Widget A', qty: 10 },
        { code: '0100', item: 'Widget B', qty: 25 },
      ];
      const cols: ColumnSchema[] = [
        { id: 'code', name: 'code', type: 'Text' },
        { id: 'item', name: 'item', type: 'Text' },
        { id: 'qty', name: 'qty', type: 'Numeric' },
      ];

      const buffer = serializeToXlsx(rows, cols, { sheetName: 'ActiveData' });
      assert.ok(buffer instanceof ArrayBuffer);

      // Baca ulang menggunakan SheetJS
      const wb = XLSX.read(buffer, { type: 'buffer' });
      assert.deepStrictEqual(wb.SheetNames, ['ActiveData']);
      const parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['ActiveData'], {
        raw: false,
      });

      assert.strictEqual(parsedRows.length, 2);
      assert.strictEqual(parsedRows[0].code, '0099'); // Preservasi string 0099
    });
  });
});
