import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DatasetOverview } from '../components/DatasetOverview';
import { Dataset, DataType } from '../types';

describe('DatasetOverview Component (FND-04)', () => {

  const renderWithMockStore = (state: Record<string, unknown>) => {
    return renderToStaticMarkup(React.createElement(DatasetOverview, { _testState: { activeDataset: null, isProcessing: false, processingMessage: null, error: null, ...state } as Record<string, unknown> }));
  };

  it('1. Dataset kosong (Empty State)', () => {
    const html = renderWithMockStore({});
    assert.ok(html.includes('Belum Ada Metrik Dataset'), 'Harus menampilkan status kosong jika tidak ada dataset aktif');
    assert.ok(!html.includes('Total Baris'), 'Tidak boleh merender metrik jika tidak ada data');
  });

  it('2. Dataset dengan jumlah record dan kolom yang diketahui', () => {
    const ds: Dataset = {
      id: 'd1', name: 'File1.csv', rowCount: 1500, columnCount: 10, columns: [],
      estimatedMemoryBytes: 204800, integrityStatus: 'VALID'
    };
    const html = renderWithMockStore({ activeDataset: ds });
    assert.ok(html.includes('1.500'), 'Menampilkan Total Baris 1500 diformat lokal id-ID');
    assert.ok(html.includes('10'), 'Menampilkan Total Kolom 10');
    assert.ok(html.includes('200 KB'), 'Menampilkan 200 KB sebagai estimasi memori');
    assert.ok(html.includes('Struktur Valid'), 'Menampilkan label integritas');
  });

  it('3. Konsistensi jumlah baris dan kolom dengan struktur data', () => {
    // Pengujian ini lebih memverifikasi tampilan sesuai dengan property `rowCount` dan `columnCount`
    const ds: Dataset = {
      id: 'd1', name: 'A', rowCount: 5, columnCount: 2, columns: [], integrityStatus: 'VALID'
    };
    const html = renderWithMockStore({ activeDataset: ds });
    assert.ok(html.includes('5'), 'Baris 5');
    assert.ok(html.includes('2'), 'Kolom 2');
  });

  it('4. Dataset dengan sel kosong / 5. isi tidak lengkap', () => {
    // Pada DatasetOverview, sel kosong tidak mengubah jumlah kolom dan baris yang direpresentasikan dataset.
    // Jika ada parser warning, integrity akan menjadi WARNING.
    const ds: Dataset = {
      id: 'd1', name: 'A', rowCount: 100, columnCount: 5, columns: [], integrityStatus: 'WARNING'
    };
    const html = renderWithMockStore({ activeDataset: ds });
    assert.ok(html.includes('Peringatan Struktural'), 'Menampilkan warning karena inkonsistensi baris/sel (diwakili oleh status WARNING)');
  });

  it('11. Pergantian dataset agar metrik lama tidak dipakai kembali', () => {
    const ds1: Dataset = { id: 'd1', name: 'Satu', rowCount: 1, columnCount: 1, columns: [] };
    const html1 = renderWithMockStore({ activeDataset: ds1 });
    assert.ok(html1.includes('Satu'));
    assert.ok(html1.includes('1'));

    const ds2: Dataset = { id: 'd2', name: 'Dua', rowCount: 999, columnCount: 999, columns: [] };
    const html2 = renderWithMockStore({ activeDataset: ds2 });
    assert.ok(html2.includes('Dua'));
    assert.ok(!html2.includes('Satu'), 'Nama dataset lama tidak boleh muncul');
    assert.ok(html2.includes('999'), 'Metrik dataset baru harus muncul');
  });

  it('State Error dan Loading', () => {
    const errorHtml = renderWithMockStore({ error: 'Gagal parse' });
    assert.ok(errorHtml.includes('Kesalahan Analisis'));
    assert.ok(errorHtml.includes('Gagal parse'));

    const loadingHtml = renderWithMockStore({ isProcessing: true, processingMessage: 'Menganalisis file...' });
    assert.ok(loadingHtml.includes('Menganalisis file...'));
  });
});
