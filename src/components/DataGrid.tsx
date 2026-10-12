'use client';

import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import Link from 'next/link';
import { useDatasetStore } from '@/store/dataset-store';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  RotateCcw,
  Plus,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { workerClient } from '@/lib/worker-client';
import {
  Dataset,
  DataType,
  ColumnSchema,
  ColumnFilter,
  FilterOperator,
  GridSortConfig,
  WorkerQueryDataSuccessResponse
} from '@/types';

type StoreState = ReturnType<typeof useDatasetStore.getState>;

const DATA_TYPES: DataType[] = ['Text', 'Numeric', 'Categorical', 'DateTime', 'Boolean'];

const FILTER_OPERATORS: { value: FilterOperator; label: string; types?: DataType[] }[] = [
  { value: 'contains', label: 'Mengandung teks' },
  { value: 'equals', label: 'Sama persis dengan' },
  { value: 'startsWith', label: 'Diawali dengan' },
  { value: 'endsWith', label: 'Diakhiri dengan' },
  { value: 'gt', label: 'Lebih besar dari (>)' },
  { value: 'gte', label: 'Lebih besar atau sama (>=)' },
  { value: 'lt', label: 'Lebih kecil dari (<)' },
  { value: 'lte', label: 'Lebih kecil atau sama (<=)' },
  { value: 'isEmpty', label: 'Kosong / Null' },
  { value: 'isNotEmpty', label: 'Tidak Kosong' },
];

const ROW_HEIGHT = 40; // Piksel per baris
const CHUNK_SIZE = 60; // Ukuran pengambilan baris dari Worker

interface DataGridProps {
  id?: string;
  _testState?: Partial<StoreState> & {
    _testRows?: Record<string, unknown>[];
    _testMatchedRows?: number;
    _testTotalRows?: number;
  };
}

export function DataGrid({ id = 'data-explorer-grid', _testState }: DataGridProps) {
  const store = useDatasetStore();
  const stateToUse = _testState || store;

  const activeDataset = stateToUse.activeDataset as Dataset | null;
  const isProcessing = stateToUse.isProcessing as boolean;
  const storeError = (stateToUse.error || (stateToUse as Record<string, unknown>).storeError) as string | null;
  const overrideColumnType = store.overrideColumnType;

  // Interaktif state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<GridSortConfig | undefined>(undefined);
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [showFilterDrawer, setShowFilterDrawer] = useState<boolean>(false);

  // New filter draft form
  const [newFilterColumn, setNewFilterColumn] = useState<string>('');
  const [newFilterOperator, setNewFilterOperator] = useState<FilterOperator>('contains');
  const [newFilterValue, setNewFilterValue] = useState<string>('');

  // Windowing & data state dari Worker
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [matchedRows, setMatchedRows] = useState<number>(0);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isLoadingRows, setIsLoadingRows] = useState<boolean>(false);

  // Virtual scrolling scroll position
  const [scrollTop, setScrollTop] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputId = useId();

  // Mapping tipe kolom terkini
  const columnTypesMap = useMemo(() => {
    if (!activeDataset) return {};
    const map: Record<string, DataType> = {};
    for (const col of activeDataset.columns) {
      map[col.id] = col.type;
    }
    return map;
  }, [activeDataset]);

  // Kolom efektif untuk form filter
  const effectiveFilterColumn = newFilterColumn || (activeDataset?.columns[0]?.id ?? '');

  // Debounce input pencarian
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Virtual windowing calculations & state derivations
  const displayRows = _testState ? (_testState._testRows || []) : rows;
  const displayMatchedRows = _testState ? (_testState._testMatchedRows ?? displayRows.length) : matchedRows;
  const displayTotalRows = _testState ? (_testState._testTotalRows ?? displayRows.length) : totalRows;

  const viewportHeight = 520; // Tinggi area scroll tabel (dioptimasi untuk layar laptop & desktop)
  const totalDisplayRows = displayMatchedRows;

  // Hitung indeks baris virtual yang perlu ditampilkan
  const currentFirstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
  const currentLastVisible = Math.min(
    totalDisplayRows,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT)
  );

  // Chunk offset yang ditargetkan untuk virtual windowing
  const targetChunkOffset = Math.max(0, Math.floor(currentFirstVisible / 20) * 20);

  // Query data dari Worker (tanpa synchronous setState di dalam effect body)
  useEffect(() => {
    if (_testState) return;
    if (!activeDataset) return;

    let isCancelled = false;
    Promise.resolve().then(() => {
      if (!isCancelled) setIsLoadingRows(true);
    });

    const { promise, taskId } = workerClient.executeTask('QUERY_DATA', {
      datasetId: activeDataset.id,
      offset: targetChunkOffset,
      limit: CHUNK_SIZE,
      sort: sortConfig,
      searchQuery: debouncedSearch,
      filters,
      columnTypes: columnTypesMap,
    });

    promise
      .then((payload) => {
        if (isCancelled) return;
        setIsLoadingRows(false);
        const res = payload as WorkerQueryDataSuccessResponse['payload'];
        if (activeDataset.id === res.datasetId) {
          setRows(res.rows as Record<string, unknown>[]);
          setMatchedRows(res.matchedRows);
          setTotalRows(res.totalRows);
          setQueryError(null);
        }
      })
      .catch((err: Error) => {
        if (isCancelled || err.message === 'Task Cancelled') return;
        setIsLoadingRows(false);
        console.error('Gagal memuat baris dataset:', err);
        setQueryError(err.message || 'Gagal memuat baris dataset.');
      });

    return () => {
      isCancelled = true;
      workerClient.cancelTask(taskId);
    };
  }, [
    activeDataset?.id,
    targetChunkOffset,
    sortConfig,
    debouncedSearch,
    filters,
    columnTypesMap,
    _testState,
    activeDataset,
  ]);

  // Handler toggle sorting kolom (None -> Asc -> Desc -> None)
  const handleToggleSort = (columnId: string) => {
    setSortConfig((prev) => {
      if (!prev || prev.columnId !== columnId) {
        return { columnId, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { columnId, direction: 'desc' };
      }
      return undefined; // Reset to normal
    });
  };

  // Handler penambahan filter baru
  const handleAddFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const colToFilter = effectiveFilterColumn;
    if (!colToFilter) return;

    const isUnary = newFilterOperator === 'isEmpty' || newFilterOperator === 'isNotEmpty';
    if (!isUnary && newFilterValue.trim().length === 0) return;

    const newFilter: ColumnFilter = {
      columnId: colToFilter,
      operator: newFilterOperator,
      value: isUnary ? '' : newFilterValue.trim(),
    };

    setFilters((prev) => [...prev, newFilter]);
    setNewFilterValue('');
  };

  // Handler penghapusan filter
  const handleRemoveFilter = (index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  };

  // Handler reset semua search, filter, dan sort
  const handleResetAll = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSortConfig(undefined);
    setFilters([]);
  };

  // 1. Error state
  if (storeError || queryError) {
    return (
      <div id={id} className="bg-white border border-red-200 rounded-2xl p-6 shadow-xs mb-6">
        <div className="flex items-center gap-3 text-red-600 mb-2">
          <AlertCircle className="h-5 w-5" />
          <h4 className="text-base font-bold">Terjadi Kesalahan pada Data Explorer</h4>
        </div>
        <p className="text-xs text-red-700 leading-relaxed mb-4">{queryError || storeError}</p>
        <button
          type="button"
          onClick={() => setQueryError(null)}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          Coba Muat Ulang Data
        </button>
      </div>
    );
  }

  // 2. Loading state saat file sedang di-parse
  if (isProcessing && !activeDataset) {
    return (
      <div id={id} className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs mb-6">
        <div className="flex items-center gap-2.5 text-[#0f766e] mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm font-semibold">Menyiapkan Tabel Interaktif...</span>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // 3. Empty state saat belum ada dataset
  if (!activeDataset) {
    return (
      <div id={id} className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs mb-6">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-[#0f766e]">
              <Table2 className="h-4 w-4 text-[#0f766e]" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Data Explorer</h1>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200/60 px-2.5 py-1 rounded-full font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Belum ada dataset
          </span>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
            <Table2 className="h-6 w-6 text-slate-400" />
          </div>
          <h4 className="text-sm font-bold text-slate-800 mb-1">
            Belum Ada Data untuk Ditampilkan
          </h4>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-4">
            Unggah dataset Anda untuk menjelajahi baris data dengan virtual scrolling, sorting kolom, dan pencarian cepat.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#0f766e] text-white hover:bg-[#0d9488] transition-colors shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]"
          >
            Unggah Dataset di Beranda
          </Link>
        </div>
      </div>
    );
  }

  const columns = activeDataset.columns;
  const isFiltered = debouncedSearch.trim().length > 0 || filters.length > 0;

  // Baris yang dirender saat ini
  const visibleRows = displayRows;

  return (
    <div id={id} className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs mb-6 scroll-mt-20">
      {/* Header Bar */}
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3.5 bg-white">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E] border border-teal-100 shadow-2xs mt-0.5">
            <Table2 className="h-5 w-5 text-[#0F766E]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Data Explorer
              </h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/70 font-mono truncate max-w-[200px] sm:max-w-xs" title={activeDataset.name}>
                {activeDataset.name}
              </span>
              <span className="text-xs font-mono text-slate-500 hidden sm:inline-block">
                • {new Intl.NumberFormat('id-ID').format(activeDataset.rowCount)} baris, {columns.length} kolom
              </span>
              {sortConfig && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-teal-50 text-[#0F766E] border border-teal-200 flex items-center gap-1 font-mono">
                  Sort: {sortConfig.columnId} ({sortConfig.direction.toUpperCase()})
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Jelajahi seluruh data dengan virtual scrolling, pencarian kata kunci, dan filter kolom presisi.
            </p>
          </div>
        </div>

        {/* Status Indikator Baris */}
        <div className="flex items-center gap-2.5 text-xs text-slate-600 bg-slate-50/90 px-3.5 py-1.5 rounded-xl border border-slate-200/80 self-start md:self-auto shrink-0 shadow-2xs">
          <span className="font-bold text-slate-900 font-mono tabular-nums">
            {new Intl.NumberFormat('id-ID').format(totalDisplayRows)}
          </span>
          <span className="text-slate-400">/</span>
          <span className="font-mono tabular-nums text-slate-600">
            {new Intl.NumberFormat('id-ID').format(displayTotalRows || activeDataset.rowCount)} baris
          </span>
          {isFiltered && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono">
              Terfilter
            </span>
          )}
        </div>
      </div>

      {/* Toolbar Kontrol: Pencarian Global, Filter Drawer Toggle, dan Tombol Reset */}
      <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Input Pencarian Global */}
        <div className="relative flex-1 max-w-md">
          <label htmlFor={searchInputId} className="sr-only">
            Pencarian kata kunci global
          </label>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            id={searchInputId}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kata kunci di seluruh kolom..."
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f766e]/40 focus:border-[#0f766e] transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
              aria-label="Hapus kata kunci pencarian"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Tombol Kontrol Filter & Reset */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              filters.length > 0 || showFilterDrawer
                ? 'bg-teal-50 border-teal-200 text-[#0f766e]'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            } focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]`}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Filter Kolom</span>
            {filters.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#0f766e] text-white font-mono">
                {filters.length}
              </span>
            )}
          </button>

          {(isFiltered || sortConfig) && (
            <button
              type="button"
              onClick={handleResetAll}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]"
              title="Kembalikan ke tampilan urutan dan baris awal"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Drawer / Panel Konfigurasi Filter Kolom */}
      {showFilterDrawer && (
        <div className="px-6 py-4 border-b border-slate-200/80 bg-teal-50/20 animate-in slide-in-from-top-2 duration-150">
          <form onSubmit={handleAddFilter} className="flex flex-wrap items-center gap-2.5 mb-3">
            <span className="text-xs font-bold text-slate-700 shrink-0">Tambah Filter:</span>

            {/* Pemilih Kolom */}
            <select
              value={effectiveFilterColumn}
              onChange={(e) => setNewFilterColumn(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#0f766e]/40"
              aria-label="Pilih Kolom Filter"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>

            {/* Pemilih Operator */}
            <select
              value={newFilterOperator}
              onChange={(e) => setNewFilterOperator(e.target.value as FilterOperator)}
              className="text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#0f766e]/40"
              aria-label="Pilih Operator Filter"
            >
              {FILTER_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {/* Input Nilai Filter (disembunyikan untuk operator isEmpty/isNotEmpty) */}
            {newFilterOperator !== 'isEmpty' && newFilterOperator !== 'isNotEmpty' && (
              <input
                type="text"
                value={newFilterValue}
                onChange={(e) => setNewFilterValue(e.target.value)}
                placeholder="Nilai acuan..."
                className="text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f766e]/40 min-w-[140px]"
                aria-label="Nilai Filter"
              />
            )}

            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0f766e] text-white hover:bg-[#0d9488] transition-colors flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Terapkan</span>
            </button>
          </form>

          {/* Daftar Chip Filter Aktif */}
          {filters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60">
              <span className="text-[11px] font-semibold text-slate-500">Filter Aktif:</span>
              {filters.map((f, idx) => {
                const colName = columns.find((c) => c.id === f.columnId)?.name || f.columnId;
                const opLabel = FILTER_OPERATORS.find((o) => o.value === f.operator)?.label || f.operator;
                return (
                  <span
                    key={`${f.columnId}-${f.operator}-${idx}`}
                    className="inline-flex items-center gap-1.5 text-xs bg-white border border-teal-200 text-teal-900 px-2.5 py-1 rounded-lg font-mono shadow-2xs"
                  >
                    <strong className="text-[#0f766e]">{colName}</strong>
                    <span className="text-slate-400">|</span>
                    <span className="text-slate-600">{opLabel}</span>
                    {f.value && <strong className="text-slate-900">{`"${f.value}"`}</strong>}
                    <button
                      type="button"
                      onClick={() => handleRemoveFilter(idx)}
                      className="ml-1 text-slate-400 hover:text-red-500 focus:outline-none"
                      aria-label={`Hapus filter ${colName}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
              <button
                type="button"
                onClick={() => setFilters([])}
                className="text-[11px] text-red-600 hover:underline font-semibold ml-1 focus:outline-none"
              >
                Hapus Semua
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabel Data Grid dengan Virtual Scrolling */}
      {totalDisplayRows === 0 && !isLoadingRows ? (
        // No results state
        <div className="py-16 text-center px-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mx-auto mb-3">
            <Search className="h-6 w-6 text-slate-400" />
          </div>
          <h4 className="text-sm font-bold text-slate-800 mb-1">
            Tidak Ada Baris yang Cocok
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed mb-4">
            Pencarian kata kunci atau filter kolom saat ini tidak menghasilkan baris observasi.
          </p>
          <button
            type="button"
            onClick={handleResetAll}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0f766e] text-white hover:bg-[#0d9488] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]"
          >
            Reset Filter & Pencarian
          </button>
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          style={{ height: `${viewportHeight}px` }}
          className="w-full overflow-x-auto overflow-y-auto relative scroll-smooth focus:outline-none"
          tabIndex={0}
          aria-label="Tabel Data Interaktif"
        >
          <table className="w-full text-left text-xs border-collapse">
            {/* Header Kolom Sticky */}
            <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200/80 shadow-2xs">
              <tr>
                {/* Kolom Nomor Baris Sticky Kiri */}
                <th
                  scope="col"
                  className="sticky left-0 z-30 bg-slate-50 py-3 px-3 font-mono font-bold text-slate-500 text-center border-r border-slate-200/80 w-16 min-w-[64px]"
                >
                  #
                </th>

                {/* Kolom Variabel */}
                {columns.map((col: ColumnSchema) => {
                  const isSorted = sortConfig?.columnId === col.id;
                  const sortDir = isSorted ? sortConfig.direction : undefined;
                  const isOverridden = !!col.originalType && col.originalType !== col.type;

                  return (
                    <th
                      key={col.id}
                      scope="col"
                      className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap min-w-[150px] border-r border-slate-100 last:border-r-0"
                    >
                      <div className="flex flex-col gap-1.5">
                        {/* Nama Kolom & Tombol Sorting */}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="font-bold text-slate-900 truncate max-w-[140px]"
                            title={col.name}
                          >
                            {col.name}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleToggleSort(col.id)}
                            className={`p-1 rounded-md transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#0f766e] ${
                              isSorted
                                ? 'bg-teal-50 text-[#0f766e]'
                                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                            }`}
                            title={
                              isSorted
                                ? `Urutan ${sortDir?.toUpperCase()} aktif. Klik untuk beralih.`
                                : `Klik untuk mengurutkan kolom ${col.name}`
                            }
                            aria-label={`Urutkan kolom ${col.name}`}
                          >
                            {sortDir === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5 text-[#0f766e]" />
                            ) : sortDir === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5 text-[#0f766e]" />
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>

                        {/* Dropdown Override Tipe Kolom */}
                        <select
                          className={`text-[11px] py-1 px-1.5 rounded-lg border outline-none cursor-pointer transition-colors focus:ring-1 focus:ring-[#0F766E] ${
                            isOverridden
                              ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 shadow-2xs'
                          }`}
                          value={col.type}
                          onChange={(e) => overrideColumnType(col.id, e.target.value as DataType)}
                          title={
                            isOverridden
                              ? `Tipe asli: ${col.originalType}`
                              : `Keyakinan inferensi: ${col.profile?.confidenceScore ?? 100}%`
                          }
                          aria-label={`Ubah tipe kolom ${col.name}`}
                        >
                          {DATA_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Badan Tabel dengan Virtual Windowing Spacers */}
            <tbody className="divide-y divide-slate-100">
              {/* Spacer Atas untuk Menjaga Scroll Height */}
              {currentFirstVisible > 0 && !_testState && (
                <tr style={{ height: `${currentFirstVisible * ROW_HEIGHT}px` }}>
                  <td colSpan={columns.length + 1} />
                </tr>
              )}

              {/* Render Baris Terlihat */}
              {visibleRows.map((row, rowIdx) => {
                const rowIndex = (row._index as number) || rowIdx + 1;

                return (
                  <tr
                    key={`row-${rowIndex}`}
                    style={{ height: `${ROW_HEIGHT}px` }}
                    className={
                      rowIdx % 2 === 0
                        ? 'bg-white hover:bg-teal-50/25 transition-colors'
                        : 'bg-slate-50/35 hover:bg-teal-50/25 transition-colors'
                    }
                  >
                    {/* Kolom Nomor Baris Asli Sticky Kiri */}
                    <td className="sticky left-0 z-10 bg-inherit py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-400 text-center border-r border-slate-200/80 select-none whitespace-nowrap shadow-2xs">
                      {new Intl.NumberFormat('id-ID').format(rowIndex)}
                    </td>

                    {/* Nilai Kolom */}
                    {columns.map((col: ColumnSchema) => {
                      const val = row[col.id];
                      const isNull = val === null || val === undefined || val === '';
                      const isNumeric = col.type === 'Numeric';

                      return (
                        <td
                          key={`${col.id}-${rowIndex}`}
                          className={`py-2.5 px-3.5 whitespace-nowrap border-r border-slate-100 last:border-r-0 ${
                            isNumeric ? 'text-right font-mono tabular-nums text-slate-800' : 'text-left text-slate-800 max-w-[280px] truncate'
                          }`}
                        >
                          {isNull ? (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-400 font-medium select-none">
                              null
                            </span>
                          ) : typeof val === 'boolean' ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                val ? 'bg-teal-50 text-[#0F766E] border border-teal-200/60' : 'bg-slate-100 text-slate-600 border border-slate-200/60'
                              }`}
                            >
                              {String(val)}
                            </span>
                          ) : (
                            <span title={String(val)}>{String(val)}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Spacer Bawah untuk Menjaga Scroll Height */}
              {totalDisplayRows > currentLastVisible && !_testState && (
                <tr style={{ height: `${(totalDisplayRows - currentLastVisible) * ROW_HEIGHT}px` }}>
                  <td colSpan={columns.length + 1} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Data Grid */}
      <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs text-slate-500">
        <div className="flex items-center gap-3 flex-wrap">
          <span>
            Total: <strong className="text-slate-800 font-mono tabular-nums">{new Intl.NumberFormat('id-ID').format(displayTotalRows || activeDataset.rowCount)}</strong> baris
          </span>
          <span className="text-slate-300">|</span>
          <span>
            Kolom: <strong className="text-slate-800 font-mono tabular-nums">{columns.length}</strong> variabel
          </span>
          {isLoadingRows && (
            <span className="inline-flex items-center gap-1.5 text-teal-700 font-medium font-mono text-[11px] bg-teal-50 px-2.5 py-0.5 rounded-lg border border-teal-200/60">
              <Loader2 className="h-3 w-3 animate-spin" />
              Memuat jendela baris...
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400">
          Gunakan scroll vertikal untuk menjelajahi baris; klik header untuk mengurutkan.
        </div>
      </div>
    </div>
  );
}
