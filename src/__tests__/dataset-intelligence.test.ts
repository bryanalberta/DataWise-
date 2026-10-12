import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  analyzeDatasetIntelligence,
  profileColumnSemantics,
  getConfidenceLabel,
  getRoleLabel,
} from '../lib/dataset-intelligence';
import { useDatasetStore } from '../store/dataset-store';
import { Dataset, WorkerResponse, DatasetIntelligenceResult } from '../types';
import InsightPage from '../app/insight/page';

describe('TASK-DI-01 — DataWise Dataset Intelligence Engine & UI Acceptance Tests', () => {
  const rootDir = path.resolve(__dirname, '..', '..');
  const workerDistPath = path.join(rootDir, 'public', 'workers', 'data-processor.worker.js');

  // Helper untuk sandbox Web Worker
  function createWorkerSandbox() {
    const workerContent = fs.readFileSync(workerDistPath, 'utf8');
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
      waitForMessage: async (timeoutMs = 15000): Promise<WorkerResponse> => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          if (postedMessages.length > 0) {
            return postedMessages[postedMessages.length - 1];
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error(`Timeout waiting for worker message after ${timeoutMs}ms`);
      },
      getAllMessages: () => [...postedMessages],
      triggerError: (err: unknown) => {
        if (errorListener) errorListener(err);
      },
    };
  }

  // Helper render React ke HTML
  function renderPage(
    component: React.ComponentType<Record<string, unknown>>,
    props: Record<string, unknown> = {}
  ): string {
    return renderToStaticMarkup(React.createElement(component as React.ElementType, props));
  }

  // =========================================================================
  // 1. INFERENSI KELUARGA DATASET (DATASET FAMILY HEURISTICS)
  // =========================================================================
  describe('1. Inferensi Keluarga Dataset (Dataset Family Classification)', () => {
    it('1.1. Dataset Event / Activity Log dengan header terklasifikasi sebagai EVENT_LOG', () => {
      const dataset: Dataset = {
        id: 'ds-event-log',
        name: 'user_activity_log.csv',
        rowCount: 5,
        columnCount: 4,
        hasHeader: true,
        columns: [
          { id: 'user_id', name: 'user_id', type: 'Text' },
          { id: 'game', name: 'game_title', type: 'Text' },
          { id: 'action', name: 'action_type', type: 'Text' },
          { id: 'hours', name: 'play_hours', type: 'Numeric' },
        ],
      };
      const data = [
        { user_id: 'USR001', game_title: 'Dota 2', action_type: 'play', play_hours: 12.5 },
        { user_id: 'USR001', game_title: 'Dota 2', action_type: 'purchase', play_hours: 1.0 },
        { user_id: 'USR002', game_title: 'Portal', action_type: 'play', play_hours: 4.2 },
        { user_id: 'USR003', game_title: 'Half-Life', action_type: 'play', play_hours: 8.0 },
        { user_id: 'USR002', game_title: 'Portal', action_type: 'purchase', play_hours: 1.0 },
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      assert.strictEqual(res.typeInference.family, 'EVENT_LOG');
      assert.strictEqual(res.typeInference.confidence, 'HIGH');
      assert.ok(res.typeInference.label.includes('Log Aktivitas'));
      assert.ok(res.typeInference.supportingFactors.length >= 2);
    });

    it('1.2. Fixture sintetis representatif Steam-200k tanpa header terklasifikasi sebagai EVENT_LOG dengan confidence SEDANG dan mencatat caveat ketiadaan header', () => {
      // Sesuai acceptance fixture Section 10: 5 kolom tanpa header (Column 1..5)
      // Col 1: user id integer non-desimal berulang
      // Col 2: item/game berulang
      // Col 3: behavior kategori biner ('purchase' / 'play')
      // Col 4: metric numeric (1.0 untuk purchase, float untuk play)
      // Col 5: constant 0
      const dataset: Dataset = {
        id: 'ds-steam-synthetic-acceptance',
        name: 'steam-200k.csv',
        rowCount: 8,
        columnCount: 5,
        hasHeader: false,
        columns: [
          { id: 'col1', name: 'Column 1', type: 'Text' },
          { id: 'col2', name: 'Column 2', type: 'Text' },
          { id: 'col3', name: 'Column 3', type: 'Text' },
          { id: 'col4', name: 'Column 4', type: 'Numeric' },
          { id: 'col5', name: 'Column 5', type: 'Numeric' },
        ],
      };
      const data = [
        { 'Column 1': '151603712', 'Column 2': 'Fallout 4', 'Column 3': 'purchase', 'Column 4': 1.0, 'Column 5': 0 },
        { 'Column 1': '151603712', 'Column 2': 'Fallout 4', 'Column 3': 'play', 'Column 4': 18.0, 'Column 5': 0 },
        { 'Column 1': '151603712', 'Column 2': 'Spore', 'Column 3': 'purchase', 'Column 4': 1.0, 'Column 5': 0 },
        { 'Column 1': '151603712', 'Column 2': 'Spore', 'Column 3': 'play', 'Column 4': 14.9, 'Column 5': 0 },
        { 'Column 1': '599269121', 'Column 2': 'Dota 2', 'Column 3': 'purchase', 'Column 4': 1.0, 'Column 5': 0 },
        { 'Column 1': '599269121', 'Column 2': 'Dota 2', 'Column 3': 'play', 'Column 4': 22.0, 'Column 5': 0 },
        { 'Column 1': '599269121', 'Column 2': 'Portal 2', 'Column 3': 'purchase', 'Column 4': 1.0, 'Column 5': 0 },
        { 'Column 1': '599269121', 'Column 2': 'Portal 2', 'Column 3': 'play', 'Column 4': 5.5, 'Column 5': 0 },
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      assert.strictEqual(res.typeInference.family, 'EVENT_LOG');
      // Karena tanpa header, confidence kategoris harus MEDIUM bukan HIGH (Section 4 & 10)
      assert.strictEqual(res.typeInference.confidence, 'MEDIUM');
      // Kolom 5 bernilai 0 pada seluruh baris harus ditandai sebagai CONSTANT
      const col5 = res.columnProfiles.find((c) => c.columnName === 'Column 5');
      assert.ok(col5);
      assert.strictEqual(col5?.role, 'CONSTANT');

      // Kolom 1 harus terdeteksi sebagai IDENTIFIER
      const col1 = res.columnProfiles.find((c) => c.columnName === 'Column 1');
      assert.strictEqual(col1?.role, 'IDENTIFIER');

      // Kolom 3 harus terdeteksi sebagai CATEGORY
      const col3 = res.columnProfiles.find((c) => c.columnName === 'Column 3');
      assert.strictEqual(col3?.role, 'CATEGORY');

      // Kolom 4 harus terdeteksi sebagai NUMERIC_METRIC tanpa mengasumsikan khusus jam bermain
      const col4 = res.columnProfiles.find((c) => c.columnName === 'Column 4');
      assert.strictEqual(col4?.role, 'NUMERIC_METRIC');

      // Memverifikasi adanya catatan/caveat tentang headerless
      assert.ok(res.typeInference.caveats && res.typeInference.caveats.length > 0);
      assert.ok(
        res.typeInference.caveats?.some((c) => c.toLowerCase().includes('header') || c.toLowerCase().includes('tanpa')),
        'Harus menyertakan peringatan keterbatasan interpretasi akibat ketiadaan header'
      );
    });

    it('1.3. Dataset Transaksi Keuangan terklasifikasi sebagai TRANSACTION dengan confidence TINGGI', () => {
      const dataset: Dataset = {
        id: 'ds-tx-01',
        name: 'orders_2024.csv',
        rowCount: 4,
        columnCount: 5,
        hasHeader: true,
        columns: [
          { id: 'order_id', name: 'order_id', type: 'Text' },
          { id: 'customer_id', name: 'customer_id', type: 'Text' },
          { id: 'amount', name: 'total_amount', type: 'Numeric' },
          { id: 'payment_status', name: 'payment_status', type: 'Text' },
          { id: 'created_at', name: 'created_at', type: 'DateTime' },
        ],
      };
      const data = [
        { order_id: 'ORD-101', customer_id: 'CUST-1', total_amount: 150000, payment_status: 'paid', created_at: '2024-01-10T10:00:00Z' },
        { order_id: 'ORD-102', customer_id: 'CUST-2', total_amount: 250000, payment_status: 'paid', created_at: '2024-01-10T11:00:00Z' },
        { order_id: 'ORD-103', customer_id: 'CUST-1', total_amount: 80000, payment_status: 'pending', created_at: '2024-01-10T12:00:00Z' },
        { order_id: 'ORD-104', customer_id: 'CUST-3', total_amount: 320000, payment_status: 'paid', created_at: '2024-01-10T13:00:00Z' },
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      assert.strictEqual(res.typeInference.family, 'TRANSACTION');
      assert.strictEqual(res.typeInference.confidence, 'HIGH');
      assert.ok(res.typeInference.label.includes('Transaksi'));
    });

    it('1.4. Dataset Time-Series terklasifikasi sebagai TIME_SERIES', () => {
      const dataset: Dataset = {
        id: 'ds-ts-01',
        name: 'sensor_timeseries.csv',
        rowCount: 5,
        columnCount: 3,
        hasHeader: true,
        columns: [
          { id: 'timestamp', name: 'timestamp', type: 'DateTime' },
          { id: 'temp', name: 'temperature_celsius', type: 'Numeric' },
          { id: 'hum', name: 'humidity_percent', type: 'Numeric' },
        ],
      };
      const data = [
        { timestamp: '2024-01-01 00:00', temperature_celsius: 28.5, humidity_percent: 65 },
        { timestamp: '2024-01-01 01:00', temperature_celsius: 28.2, humidity_percent: 66 },
        { timestamp: '2024-01-01 02:00', temperature_celsius: 27.9, humidity_percent: 68 },
        { timestamp: '2024-01-01 03:00', temperature_celsius: 27.5, humidity_percent: 70 },
        { timestamp: '2024-01-01 04:00', temperature_celsius: 27.1, humidity_percent: 72 },
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      assert.strictEqual(res.typeInference.family, 'TIME_SERIES');
    });

    it('1.5. Dataset Pelanggan / User Records terklasifikasi sebagai CUSTOMER_RECORDS', () => {
      const dataset: Dataset = {
        id: 'ds-cust-01',
        name: 'customers.csv',
        rowCount: 4,
        columnCount: 4,
        hasHeader: true,
        columns: [
          { id: 'cust_id', name: 'customer_id', type: 'Text' },
          { id: 'name', name: 'full_name', type: 'Text' },
          { id: 'email', name: 'email', type: 'Text' },
          { id: 'tier', name: 'membership_tier', type: 'Text' },
        ],
      };
      const data = [
        { customer_id: 'C001', full_name: 'Budi Santoso', email: 'budi@example.com', membership_tier: 'Gold' },
        { customer_id: 'C002', full_name: 'Siti Aminah', email: 'siti@example.com', membership_tier: 'Silver' },
        { customer_id: 'C003', full_name: 'Agus Wijaya', email: 'agus@example.com', membership_tier: 'Platinum' },
        { customer_id: 'C004', full_name: 'Dewi Lestari', email: 'dewi@example.com', membership_tier: 'Silver' },
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      assert.strictEqual(res.typeInference.family, 'CUSTOMER_RECORDS');
    });

    it('1.6. Dataset Katalog Produk terklasifikasi sebagai PRODUCT_CATALOG', () => {
      const dataset: Dataset = {
        id: 'ds-prod-01',
        name: 'catalog.csv',
        rowCount: 3,
        columnCount: 4,
        hasHeader: true,
        columns: [
          { id: 'sku', name: 'sku_code', type: 'Text' },
          { id: 'prod_name', name: 'product_name', type: 'Text' },
          { id: 'cat', name: 'category', type: 'Text' },
          { id: 'price', name: 'unit_price', type: 'Numeric' },
        ],
      };
      const data = [
        { sku_code: 'SKU-01', product_name: 'Keyboard Mech', category: 'Elektronik', unit_price: 650000 },
        { sku_code: 'SKU-02', product_name: 'Mouse Ergonomic', category: 'Elektronik', unit_price: 320000 },
        { sku_code: 'SKU-03', product_name: 'Headphone Wireless', category: 'Audio', unit_price: 1200000 },
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      assert.strictEqual(res.typeInference.family, 'PRODUCT_CATALOG');
    });

    it('1.7. Dataset Survei / Kuesioner terklasifikasi sebagai SURVEY_RESPONSES', () => {
      const dataset: Dataset = {
        id: 'ds-survey-01',
        name: 'survey_results.csv',
        rowCount: 3,
        columnCount: 4,
        hasHeader: true,
        columns: [
          { id: 'resp_id', name: 'respondent_id', type: 'Text' },
          { id: 'q1', name: 'question_1', type: 'Text' },
          { id: 'q2', name: 'question_2', type: 'Text' },
          { id: 'feedback', name: 'free_feedback', type: 'Text' },
        ],
      };
      const data = [
        { respondent_id: 'R01', question_1: 'Sangat Puas', question_2: 'Pasti Merekomendasikan', free_feedback: 'Aplikasi cepat dan responsif' },
        { respondent_id: 'R02', question_1: 'Puas', question_2: 'Mungkin', free_feedback: 'Tampilan bersih' },
        { respondent_id: 'R03', question_1: 'Cukup', question_2: 'Tidak Tahu', free_feedback: 'Perlu fitur dark mode' },
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      assert.strictEqual(res.typeInference.family, 'SURVEY_RESPONSES');
    });

    it('1.8. Dataset numerik dan kategorikal umum (Iris) terklasifikasi sebagai GENERAL_TABULAR', () => {
      const dataset: Dataset = {
        id: 'ds-iris',
        name: 'iris.csv',
        rowCount: 3,
        columnCount: 5,
        hasHeader: true,
        columns: [
          { id: 'sl', name: 'sepal_length', type: 'Numeric' },
          { id: 'sw', name: 'sepal_width', type: 'Numeric' },
          { id: 'pl', name: 'petal_length', type: 'Numeric' },
          { id: 'pw', name: 'petal_width', type: 'Numeric' },
          { id: 'sp', name: 'species', type: 'Text' },
        ],
      };
      const data = [
        { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2, species: 'setosa' },
        { sepal_length: 7.0, sepal_width: 3.2, petal_length: 4.7, petal_width: 1.4, species: 'versicolor' },
        { sepal_length: 6.3, sepal_width: 3.3, petal_length: 6.0, petal_width: 2.5, species: 'virginica' },
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      assert.strictEqual(res.typeInference.family, 'GENERAL_TABULAR');
      assert.ok(res.typeInference.label.includes('Dataset Tabular Umum'));
    });

    it('1.9. Dataset kosong (0 baris) menghasilkan klasifikasi aman tanpa exception', () => {
      const emptyDataset: Dataset = {
        id: 'ds-empty',
        name: 'empty.csv',
        rowCount: 0,
        columnCount: 2,
        hasHeader: true,
        columns: [
          { id: 'col1', name: 'col1', type: 'Text' },
          { id: 'col2', name: 'col2', type: 'Numeric' },
        ],
      };

      const res = analyzeDatasetIntelligence(emptyDataset, []);
      assert.strictEqual(res.rowCount, 0);
      assert.strictEqual(res.typeInference.family, 'UNCLASSIFIED');
      assert.strictEqual(res.typeInference.confidence, 'LOW');
    });
  });

  // =========================================================================
  // 2. DETEKSI PERAN SEMANTIK SETIAP KOLOM
  // =========================================================================
  describe('2. Deteksi Peran Semantik Kolom (Semantic Column Roles)', () => {
    it('2.1. Kolom konstan (1 nilai pada seluruh baris) terdeteksi sebagai CONSTANT', () => {
      const dataset: Dataset = {
        id: 'ds-const',
        name: 'constant_test.csv',
        rowCount: 5,
        columnCount: 1,
        columns: [{ id: 'flag', name: 'status_flag', type: 'Numeric' }],
      };
      const values = [0, 0, 0, 0, 0];

      const profile = profileColumnSemantics(dataset, dataset.columns[0], values);
      assert.strictEqual(profile.role, 'CONSTANT');
      assert.strictEqual(profile.evidence.uniqueCount, 1);
      assert.strictEqual(profile.confidence, 'HIGH');
      assert.ok(profile.rationale.includes('100% baris'));
    });

    it('2.2. Kolom NIK / User ID dengan kardinalitas tinggi terdeteksi sebagai IDENTIFIER', () => {
      const dataset: Dataset = {
        id: 'ds-id',
        name: 'users.csv',
        rowCount: 4,
        columnCount: 1,
        columns: [{ id: 'uid', name: 'user_id', type: 'Text' }],
      };
      const values = ['3201012345670001', '3201012345670002', '3201012345670003', '3201012345670004'];

      const profile = profileColumnSemantics(dataset, dataset.columns[0], values);
      assert.strictEqual(profile.role, 'IDENTIFIER');
      assert.strictEqual(profile.evidence.uniquenessRatio, 1.0);
    });

    it('2.3. Kolom kategori dengan nilai berulang terdeteksi sebagai CATEGORY', () => {
      const dataset: Dataset = {
        id: 'ds-cat',
        name: 'sales.csv',
        rowCount: 6,
        columnCount: 1,
        columns: [{ id: 'reg', name: 'wilayah_region', type: 'Text' }],
      };
      const values = ['Jawa Barat', 'Jawa Barat', 'DKI Jakarta', 'Jawa Tengah', 'DKI Jakarta', 'Jawa Barat'];

      const profile = profileColumnSemantics(dataset, dataset.columns[0], values);
      assert.strictEqual(profile.role, 'CATEGORY');
      assert.strictEqual(profile.evidence.uniqueCount, 3);
    });

    it('2.4. Kolom nama / label produk terdeteksi sebagai NAME_LABEL', () => {
      const dataset: Dataset = {
        id: 'ds-label',
        name: 'products.csv',
        rowCount: 4,
        columnCount: 1,
        columns: [{ id: 'pname', name: 'nama_produk', type: 'Text' }],
      };
      const values = ['Laptop Ultra Pro', 'Mouse Wireless', 'Keyboard RGB', 'Monitor 27 Inch'];

      const profile = profileColumnSemantics(dataset, dataset.columns[0], values);
      assert.strictEqual(profile.role, 'NAME_LABEL');
    });

    it('2.5. Kolom nominal harga terdeteksi sebagai CURRENCY', () => {
      const dataset: Dataset = {
        id: 'ds-curr',
        name: 'pricing.csv',
        rowCount: 3,
        columnCount: 1,
        columns: [{ id: 'prc', name: 'harga_satuan', type: 'Numeric' }],
      };
      const values = [150000, 250000, 500000];

      const profile = profileColumnSemantics(dataset, dataset.columns[0], values);
      assert.strictEqual(profile.role, 'CURRENCY');
    });

    it('2.6. Kolom persentase terdeteksi sebagai PERCENTAGE', () => {
      const dataset: Dataset = {
        id: 'ds-pct',
        name: 'margin.csv',
        rowCount: 3,
        columnCount: 1,
        columns: [{ id: 'rate', name: 'margin_persen', type: 'Numeric' }],
      };
      const values = [12.5, 18.0, 24.3];

      const profile = profileColumnSemantics(dataset, dataset.columns[0], values);
      assert.strictEqual(profile.role, 'PERCENTAGE');
    });

    it('2.7. Kolom durasi terdeteksi sebagai DURATION', () => {
      const dataset: Dataset = {
        id: 'ds-dur',
        name: 'flight.csv',
        rowCount: 3,
        columnCount: 1,
        columns: [{ id: 'dur', name: 'flight_duration_minutes', type: 'Numeric' }],
      };
      const values = [90, 120, 185];

      const profile = profileColumnSemantics(dataset, dataset.columns[0], values);
      assert.strictEqual(profile.role, 'DURATION');
    });

    it('2.8. Kolom boolean terdeteksi sebagai BOOLEAN', () => {
      const dataset: Dataset = {
        id: 'ds-bool',
        name: 'flags.csv',
        rowCount: 4,
        columnCount: 1,
        columns: [{ id: 'act', name: 'is_active', type: 'Boolean' }],
      };
      const values = [true, false, true, true];

      const profile = profileColumnSemantics(dataset, dataset.columns[0], values);
      assert.strictEqual(profile.role, 'BOOLEAN');
    });

    it('2.9. Helper getConfidenceLabel dan getRoleLabel memetakan nilai ke bahasa Indonesia', () => {
      assert.strictEqual(getConfidenceLabel('HIGH'), 'Tinggi');
      assert.strictEqual(getConfidenceLabel('MEDIUM'), 'Sedang');
      assert.strictEqual(getConfidenceLabel('LOW'), 'Rendah');

      assert.strictEqual(getRoleLabel('IDENTIFIER'), 'Identifier / Kunci');
      assert.strictEqual(getRoleLabel('CONSTANT'), 'Konstan (Tanpa Variasi)');
      assert.strictEqual(getRoleLabel('CATEGORY'), 'Kategori');
    });
  });

  // =========================================================================
  // 3. TEMUAN PENTING (KEY FINDINGS & NUMERICAL EVIDENCE)
  // =========================================================================
  describe('3. Temuan Penting (Key Findings)', () => {
    it('3.1. Menemukan kolom konstan dengan bukti numerik 100% baris identik', () => {
      const dataset: Dataset = {
        id: 'ds-find-const',
        name: 'log.csv',
        rowCount: 5,
        columnCount: 2,
        columns: [
          { id: 'c1', name: 'id', type: 'Text' },
          { id: 'c2', name: 'status_code', type: 'Numeric' },
        ],
      };
      const data = [
        { id: '1', status_code: 200 },
        { id: '2', status_code: 200 },
        { id: '3', status_code: 200 },
        { id: '4', status_code: 200 },
        { id: '5', status_code: 200 },
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      const constFinding = res.keyFindings.find((f) => f.category === 'VARIATION');
      assert.ok(constFinding, 'Harus mendeteksi temuan variasi nilai');
      assert.ok(constFinding?.numericalEvidence.formattedValue.includes('100%'));
      assert.ok(constFinding?.targetColumns.includes('status_code'));
    });

    it('3.2. Menemukan kolom dengan missing values tinggi (>20%) dengan bukti persentase nyata', () => {
      const dataset: Dataset = {
        id: 'ds-find-miss',
        name: 'missing_test.csv',
        rowCount: 5,
        columnCount: 2,
        columns: [
          { id: 'c1', name: 'id', type: 'Text' },
          { id: 'c2', name: 'notes', type: 'Text' },
        ],
      };
      const data = [
        { id: '1', notes: 'Ada' },
        { id: '2', notes: null },
        { id: '3', notes: '' },
        { id: '4', notes: 'Ada' },
        { id: '5', notes: null }, // 3 out of 5 missing (60%)
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      const missFinding = res.keyFindings.find((f) => f.category === 'QUALITY');
      assert.ok(missFinding, 'Harus mendeteksi temuan missing value');
      assert.ok(missFinding?.numericalEvidence.formattedValue.includes('60.0%'));
      assert.ok(missFinding?.targetColumns.includes('notes'));
    });

    it('3.3. Menemukan ketidakseimbangan kategori ekstrem (>80%) dengan persentase dominan', () => {
      const dataset: Dataset = {
        id: 'ds-find-skew',
        name: 'skew_test.csv',
        rowCount: 10,
        columnCount: 2,
        columns: [
          { id: 'c1', name: 'id', type: 'Text' },
          { id: 'c2', name: 'tipe_user', type: 'Text' },
        ],
      };
      const data = [
        { id: '1', tipe_user: 'Regular' },
        { id: '2', tipe_user: 'Regular' },
        { id: '3', tipe_user: 'Regular' },
        { id: '4', tipe_user: 'Regular' },
        { id: '5', tipe_user: 'Regular' },
        { id: '6', tipe_user: 'Regular' },
        { id: '7', tipe_user: 'Regular' },
        { id: '8', tipe_user: 'Regular' },
        { id: '9', tipe_user: 'Regular' },
        { id: '10', tipe_user: 'VIP' }, // 90% Regular
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      const skewFinding = res.keyFindings.find((f) => f.category === 'DISTRIBUTION');
      assert.ok(skewFinding, 'Harus mendeteksi ketidakseimbangan distribusi kategori');
      assert.ok(skewFinding?.numericalEvidence.formattedValue.includes('90.0%'));
      assert.ok(skewFinding?.targetColumns.includes('tipe_user'));
    });
  });

  // =========================================================================
  // 4. REKOMENDASI ANALISIS & GRAFIK (ACTIONABLE RECOMMENDATIONS)
  // =========================================================================
  describe('4. Rekomendasi Analisis & Visualisasi Praktis', () => {
    it('4.1. Menghasilkan rekomendasi grafik dan analisis yang menunjuk route resmi', () => {
      const dataset: Dataset = {
        id: 'ds-recs',
        name: 'full_features.csv',
        rowCount: 5,
        columnCount: 4,
        columns: [
          { id: 'dt', name: 'date', type: 'DateTime' },
          { id: 'cat', name: 'category', type: 'Text' },
          { id: 'sales', name: 'sales', type: 'Numeric' },
          { id: 'profit', name: 'profit', type: 'Numeric' },
        ],
      };
      const data = [
        { date: '2024-01-01', category: 'A', sales: 100, profit: 20 },
        { date: '2024-01-02', category: 'B', sales: 150, profit: 35 },
        { date: '2024-01-03', category: 'A', sales: 200, profit: 50 },
        { date: '2024-01-04', category: 'C', sales: 80, profit: 10 },
        { date: '2024-01-05', category: 'B', sales: 120, profit: 25 },
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      assert.ok(res.recommendations.length >= 3);

      // Verifikasi semua targetRoute valid
      const validRoutes = ['/visualisasi', '/analisis', '/pembersihan'];
      for (const rec of res.recommendations) {
        assert.ok(
          validRoutes.includes(rec.targetRoute),
          `targetRoute "${rec.targetRoute}" harus termasuk dalam route yang didukung`
        );
        assert.ok(rec.questionAnswered.length > 5, 'Harus mendefinisikan pertanyaan yang dijawab');
        assert.ok(rec.rationale.length > 5, 'Harus mendefinisikan alasan rekomendasi');
        assert.ok(rec.targetColumns.length > 0, 'Harus menyertakan kolom yang terlibat');
      }

      // Pastikan ada rekomendasi Bar Chart dan Scatter Plot
      const barRec = res.recommendations.find((r) => r.chartType === 'BAR' || r.title.toLowerCase().includes('bar'));
      assert.ok(barRec, 'Harus ada rekomendasi Bar Chart untuk Kategori + Numerik');

      const scatterRec = res.recommendations.find((r) => r.chartType === 'SCATTER' || r.title.toLowerCase().includes('scatter'));
      assert.ok(scatterRec, 'Harus ada rekomendasi Scatter Plot untuk 2 metrik numerik');
    });

    it('4.2. Merekomendasikan Studio Pembersihan saat terdapat kolom konstan atau missing values', () => {
      const dataset: Dataset = {
        id: 'ds-clean-rec',
        name: 'needs_cleaning.csv',
        rowCount: 4,
        columnCount: 2,
        columns: [
          { id: 'c1', name: 'id', type: 'Text' },
          { id: 'c2', name: 'always_zero', type: 'Numeric' },
        ],
      };
      const data = [
        { id: '1', always_zero: 0 },
        { id: '2', always_zero: 0 },
        { id: '3', always_zero: 0 },
        { id: '4', always_zero: 0 },
      ];

      const res = analyzeDatasetIntelligence(dataset, data);
      const cleanRec = res.recommendations.find((r) => r.type === 'CLEANING');
      assert.ok(cleanRec, 'Harus merekomendasikan Studio Pembersihan');
      assert.strictEqual(cleanRec?.targetRoute, '/pembersihan');
    });
  });

  // =========================================================================
  // 5. DETERMINISME HASIL
  // =========================================================================
  describe('5. Determinisme Hasil (Deterministic Evaluation)', () => {
    it('5.1. Input dataset yang sama menghasilkan output identik tanpa variasi acak', () => {
      const dataset: Dataset = {
        id: 'ds-det-01',
        name: 'deterministic_test.csv',
        rowCount: 3,
        columnCount: 3,
        columns: [
          { id: 'id', name: 'id', type: 'Text' },
          { id: 'val', name: 'value', type: 'Numeric' },
          { id: 'cat', name: 'category', type: 'Text' },
        ],
      };
      const data = [
        { id: 'A', value: 10, category: 'X' },
        { id: 'B', value: 20, category: 'Y' },
        { id: 'C', value: 30, category: 'X' },
      ];

      const run1 = analyzeDatasetIntelligence(dataset, data);
      const run2 = analyzeDatasetIntelligence(dataset, data);

      assert.strictEqual(run1.typeInference.family, run2.typeInference.family);
      assert.strictEqual(run1.typeInference.confidence, run2.typeInference.confidence);
      assert.strictEqual(run1.columnProfiles.length, run2.columnProfiles.length);
      for (let i = 0; i < run1.columnProfiles.length; i++) {
        assert.strictEqual(run1.columnProfiles[i].role, run2.columnProfiles[i].role);
        assert.strictEqual(run1.columnProfiles[i].evidence.uniqueCount, run2.columnProfiles[i].evidence.uniqueCount);
      }
      assert.strictEqual(run1.keyFindings.length, run2.keyFindings.length);
      assert.strictEqual(run1.recommendations.length, run2.recommendations.length);
    });
  });

  // =========================================================================
  // 6. STORE STATE & INVALIDASI CACHE (LIFECYCLE)
  // =========================================================================
  describe('6. Store State & Invalidasi Hasil Lama (Cache Lifecycle)', () => {
    it('6.1. setDataset mereset datasetIntelligence menjadi null', () => {
      const store = useDatasetStore.getState();
      const dummyRes: DatasetIntelligenceResult = {
        datasetId: 'old-ds',
        evaluatedAt: Date.now(),
        rowCount: 10,
        columnCount: 2,
        hasHeader: true,
        typeInference: { family: 'GENERAL_TABULAR', label: 'Tabular', description: 'desc', confidence: 'LOW', confidenceLabel: 'Rendah', supportingFactors: [], caveats: [] },
        columnProfiles: [],
        keyFindings: [],
        recommendations: [],
      };

      store.setDatasetIntelligence(dummyRes);
      assert.strictEqual(useDatasetStore.getState().datasetIntelligence?.datasetId, 'old-ds');

      // Muat dataset baru -> harus otomatis di-reset ke null
      store.setDataset({
        id: 'new-ds',
        name: 'new.csv',
        rowCount: 5,
        columnCount: 1,
        columns: [{ id: 'col', name: 'col', type: 'Text' }],
      });
      assert.strictEqual(useDatasetStore.getState().datasetIntelligence, null);
    });

    it('6.2. clearDataset dan updateActiveDatasetAfterCleaning mereset datasetIntelligence', () => {
      const store = useDatasetStore.getState();
      const dummyRes: DatasetIntelligenceResult = {
        datasetId: 'clean-ds',
        evaluatedAt: Date.now(),
        rowCount: 10,
        columnCount: 1,
        hasHeader: true,
        typeInference: { family: 'GENERAL_TABULAR', label: 'Tabular', description: 'desc', confidence: 'LOW', confidenceLabel: 'Rendah', supportingFactors: [], caveats: [] },
        columnProfiles: [],
        keyFindings: [],
        recommendations: [],
      };

      // Set dan verifikasi
      store.setDatasetIntelligence(dummyRes);
      assert.strictEqual(useDatasetStore.getState().datasetIntelligence?.datasetId, 'clean-ds');

      // Mutasi cleaning -> reset ke null
      store.updateActiveDatasetAfterCleaning({
        id: 'clean-ds',
        name: 'clean.csv',
        rowCount: 9,
        columnCount: 1,
        columns: [{ id: 'col', name: 'col', type: 'Text' }],
      });
      assert.strictEqual(useDatasetStore.getState().datasetIntelligence, null);

      // Set lagi lalu panggil clearDataset
      store.setDatasetIntelligence(dummyRes);
      store.clearDataset();
      assert.strictEqual(useDatasetStore.getState().datasetIntelligence, null);
    });
  });

  // =========================================================================
  // 7. WEB WORKER EXECUTION & CONTRACT INTEGRATION
  // =========================================================================
  describe('7. Web Worker Execution & Message Contract', () => {
    it('7.1. Bundled Worker memproses ANALYZE_DATASET_INTELLIGENCE dan merespons dengan hasil lengkap', async () => {
      const sandbox = createWorkerSandbox();
      const csv = `product_id,product_name,category,price\nP101,Laptop,Electronics,1200\nP102,Mouse,Electronics,25\n`;
      const file = new File([csv], 'catalog.csv', { type: 'text/csv' });

      // Parse dataset terlebih dahulu ke memori Worker
      sandbox.dispatch({
        taskId: 'task-parse-for-di',
        action: 'PARSE_FILE',
        payload: {
          fileId: 'f-di-01',
          file,
          options: { hasHeader: true },
        },
      });

      const parseRes = await sandbox.waitForMessage();
      assert.strictEqual(parseRes.status, 'SUCCESS');
      const parsedDataset = (parseRes.payload as { dataset: Dataset }).dataset;

      // Jalankan aksi ANALYZE_DATASET_INTELLIGENCE
      sandbox.dispatch({
        taskId: 'task-di-test-01',
        action: 'ANALYZE_DATASET_INTELLIGENCE',
        payload: {
          datasetId: parsedDataset.id,
        },
      });

      const diRes = await sandbox.waitForMessage();
      assert.strictEqual(diRes.status, 'SUCCESS');
      assert.strictEqual(diRes.action, 'ANALYZE_DATASET_INTELLIGENCE');

      const diPayload = diRes.payload as {
        datasetId: string;
        intelligence: DatasetIntelligenceResult;
      };
      assert.strictEqual(diPayload.datasetId, parsedDataset.id);
      assert.strictEqual(diPayload.intelligence.columnProfiles.length, 4);
      assert.ok(diPayload.intelligence.typeInference.label.length > 0);
    });

    it('7.2. Bundled Worker mengembalikan error ketika datasetId tidak ditemukan di memori', async () => {
      const sandbox = createWorkerSandbox();

      sandbox.dispatch({
        taskId: 'task-di-not-found',
        action: 'ANALYZE_DATASET_INTELLIGENCE',
        payload: {
          datasetId: 'non-existent-dataset-id',
        },
      });

      const res = await sandbox.waitForMessage();
      assert.strictEqual(res.status, 'ERROR');
      assert.strictEqual(res.action, 'ANALYZE_DATASET_INTELLIGENCE');
      const payload = res.payload as { error: string };
      assert.ok(payload.error.includes('tidak ditemukan'));
    });
  });

  // =========================================================================
  // 8. UI PAGE & ROUTING ACCEPTANCE
  // =========================================================================
  describe('8. UI Page & Routing Acceptance', () => {
    it('8.1. Halaman /insight menampilkan empty state ramah pengguna ketika belum ada dataset', () => {
      const html = renderPage(InsightPage as React.ComponentType<Record<string, unknown>>, {
        _testDataset: null,
      });

      assert.ok(html.includes('Insight Dataset'));
      assert.ok(html.includes('Belum Ada Dataset yang Dimuat'));
      assert.ok(html.includes('href="/"'), 'Harus menyertakan tautan kembali ke Beranda');
    });

    it('8.2. Halaman /insight merender struktur informasi lengkap saat dataset aktif tersedia', () => {
      const testDs: Dataset = {
        id: 'ds-render-test',
        name: 'transactions_sample.csv',
        rowCount: 100,
        columnCount: 3,
        hasHeader: true,
        columns: [
          { id: 'c1', name: 'transaction_id', type: 'Text' },
          { id: 'c2', name: 'category', type: 'Text' },
          { id: 'c3', name: 'amount', type: 'Numeric' },
        ],
      };

      const testIntel: DatasetIntelligenceResult = {
        datasetId: testDs.id,
        evaluatedAt: Date.now(),
        rowCount: 100,
        columnCount: 3,
        hasHeader: true,
        typeInference: {
          family: 'TRANSACTION',
          label: 'Data Transaksi',
          description: 'Dataset merepresentasikan rekaman transaksi dengan nominal uang.',
          confidence: 'HIGH',
          confidenceLabel: 'Tinggi',
          supportingFactors: ['Terdapat kolom transaksi dan nominal uang'],
          caveats: [],
        },
        columnProfiles: [
          {
            columnId: 'c1',
            columnName: 'transaction_id',
            inferredType: 'Text',
            role: 'IDENTIFIER',
            roleLabel: 'Identifier / Kunci',
            confidence: 'HIGH',
            confidenceLabel: 'Tinggi',
            rationale: 'Kardinalitas 100% unik dengan pola identifier.',
            evidence: {
              uniqueCount: 100,
              uniquenessRatio: 1.0,
              nullCount: 0,
              nullRatio: 0,
              isConstant: false,
              sampleValues: ['TX001', 'TX002'],
              isNumeric: false,
              isDateTime: false,
            },
          },
          {
            columnId: 'c2',
            columnName: 'category',
            inferredType: 'Text',
            role: 'CATEGORY',
            roleLabel: 'Kategori',
            confidence: 'HIGH',
            confidenceLabel: 'Tinggi',
            rationale: 'Kardinalitas rendah dengan nilai berulang.',
            evidence: {
              uniqueCount: 4,
              uniquenessRatio: 0.04,
              nullCount: 0,
              nullRatio: 0,
              isConstant: false,
              sampleValues: ['Food', 'Beverage'],
              isNumeric: false,
              isDateTime: false,
            },
          },
          {
            columnId: 'c3',
            columnName: 'amount',
            inferredType: 'Numeric',
            role: 'CURRENCY',
            roleLabel: 'Mata Uang / Finansial',
            confidence: 'HIGH',
            confidenceLabel: 'Tinggi',
            rationale: 'Metrik numerik finansial.',
            evidence: {
              uniqueCount: 80,
              uniquenessRatio: 0.8,
              nullCount: 0,
              nullRatio: 0,
              isConstant: false,
              sampleValues: [50000, 100000],
              isNumeric: true,
              isDateTime: false,
            },
          },
        ],
        keyFindings: [
          {
            id: 'f-1',
            category: 'STRUCTURE',
            severity: 'INFO',
            title: 'Kandidat Primary Key',
            description: 'Kolom transaction_id unik pada seluruh baris.',
            targetColumns: ['transaction_id'],
            numericalEvidence: {
              metricName: 'Unik',
              value: 100,
              formattedValue: '100% unik',
            },
          },
        ],
        recommendations: [
          {
            id: 'r-1',
            type: 'CHART',
            title: 'Distribusi Frekuensi per Kategori',
            questionAnswered: 'Kategori mana yang paling banyak tercatat?',
            rationale: 'Grafik batang membandingkan frekuensi kategori.',
            targetColumns: ['category'],
            targetRoute: '/visualisasi',
            chartType: 'BAR',
          },
        ],
      };

      const html = renderPage(InsightPage as React.ComponentType<Record<string, unknown>>, {
        _testDataset: testDs,
        _testIntelligence: testIntel,
      });

      // Verifikasi komponen utama ter-render
      assert.ok(html.includes('Insight Dataset'));
      assert.ok(html.includes('100% In-Memory Browser'));
      assert.ok(html.includes('Data Transaksi'));
      assert.ok(html.includes('Confidence Tinggi'));
      assert.ok(html.includes('transaction_id'));
      assert.ok(html.includes('Identifier / Kunci'));
      assert.ok(html.includes('Kandidat Primary Key'));
      assert.ok(html.includes('Distribusi Frekuensi per Kategori'));
      assert.ok(html.includes('href="/visualisasi"'));
    });
  });
});
