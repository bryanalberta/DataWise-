import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  queryDataGrid,
  compareRows,
  matchesGlobalSearch,
  matchesColumnFilter,
  isMissingValue,
} from '../lib/data-grid-engine';
import { DataGrid } from '../components/DataGrid';
import { Dataset, DataType, ColumnFilter } from '../types';

describe('TASK-FNC-03 — Interactive Data Grid, Sorting, Search & Filtering', () => {
  // =========================================================================
  // 1. UNIT TESTS: ENGINE SORTING
  // =========================================================================
  describe('1. Engine Sorting (Multi-Type, Nulls Last, Stability)', () => {
    it('1.1. Numeric sorting: ASC dan DESC terurut matematis (bukan perbandingan teks)', () => {
      const rows = [
        { id: 1, val: 10 },
        { id: 2, val: 2 },
        { id: 3, val: 100 },
        { id: 4, val: -5 },
        { id: 5, val: 0.5 },
      ];
      const colTypes: Record<string, DataType> = { val: 'Numeric' };

      // ASC
      const ascSorted = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'val', direction: 'asc' }, colTypes)
      );
      assert.deepEqual(
        ascSorted.map((r) => r.val),
        [-5, 0.5, 2, 10, 100],
        'Numeric ASC harus urut dari terkecil ke terbesar'
      );

      // DESC
      const descSorted = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'val', direction: 'desc' }, colTypes)
      );
      assert.deepEqual(
        descSorted.map((r) => r.val),
        [100, 10, 2, 0.5, -5],
        'Numeric DESC harus urut dari terbesar ke terkecil'
      );
    });

    it('1.2. Text & Categorical sorting: Leksikografis case-insensitive', () => {
      const rows = [
        { name: 'banana' },
        { name: 'Apple' },
        { name: 'cherry' },
        { name: 'apricot' },
      ];
      const colTypes: Record<string, DataType> = { name: 'Text' };

      const ascSorted = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'name', direction: 'asc' }, colTypes)
      );
      assert.deepEqual(
        ascSorted.map((r) => r.name.toLowerCase()),
        ['apple', 'apricot', 'banana', 'cherry']
      );

      const descSorted = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'name', direction: 'desc' }, colTypes)
      );
      assert.deepEqual(
        descSorted.map((r) => r.name.toLowerCase()),
        ['cherry', 'banana', 'apricot', 'apple']
      );
    });

    it('1.3. Boolean sorting: false selalu mendahului true pada ASC, dibalik pada DESC', () => {
      const rows = [
        { id: 1, active: true },
        { id: 2, active: false },
        { id: 3, active: 'true' },
        { id: 4, active: 0 },
      ];
      const colTypes: Record<string, DataType> = { active: 'Boolean' };

      const ascSorted = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'active', direction: 'asc' }, colTypes)
      );
      assert.deepEqual(
        ascSorted.map((r) => Boolean(r.active === true || r.active === 'true')),
        [false, false, true, true]
      );

      const descSorted = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'active', direction: 'desc' }, colTypes)
      );
      assert.deepEqual(
        descSorted.map((r) => Boolean(r.active === true || r.active === 'true')),
        [true, true, false, false]
      );
    });

    it('1.4. DateTime sorting: Urutan kronologis valid', () => {
      const rows = [
        { date: '2024-03-15' },
        { date: '2023-01-01' },
        { date: '2024-12-31' },
        { date: '2024-01-10' },
      ];
      const colTypes: Record<string, DataType> = { date: 'DateTime' };

      const ascSorted = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'date', direction: 'asc' }, colTypes)
      );
      assert.deepEqual(
        ascSorted.map((r) => r.date),
        ['2023-01-01', '2024-01-10', '2024-03-15', '2024-12-31']
      );

      const descSorted = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'date', direction: 'desc' }, colTypes)
      );
      assert.deepEqual(
        descSorted.map((r) => r.date),
        ['2024-12-31', '2024-03-15', '2024-01-10', '2023-01-01']
      );
    });

    it('1.5. Missing Values: Selalu ditempatkan di paling akhir (Nulls Last) pada ASC maupun DESC', () => {
      const rows = [
        { id: 1, val: 50 },
        { id: 2, val: null },
        { id: 3, val: 10 },
        { id: 4, val: undefined },
        { id: 5, val: '' },
        { id: 6, val: 30 },
      ];
      const colTypes: Record<string, DataType> = { val: 'Numeric' };

      const asc = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'val', direction: 'asc' }, colTypes)
      );
      assert.equal(asc[0].val, 10);
      assert.equal(asc[1].val, 30);
      assert.equal(asc[2].val, 50);
      assert.ok(isMissingValue(asc[3].val));
      assert.ok(isMissingValue(asc[4].val));
      assert.ok(isMissingValue(asc[5].val));

      const desc = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'val', direction: 'desc' }, colTypes)
      );
      assert.equal(desc[0].val, 50);
      assert.equal(desc[1].val, 30);
      assert.equal(desc[2].val, 10);
      assert.ok(isMissingValue(desc[3].val));
      assert.ok(isMissingValue(desc[4].val));
      assert.ok(isMissingValue(desc[5].val));
    });

    it('1.6. Stable Sorting: Nilai kembar (ties) mempertahankan posisi indeks asli', () => {
      const rows = [
        { _index: 1, name: 'Alice', score: 90 },
        { _index: 2, name: 'Bob', score: 80 },
        { _index: 3, name: 'Charlie', score: 90 },
        { _index: 4, name: 'David', score: 80 },
        { _index: 5, name: 'Eve', score: 90 },
      ];
      const colTypes: Record<string, DataType> = { score: 'Numeric' };

      const sorted = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'score', direction: 'asc' }, colTypes)
      );

      // Score 80: Bob (_index 2) harus mendahului David (_index 4)
      assert.equal(sorted[0].name, 'Bob');
      assert.equal(sorted[1].name, 'David');
      // Score 90: Alice (1), Charlie (3), Eve (5)
      assert.equal(sorted[2].name, 'Alice');
      assert.equal(sorted[3].name, 'Charlie');
      assert.equal(sorted[4].name, 'Eve');
    });

    it('1.7. Override Tipe Kolom: Sorting menyesuaikan tipe yang di-override', () => {
      // Contoh angka yang tersimpan sebagai string: "100", "20", "3"
      const rows = [
        { code: '100' },
        { code: '20' },
        { code: '3' },
      ];

      // Jika Text: "100" < "20" < "3"
      const textSorted = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'code', direction: 'asc' }, { code: 'Text' })
      );
      assert.deepEqual(textSorted.map((r) => r.code), ['100', '20', '3']);

      // Jika di-override menjadi Numeric: 3 < 20 < 100
      const numSorted = [...rows].sort((a, b) =>
        compareRows(a, b, { columnId: 'code', direction: 'asc' }, { code: 'Numeric' })
      );
      assert.deepEqual(numSorted.map((r) => r.code), ['3', '20', '100']);
    });
  });

  // =========================================================================
  // 2. UNIT TESTS: GLOBAL SEARCH & FILTERING
  // =========================================================================
  describe('2. Global Search & Column Filtering', () => {
    const testData = [
      { id: 101, name: 'Laptop Dell XPS', price: 25000000, category: 'Electronics', inStock: true },
      { id: 102, name: 'Keyboard Mechanical', price: 1200000, category: 'Accessories', inStock: true },
      { id: 103, name: 'Mouse Wireless', price: 350000, category: 'Accessories', inStock: false },
      { id: 104, name: 'Monitor 4K Dell', price: 6500000, category: 'Electronics', inStock: true },
      { id: 105, name: 'Desk Mat', price: null, category: null, inStock: null },
    ];

    it('2.1. Global Search: Menemukan baris di berbagai kolom secara case-insensitive', () => {
      // Cari "dell" -> harus cocok dengan ID 101 dan 104
      assert.equal(matchesGlobalSearch(testData[0], 'dell'), true);
      assert.equal(matchesGlobalSearch(testData[1], 'dell'), false);
      assert.equal(matchesGlobalSearch(testData[3], 'DELL'), true);

      // Cari angka "350000" -> harus cocok dengan ID 103
      assert.equal(matchesGlobalSearch(testData[2], '350000'), true);

      // Query kosong harus cocok dengan semua
      assert.equal(matchesGlobalSearch(testData[4], ''), true);
      assert.equal(matchesGlobalSearch(testData[4], '   '), true);
    });

    it('2.2. Column Filter Operators: contains & equals', () => {
      const filterContains: ColumnFilter = {
        columnId: 'name',
        operator: 'contains',
        value: 'Wireless',
      };
      assert.equal(matchesColumnFilter(testData[2].name, filterContains), true);
      assert.equal(matchesColumnFilter(testData[0].name, filterContains), false);

      const filterEquals: ColumnFilter = {
        columnId: 'category',
        operator: 'equals',
        value: 'Accessories',
      };
      assert.equal(matchesColumnFilter(testData[1].category, filterEquals), true);
      assert.equal(matchesColumnFilter(testData[0].category, filterEquals), false);
    });

    it('2.3. Column Filter Operators: gt, lt, gte, lte', () => {
      const filterGt: ColumnFilter = { columnId: 'price', operator: 'gt', value: '2000000' };
      assert.equal(matchesColumnFilter(testData[0].price, filterGt), true); // 25jt > 2jt
      assert.equal(matchesColumnFilter(testData[1].price, filterGt), false); // 1.2jt < 2jt

      const filterLte: ColumnFilter = { columnId: 'price', operator: 'lte', value: '1200000' };
      assert.equal(matchesColumnFilter(testData[1].price, filterLte), true);
      assert.equal(matchesColumnFilter(testData[2].price, filterLte), true);
      assert.equal(matchesColumnFilter(testData[0].price, filterLte), false);
    });

    it('2.4. Column Filter Operators: isEmpty & isNotEmpty', () => {
      const filterEmpty: ColumnFilter = { columnId: 'price', operator: 'isEmpty', value: '' };
      assert.equal(matchesColumnFilter(testData[4].price, filterEmpty), true);
      assert.equal(matchesColumnFilter(testData[0].price, filterEmpty), false);

      const filterNotEmpty: ColumnFilter = { columnId: 'price', operator: 'isNotEmpty', value: '' };
      assert.equal(matchesColumnFilter(testData[0].price, filterNotEmpty), true);
      assert.equal(matchesColumnFilter(testData[4].price, filterNotEmpty), false);
    });

    it('2.5. Kombinasi Search & Filter via queryDataGrid', () => {
      const result = queryDataGrid(testData, {
        datasetId: 'd1',
        searchQuery: 'Dell',
        filters: [{ columnId: 'price', operator: 'gt', value: '10000000' }],
      });

      // Dell ada di 101 (25jt) dan 104 (6.5jt). Filter > 10jt hanya lolos 101
      assert.equal(result.matchedRows, 1);
      assert.equal(result.rows[0].id, 101);
      assert.equal(result.totalRows, 5);
    });

    it('2.6. Slicing Window Virtual (offset & limit)', () => {
      const tenRows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
      const result = queryDataGrid(tenRows, {
        datasetId: 'd1',
        offset: 3,
        limit: 4,
      });

      assert.equal(result.totalRows, 10);
      assert.equal(result.matchedRows, 10);
      assert.equal(result.rows.length, 4);
      assert.equal(result.rows[0].id, 4);
      assert.equal(result.rows[0]._index, 4); // 1-based index
      assert.equal(result.rows[3].id, 7);
      assert.equal(result.rows[3]._index, 7);
    });

    it('2.7. Search Nihil (0 matched rows)', () => {
      const result = queryDataGrid(testData, {
        datasetId: 'd1',
        searchQuery: 'kata_kunci_tidak_ada_xyz_12345',
      });
      assert.equal(result.matchedRows, 0);
      assert.equal(result.rows.length, 0);
      assert.equal(result.totalRows, 5);
    });

    it('2.8. Immutability: queryDataGrid tidak memutasi array mentah', () => {
      const rawCopy = JSON.parse(JSON.stringify(testData));
      queryDataGrid(testData, {
        datasetId: 'd1',
        sort: { columnId: 'price', direction: 'asc' },
        searchQuery: 'Dell',
      });
      assert.deepEqual(testData, rawCopy, 'Dataset asli tidak boleh termutasi');
    });
  });

  // =========================================================================
  // 3. BENCHMARK PERFORMANSI DETERMINISTIK (25.000 & 50.000 BARIS)
  // =========================================================================
  describe('3. Deterministic Performance Benchmarks (25,000 & 50,000 Rows)', () => {
    // Generator dataset sintetis deterministik
    function createSyntheticDataset(count: number) {
      const depts = ['Engineering', 'Marketing', 'Sales', 'Finance', 'Human Resources', 'Support'];
      const data: Record<string, unknown>[] = new Array(count);
      for (let i = 0; i < count; i++) {
        data[i] = {
          id: i + 1,
          name: `Employee ${i + 1}`,
          dept: depts[i % depts.length],
          salary: 3000000 + ((i * 13791) % 70000000), // deterministik
          score: (i % 100) / 10,
          isActive: i % 2 === 0,
          hireDate: `202${i % 4}-0${(i % 9) + 1}-15`,
          notes: i % 10 === 0 ? null : `Note for emp ${i + 1}`,
        };
      }
      return data;
    }

    const colTypes: Record<string, DataType> = {
      id: 'Numeric',
      name: 'Text',
      dept: 'Text',
      salary: 'Numeric',
      score: 'Numeric',
      isActive: 'Boolean',
      hireDate: 'DateTime',
      notes: 'Text',
    };

    it('3.1. Benchmark 25.000 baris: Sorting numerik, Pencarian global, Filtering, dan Virtual Slicing', () => {
      const data25k = createSyntheticDataset(25000);
      assert.equal(data25k.length, 25000);

      // 1. Sort Benchmark (Numeric DESC)
      const t0 = performance.now();
      const sortResult = queryDataGrid(data25k, {
        datasetId: 'b-25k',
        sort: { columnId: 'salary', direction: 'desc' },
        columnTypes: colTypes,
        offset: 0,
        limit: 50,
      });
      const tSort = performance.now() - t0;

      assert.equal(sortResult.matchedRows, 25000);
      assert.equal(sortResult.rows.length, 50);
      assert.ok(Number(sortResult.rows[0].salary) >= Number(sortResult.rows[1].salary));

      // 2. Global Search Benchmark
      const t1 = performance.now();
      const searchResult = queryDataGrid(data25k, {
        datasetId: 'b-25k',
        searchQuery: 'Employee 1234',
        columnTypes: colTypes,
        offset: 0,
        limit: 50,
      });
      const tSearch = performance.now() - t1;
      assert.ok(searchResult.matchedRows >= 1);

      // 3. Filter Benchmark (dept == 'Engineering' AND salary > 50.000.000)
      const t2 = performance.now();
      const filterResult = queryDataGrid(data25k, {
        datasetId: 'b-25k',
        filters: [
          { columnId: 'dept', operator: 'equals', value: 'Engineering' },
          { columnId: 'salary', operator: 'gt', value: '50000000' },
        ],
        columnTypes: colTypes,
        offset: 0,
        limit: 50,
      });
      const tFilter = performance.now() - t2;
      assert.ok(filterResult.matchedRows > 0);

      // 4. Combined: Search + Filter + Sort + Virtual Slice
      const t3 = performance.now();
      const combResult = queryDataGrid(data25k, {
        datasetId: 'b-25k',
        searchQuery: 'Emp',
        filters: [{ columnId: 'isActive', operator: 'equals', value: 'true' }],
        sort: { columnId: 'score', direction: 'asc' },
        columnTypes: colTypes,
        offset: 500,
        limit: 60,
      });
      const tComb = performance.now() - t3;
      assert.equal(combResult.rows.length, 60);

      console.log(`\n--- BENCHMARK 25.000 BARIS ---`);
      console.log(`- Numeric Sort (25k)       : ${tSort.toFixed(2)} ms`);
      console.log(`- Global Search (25k)      : ${tSearch.toFixed(2)} ms`);
      console.log(`- Multi-column Filter (25k): ${tFilter.toFixed(2)} ms`);
      console.log(`- Combined Ops (25k)       : ${tComb.toFixed(2)} ms`);

      // Target SLA: seluruh query 25k harus selesai < 250ms pada CPU standar
      assert.ok(tSort < 250, `Sorting 25k rows took ${tSort}ms, should be < 250ms`);
      assert.ok(tSearch < 250, `Search 25k rows took ${tSearch}ms, should be < 250ms`);
    });

    it('3.2. Benchmark 50.000 baris: Target PRD Pengujian Lebih Ketat', () => {
      const data50k = createSyntheticDataset(50000);
      assert.equal(data50k.length, 50000);

      // 1. Sort Benchmark (Numeric DESC)
      const t0 = performance.now();
      const sortResult = queryDataGrid(data50k, {
        datasetId: 'b-50k',
        sort: { columnId: 'salary', direction: 'desc' },
        columnTypes: colTypes,
        offset: 0,
        limit: 50,
      });
      const tSort = performance.now() - t0;
      assert.equal(sortResult.matchedRows, 50000);
      assert.equal(sortResult.rows.length, 50);

      // 2. Global Search Benchmark
      const t1 = performance.now();
      const searchResult = queryDataGrid(data50k, {
        datasetId: 'b-50k',
        searchQuery: 'Employee 49999',
        columnTypes: colTypes,
        offset: 0,
        limit: 50,
      });
      const tSearch = performance.now() - t1;
      assert.equal(searchResult.matchedRows, 1);
      assert.equal(searchResult.rows[0].id, 49999);

      // 3. Multi Filter Benchmark
      const t2 = performance.now();
      const filterResult = queryDataGrid(data50k, {
        datasetId: 'b-50k',
        filters: [
          { columnId: 'dept', operator: 'equals', value: 'Sales' },
          { columnId: 'score', operator: 'gte', value: '5' },
        ],
        columnTypes: colTypes,
        offset: 0,
        limit: 50,
      });
      const tFilter = performance.now() - t2;
      assert.ok(filterResult.matchedRows > 0);

      // 4. Combined: Sort + Filter + Deep Virtual Scroll Slice (offset 20.000)
      const t3 = performance.now();
      const combResult = queryDataGrid(data50k, {
        datasetId: 'b-50k',
        filters: [{ columnId: 'dept', operator: 'equals', value: 'Engineering' }],
        sort: { columnId: 'salary', direction: 'asc' },
        columnTypes: colTypes,
        offset: 5000,
        limit: 60,
      });
      const tComb = performance.now() - t3;
      assert.equal(combResult.rows.length, 60);

      console.log(`\n--- BENCHMARK 50.000 BARIS ---`);
      console.log(`- Numeric Sort (50k)       : ${tSort.toFixed(2)} ms`);
      console.log(`- Global Search (50k)      : ${tSearch.toFixed(2)} ms`);
      console.log(`- Multi-column Filter (50k): ${tFilter.toFixed(2)} ms`);
      console.log(`- Combined Deep Slice (50k): ${tComb.toFixed(2)} ms`);

      // Target SLA: query 50k harus selesai < 500ms pada node
      assert.ok(tSort < 500, `Sorting 50k rows took ${tSort}ms, should be < 500ms`);
      assert.ok(tSearch < 500, `Search 50k rows took ${tSearch}ms, should be < 500ms`);
      assert.ok(tFilter < 500, `Filter 50k rows took ${tFilter}ms, should be < 500ms`);
    });
  });

  // =========================================================================
  // 4. COMPONENT TESTS: DATAGRID RENDERING & UI STATES
  // =========================================================================
  describe('4. DataGrid Component Rendering (SSR / Static DOM)', () => {
    const dummyDataset: Dataset = {
      id: 'ds-test-01',
      name: 'Transactions_2024.csv',
      rowCount: 50000,
      columnCount: 3,
      columns: [
        { id: 'txn_id', name: 'Transaction ID', type: 'Numeric' },
        { id: 'merchant', name: 'Merchant Name', type: 'Text' },
        { id: 'amount', name: 'Amount (IDR)', type: 'Numeric' },
      ],
    };

    const dummyRows = [
      { _index: 1, txn_id: 1001, merchant: 'Tokopedia', amount: 150000 },
      { _index: 2, txn_id: 1002, merchant: 'Shopee', amount: null },
      { _index: 3, txn_id: 1003, merchant: 'GrabFood', amount: 45000 },
    ];

    it('4.1. Empty state saat belum ada dataset aktif', () => {
      const html = renderToStaticMarkup(
        React.createElement(DataGrid, {
          _testState: {
            activeDataset: null,
            _testRows: [],
            _testMatchedRows: 0,
            _testTotalRows: 0,
          },
        })
      );
      assert.ok(html.includes('Belum Ada Data untuk Ditampilkan'));
      assert.ok(html.includes('Belum ada dataset'));
    });

    it('4.2. Loading state saat memproses dataset', () => {
      const html = renderToStaticMarkup(
        React.createElement(DataGrid, {
          _testState: {
            activeDataset: null,
            isProcessing: true,
            _testRows: [],
            _testMatchedRows: 0,
            _testTotalRows: 0,
          },
        })
      );
      assert.ok(html.includes('Menyiapkan Tabel Interaktif'));
    });

    it('4.3. Error state saat terjadi kesalahan query atau store', () => {
      const html = renderToStaticMarkup(
        React.createElement(DataGrid, {
          _testState: {
            activeDataset: dummyDataset,
            error: 'Gagal mengambil data dari Worker',
            _testRows: [],
            _testMatchedRows: 0,
            _testTotalRows: 0,
          },
        })
      );
      assert.ok(html.includes('Terjadi Kesalahan pada Data Explorer'));
      assert.ok(html.includes('Gagal mengambil data dari Worker'));
    });

    it('4.4. Rendering Grid: Header kolom, nama dataset, tabular numerals, dan badge null', () => {
      const html = renderToStaticMarkup(
        React.createElement(DataGrid, {
          _testState: {
            activeDataset: dummyDataset,
            _testRows: dummyRows,
            _testMatchedRows: 3,
            _testTotalRows: 50000,
          },
        })
      );

      // Verifikasi judul dan nama dataset
      assert.ok(html.includes('Data Explorer'));
      assert.ok(html.includes('Transactions_2024.csv'));

      // Verifikasi header kolom
      assert.ok(html.includes('Transaction ID'));
      assert.ok(html.includes('Merchant Name'));
      assert.ok(html.includes('Amount (IDR)'));

      // Verifikasi data baris
      assert.ok(html.includes('Tokopedia'));
      assert.ok(html.includes('Shopee'));
      assert.ok(html.includes('GrabFood'));

      // Verifikasi badge null untuk sel amount yang kosong
      assert.ok(html.includes('null'), 'Harus menampilkan badge null untuk sel null/kosong');

      // Verifikasi tabular nums pada angka
      assert.ok(html.includes('tabular-nums'));

      // Verifikasi toolbar pencarian dan filter
      assert.ok(html.includes('Cari kata kunci di seluruh kolom'));
      assert.ok(html.includes('Filter'));
    });

    it('4.5. State Hasil Pencarian Nihil (0 Baris Cocok)', () => {
      const html = renderToStaticMarkup(
        React.createElement(DataGrid, {
          _testState: {
            activeDataset: dummyDataset,
            _testRows: [],
            _testMatchedRows: 0,
            _testTotalRows: 50000,
          },
        })
      );

      assert.ok(html.includes('Tidak Ada Baris yang Cocok'));
      assert.ok(html.includes('Pencarian kata kunci atau filter kolom saat ini tidak menghasilkan baris observasi'));
    });

    it('4.6. Pergantian dataset: Render dataset baru tanpa residual data lama', () => {
      const secondDataset: Dataset = {
        id: 'ds-test-02',
        name: 'Customers_New.csv',
        rowCount: 120,
        columnCount: 2,
        columns: [
          { id: 'cid', name: 'Customer ID', type: 'Numeric' },
          { id: 'city', name: 'City', type: 'Text' },
        ],
      };
      const secondRows = [
        { _index: 1, cid: 99, city: 'Jakarta' },
      ];

      const html = renderToStaticMarkup(
        React.createElement(DataGrid, {
          _testState: {
            activeDataset: secondDataset,
            _testRows: secondRows,
            _testMatchedRows: 1,
            _testTotalRows: 120,
          },
        })
      );

      assert.ok(html.includes('Customers_New.csv'));
      assert.ok(html.includes('Customer ID'));
      assert.ok(html.includes('City'));
      assert.ok(!html.includes('Transactions_2024.csv'));
      assert.ok(!html.includes('Tokopedia'));
    });
  });
});
