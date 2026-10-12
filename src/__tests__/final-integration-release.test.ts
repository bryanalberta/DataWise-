/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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
} from '../lib/chart-engine';
import { serializeToCsv, serializeToXlsx } from '../lib/export-engine';
import {
  analyzeDatasetIntelligence,
  profileColumnSemantics,
} from '../lib/dataset-intelligence';
import { useDatasetStore } from '../store/dataset-store';
import { Dataset, WorkerResponse } from '../types';
import { NAV_ITEMS } from '../components/AppSidebar';

// Pages for SSR / Static render validation
import HomePage from '../app/page';
import DatasetPage from '../app/dataset/page';
import InsightPage from '../app/insight/page';
import ProfilingPage from '../app/profiling/page';
import AnalisisPage from '../app/analisis/page';
import PembersihanPage from '../app/pembersihan/page';
import VisualisasiPage from '../app/visualisasi/page';
import EksporPage from '../app/ekspor/page';

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const WORKER_DIST_PATH = path.join(ROOT_DIR, 'public', 'workers', 'data-processor.worker.js');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const IRIS_PATH = path.join(FIXTURES_DIR, 'iris.csv');
const TITANIC_PATH = path.join(FIXTURES_DIR, 'titanic.csv');
const REAL_STEAM_PATH = process.env.STEAM_DATASET_PATH || path.join(os.homedir(), 'Downloads', 'steam-200k.csv', 'steam-200k.csv');

describe('TASK-QA-05 — Final Integration & Release Candidate Audit', () => {
  // Helper Sandbox untuk Web Worker
  function createWorkerSandbox() {
    const workerContent = fs.readFileSync(WORKER_DIST_PATH, 'utf8');
    let messageListener: ((event: { data: unknown }) => void) | null = null;
    let errorListener: ((event: unknown) => void) | null = null;
    const postedMessages: WorkerResponse[] = [];

    const sandbox = {
      self: {
        addEventListener: (type: string, fn: (event: unknown) => void) => {
          if (type === 'message') messageListener = fn as (event: { data: unknown }) => void;
          if (type === 'error') errorListener = fn;
        },
        postMessage: (msg: WorkerResponse) => {
          postedMessages.push(msg);
        },
      },
      console: { log: () => {}, error: () => {}, warn: () => {} },
      TextEncoder,
      TextDecoder,
    };

    vm.createContext(sandbox);
    vm.runInContext(workerContent, sandbox);

    return {
      dispatch: (data: unknown) => {
        if (!messageListener) throw new Error('Worker message listener not registered');
        messageListener({ data });
      },
      waitForMessage: async (expectedTaskId?: string, timeoutMs = 30000): Promise<WorkerResponse> => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const idx = postedMessages.findIndex(
            (m: any) => (!expectedTaskId || m.taskId === expectedTaskId) && m.status !== 'PROGRESS'
          );
          if (idx !== -1) {
            const [msg] = postedMessages.splice(idx, 1);
            return msg;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error(`Timeout waiting for worker message (${expectedTaskId || 'any'}) after ${timeoutMs}ms`);
      },
    };
  }

  // =========================================================================
  // 1. INTEGRASI 8 HALAMAN & ARSITEKTUR RUTE LENGKAP
  // =========================================================================
  describe('1. Eight-Page Architecture & Route Completeness', () => {
    it('1.1. Sidebar memuat tepat 8 rute resmi dengan URL yang benar', () => {
      assert.strictEqual(NAV_ITEMS.length, 8);
      const expectedRoutes = [
        { id: 'beranda', href: '/', label: 'Beranda' },
        { id: 'dataset', href: '/dataset', label: 'Dataset' },
        { id: 'insight', href: '/insight', label: 'Insight Dataset' },
        { id: 'profiling', href: '/profiling', label: 'Profiling' },
        { id: 'analisis', href: '/analisis', label: 'Analisis' },
        { id: 'pembersihan', href: '/pembersihan', label: 'Pembersihan' },
        { id: 'visualisasi', href: '/visualisasi', label: 'Visualisasi' },
        { id: 'ekspor', href: '/ekspor', label: 'Ekspor' },
      ];

      for (const exp of expectedRoutes) {
        const item = NAV_ITEMS.find((n) => n.id === exp.id);
        assert.ok(item, `Menu ${exp.id} harus terdaftar di NAV_ITEMS`);
        assert.strictEqual(item.href, exp.href);
        assert.strictEqual(item.label, exp.label);
        assert.strictEqual(item.available, true);
      }
    });

    it('1.2. Seluruh 8 halaman merender Empty State profesional saat dataset belum dimuat', () => {
      // 1. Beranda: Area upload tersedia, overview empty state
      const homeHtml = renderToStaticMarkup(React.createElement(HomePage));
      assert.ok(homeHtml.includes('Selamat datang di DataWise'), 'Beranda harus merender banner selamat datang');
      assert.ok(
        homeHtml.includes('Unggah Dataset Anda') || homeHtml.includes('Pilih File dari Komputer'),
        'Beranda harus merender dropzone upload'
      );

      // 2. Dataset: Empty state
      const datasetHtml = renderToStaticMarkup(React.createElement(DatasetPage as any, { _testDataset: null }));
      assert.ok(
        datasetHtml.includes('Belum Ada Data untuk Ditampilkan') || datasetHtml.includes('Belum Ada Dataset'),
        'Dataset Explorer harus merender empty state'
      );

      // 3. Insight: Empty state
      const insightHtml = renderToStaticMarkup(React.createElement(InsightPage as any, { _testDataset: null }));
      assert.ok(
        insightHtml.includes('Belum Ada Dataset yang Dimuat') || insightHtml.includes('Insight Dataset'),
        'Insight Dataset harus merender empty state'
      );

      // 4. Profiling: Empty state
      const profilingHtml = renderToStaticMarkup(React.createElement(ProfilingPage as any, { _testDataset: null }));
      assert.ok(
        profilingHtml.includes('Belum Ada Dataset untuk Profiling') || profilingHtml.includes('Profiling & Kualitas Data'),
        'Profiling harus merender empty state'
      );

      // 5. Analisis: Empty state
      const analisisHtml = renderToStaticMarkup(React.createElement(AnalisisPage as any, { _testDataset: null }));
      assert.ok(
        analisisHtml.includes('Belum Ada Statistik untuk Ditampilkan') || analisisHtml.includes('Statistik Deskriptif'),
        'Analisis Deskriptif harus merender empty state'
      );

      // 6. Pembersihan: Empty state
      const pembersihanHtml = renderToStaticMarkup(React.createElement(PembersihanPage as any, { _testDataset: null }));
      assert.ok(
        pembersihanHtml.includes('Belum Ada Dataset yang Dimuat') || pembersihanHtml.includes('Pembersihan Data'),
        'Pembersihan harus merender empty state'
      );

      // 7. Visualisasi: Empty state
      const visualisasiHtml = renderToStaticMarkup(React.createElement(VisualisasiPage as any, { _testDataset: null }));
      assert.ok(
        visualisasiHtml.includes('Belum ada dataset yang dimuat') || visualisasiHtml.includes('Visualisasi Data'),
        'Visualisasi harus merender empty state'
      );

      // 8. Ekspor: Empty state
      const eksporHtml = renderToStaticMarkup(React.createElement(EksporPage as any, { _testDataset: null }));
      assert.ok(
        eksporHtml.includes('Belum ada dataset yang dimuat') || eksporHtml.includes('Ekspor Dataset'),
        'Ekspor harus merender empty state'
      );
    });
  });

  // =========================================================================
  // 2. KONTINUITAS STATE & ISOLASI CACHE PERGANTIAN DATASET
  // =========================================================================
  describe('2. State Continuity & Cache Isolation Across Dataset Changes', () => {
    it('2.1. Pergantian dataset menginvalidsi statistik deskriptif dan dataset intelligence lama', () => {
      const datasetA: Dataset = {
        id: 'dataset-iris-001',
        name: 'iris.csv',
        rowCount: 150,
        columnCount: 5,
        columns: [
          { id: 'c1', name: 'sepal_length', type: 'Numeric' },
          { id: 'c2', name: 'species', type: 'Text' },
        ],
      };

      useDatasetStore.getState().setDataset(datasetA);
      assert.strictEqual(useDatasetStore.getState().activeDataset?.id, 'dataset-iris-001');

      // Set cache statistik dan intelligence untuk Dataset A
      useDatasetStore.getState().setDatasetIntelligence({
        datasetId: 'dataset-iris-001',
        evaluatedAt: Date.now(),
        rowCount: 150,
        columnCount: 2,
        hasHeader: true,
        typeInference: {
          family: 'GENERAL_TABULAR',
          label: 'Dataset Tabular Umum',
          description: 'Iris flower measurements',
          confidence: 'MEDIUM',
          confidenceLabel: 'Sedang',
          supportingFactors: ['Variabel numerik dan teks'],
          caveats: [],
        },
        columnProfiles: [],
        keyFindings: [],
        recommendations: [],
      });
      assert.ok(useDatasetStore.getState().datasetIntelligence !== null);
      assert.strictEqual(useDatasetStore.getState().datasetIntelligence?.datasetId, 'dataset-iris-001');

      // Ganti ke Dataset B (Titanic)
      const datasetB: Dataset = {
        id: 'dataset-titanic-002',
        name: 'titanic.csv',
        rowCount: 891,
        columnCount: 12,
        columns: [
          { id: 't1', name: 'PassengerId', type: 'Numeric' },
          { id: 't2', name: 'Survived', type: 'Categorical' },
        ],
      };

      useDatasetStore.getState().setDataset(datasetB);
      assert.strictEqual(useDatasetStore.getState().activeDataset?.id, 'dataset-titanic-002');
      // Hasil cache Dataset A HARUS ter-reset ke null agar tidak bocor ke Dataset B
      assert.strictEqual(useDatasetStore.getState().datasetIntelligence, null, 'Cache intelligence lama harus di-reset');
      assert.strictEqual(useDatasetStore.getState().descriptiveStats, null, 'Cache statistik lama harus di-reset');
      assert.strictEqual(useDatasetStore.getState().dataQualityStats, null, 'Cache data quality lama harus di-reset');

      // Bersihkan dataset
      useDatasetStore.getState().clearDataset();
      assert.strictEqual(useDatasetStore.getState().activeDataset, null);
      assert.strictEqual(useDatasetStore.getState().datasetIntelligence, null);
    });

    it('2.2. Override column type dan recipe cleaning menginvalidsi cache intelligence', () => {
      const dataset: Dataset = {
        id: 'dataset-sales-003',
        name: 'sales.csv',
        rowCount: 500,
        columnCount: 3,
        columns: [
          { id: 'col_id', name: 'id', type: 'Numeric' },
          { id: 'col_amt', name: 'amount', type: 'Numeric' },
          { id: 'col_reg', name: 'region', type: 'Text' },
        ],
      };

      useDatasetStore.getState().setDataset(dataset);
      useDatasetStore.getState().setDatasetIntelligence({
        datasetId: 'dataset-sales-003',
        evaluatedAt: Date.now(),
        rowCount: 500,
        columnCount: 3,
        hasHeader: true,
        typeInference: {
          family: 'TRANSACTION',
          label: 'Data Transaksi',
          description: 'Sales transactions',
          confidence: 'HIGH',
          confidenceLabel: 'Tinggi',
          supportingFactors: [],
          caveats: [],
        },
        columnProfiles: [],
        keyFindings: [],
        recommendations: [],
      });

      // Override tipe kolom id menjadi Text
      useDatasetStore.getState().overrideColumnType('col_id', 'Text');
      assert.strictEqual(useDatasetStore.getState().datasetIntelligence, null, 'Override column type harus mereset intelligence');

      // Set kembali intelligence lalu lakukan cleaning update
      useDatasetStore.getState().setDatasetIntelligence({
        datasetId: 'dataset-sales-003',
        evaluatedAt: Date.now(),
        rowCount: 500,
        columnCount: 3,
        hasHeader: true,
        typeInference: {
          family: 'TRANSACTION',
          label: 'Data Transaksi',
          description: 'Sales transactions',
          confidence: 'HIGH',
          confidenceLabel: 'Tinggi',
          supportingFactors: [],
          caveats: [],
        },
        columnProfiles: [],
        keyFindings: [],
        recommendations: [],
      });

      useDatasetStore.getState().updateActiveDatasetAfterCleaning({
        ...dataset,
        rowCount: 490,
      });
      assert.strictEqual(useDatasetStore.getState().datasetIntelligence, null, 'Cleaning recipe update harus mereset intelligence');
    });
  });

  // =========================================================================
  // 3. AUDIT KRITIS DATASET INTELLIGENCE ENGINE (BEBAS HARD-CODING)
  // =========================================================================
  describe('3. Critical Audit of Dataset Intelligence Heuristics', () => {
    it('3.1. Kode sumber dataset-intelligence.ts tidak memuat hard-coded nama berkas Steam', () => {
      const sourcePath = path.join(ROOT_DIR, 'src', 'lib', 'dataset-intelligence.ts');
      const sourceCode = fs.readFileSync(sourcePath, 'utf8');

      // Pastikan tidak ada pengecekan spesifik 'steam-200k' atau 'steam_200k'
      assert.ok(
        !sourceCode.includes('steam-200k'),
        'Tidak boleh ada string hard-coded steam-200k di dataset-intelligence.ts'
      );
      assert.ok(
        !sourceCode.includes('steam_200k'),
        'Tidak boleh ada string hard-coded steam_200k di dataset-intelligence.ts'
      );
    });

    it('3.2. Dataset ambigu dengan header generik dan data acak menghasilkan label netral & peringatan', () => {
      // Dataset acak yang tidak menyerupai domain tertentu
      const ambiguousDataset: Dataset = {
        id: 'ds-ambiguous',
        name: 'data.csv',
        rowCount: 50,
        columnCount: 3,
        hasHeader: false,
        columns: [
          { id: 'c1', name: 'Column 1', type: 'Text' },
          { id: 'c2', name: 'Column 2', type: 'Text' },
          { id: 'c3', name: 'Column 3', type: 'Text' },
        ],
      };

      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < 50; i++) {
        rows.push({
          'Column 1': `ABC_${i}`,
          'Column 2': `XYZ_${i % 12}`,
          'Column 3': `VAL_${(i * 7) % 20}`,
        });
      }

      const result = analyzeDatasetIntelligence(ambiguousDataset, rows);
      // Harus menghasilkan keluarga netral GENERAL_TABULAR dengan caveat ketiadaan header
      assert.strictEqual(result.typeInference.family, 'GENERAL_TABULAR');
      assert.strictEqual(result.typeInference.confidence, 'MEDIUM');
      assert.ok(result.typeInference.caveats && result.typeInference.caveats.length > 0);
      assert.ok(
        result.typeInference.caveats.some((c) => c.includes('tanpa header')),
        'Harus mencantumkan catatan bahwa dataset tanpa header'
      );
    });

    it('3.3. Nilai numerik kecil tidak keliru dilabeli sebagai IDENTIFIER', () => {
      // Dataset kecil dengan 5 angka penjualan yang unik
      const smallDataset: Dataset = {
        id: 'ds-sales-small',
        name: 'sales.csv',
        rowCount: 5,
        columnCount: 2,
        hasHeader: true,
        columns: [
          { id: 'c1', name: 'sales_amount', type: 'Numeric' },
          { id: 'c2', name: 'store', type: 'Text' },
        ],
      };

      const rows = [
        { sales_amount: 1500, store: 'Branch A' },
        { sales_amount: 2300, store: 'Branch B' },
        { sales_amount: 3100, store: 'Branch C' },
        { sales_amount: 4200, store: 'Branch D' },
        { sales_amount: 5000, store: 'Branch E' },
      ];

      const profile = profileColumnSemantics(
        smallDataset,
        smallDataset.columns[0],
        rows.map((r) => r.sales_amount)
      );

      // Meskipun 5 dari 5 baris nilainya unik (uniqueness = 1.0), ini adalah NUMERIC_METRIC / CURRENCY, bukan ID!
      assert.notStrictEqual(profile.role, 'IDENTIFIER', 'Kolom sales tidak boleh dianggap IDENTIFIER');
      assert.ok(profile.role === 'CURRENCY' || profile.role === 'NUMERIC_METRIC');
    });

    it('3.4. Temuan Ketimpangan Kategori (>80%) diverifikasi dengan bukti numerik eksak', () => {
      const skewedDataset: Dataset = {
        id: 'ds-skewed',
        name: 'users.csv',
        rowCount: 100,
        columnCount: 2,
        columns: [
          { id: 'c1', name: 'id', type: 'Text' },
          { id: 'c2', name: 'country', type: 'Categorical' },
        ],
      };

      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < 100; i++) {
        rows.push({
          id: `ID_${i}`,
          country: i < 85 ? 'Indonesia' : 'Singapore', // 85% Indonesia
        });
      }

      const result = analyzeDatasetIntelligence(skewedDataset, rows);
      const imbalanceFinding = result.keyFindings.find((f) => f.id.includes('imbalance'));
      assert.ok(imbalanceFinding, 'Harus mendeteksi ketimpangan kategori 85%');
      assert.strictEqual(imbalanceFinding.numericalEvidence.value, 85);
      assert.ok(imbalanceFinding.description.includes('85.0%'));
    });
  });

  // =========================================================================
  // 4. AUDIT PENERIMAAN FIXTURE STEAM-200K (SINTETIS & ASLI JIKA ADA)
  // =========================================================================
  describe('4. Steam-200k Headerless Acceptance Audit', () => {
    it('4.1. Fixture sintetis tanpa header teranalisis akurat sebagai EVENT_LOG dengan Column 5 CONSTANT', () => {
      const syntheticFixture: Dataset = {
        id: 'steam-synth',
        name: 'steam-sample.csv',
        rowCount: 50,
        columnCount: 5,
        hasHeader: false,
        columns: [
          { id: 'c1', name: 'Column 1', type: 'Text' },
          { id: 'c2', name: 'Column 2', type: 'Text' },
          { id: 'c3', name: 'Column 3', type: 'Categorical' },
          { id: 'c4', name: 'Column 4', type: 'Numeric' },
          { id: 'c5', name: 'Column 5', type: 'Numeric' },
        ],
      };

      const gameTitles = [
        'The Elder Scrolls V Skyrim', 'Fallout 4', 'Spore', 'Ultra Street Fighter IV', 'FINAL FANTASY XIII',
        'Grand Theft Auto V', 'Counter-Strike Global Offensive', 'Left 4 Dead 2', 'Dota 2', 'Team Fortress 2',
        'Portal 2', 'Sid Meiers Civilization V', 'BioShock Infinite', 'Borderlands 2', 'Half-Life 2',
        'PAYDAY 2', 'Warframe', 'Garrys Mod', 'Terraria', 'Unturned',
        'Robocraft', 'Heroes & Generals', 'Mount & Blade Warband', 'Total War ROME II', 'Arma 3'
      ];
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < gameTitles.length; i++) {
        const title = gameTitles[i];
        rows.push({ 'Column 1': String(151603793 + (i % 4)), 'Column 2': title, 'Column 3': 'purchase', 'Column 4': 1.0, 'Column 5': 0 });
        rows.push({ 'Column 1': String(151603793 + (i % 4)), 'Column 2': title, 'Column 3': 'play', 'Column 4': (i * 7.5) + 2.0, 'Column 5': 0 });
      }
      (syntheticFixture as any).rowCount = rows.length;

      const res = analyzeDatasetIntelligence(syntheticFixture, rows);

      // Verifikasi peran kolom
      assert.strictEqual(res.columnProfiles[0].role, 'IDENTIFIER');
      assert.strictEqual(res.columnProfiles[1].role, 'NAME_LABEL');
      assert.strictEqual(res.columnProfiles[2].role, 'CATEGORY');
      assert.strictEqual(res.columnProfiles[3].role, 'NUMERIC_METRIC');
      assert.strictEqual(res.columnProfiles[4].role, 'CONSTANT');

      // Verifikasi keluarga dataset
      assert.strictEqual(res.typeInference.family, 'EVENT_LOG');
      assert.strictEqual(res.typeInference.confidence, 'MEDIUM');

      // Verifikasi temuan kolom konstan
      const constFinding = res.keyFindings.find(
        (f) => f.targetColumns?.includes('Column 5') || f.id.includes('c5') || f.id.includes('Column 5')
      );
      assert.ok(constFinding, 'Harus mendeteksi Column 5 sebagai konstan');
      assert.strictEqual(constFinding.numericalEvidence.value, 1);
    });

    it('4.2. Berkas autentik steam-200k.csv (200.000 baris x 5 field) jika tersedia di sistem', async (t) => {
      if (!fs.existsSync(REAL_STEAM_PATH)) {
        t.skip(`Berkas fisik ${REAL_STEAM_PATH} tidak ditemukan.`);
        return;
      }

      const fileContent = fs.readFileSync(REAL_STEAM_PATH, 'utf8');
      const file = new File([fileContent], 'steam-200k.csv', { type: 'text/csv' });
      const sandbox = createWorkerSandbox();

      // Ingestion file di Worker dengan opsi hasHeader: false
      sandbox.dispatch({
        taskId: 'qa05-real-steam-parse',
        action: 'PARSE_FILE',
        payload: {
          fileId: 'file-real-steam-qa05',
          file,
          options: { hasHeader: false },
        },
      });

      const parseRes = await sandbox.waitForMessage('qa05-real-steam-parse', 30000);
      assert.strictEqual(parseRes.status, 'SUCCESS');
      const payload = parseRes.payload as { dataset: Dataset; previewData: readonly Record<string, unknown>[] };
      assert.strictEqual(payload.dataset.rowCount, 200000);
      assert.strictEqual(payload.dataset.columnCount, 5);

      // Jalankan Dataset Intelligence di Worker
      sandbox.dispatch({
        taskId: 'qa05-real-steam-intel',
        action: 'ANALYZE_DATASET_INTELLIGENCE',
        payload: {
          datasetId: payload.dataset.id,
        },
      });

      const intelRes = await sandbox.waitForMessage('qa05-real-steam-intel', 30000);
      assert.strictEqual(intelRes.status, 'SUCCESS');
      const intelPayload = intelRes.payload as { datasetId: string; intelligence: any };
      const intel = intelPayload.intelligence;

      assert.strictEqual(intel.typeInference.family, 'EVENT_LOG');
      assert.strictEqual(intel.columnProfiles[0].role, 'IDENTIFIER');
      assert.strictEqual(intel.columnProfiles[1].role, 'NAME_LABEL');
      assert.strictEqual(intel.columnProfiles[2].role, 'CATEGORY');
      assert.strictEqual(intel.columnProfiles[3].role, 'NUMERIC_METRIC');
      assert.strictEqual(intel.columnProfiles[4].role, 'CONSTANT');

      // Rekomendasi harus mencakup Bar Chart, Histogram, Scatter Plot, Deskriptif, dan Pembersihan
      assert.ok(intel.recommendations.some((r: any) => r.type === 'CHART' && r.chartType === 'BAR'));
      assert.ok(intel.recommendations.some((r: any) => r.type === 'CHART' && r.chartType === 'HISTOGRAM'));
      assert.ok(intel.recommendations.some((r: any) => r.type === 'ANALYSIS'));
      assert.ok(intel.recommendations.some((r: any) => r.type === 'CLEANING'));
    });
  });

  // =========================================================================
  // 5. AUDIT KONSISTENSI BENCHMARK TEST & KEPATUHAN SLA PRD
  // =========================================================================
  describe('5. Benchmark SLA Conformance Audit', () => {
    it('5.1. Ambang batas benchmark.test.ts mematuhi SLA PRD Bagian 5.5 secara ketat', () => {
      const benchmarkFilePath = path.join(ROOT_DIR, 'src', '__tests__', 'benchmark.test.ts');
      const benchmarkContent = fs.readFileSync(benchmarkFilePath, 'utf8');

      // Verifikasi konstanta target SLA pada setiap tier di benchmark.test.ts
      // Tier 2: 10.000 baris -> Parse <= 1.000 ms, Stats <= 600 ms
      assert.ok(
        benchmarkContent.includes('size: 10000, maxParseMs: 1000, maxStatsMs: 600'),
        'Tier 2 SLA harus persis <= 1.000ms parse dan <= 600ms stats'
      );

      // Tier 3: 25.000 baris -> Parse <= 2.500 ms, Stats <= 1.500 ms
      assert.ok(
        benchmarkContent.includes('size: 25000, maxParseMs: 2500, maxStatsMs: 1500'),
        'Tier 3 SLA harus persis <= 2.500ms parse dan <= 1.500ms stats'
      );

      // Tier 4: 50.000 baris -> Parse <= 5.000 ms, Stats <= 3.500 ms
      assert.ok(
        benchmarkContent.includes('size: 50000, maxParseMs: 5000, maxStatsMs: 3500'),
        'Tier 4 SLA harus persis <= 5.000ms parse dan <= 3.500ms stats'
      );

      // Pastikan tidak ada SLA yang dilonggarkan
      assert.ok(!benchmarkContent.includes('maxParseMs: 10000'), 'Ambang parse tidak boleh dilonggarkan');
      assert.ok(!benchmarkContent.includes('maxStatsMs: 8000'), 'Ambang stats tidak boleh dilonggarkan');
    });
  });

  // =========================================================================
  // 6. PIPELINE WORKFLOW END-TO-END (INGESTION S/D EXPORT)
  // =========================================================================
  describe('6. Full Analytical Pipeline & Export Round-Trip', () => {
    it('6.1. Ingestion CSV, Profiling, Stats, Cleaning Recipe, Visualisasi, dan Ekspor biner CSV/XLSX', () => {
      // 1. Parsing CSV
      const csvRaw = fs.readFileSync(IRIS_PATH, 'utf8');
      const parsed = Papa.parse<Record<string, unknown>>(csvRaw, {
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
      });
      assert.strictEqual(parsed.data.length, 150);

      const colNames = Object.keys(parsed.data[0]);
      const columns = inferColumnTypes(colNames, parsed.data);

      // 2. Data Quality
      const quality = calculateDataQuality('ds-iris', parsed.data, columns);
      assert.strictEqual(quality.totalRecords, 150);
      assert.strictEqual(quality.totalEffectiveMissing, 0);

      // 3. Descriptive Stats
      const stats = calculateDescriptiveStatistics('ds-iris', parsed.data, columns);
      assert.strictEqual(stats.totalRecords, 150);
      assert.strictEqual(stats.columnStats.length, 5);

      // 4. Interactive Data Grid Query (Filter & Sort)
      const gridResult = queryDataGrid(parsed.data, {
        datasetId: 'ds-iris',
        searchQuery: 'setosa',
        sort: { columnId: 'sepal_length', direction: 'desc' },
        limit: 20,
        offset: 0,
      });
      assert.strictEqual(gridResult.matchedRows, 50);
      assert.strictEqual(gridResult.rows.length, 20);

      // 5. Recipe Cleaning (Non-Destruktif)
      const preview = previewRecipeStep(parsed.data, columns, {
        id: 'step-preview-dedupe',
        timestamp: Date.now(),
        type: 'DROP_DUPLICATES',
        description: 'Preview hapus duplikat',
      });
      assert.ok(preview.impactedRows > 0, 'Harus mendeteksi duplikat pada Iris');

      const cleaned = executeRecipe(parsed.data, columns, [
        {
          id: 'step-dedupe',
          timestamp: Date.now(),
          type: 'DROP_DUPLICATES',
          description: 'Hapus baris duplikat',
        },
      ]);
      assert.ok(cleaned.data.length < 150, 'Baris data aktif harus berkurang setelah dedupe');

      // 6. Visualisasi (Bar Chart & Histogram)
      const barData = generateBarChartData(cleaned.data, columns, {
        type: 'BAR',
        xColumn: 'species',
        aggregation: 'COUNT',
      });
      assert.ok(barData.data.length > 0);

      const histData = generateHistogramData(cleaned.data, columns, {
        type: 'HISTOGRAM',
        column: 'sepal_length',
        bins: 10,
      });
      assert.strictEqual(histData.bins.length, 10);

      // 7. Ekspor CSV (RFC 4180 BOM) & XLSX (SheetJS)
      const exportedCsv = serializeToCsv(cleaned.data, columns, { delimiter: ',', includeBom: true });
      assert.ok(exportedCsv.startsWith('\uFEFF'), 'CSV harus memuat UTF-8 BOM');

      const exportedXlsx = serializeToXlsx(cleaned.data, columns, { sheetName: 'CleanIris' });
      assert.ok(exportedXlsx instanceof ArrayBuffer);
      assert.ok(exportedXlsx.byteLength > 0);

      // Baca ulang XLSX untuk membuktikan keutuhan round-trip
      const readWb = XLSX.read(exportedXlsx, { type: 'buffer' });
      assert.strictEqual(readWb.SheetNames[0], 'CleanIris');
      const readRows = XLSX.utils.sheet_to_json(readWb.Sheets['CleanIris']);
      assert.strictEqual(readRows.length, cleaned.data.length);
    });
  });
});
