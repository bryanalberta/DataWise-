import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import Papa from 'papaparse';
import { inferColumnTypes } from '../lib/type-inference';
import { calculateDataQuality } from '../lib/data-quality';
import { calculateDescriptiveStatistics } from '../lib/descriptive-stats';
import { queryDataGrid } from '../lib/data-grid-engine';
import { executeRecipe } from '../lib/recipe-engine';
import { generateBarChartData, generateHistogramData } from '../lib/chart-engine';
import { serializeToCsv, serializeToXlsx } from '../lib/export-engine';
import { RecipeStep, ColumnSchema } from '../types';

// Deterministic PRNG: Mulberry32
function createPrng(seed: number) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BenchmarkFixture {
  rows: Record<string, unknown>[];
  csvString: string;
  columns: ColumnSchema[];
  specs: {
    rowCount: number;
    colCount: number;
    missingPercent: number;
    duplicateRowsCount: number;
  };
}

function generateDeterministicFixture(rowCount: number, seed = 12345): BenchmarkFixture {
  const rand = createPrng(seed);
  const categories = ['Bronze', 'Silver', 'Gold', 'Platinum'];
  const catWeights = [0.50, 0.30, 0.15, 0.05];

  const rows: Record<string, unknown>[] = [];
  let totalCells = 0;
  let missingCells = 0;

  const numBase = Math.floor(rowCount * 0.98); // 98% base, 2% duplicate
  for (let i = 1; i <= numBase; i++) {
    // 1. ID with leading zeros (e.g. "000123")
    const id = String(i).padStart(6, '0');

    // 2. Integer
    const intVal = Math.floor(rand() * 10000) - 1000;

    // 3. Decimal
    const decVal = Number((rand() * 5000 + 10).toFixed(2));

    // 4. Skewed Category
    const rCat = rand();
    let cat = 'Bronze';
    let accum = 0;
    for (let c = 0; c < categories.length; c++) {
      accum += catWeights[c];
      if (rCat <= accum) {
        cat = categories[c];
        break;
      }
    }

    // 5. Date ISO
    const day = 1 + Math.floor(rand() * 28);
    const month = 1 + Math.floor(rand() * 12);
    const dateVal = `2024-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 6. Empty / Whitespace / Text
    const rEmpty = rand();
    let emptyVal: string | null = 'Active';
    if (rEmpty < 0.10) {
      emptyVal = ''; // pure empty
      missingCells++;
    } else if (rEmpty < 0.15) {
      emptyVal = '   '; // dirty whitespace
      missingCells++;
    }

    // 7. High-cardinality category
    const highCard = `SKU_${Math.floor(rand() * 5000).toString().padStart(4, '0')}`;

    // 8. Description with accents / non-ASCII occasionally
    const rUnicode = rand();
    const desc = rUnicode < 0.05 ? 'Data Spesial 🌟 Zürich' : `Item Record ${i}`;

    totalCells += 8;

    rows.push({
      id,
      quantity: intVal,
      price: decVal,
      tier: cat,
      registered_date: dateVal,
      status: emptyVal,
      sku: highCard,
      description: desc
    });
  }

  // Add 2% intentional duplicate rows
  const numDupes = rowCount - numBase;
  for (let d = 0; d < numDupes; d++) {
    const sourceIdx = Math.floor(rand() * numBase);
    rows.push({ ...rows[sourceIdx] });
    totalCells += 8;
  }

  const colNames = ['id', 'quantity', 'price', 'tier', 'registered_date', 'status', 'sku', 'description'];
  const columns = inferColumnTypes(colNames, rows);
  const csvString = serializeToCsv(rows, columns, { delimiter: ',', includeBom: false });

  return {
    rows,
    csvString,
    columns,
    specs: {
      rowCount: rows.length,
      colCount: colNames.length,
      missingPercent: Number(((missingCells / totalCells) * 100).toFixed(2)),
      duplicateRowsCount: numDupes
    }
  };
}

function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

describe('TASK-QA-02A — Benchmark Dataset Sintetis (10.000, 25.000, 50.000 Baris)', () => {
  const tiers = [
    { name: 'Tier 2 (Medium)', size: 10000, maxParseMs: 1000, maxStatsMs: 600 },
    { name: 'Tier 3 (Upper Recommended)', size: 25000, maxParseMs: 2500, maxStatsMs: 1500 },
    { name: 'Tier 4 (Stress Benchmark)', size: 50000, maxParseMs: 5000, maxStatsMs: 3500 },
  ];

  for (const tier of tiers) {
    describe(`${tier.name} — ${tier.size.toLocaleString()} Baris`, () => {
      let fixture: BenchmarkFixture;

      it(`1. Pembangkitan Fixture Sintetis Deterministik (${tier.size} baris)`, () => {
        fixture = generateDeterministicFixture(tier.size);
        assert.equal(fixture.rows.length, tier.size);
        assert.equal(fixture.columns.length, 8);
        assert.ok(fixture.specs.duplicateRowsCount > 0);
        assert.ok(fixture.specs.missingPercent > 0);
      });

      it(`2. Operasi 1: Parsing CSV (PapaParse) - 3 iterasi`, async () => {
        const times: number[] = [];
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          const parsed = await new Promise<Papa.ParseResult<Record<string, unknown>>>((resolve) => {
            Papa.parse<Record<string, unknown>>(fixture.csvString, {
              header: true,
              dynamicTyping: false,
              skipEmptyLines: true,
              complete: (res) => resolve(res)
            });
          });
          const t1 = performance.now();
          times.push(t1 - t0);
          assert.equal(parsed.data.length, tier.size, 'Baris hasil parse harus cocok');
        }
        const med = calculateMedian(times);
        assert.ok(med < tier.maxParseMs, `Median parse (${med.toFixed(1)}ms) harus <= SLA PRD (${tier.maxParseMs}ms)`);
      });

      it(`3. Operasi 2: Inferensi Tipe Kolom (inferColumnTypes) - 3 iterasi`, () => {
        const times: number[] = [];
        const colNames = ['id', 'quantity', 'price', 'tier', 'registered_date', 'status', 'sku', 'description'];
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          const cols = inferColumnTypes(colNames, fixture.rows);
          const t1 = performance.now();
          times.push(t1 - t0);
          assert.equal(cols.length, 8);
        }
        const med = calculateMedian(times);
        assert.ok(med < 100, `Inferensi tipe (${med.toFixed(1)}ms) harus sangat cepat`);
      });

      it(`4. Operasi 3: Kualitas Data & Deteksi Duplikat (calculateDataQuality) - 3 iterasi`, () => {
        const times: number[] = [];
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          const quality = calculateDataQuality('bench_ds', fixture.rows, fixture.columns);
          const t1 = performance.now();
          times.push(t1 - t0);
          assert.equal(quality.totalRecords, tier.size);
          assert.ok(quality.duplicateOccurrences > 0, 'Harus mendeteksi duplikat yang disengaja');
        }
      });

      it(`5. Operasi 4: Komputasi Statistik Deskriptif (calculateDescriptiveStatistics) - 3 iterasi`, () => {
        const times: number[] = [];
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          const summary = calculateDescriptiveStatistics('bench_ds', fixture.rows, fixture.columns);
          const t1 = performance.now();
          times.push(t1 - t0);
          assert.equal(summary.totalRecords, tier.size);
          assert.equal(summary.columnStats.length, 8);
        }
        const med = calculateMedian(times);
        assert.ok(med < tier.maxStatsMs, `Median stats (${med.toFixed(1)}ms) harus <= SLA PRD (${tier.maxStatsMs}ms)`);
      });

      it(`6. Operasi 5: Data Grid Pencarian Global & Multi-type Sorting (queryDataGrid) - 3 iterasi`, () => {
        const times: number[] = [];
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          const result = queryDataGrid(fixture.rows, {
            datasetId: 'bench_ds',
            searchQuery: 'Platinum',
            sort: { columnId: 'price', direction: 'desc' },
            offset: 0,
            limit: 100
          });
          const t1 = performance.now();
          times.push(t1 - t0);
          assert.ok(result.matchedRows > 0);
          assert.ok(result.rows.length <= 100);
        }
        const med = calculateMedian(times);
        const maxGridMs = tier.size >= 50000 ? 3000 : 1500;
        assert.ok(med < maxGridMs, `Grid query (${med.toFixed(1)}ms) harus responsif (< ${maxGridMs}ms)`);
      });

      it(`7. Operasi 6: Eksekusi Recipe Cleaning Majemuk (executeRecipe) - 3 iterasi`, () => {
        const recipe: RecipeStep[] = [
          {
            id: 'step-1',
            timestamp: Date.now(),
            type: 'TRIM_WHITESPACE',
            description: 'Trim whitespace across all columns'
          },
          {
            id: 'step-2',
            timestamp: Date.now(),
            type: 'DROP_DUPLICATES',
            description: 'Drop duplicate rows'
          },
          {
            id: 'step-3',
            timestamp: Date.now(),
            type: 'IMPUTE_MISSING',
            targetColumn: 'status',
            method: 'FixedValue',
            fixedValue: 'Standard',
            description: 'Impute missing status with constant value'
          }
        ];

        const times: number[] = [];
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          const cleaned = executeRecipe(fixture.rows, fixture.columns, recipe);
          const t1 = performance.now();
          times.push(t1 - t0);
          // Duplikat terhapus, jumlah baris harus berkurang
          assert.ok(cleaned.data.length < tier.size, 'Baris duplikat harus terhapus');
          // Imputasi: pastikan kolom status tidak lagi memiliki nilai kosong
          for (let r = 0; r < Math.min(100, cleaned.data.length); r++) {
            assert.ok(cleaned.data[r].status !== '', 'Status kosong harus terimputasi');
          }
        }
        const med = calculateMedian(times);
        const maxRecipeMs = tier.size >= 50000 ? 3000 : 1000;
        assert.ok(med < maxRecipeMs, `Cleaning pipeline (${med.toFixed(1)}ms) harus efisien (< ${maxRecipeMs}ms)`);
      });

      it(`8. Operasi 7: Pembuatan Data Chart Histogram & Bar Chart - 3 iterasi`, () => {
        const times: number[] = [];
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          const hist = generateHistogramData(fixture.rows, fixture.columns, {
            type: 'HISTOGRAM',
            column: 'price',
            bins: 15
          });
          const bar = generateBarChartData(fixture.rows, fixture.columns, {
            type: 'BAR',
            xColumn: 'tier',
            aggregation: 'COUNT'
          });
          const t1 = performance.now();
          times.push(t1 - t0);
          assert.equal(hist.bins.length, 15);
          assert.equal(bar.data.length, 4); // Bronze, Silver, Gold, Platinum
        }
        const med = calculateMedian(times);
        assert.ok(med < 200, `Chart aggregation (${med.toFixed(1)}ms) harus instan`);
      });

      it(`9. Operasi 8: Serialisasi Ekspor CSV (serializeToCsv) - 3 iterasi`, () => {
        const times: number[] = [];
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now();
          const csv = serializeToCsv(fixture.rows, fixture.columns, { delimiter: ',', includeBom: true });
          const t1 = performance.now();
          times.push(t1 - t0);
          assert.ok(csv.startsWith('\uFEFF'));
          assert.ok(csv.length > tier.size * 10);
        }
        const med = calculateMedian(times);
        assert.ok(med < 500, `CSV serialize (${med.toFixed(1)}ms) harus efisien`);
      });

      it(`10. Operasi 9: Serialisasi Ekspor XLSX SheetJS (serializeToXlsx)`, () => {
        const t0 = performance.now();
        const buffer = serializeToXlsx(fixture.rows, fixture.columns, { sheetName: 'BenchSheet' });
        const t1 = performance.now();
        assert.ok(buffer instanceof ArrayBuffer);
        assert.ok(buffer.byteLength > 0);
        const duration = t1 - t0;
        // 50k rows XLSX sheet serialization can take ~5-10s in single-threaded Node JS memory
        const maxXlsxMs = tier.size >= 50000 ? 12000 : 5000;
        assert.ok(duration < maxXlsxMs, `XLSX serialize (${duration.toFixed(1)}ms) harus selesai < ${maxXlsxMs}ms`);
      });
    });
  }
});
