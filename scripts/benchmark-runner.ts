import { performance } from 'node:perf_hooks';
import Papa from 'papaparse';
import { inferColumnTypes } from '../src/lib/type-inference';
import { calculateDataQuality } from '../src/lib/data-quality';
import { calculateDescriptiveStatistics } from '../src/lib/descriptive-stats';
import { queryDataGrid } from '../src/lib/data-grid-engine';
import { executeRecipe } from '../src/lib/recipe-engine';
import { generateHistogramData } from '../src/lib/chart-engine';
import { serializeToCsv, serializeToXlsx } from '../src/lib/export-engine';
import { RecipeStep, ColumnSchema } from '../src/types';

// Deterministic PRNG: Mulberry32
export function createPrng(seed: number) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BenchmarkDataset {
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

export function generateBenchmarkData(rowCount: number, seed = 42): BenchmarkDataset {
  const rand = createPrng(seed);
  const categories = ['Bronze', 'Silver', 'Gold', 'Platinum'];
  const catWeights = [0.50, 0.30, 0.15, 0.05];

  const rows: Record<string, unknown>[] = [];
  let totalCells = 0;
  let missingCells = 0;

  // Generate base rows
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

  // Add 2% duplicate rows
  const numDupes = rowCount - numBase;
  for (let d = 0; d < numDupes; d++) {
    const sourceIdx = Math.floor(rand() * numBase);
    rows.push({ ...rows[sourceIdx] });
    totalCells += 8;
  }

  const colNames = ['id', 'quantity', 'price', 'tier', 'registered_date', 'status', 'sku', 'description'];
  const columns = inferColumnTypes(colNames, rows);

  // Serialize to CSV for parser benchmark
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

export interface MetricBenchmarkResult {
  operation: string;
  runs: number;
  timesMs: number[];
  medianMs: number;
  minMs: number;
  maxMs: number;
}

export async function runBenchmarkForSize(size: number, runs = 3): Promise<{
  size: number;
  specs: BenchmarkDataset['specs'];
  results: MetricBenchmarkResult[];
}> {
  console.log(`\n======================================================`);
  console.log(`BENCHMARK FOR ${size.toLocaleString()} ROWS (${runs} RUNS)`);
  console.log(`======================================================`);
  const fixture = generateBenchmarkData(size);
  console.log(`Fixture specs: ${fixture.specs.rowCount} rows, ${fixture.specs.colCount} cols, missing: ${fixture.specs.missingPercent}%, intentional duplicates: ${fixture.specs.duplicateRowsCount}`);

  // Helper for median
  function median(nums: number[]) {
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  const results: MetricBenchmarkResult[] = [];

  async function measure(name: string, fn: () => Promise<unknown> | unknown) {
    const times: number[] = [];
    for (let r = 0; r < runs; r++) {
      const t0 = performance.now();
      await fn();
      const t1 = performance.now();
      times.push(t1 - t0);
    }
    const med = median(times);
    const min = Math.min(...times);
    const max = Math.max(...times);
    console.log(`  * ${name.padEnd(35)} : Median = ${med.toFixed(2).padStart(8)} ms (Min: ${min.toFixed(2)}, Max: ${max.toFixed(2)})`);
    const res: MetricBenchmarkResult = { operation: name, runs, timesMs: times, medianMs: Number(med.toFixed(2)), minMs: Number(min.toFixed(2)), maxMs: Number(max.toFixed(2)) };
    results.push(res);
    return res;
  }

  // 1. Parsing CSV
  await measure('1. Parsing CSV (PapaParse)', () => {
    return new Promise((resolve) => {
      Papa.parse(fixture.csvString, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
        complete: () => resolve(true)
      });
    });
  });

  // 2. Type Inference
  const colNames = ['id', 'quantity', 'price', 'tier', 'registered_date', 'status', 'sku', 'description'];
  await measure('2. Type Inference', () => {
    inferColumnTypes(colNames, fixture.rows);
  });

  // 3. Data Quality Calculation
  await measure('3. Data Quality Calculation', () => {
    calculateDataQuality('bench_ds', fixture.rows, fixture.columns);
  });

  // 4. Descriptive Statistics
  await measure('4. Descriptive Statistics', () => {
    calculateDescriptiveStatistics('bench_ds', fixture.rows, fixture.columns);
  });

  // 5. Data Grid Search & Sort
  await measure('5. Data Grid (Search & Sort)', () => {
    queryDataGrid(fixture.rows, {
      datasetId: 'bench_ds',
      searchQuery: 'Platinum',
      sort: { columnId: 'price', direction: 'desc' },
      offset: 0,
      limit: 100
    });
  });

  // 6. Cleaning Recipe Execution
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
  await measure('6. Cleaning Recipe (3 Steps)', () => {
    executeRecipe(fixture.rows, fixture.columns, recipe);
  });

  // 7. Chart Data Generation (Histogram & Bar)
  await measure('7. Chart Data (Histogram)', () => {
    generateHistogramData(fixture.rows, fixture.columns, {
      type: 'HISTOGRAM',
      column: 'price',
      bins: 15
    });
  });

  // 8. CSV Export Serialization
  await measure('8. CSV Export Serialization', () => {
    serializeToCsv(fixture.rows, fixture.columns, { delimiter: ',', includeBom: true });
  });

  // 9. XLSX Export Serialization (SheetJS)
  if (size <= 50000) {
    await measure('9. XLSX Export Serialization', () => {
      serializeToXlsx(fixture.rows, fixture.columns, { sheetName: 'DataBench' });
    });
  }

  return { size, specs: fixture.specs, results };
}

async function main() {
  const allResults = [];
  allResults.push(await runBenchmarkForSize(10000, 3));
  allResults.push(await runBenchmarkForSize(25000, 3));
  allResults.push(await runBenchmarkForSize(50000, 3));
  console.log(`\nBenchmark run complete for all tiers.`);
}

if (require.main === module) {
  main().catch(console.error);
}
