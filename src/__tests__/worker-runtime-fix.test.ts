import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { NAV_ITEMS } from '../components/AppSidebar';
import { useDatasetStore } from '../store/dataset-store';
import { Dataset } from '../types';
import * as XLSX from 'xlsx';

describe('TASK-FIX-01 — Worker Runtime, Upload Lifecycle & UI Fixes Regression', () => {
  const rootDir = path.resolve(__dirname, '..', '..');
  const workerDistPath = path.join(rootDir, 'public', 'workers', 'data-processor.worker.js');
  const irisCsvPath = path.join(__dirname, 'fixtures', 'iris.csv');

  describe('1. Worker Bundling & Standalone Runtime Verification', () => {
    it('1.1. File public/workers/data-processor.worker.js harus ada dan merupakan file JavaScript valid', () => {
      assert.ok(fs.existsSync(workerDistPath), 'data-processor.worker.js must exist in public/workers');
      const content = fs.readFileSync(workerDistPath, 'utf8');
      assert.ok(content.length > 50000, 'Worker bundle should be non-trivial (>50KB)');
      // Memastikan bukan raw TypeScript
      assert.ok(!content.startsWith('/// <reference lib="webworker" />'), 'Worker bundle should not contain raw TS reference directives');
      assert.ok(!content.includes('import { WorkerRequest'), 'Worker bundle should not contain unbundled ES module imports');
    });

    it('1.2. Bundled Worker dapat dieksekusi dalam WorkerGlobalScope sandbox tanpa SyntaxError', () => {
      const content = fs.readFileSync(workerDistPath, 'utf8');
      let registeredHandler: ((event: { data: unknown }) => void) | null = null;
      const postedMessages: unknown[] = [];

      const sandbox = {
        self: {
          addEventListener: (type: string, fn: (event: { data: unknown }) => void) => {
            if (type === 'message') registeredHandler = fn;
          },
          postMessage: (msg: unknown) => {
            postedMessages.push(msg);
          },
        },
        console: { log: () => {}, error: () => {}, warn: () => {} },
        TextEncoder,
        TextDecoder,
      };

      vm.createContext(sandbox);
      assert.doesNotThrow(() => {
        vm.runInContext(content, sandbox);
      }, 'Executing worker code in sandbox should not throw syntax error');

      assert.ok(registeredHandler !== null, 'Worker should register a "message" event listener');
    });

    it('1.3. Bundled Worker memproses CSV (iris.csv) dan mem-postMessage hasil sukses dengan 150 baris', async () => {
      const content = fs.readFileSync(workerDistPath, 'utf8');
      const irisRaw = fs.readFileSync(irisCsvPath, 'utf8');

      let registeredHandler: ((event: { data: unknown }) => void) | null = null;
      let postedMessage: { taskId: string; status: string; action: string; payload: { dataset: Dataset; previewData: readonly Record<string, unknown>[] } } | null = null;

      const sandbox = {
        self: {
          addEventListener: (type: string, fn: (event: { data: unknown }) => void) => {
            if (type === 'message') registeredHandler = fn;
          },
          postMessage: (msg: unknown) => {
            postedMessage = msg as typeof postedMessage;
          },
        },
        console: { log: () => {}, error: () => {}, warn: () => {} },
        TextEncoder,
        TextDecoder,
      };

      vm.createContext(sandbox);
      vm.runInContext(content, sandbox);

      assert.ok(registeredHandler);

      const taskId = 'task-test-upload-iris-001';
      const request = {
        taskId,
        action: 'PARSE_FILE',
        payload: {
          fileId: 'file-iris-001',
          file: new File([irisRaw], 'iris.csv', { type: 'text/csv' }),
        },
      };

      (registeredHandler as (event: { data: unknown }) => void)({ data: request });

      // Tunggu PapaParse async complete
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (postedMessage) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      assert.ok(postedMessage, 'Worker must post a response message');
      const res = postedMessage as { taskId: string; status: string; action: string; payload: { dataset: Dataset; previewData: readonly Record<string, unknown>[] } };
      assert.strictEqual(res.taskId, taskId);
      assert.strictEqual(res.status, 'SUCCESS');
      assert.strictEqual(res.action, 'PARSE_FILE');

      const dataset = res.payload.dataset;
      assert.strictEqual(dataset.name, 'iris.csv');
      assert.strictEqual(dataset.rowCount, 150, 'Iris CSV should have exactly 150 rows');
      assert.strictEqual(dataset.columnCount, 5, 'Iris CSV should have 5 columns');
      assert.strictEqual(res.payload.previewData.length, 100, 'Preview data capped at 100 rows');
    });

    it('1.4. Bundled Worker menolak file 0-byte dengan pesan error Indonesia yang informatif', async () => {
      const content = fs.readFileSync(workerDistPath, 'utf8');
      let registeredHandler: ((event: { data: unknown }) => void) | null = null;
      let postedMessage: { taskId: string; status: string; action: string; payload: { error: string } } | null = null;

      const sandbox = {
        self: {
          addEventListener: (type: string, fn: (event: { data: unknown }) => void) => {
            if (type === 'message') registeredHandler = fn;
          },
          postMessage: (msg: unknown) => {
            postedMessage = msg as typeof postedMessage;
          },
        },
        console: { log: () => {}, error: () => {}, warn: () => {} },
        TextEncoder,
        TextDecoder,
      };

      vm.createContext(sandbox);
      vm.runInContext(content, sandbox);

      assert.ok(registeredHandler);

      const taskId = 'task-test-empty-file-002';
      const emptyFile = new File([], 'empty.csv', { type: 'text/csv' });

      (registeredHandler as (event: { data: unknown }) => void)({
        data: {
          taskId,
          action: 'PARSE_FILE',
          payload: {
            fileId: 'file-empty-002',
            file: emptyFile,
          },
        },
      });

      assert.ok(postedMessage, 'Worker should reply with error for 0-byte file');
      const errRes = postedMessage as { taskId: string; status: string; action: string; payload: { error: string } };
      assert.strictEqual(errRes.taskId, taskId);
      assert.strictEqual(errRes.status, 'ERROR');
      assert.ok(errRes.payload.error.includes('File kosong (0 byte)'));
    });

    it('1.5. Bundled Worker memproses file XLSX dan INSPECT_FILE dengan benar', async () => {
      const content = fs.readFileSync(workerDistPath, 'utf8');

      // Buat dummy XLSX workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet([
        { id: 1, product: 'Laptop', price: 1500 },
        { id: 2, product: 'Mouse', price: 25 },
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'SalesData');
      const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const xlsxFile = new File([xlsxBuffer], 'sales.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      let registeredHandler: ((event: { data: unknown }) => void) | null = null;
      let postedMessage: { taskId: string; status: string; action: string; payload: unknown } | null = null;

      const sandbox = {
        self: {
          addEventListener: (type: string, fn: (event: { data: unknown }) => void) => {
            if (type === 'message') registeredHandler = fn;
          },
          postMessage: (msg: unknown) => {
            postedMessage = msg as typeof postedMessage;
          },
        },
        console: { log: () => {}, error: () => {}, warn: () => {} },
        TextEncoder,
        TextDecoder,
        Uint8Array,
      };

      vm.createContext(sandbox);
      vm.runInContext(content, sandbox);

      assert.ok(registeredHandler);

      // 1.5.1 INSPECT_FILE
      const inspectTaskId = 'task-inspect-001';
      (registeredHandler as (event: { data: unknown }) => void)({
        data: {
          taskId: inspectTaskId,
          action: 'INSPECT_FILE',
          payload: { file: xlsxFile },
        },
      });

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (postedMessage) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      assert.ok(postedMessage);
      const inspectRes = postedMessage as { taskId: string; status: string; action: string; payload: { sheetNames: string[] } };
      assert.strictEqual(inspectRes.status, 'SUCCESS');
      assert.deepStrictEqual([...inspectRes.payload.sheetNames], ['SalesData']);

      // 1.5.2 PARSE_FILE
      postedMessage = null;
      const parseTaskId = 'task-parse-xlsx-001';
      (registeredHandler as (event: { data: unknown }) => void)({
        data: {
          taskId: parseTaskId,
          action: 'PARSE_FILE',
          payload: {
            fileId: 'file-xlsx-001',
            file: xlsxFile,
          },
        },
      });

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (postedMessage) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      assert.ok(postedMessage);
      const parseRes = postedMessage as { taskId: string; status: string; action: string; payload: { dataset: Dataset; previewData: readonly Record<string, unknown>[] } };
      assert.strictEqual(parseRes.status, 'SUCCESS');
      assert.strictEqual(parseRes.payload.dataset.name, 'sales.xlsx');
      assert.strictEqual(parseRes.payload.dataset.rowCount, 2);
      assert.strictEqual(parseRes.payload.dataset.columnCount, 3);
    });
  });

  describe('2. Sidebar Badge UI Verification', () => {
    it('2.1. NAV_ITEMS tidak boleh memuat tiket internal FNC-04, FNC-05, atau FNC-06', () => {
      for (const item of NAV_ITEMS) {
        assert.notStrictEqual(item.badge, 'FNC-04', `Item ${item.label} should not have FNC-04 badge`);
        assert.notStrictEqual(item.badge, 'FNC-05', `Item ${item.label} should not have FNC-05 badge`);
        assert.notStrictEqual(item.badge, 'FNC-06', `Item ${item.label} should not have FNC-06 badge`);
      }
    });

    it('2.2. Seluruh 8 menu utama (termasuk Insight Dataset) tetap tersedia dengan label bahasa Indonesia yang benar', () => {
      const expectedMenus = [
        { id: 'beranda', label: 'Beranda', href: '/' },
        { id: 'dataset', label: 'Dataset', href: '/dataset' },
        { id: 'insight', label: 'Insight Dataset', href: '/insight' },
        { id: 'profiling', label: 'Profiling', href: '/profiling' },
        { id: 'analisis', label: 'Analisis', href: '/analisis' },
        { id: 'pembersihan', label: 'Pembersihan', href: '/pembersihan' },
        { id: 'visualisasi', label: 'Visualisasi', href: '/visualisasi' },
        { id: 'ekspor', label: 'Ekspor', href: '/ekspor' },
      ];

      assert.strictEqual(NAV_ITEMS.length, 8);
      expectedMenus.forEach((expected, i) => {
        assert.strictEqual(NAV_ITEMS[i].id, expected.id);
        assert.strictEqual(NAV_ITEMS[i].label, expected.label);
        assert.strictEqual(NAV_ITEMS[i].href, expected.href);
        assert.strictEqual(NAV_ITEMS[i].available, true);
      });
    });
  });

  describe('3. Store State Integrity On Failed Upload', () => {
    it('3.1. File upload yang gagal tidak merusak dataset aktif yang sebelumnya valid', () => {
      const store = useDatasetStore.getState();

      const initialDataset: Dataset = {
        id: 'initial-active-dataset',
        name: 'customer_data.csv',
        rowCount: 500,
        columnCount: 4,
        columns: [
          { id: 'c1', name: 'id', type: 'Numeric' },
          { id: 'c2', name: 'name', type: 'Text' },
          { id: 'c3', name: 'age', type: 'Numeric' },
          { id: 'c4', name: 'score', type: 'Numeric' },
        ],
        fileSize: 25000,
      };

      store.setDataset(initialDataset, [{ id: 1, name: 'Alice', age: 25, score: 90.5 }]);
      assert.strictEqual(useDatasetStore.getState().activeDataset?.id, 'initial-active-dataset');

      // Simulasi upload file kedua yang gagal parsing
      store.startProcessing('task-failed-003', 'Membaca dan memparsing dataset...');
      assert.strictEqual(useDatasetStore.getState().isProcessing, true);

      // Terjadi error parsing
      store.setError('Gagal memparsing dataset: Format berkas tidak valid.');

      // State harus bersih dari loading, tetapi dataset aktif lama tetap utuh
      const stateAfterError = useDatasetStore.getState();
      assert.strictEqual(stateAfterError.isProcessing, false);
      assert.strictEqual(stateAfterError.currentTaskId, null);
      assert.strictEqual(stateAfterError.processingMessage, null);
      assert.strictEqual(stateAfterError.error, 'Gagal memparsing dataset: Format berkas tidak valid.');
      assert.strictEqual(stateAfterError.activeDataset?.id, 'initial-active-dataset', 'Active dataset must not be destroyed by failed upload');
      assert.strictEqual(stateAfterError.activeDataset?.name, 'customer_data.csv');
    });
  });
});
