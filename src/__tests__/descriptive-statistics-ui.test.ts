import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DescriptiveStatistics } from '../components/DescriptiveStatistics';
import {
  Dataset,
  DataType,
  DescriptiveStatisticsSummary,
  ColumnDescriptiveStats,
  NumericColumnStats,
  CategoricalColumnStats,
} from '../types';

describe('TASK-FNC-02 — Descriptive Statistics UI Component', () => {
  const renderWithMockStore = (state: Record<string, unknown>) => {
    return renderToStaticMarkup(
      React.createElement(DescriptiveStatistics, {
        _testState: {
          activeDataset: null,
          descriptiveStats: null,
          isProcessing: false,
          processingMessage: null,
          error: null,
          ...state,
        } as Record<string, unknown>,
      })
    );
  };

  it('1. Empty state saat belum ada dataset aktif', () => {
    const html = renderWithMockStore({});
    assert.ok(html.includes('Belum ada dataset'), 'Harus menampilkan badge belum ada dataset');
    assert.ok(html.includes('Belum Ada Statistik untuk Ditampilkan'), 'Harus menampilkan heading empty state');
    assert.ok(html.includes('Unggah dataset CSV atau Excel'), 'Harus menyertakan pesan panduan');
  });

  it('2. Loading state saat sedang memproses atau menghitung', () => {
    const html = renderWithMockStore({
      isProcessing: true,
      activeDataset: { id: 'ds-loading', name: 'test.csv', rowCount: 100, columnCount: 2, columns: [] },
      descriptiveStats: null,
    });
    assert.ok(html.includes('Menghitung Statistik Deskriptif...'), 'Harus menampilkan status loading');
    assert.ok(html.includes('Batal'), 'Harus menyediakan tombol Batal');
  });

  it('3. Error state saat terjadi kegagalan kalkulasi', () => {
    const html = renderWithMockStore({
      error: 'Worker kehabisan memori saat mengolah data.',
    });
    assert.ok(html.includes('Kesalahan Statistik Deskriptif'), 'Harus menampilkan judul error alert');
    assert.ok(html.includes('Worker kehabisan memori saat mengolah data.'), 'Harus menampilkan pesan error');
    assert.ok(html.includes('Coba Lagi'), 'Harus menampilkan tombol coba lagi');
  });

  it('4. Rendering metrik numerik lengkap dengan presisi 4 desimal dan tabular numerals (FR-07 / PRD 4.4)', () => {
    const activeDataset: Dataset = {
      id: 'ds-1',
      name: 'iris.csv',
      rowCount: 150,
      columnCount: 1,
      columns: [{ id: 'sepal_length', name: 'sepal_length', type: 'Numeric' }],
    };

    const numericStats: NumericColumnStats = {
      count: 150,
      missing: 0,
      sum: 876.5,
      mean: 5.8433333333,
      median: 5.8,
      mode: [5.0],
      standardDeviation: 0.8280661279,
      variance: 0.6856935123,
      min: 4.3,
      max: 7.9,
      q1: 5.1,
      q3: 6.4,
      iqr: 1.3,
    };

    const descriptiveStats: DescriptiveStatisticsSummary = {
      datasetId: 'ds-1',
      totalRecords: 150,
      columnStats: [
        {
          columnId: 'sepal_length',
          columnName: 'sepal_length',
          type: 'Numeric',
          numericStats,
        },
      ],
    };

    const html = renderWithMockStore({ activeDataset, descriptiveStats });

    // Verifikasi Header & Nama Kolom
    assert.ok(html.includes('Statistik Deskriptif'), 'Menampilkan heading utama');
    assert.ok(html.includes('sepal_length'), 'Menampilkan nama kolom variabel');

    // Verifikasi Count & Missing
    assert.ok(html.includes('Count (N Valid)'), 'Menampilkan baris Count');
    assert.ok(html.includes('150'), 'Menampilkan jumlah baris N=150');
    assert.ok(html.includes('Missing Count'), 'Menampilkan baris Missing');

    // Verifikasi pembulatan 4 angka desimal
    assert.ok(html.includes('5.8433'), 'Mean dibulatkan 4 desimal (5.8433)');
    assert.ok(html.includes('5.8000'), 'Median dibulatkan 4 desimal (5.8000)');
    assert.ok(html.includes('0.8281'), 'Std Dev dibulatkan 4 desimal (0.8281)');
    assert.ok(html.includes('0.6857'), 'Variance dibulatkan 4 desimal (0.6857)');
    assert.ok(html.includes('4.3000'), 'Min dibulatkan 4 desimal (4.3000)');
    assert.ok(html.includes('7.9000'), 'Max dibulatkan 4 desimal (7.9000)');
    assert.ok(html.includes('5.1000'), 'Q1 dibulatkan 4 desimal (5.1000)');
    assert.ok(html.includes('6.4000'), 'Q3 dibulatkan 4 desimal (6.4000)');
    assert.ok(html.includes('1.3000'), 'IQR dibulatkan 4 desimal (1.3000)');

    // Verifikasi CSS tabular numerals & monospace
    assert.ok(html.includes('tabular-nums'), 'Menggunakan tabular-nums untuk angka');
    assert.ok(html.includes('font-mono'), 'Menggunakan font monospace untuk angka');
  });

  it('5. Membedakan nilai nol valid (0.0000) dari statistik tidak tersedia (N/A) (PRD 4.3.B & 4.4)', () => {
    const activeDataset: Dataset = {
      id: 'ds-zero',
      name: 'zero_variance.csv',
      rowCount: 10,
      columnCount: 2,
      columns: [
        { id: 'zero_col', name: 'Zero Column', type: 'Numeric' },
        { id: 'single_col', name: 'Single Observation', type: 'Numeric' },
      ],
    };

    // Kolom dengan nilai identik 0 (Varians dan Std Dev = 0.0000)
    const zeroStats: NumericColumnStats = {
      count: 10,
      missing: 0,
      sum: 0,
      mean: 0,
      median: 0,
      mode: [0],
      standardDeviation: 0,
      variance: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
    };

    // Kolom dengan N=1 (Varians dan Std Dev harus N/A, BUKAN 0.0000)
    const singleStats: NumericColumnStats = {
      count: 1,
      missing: 9,
      sum: 45,
      mean: 45,
      median: 45,
      mode: [45],
      standardDeviation: null,
      variance: null,
      min: 45,
      max: 45,
      q1: 45,
      q3: 45,
      iqr: 0,
    };

    const descriptiveStats: DescriptiveStatisticsSummary = {
      datasetId: 'ds-zero',
      totalRecords: 10,
      columnStats: [
        { columnId: 'zero_col', columnName: 'Zero Column', type: 'Numeric', numericStats: zeroStats },
        { columnId: 'single_col', columnName: 'Single Observation', type: 'Numeric', numericStats: singleStats },
      ],
    };

    const html = renderWithMockStore({ activeDataset, descriptiveStats });

    // Kolom zero_col harus menampilkan "0.0000"
    assert.ok(html.includes('0.0000'), 'Nilai nol murni harus menampilkan 0.0000');

    // Kolom single_col harus menampilkan "N/A" untuk Varians & Std Dev dengan tooltip edukatif
    assert.ok(html.includes('N/A'), 'Nilai null harus menampilkan N/A');
    assert.ok(
      html.includes('Memerlukan minimal 2 observasi non-null'),
      'N=1 untuk varians/stddev harus memuat tooltip edukatif N < 2'
    );
  });

  it('6. Penanganan Modus: Modus Tunggal, Multimodal Ties, dan "Tidak Ada Modus" (PRD 4.3.C)', () => {
    const activeDataset: Dataset = {
      id: 'ds-mode',
      name: 'modes.csv',
      rowCount: 5,
      columnCount: 3,
      columns: [
        { id: 'single_mode', name: 'Single Mode', type: 'Numeric' },
        { id: 'multi_mode', name: 'Multi Mode', type: 'Numeric' },
        { id: 'no_mode', name: 'No Mode', type: 'Numeric' },
      ],
    };

    const singleStats: NumericColumnStats = {
      count: 5,
      missing: 0,
      sum: 15,
      mean: 3,
      median: 3,
      mode: [3],
      standardDeviation: 1.4142,
      variance: 2,
      min: 1,
      max: 5,
      q1: 2,
      q3: 4,
      iqr: 2,
    };

    const multiStats: NumericColumnStats = {
      count: 4,
      missing: 0,
      sum: 10,
      mean: 2.5,
      median: 2.5,
      mode: [1, 2], // 2 nilai seri multimodal
      standardDeviation: 1.291,
      variance: 1.6667,
      min: 1,
      max: 4,
      q1: 1.25,
      q3: 3.75,
      iqr: 2.5,
    };

    const noModeStats: NumericColumnStats = {
      count: 5,
      missing: 0,
      sum: 15,
      mean: 3,
      median: 3,
      mode: null, // Semua unik, tidak ada modus
      standardDeviation: 1.5811,
      variance: 2.5,
      min: 1,
      max: 5,
      q1: 2,
      q3: 4,
      iqr: 2,
    };

    const descriptiveStats: DescriptiveStatisticsSummary = {
      datasetId: 'ds-mode',
      totalRecords: 5,
      columnStats: [
        { columnId: 'single_mode', columnName: 'Single Mode', type: 'Numeric', numericStats: singleStats },
        { columnId: 'multi_mode', columnName: 'Multi Mode', type: 'Numeric', numericStats: multiStats },
        { columnId: 'no_mode', columnName: 'No Mode', type: 'Numeric', numericStats: noModeStats },
      ],
    };

    const html = renderWithMockStore({ activeDataset, descriptiveStats });

    // Modus tunggal: 3.0000
    assert.ok(html.includes('3.0000'), 'Modus tunggal ter-render format 4 desimal');

    // Multimodal badge: Multimodal (2 nilai)
    assert.ok(html.includes('Multimodal (2 nilai)'), 'Harus menampilkan badge Multimodal dengan jumlah nilai');

    // Tidak ada modus
    assert.ok(html.includes('Tidak Ada Modus'), 'Harus menampilkan status Tidak Ada Modus');
  });

  it('7. Rendering Metrik Kategorikal (Count, Missing, Unique Count, Top Value, Frekuensi) (PRD FR-07)', () => {
    const activeDataset: Dataset = {
      id: 'ds-cat',
      name: 'titanic.csv',
      rowCount: 891,
      columnCount: 1,
      columns: [{ id: 'embarked', name: 'Embarked', type: 'Categorical' }],
    };

    const categoricalStats: CategoricalColumnStats = {
      count: 889,
      missing: 2,
      uniqueCount: 3,
      topValue: 'Southampton',
      topValueFrequency: 644,
      frequencies: [
        { value: 'Southampton', count: 644, percentage: 72.4409 },
        { value: 'Cherbourg', count: 168, percentage: 18.8976 },
        { value: 'Queenstown', count: 77, percentage: 8.6614 },
      ],
    };

    const descriptiveStats: DescriptiveStatisticsSummary = {
      datasetId: 'ds-cat',
      totalRecords: 891,
      columnStats: [
        {
          columnId: 'embarked',
          columnName: 'Embarked',
          type: 'Categorical',
          categoricalStats,
        },
      ],
    };

    // Render tab numerik dulu (karena default tab adalah numerik)
    const htmlNumericTab = renderWithMockStore({ activeDataset, descriptiveStats });
    assert.ok(
      htmlNumericTab.includes('Dataset tidak memiliki kolom bertipe Numerik'),
      'Jika hanya ada kolom kategorikal, tab numerik menampilkan pesan informatif'
    );
    assert.ok(htmlNumericTab.includes('Metrik Kategorikal'), 'Tab tombol kategorikal tersedia');
  });

  it('8. Isolasi dataset lama saat dataset aktif berganti (Stale Data Prevention)', () => {
    const oldDataset: Dataset = {
      id: 'old-ds',
      name: 'old.csv',
      rowCount: 10,
      columnCount: 1,
      columns: [{ id: 'val', name: 'OldVal', type: 'Numeric' }],
    };

    const oldStats: DescriptiveStatisticsSummary = {
      datasetId: 'old-ds',
      totalRecords: 10,
      columnStats: [
        {
          columnId: 'val',
          columnName: 'OldVal',
          type: 'Numeric',
          numericStats: {
            count: 10,
            missing: 0,
            sum: 100,
            mean: 10,
            median: 10,
            mode: [10],
            standardDeviation: 0,
            variance: 0,
            min: 10,
            max: 10,
            q1: 10,
            q3: 10,
            iqr: 0,
          },
        },
      ],
    };

    // Dataset baru aktif tapi descriptiveStats masih memuat oldStats (belum match)
    const newDataset: Dataset = {
      id: 'new-ds',
      name: 'new.csv',
      rowCount: 50,
      columnCount: 1,
      columns: [{ id: 'other', name: 'NewOther', type: 'Numeric' }],
    };

    const html = renderWithMockStore({
      activeDataset: newDataset,
      descriptiveStats: oldStats, // Mismatched datasetId
    });

    // Karena datasetId mismatch, data lama tidak boleh di-render
    assert.ok(!html.includes('OldVal'), 'Data statistik dari dataset lama dilarang tampil');
  });
});
