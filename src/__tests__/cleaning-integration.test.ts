import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useDatasetStore } from '../store/dataset-store';
import { executeRecipe, previewRecipeStep, createRecipeStepId } from '../lib/recipe-engine';
import { Dataset, ColumnSchema, RecipeStep } from '../types';

describe('Data Cleaning Studio End-to-End Workflow & Store Sync (FNC-04)', () => {
  const initialColumns: ColumnSchema[] = [
    { id: 'c1', name: 'nama', type: 'Text' },
    { id: 'c2', name: 'skor', type: 'Numeric' },
    { id: 'c3', name: 'kota', type: 'Categorical' },
  ];

  const rawRows: Record<string, unknown>[] = [
    { nama: '  Andi  ', skor: 80, kota: 'Jakarta' },
    { nama: 'Budi', skor: null, kota: 'Surabaya' },
    { nama: '  Andi  ', skor: 80, kota: 'Jakarta' }, // Duplikat persis dengan baris 1
    { nama: 'Citra', skor: 90, kota: null },
  ];

  const initialDataset: Dataset = {
    id: 'test-dataset-01',
    name: 'test-sample.csv',
    rowCount: 4,
    columnCount: 3,
    columns: initialColumns,
    fileSize: 2048,
  };

  beforeEach(() => {
    const store = useDatasetStore.getState();
    store.clearDataset();
    store.setDataset(initialDataset, rawRows.slice(0, 100));
  });

  it('1. Dataset awal terpasang dengan benar di Zustand store', () => {
    const store = useDatasetStore.getState();
    assert.equal(store.activeDataset?.id, 'test-dataset-01');
    assert.equal(store.activeDataset?.rowCount, 4);
    assert.equal(store.activeRecipe.length, 0);
  });

  it('2. Alur Preview -> Apply Drop Duplicates memperbarui activeDataset & reset stats', () => {
    const store = useDatasetStore.getState();
    const step: RecipeStep = {
      id: createRecipeStepId(),
      timestamp: Date.now(),
      type: 'DROP_DUPLICATES',
      description: 'Hapus baris duplikat persis',
    };

    // Live preview
    const preview = previewRecipeStep(rawRows, initialColumns, step);
    assert.equal(preview.canApply, true);
    assert.equal(preview.impactedRows, 1);

    // Apply via recipe engine
    const cleanResult = executeRecipe(rawRows, initialColumns, [step]);
    assert.equal(cleanResult.data.length, 3);

    // Update store
    const updatedMeta: Dataset = {
      ...initialDataset,
      rowCount: cleanResult.data.length,
      columns: cleanResult.columns,
    };
    store.updateActiveDatasetAfterCleaning(updatedMeta, cleanResult.data, [step]);

    const updated = useDatasetStore.getState();
    assert.equal(updated.activeDataset?.rowCount, 3);
    assert.equal(updated.datasetPreview.length, 3);
    assert.equal(updated.activeRecipe.length, 1);
    assert.equal(updated.activeRecipe[0].type, 'DROP_DUPLICATES');
    // Stats harus di-null-kan agar re-evaluasi di /profiling dan /analisis
    assert.equal(updated.dataQualityStats, null);
    assert.equal(updated.descriptiveStats, null);
  });

  it('3. Alur multi-langkah: Duplikat -> Trim Whitespace -> Imputasi Mean', () => {
    const store = useDatasetStore.getState();

    const step1: RecipeStep = {
      id: 'step-1',
      timestamp: Date.now(),
      type: 'DROP_DUPLICATES',
      description: 'Drop duplicates',
    };

    const step2: RecipeStep = {
      id: 'step-2',
      timestamp: Date.now(),
      type: 'TRIM_WHITESPACE',
      description: 'Trim whitespace',
    };

    const step3: RecipeStep = {
      id: 'step-3',
      timestamp: Date.now(),
      type: 'IMPUTE_MISSING',
      targetColumn: 'skor',
      method: 'Mean',
      description: 'Impute missing skor with Mean',
    };

    const pipeline = [step1, step2, step3];
    const cleanResult = executeRecipe(rawRows, initialColumns, pipeline);

    const updatedMeta: Dataset = {
      ...initialDataset,
      rowCount: cleanResult.data.length,
      columns: cleanResult.columns,
    };
    store.updateActiveDatasetAfterCleaning(updatedMeta, cleanResult.data, pipeline);

    const updated = useDatasetStore.getState();
    assert.equal(updated.activeDataset?.rowCount, 3);
    assert.equal(updated.activeRecipe.length, 3);

    // Verifikasi data bersih
    assert.equal(updated.datasetPreview[0].nama, 'Andi'); // whitespace hilang
    assert.equal(updated.datasetPreview[1].nama, 'Budi');
    assert.equal(updated.datasetPreview[1].skor, 85); // Mean(80, 90) = 85
  });

  it('4. Hapus langkah ke-2 (Trim) menghitung ulang seluruh pipeline dari data mentah asli', () => {
    const store = useDatasetStore.getState();

    const step1: RecipeStep = {
      id: 'step-1',
      timestamp: Date.now(),
      type: 'DROP_DUPLICATES',
      description: 'Drop duplicates',
    };

    const step2: RecipeStep = {
      id: 'step-2',
      timestamp: Date.now(),
      type: 'TRIM_WHITESPACE',
      description: 'Trim whitespace',
    };

    const step3: RecipeStep = {
      id: 'step-3',
      timestamp: Date.now(),
      type: 'IMPUTE_MISSING',
      targetColumn: 'skor',
      method: 'Mean',
      description: 'Impute missing skor with Mean',
    };

    // Terapkan dulu 3 langkah
    const initialPipeline = [step1, step2, step3];
    const initialClean = executeRecipe(rawRows, initialColumns, initialPipeline);
    assert.equal(initialClean.data[0].nama, 'Andi'); // trim aktif

    // Langkah 2 dihapus -> tersisa [step1, step3]
    const remainingSteps = [step1, step3];
    const cleanResult = executeRecipe(rawRows, initialColumns, remainingSteps);

    const updatedMeta: Dataset = {
      ...initialDataset,
      rowCount: cleanResult.data.length,
      columns: cleanResult.columns,
    };
    store.updateActiveDatasetAfterCleaning(updatedMeta, cleanResult.data, remainingSteps);

    const updated = useDatasetStore.getState();
    assert.equal(updated.activeRecipe.length, 2);
    // nama baris pertama kembali memiliki whitespace karena langkah trim dihapus!
    assert.equal(updated.datasetPreview[0].nama, '  Andi  ');
    // skor tetap terimputasi 85
    assert.equal(updated.datasetPreview[1].skor, 85);
  });

  it('5. Reset ke Data Asli mengembalikan dataset awal secara presisi dan mengosongkan recipe log', () => {
    const store = useDatasetStore.getState();

    // Reset dengan pipeline kosong []
    const resetResult = executeRecipe(rawRows, initialColumns, []);
    const updatedMeta: Dataset = {
      ...initialDataset,
      rowCount: resetResult.data.length,
      columns: resetResult.columns,
    };
    store.updateActiveDatasetAfterCleaning(updatedMeta, resetResult.data, []);

    const updated = useDatasetStore.getState();
    assert.equal(updated.activeDataset?.rowCount, 4);
    assert.equal(updated.activeRecipe.length, 0);
    assert.deepEqual(updated.datasetPreview, rawRows);
  });
});
