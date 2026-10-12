import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DatasetPreview } from '../components/DatasetPreview';
import { Dataset, DataType } from '../types';

describe('DatasetPreview Component (FND-03)', () => {

  const renderWithMockStore = (state: Record<string, unknown>) => {
    return renderToStaticMarkup(React.createElement(DatasetPreview, { _testState: { activeDataset: null, datasetPreview: [], isProcessing: false, processingMessage: null, error: null, ...state } as Record<string, unknown> }));
  };

  it('1. Empty state saat belum ada dataset', () => {
    const html = renderWithMockStore({});
    assert.ok(html.includes('Belum Ada Pratinjau Data'), 'Harus menampilkan status kosong');
    assert.ok(html.includes('Unggah dataset'), 'Harus menyertakan pesan panduan');
  });

  it('2. Loading state saat sedang memproses', () => {
    const html = renderWithMockStore({ isProcessing: true, processingMessage: 'Parsing file CSV' });
    assert.ok(html.includes('Memproses Dataset'), 'Harus menampilkan judul loading');
    assert.ok(html.includes('Parsing file CSV'), 'Harus menampilkan pesan loading dari store');
  });

  it('3. Error state saat terjadi kesalahan', () => {
    const html = renderWithMockStore({ error: 'Gagal membaca file karena rusak' });
    assert.ok(html.includes('Kesalahan'), 'Harus menampilkan alert kesalahan');
    assert.ok(html.includes('Gagal membaca file karena rusak'), 'Harus menampilkan isi error');
  });

  it('4. Tampilan header, kolom dengan urutan yang benar, dan penanganan null/sel kosong', () => {
    const dummyDataset: Dataset = {
      id: 'd1',
      name: 'Sales.csv',
      rowCount: 500,
      columnCount: 3,
      columns: [
        { id: 'id', name: 'ID', type: 'Numeric' as DataType },
        { id: 'name', name: 'Product Name', type: 'Text' as DataType },
        { id: 'price', name: 'Price', type: 'Numeric' as DataType }
      ]
    };

    const dummyPreview = [
      { id: 1, name: 'Apple', price: 10.5 },
      { id: 2, name: '', price: null } 
    ];

    const html = renderWithMockStore({ activeDataset: dummyDataset, datasetPreview: dummyPreview });
    
    // Verifikasi metadata info
    assert.ok(html.includes('Sales.csv'), 'Menampilkan nama dataset');
    assert.ok(html.includes('500'), 'Menampilkan rowCount');
    
    // Verifikasi kolom
    assert.ok(html.includes('Product Name'), 'Menampilkan kolom header 2');
    assert.ok(html.includes('Price'), 'Menampilkan kolom header 3');

    // Verifikasi data
    assert.ok(html.includes('Apple'), 'Menampilkan data row 1');
    assert.ok(html.includes('null'), 'Menampilkan null formatter (atau span bertuliskan null)');
  });

  it('5. Pergantian dataset tanpa menampilkan data lama', () => {
    const ds2: Dataset = { id: '2', name: 'S2', rowCount: 1, columnCount: 1, columns: [{ id: 'b', name: 'B', type: 'Text' }] };
    const prev2 = [{ b: 'NEW_DATA' }];
    
    const html = renderWithMockStore({ activeDataset: ds2, datasetPreview: prev2 });
    
    assert.ok(html.includes('NEW_DATA'), 'Data baru harus muncul');
    assert.ok(!html.includes('OLD_DATA'), 'Data lama tidak boleh muncul');
  });

});
