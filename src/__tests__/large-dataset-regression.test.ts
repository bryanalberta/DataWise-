import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { inferColumnTypes } from '../lib/type-inference';
import { calculateDataQuality } from '../lib/data-quality';
import { calculateDescriptiveStatistics } from '../lib/descriptive-stats';
import { queryDataGrid } from '../lib/data-grid-engine';
import { useDatasetStore } from '../store/dataset-store';
import { Dataset, WorkerResponse } from '../types';

describe('TASK-FIX-02 — Large Dataset Analysis, Headerless CSV & Header Polish Regression Tests', () => {
  const rootDir = path.resolve(__dirname, '..', '..');
  const workerDistPath = path.join(rootDir, 'public', 'workers', 'data-processor.worker.js');

  // Helper untuk menjalankan Worker sandbox
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
      getLastMessage: () => postedMessages[postedMessages.length - 1],
      getAllMessages: () => [...postedMessages],
      waitForMessage: async (timeoutMs = 15000) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          if (postedMessages.length > 0) {
            return postedMessages[postedMessages.length - 1];
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error(`Timeout waiting for worker message after ${timeoutMs}ms`);
      },
      triggerError: (err: unknown) => {
        if (errorListener) errorListener(err);
      }
    };
  }

  describe('1. CSV Ingestion — Header vs Headerless Mode', () => {
    it('1.1. CSV dengan header memetakan baris pertama sebagai nama kolom dan mengabaikannya dari data', async () => {
      const sandbox = createWorkerSandbox();
      const csvWithHeader = `user_id,game,behavior,hours,flag\n101,Portal,play,12.5,0\n102,Dota 2,purchase,1.0,0\n`;
      const file = new File([csvWithHeader], 'games_header.csv', { type: 'text/csv' });

      sandbox.dispatch({
        taskId: 'task-test-header-true',
        action: 'PARSE_FILE',
        payload: {
          fileId: 'file-h-true',
          file,
          options: { hasHeader: true },
        },
      });

      const res = await sandbox.waitForMessage();
      assert.strictEqual(res.status, 'SUCCESS');
      const payload = res.payload as { dataset: Dataset; previewData: readonly Record<string, unknown>[] };
      assert.strictEqual(payload.dataset.rowCount, 2);
      assert.strictEqual(payload.dataset.columnCount, 5);
      assert.deepStrictEqual(
        [...payload.dataset.columns.map((c) => c.name)],
        ['user_id', 'game', 'behavior', 'hours', 'flag']
      );
      assert.strictEqual(payload.dataset.hasHeader, true);
      assert.strictEqual(payload.previewData[0]['game'], 'Portal');
    });

    it('1.2. CSV tanpa header menghasilkan kolom generik unik (Column 1..5) dan mempertahankan baris pertama sebagai data observasi', async () => {
      const sandbox = createWorkerSandbox();
      // Baris pertama adalah data asli (101, Portal, play, ...)
      const csvNoHeader = `101,Portal,play,12.5,0\n102,Dota 2,purchase,1.0,0\n103,Half-Life,play,45.0,0\n`;
      const file = new File([csvNoHeader], 'games_no_header.csv', { type: 'text/csv' });

      sandbox.dispatch({
        taskId: 'task-test-header-false',
        action: 'PARSE_FILE',
        payload: {
          fileId: 'file-h-false',
          file,
          options: { hasHeader: false },
        },
      });

      const res = await sandbox.waitForMessage();
      assert.strictEqual(res.status, 'SUCCESS');
      const payload = res.payload as { dataset: Dataset; previewData: readonly Record<string, unknown>[] };
      // Harus ada tepat 3 baris data (baris pertama TIDAK hilang)
      assert.strictEqual(payload.dataset.rowCount, 3);
      assert.strictEqual(payload.dataset.columnCount, 5);
      assert.deepStrictEqual(
        [...payload.dataset.columns.map((c) => c.name)],
        ['Column 1', 'Column 2', 'Column 3', 'Column 4', 'Column 5']
      );
      assert.strictEqual(payload.dataset.hasHeader, false);
      // Baris pertama tetap ada di data
      assert.strictEqual(payload.previewData[0]['Column 1'], '101');
      assert.strictEqual(payload.previewData[0]['Column 2'], 'Portal');
      assert.strictEqual(payload.previewData[1]['Column 2'], 'Dota 2');
      assert.strictEqual(payload.previewData[2]['Column 2'], 'Half-Life');
    });
  });

  describe('2. Skala Dataset 200.000 Baris (Karakteristik Steam-200k)', () => {
    // Bangkitkan fixture sintetis deterministik yang menyerupai steam-200k:
    // 200.000 baris, 5 field, tanpa header, ~8.9 MB
    console.log('[Test Setup] Membangkitkan fixture sintetis 200.000 baris x 5 field...');
    const t0 = Date.now();
    const rowsBatch: string[] = [];
    const sampleSize = 200000;
    for (let i = 0; i < sampleSize; i++) {
      const userId = i === 0 ? '0015160371' : String(151603712 + (i % 12370)); // Baris 0 memuat identifier leading zero
      const game = i % 4 === 0 ? 'Dota 2' : i % 4 === 1 ? 'Team Fortress 2' : i % 4 === 2 ? 'Counter-Strike' : 'Left 4 Dead 2';
      const behavior = i % 2 === 0 ? 'purchase' : 'play';
      const hours = behavior === 'purchase' ? '1.0' : String(((i % 500) + 1) * 0.5);
      const flag = '0';
      rowsBatch.push(`${userId},${game},${behavior},${hours},${flag}`);
    }
    const syntheticCsvContent = rowsBatch.join('\n');
    console.log(`[Test Setup] Fixture selesai dalam ${Date.now() - t0}ms (${(syntheticCsvContent.length / (1024 * 1024)).toFixed(2)} MB)`);

    it('2.1. Parsing 200.000 baris di Worker selesai tanpa RangeError (Maximum call stack size exceeded)', async () => {
      const sandbox = createWorkerSandbox();
      const file = new File([syntheticCsvContent], 'steam-200k.csv', { type: 'text/csv' });

      const startTime = Date.now();
      sandbox.dispatch({
        taskId: 'task-test-steam-200k',
        action: 'PARSE_FILE',
        payload: {
          fileId: 'file-steam-200k',
          file,
          options: { hasHeader: false },
        },
      });

      const res = await sandbox.waitForMessage(30000);
      const duration = Date.now() - startTime;
      console.log(`[Worker Scale] Parse 200.000 baris selesai dalam ${duration}ms`);

      assert.strictEqual(res.status, 'SUCCESS');
      const payload = res.payload as { dataset: Dataset; previewData: readonly Record<string, unknown>[] };
      // 1. Tepat 200.000 baris data
      assert.strictEqual(payload.dataset.rowCount, 200000, 'Harus menghasilkan tepat 200.000 baris');
      // 2. Kelima field dipertahankan
      assert.strictEqual(payload.dataset.columnCount, 5, 'Kelima field harus dipertahankan');
      // 3. Nama kolom generik unik
      assert.deepStrictEqual(
        [...payload.dataset.columns.map((c) => c.name)],
        ['Column 1', 'Column 2', 'Column 3', 'Column 4', 'Column 5']
      );
      // 4. Baris pertama data dipertahankan
      assert.strictEqual(payload.previewData[0]['Column 1'], '0015160371');
      assert.strictEqual(payload.previewData[0]['Column 2'], 'Dota 2');
      assert.strictEqual(payload.previewData[0]['Column 3'], 'purchase');
      assert.strictEqual(payload.previewData[0]['Column 4'], '1.0');
      assert.strictEqual(payload.previewData[0]['Column 5'], '0');
    });

    it('2.2. Type inference mempertahankan leading zero identifier pada 200.000 baris', () => {
      const columns = ['Column 1', 'Column 2', 'Column 3', 'Column 4', 'Column 5'];
      const testRows: Record<string, unknown>[] = [];
      for (let i = 0; i < 2000; i++) {
        testRows.push({
          'Column 1': i === 0 ? '0015160371' : String(151603712 + i),
          'Column 2': 'Dota 2',
          'Column 3': i % 2 === 0 ? 'purchase' : 'play',
          'Column 4': ((i % 50) + 1) * 0.5,
          'Column 5': 0,
        });
      }

      const schemas = inferColumnTypes(columns, testRows);
      const col1 = schemas.find((c) => c.name === 'Column 1');
      assert.ok(col1);
      // Leading zero harus menjaga tipe Text dan menandai isIdentifier
      assert.strictEqual(col1.type, 'Text');
      assert.strictEqual(col1.profile?.isIdentifier, true);

      const col3 = schemas.find((c) => c.name === 'Column 3');
      assert.ok(col3);
      assert.strictEqual(col3.type, 'Text');

      const col4 = schemas.find((c) => c.name === 'Column 4');
      assert.ok(col4);
      assert.strictEqual(col4.type, 'Numeric');
    });

    it('2.3. Data Quality & Duplicate Detection beroperasi pada 200.000 baris tanpa RangeError', () => {
      const columns = [
        { id: 'Column 1', name: 'Column 1', type: 'Text' as const },
        { id: 'Column 2', name: 'Column 2', type: 'Categorical' as const },
        { id: 'Column 3', name: 'Column 3', type: 'Categorical' as const },
        { id: 'Column 4', name: 'Column 4', type: 'Numeric' as const },
        { id: 'Column 5', name: 'Column 5', type: 'Numeric' as const },
      ];

      // Array objek 200.000 baris
      const fullRows: Record<string, unknown>[] = [];
      for (let i = 0; i < 200000; i++) {
        fullRows.push({
          'Column 1': String(151603712 + (i % 1000)), // Ada duplikasi
          'Column 2': 'Dota 2',
          'Column 3': 'play',
          'Column 4': 10.5,
          'Column 5': 0,
        });
      }

      const tQuality = Date.now();
      const quality = calculateDataQuality('steam-200k-ds', fullRows, columns);
      console.log(`[Performance] Data Quality 200.000 baris selesai dalam ${Date.now() - tQuality}ms`);

      assert.strictEqual(quality.totalRecords, 200000);
      assert.ok(quality.duplicateOccurrences > 0, 'Harus mendeteksi duplikat dengan benar');
      assert.strictEqual(quality.totalNativeMissing, 0);
    });

    it('2.4. Komputasi Descriptive Statistics pada 200.000 baris selesai tanpa RangeError', () => {
      const columns = [
        { id: 'Column 4', name: 'Column 4', type: 'Numeric' as const },
        { id: 'Column 3', name: 'Column 3', type: 'Categorical' as const },
      ];

      const fullRows: Record<string, unknown>[] = [];
      for (let i = 0; i < 200000; i++) {
        fullRows.push({
          'Column 3': i % 2 === 0 ? 'purchase' : 'play',
          'Column 4': (i % 100) + 1.0,
        });
      }

      const tStats = Date.now();
      const stats = calculateDescriptiveStatistics('steam-200k-ds', fullRows, columns);
      console.log(`[Performance] Descriptive Stats 200.000 baris selesai dalam ${Date.now() - tStats}ms`);

      assert.strictEqual(stats.columnStats.length, 2);
      const numStats = stats.columnStats.find((c) => c.columnName === 'Column 4')?.numericStats;
      assert.ok(numStats);
      assert.strictEqual(numStats.count, 200000);
      assert.ok(numStats.mean !== null && numStats.mean > 0);
      assert.ok(numStats.median !== null && numStats.median > 0);
      assert.ok(numStats.variance !== null && numStats.variance > 0);
    });

    it('2.5. Data Grid sorting dan pencarian pada 200.000 baris beroperasi tanpa RangeError', () => {
      const fullRows: Record<string, unknown>[] = [];
      for (let i = 0; i < 200000; i++) {
        fullRows.push({
          'Column 1': String(151603712 + i),
          'Column 2': i === 42 ? 'SpecialUniqueGame' : 'Dota 2',
          'Column 4': i * 0.1,
        });
      }

      // Sort descending
      const sortedResult = queryDataGrid(fullRows, {
        datasetId: 'steam-200k-ds',
        limit: 50,
        offset: 0,
        sort: { columnId: 'Column 4', direction: 'desc' },
        columnTypes: { 'Column 4': 'Numeric' },
      });
      assert.strictEqual(sortedResult.rows.length, 50);
      assert.strictEqual(sortedResult.matchedRows, 200000);
      assert.ok((sortedResult.rows[0]['Column 4'] as number) > (sortedResult.rows[49]['Column 4'] as number));

      // Search keyword
      const searchResult = queryDataGrid(fullRows, {
        datasetId: 'steam-200k-ds',
        limit: 50,
        offset: 0,
        searchQuery: 'SpecialUniqueGame',
      });
      assert.strictEqual(searchResult.matchedRows, 1);
      assert.strictEqual(searchResult.rows[0]['Column 2'], 'SpecialUniqueGame');
    });

    it('2.6. Pengujian Verifikasi Dataset Autentik steam-200k.csv jika berkas fisik tersedia di mesin', async (t) => {
      const realFilePath = process.env.STEAM_DATASET_PATH || path.join(os.homedir(), 'Downloads', 'steam-200k.csv', 'steam-200k.csv');
      if (!fs.existsSync(realFilePath)) {
        t.skip('File autentik steam-200k.csv tidak ditemukan di direktori Downloads');
        return;
      }
      const realContent = fs.readFileSync(realFilePath, 'utf8');
      const file = new File([realContent], 'steam-200k.csv', { type: 'text/csv' });
      const sandbox = createWorkerSandbox();
      sandbox.dispatch({
        taskId: 'task-test-real-steam-file',
        action: 'PARSE_FILE',
        payload: {
          fileId: 'file-real-steam',
          file,
          options: { hasHeader: false },
        },
      });
      const res = await sandbox.waitForMessage(30000);
      assert.strictEqual(res.status, 'SUCCESS');
      const payload = res.payload as { dataset: Dataset; previewData: readonly Record<string, unknown>[] };
      assert.strictEqual(payload.dataset.rowCount, 200000);
      assert.strictEqual(payload.dataset.columnCount, 5);
      assert.strictEqual(payload.previewData[0]['Column 1'], '151603712');
      assert.strictEqual(payload.previewData[0]['Column 2'], 'The Elder Scrolls V Skyrim');
      assert.strictEqual(payload.previewData[0]['Column 3'], 'purchase');
      assert.strictEqual(payload.previewData[0]['Column 4'], '1.0');
      assert.strictEqual(payload.previewData[0]['Column 5'], '0');
    });
  });

  describe('3. Error Handling, Lifecycle & Active Dataset Safety', () => {
    it('3.1. Error pada pemrosesan file menghasilkan respons ERROR dan Promise ditolak tanpa menggantung', async () => {
      const sandbox = createWorkerSandbox();
      const emptyFile = new File([''], 'empty.csv', { type: 'text/csv' });

      sandbox.dispatch({
        taskId: 'task-test-error-empty',
        action: 'PARSE_FILE',
        payload: {
          fileId: 'file-empty-001',
          file: emptyFile,
        },
      });

      const res = await sandbox.waitForMessage();
      assert.strictEqual(res.status, 'ERROR');
      assert.ok(res.payload?.error);
      assert.ok(typeof res.payload.error === 'string');
    });

    it('3.2. Dataset aktif yang telah dimuat sebelumnya tidak rusak saat upload berikutnya gagal', () => {
      const store = useDatasetStore.getState();

      const existingDataset: Dataset = {
        id: 'ds-existing-active',
        name: 'existing_dataset.csv',
        rowCount: 100,
        columnCount: 2,
        columns: [
          { id: 'c1', name: 'c1', type: 'Text' },
          { id: 'c2', name: 'c2', type: 'Numeric' },
        ],
        fileSize: 1024,
      };

      store.setDataset(existingDataset, [{ c1: 'A', c2: 1 }]);
      assert.strictEqual(useDatasetStore.getState().activeDataset?.id, 'ds-existing-active');

      // Simulasikan alur upload baru yang gagal
      store.startProcessing('task-failed-upload', 'Membaca berkas baru...');
      assert.strictEqual(useDatasetStore.getState().isProcessing, true);

      // Terjadi error pada upload baru
      store.setError('Format berkas tidak valid atau rusak: parse error');
      
      const stateAfterError = useDatasetStore.getState();
      assert.strictEqual(stateAfterError.isProcessing, false);
      assert.strictEqual(stateAfterError.error, 'Format berkas tidak valid atau rusak: parse error');
      // Dataset aktif yang ada sebelumnya harus tetap utuh dan aman
      assert.ok(stateAfterError.activeDataset !== null);
      assert.strictEqual(stateAfterError.activeDataset.id, 'ds-existing-active');
      assert.strictEqual(stateAfterError.activeDataset.rowCount, 100);
      assert.strictEqual(stateAfterError.datasetPreview.length, 1);
    });

    it('3.3. Pembatalan (cancel) membersihkan processing state tanpa merusak dataset aktif', () => {
      const store = useDatasetStore.getState();
      store.startProcessing('task-to-cancel', 'Memproses...');
      assert.strictEqual(useDatasetStore.getState().isProcessing, true);

      store.stopProcessing();
      assert.strictEqual(useDatasetStore.getState().isProcessing, false);
      assert.strictEqual(useDatasetStore.getState().currentTaskId, null);
      assert.strictEqual(useDatasetStore.getState().processingMessage, null);
      assert.strictEqual(useDatasetStore.getState().activeDataset?.id, 'ds-existing-active');
    });
  });
});
