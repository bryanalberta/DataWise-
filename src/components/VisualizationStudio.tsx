'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  BarChart3,
  Activity,
  LineChart as LineChartIcon,
  CircleDot,
  Download,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Database,
  ShieldCheck,
  Hash,
  Type,
  TrendingUp,
} from 'lucide-react';
import { useDatasetStore } from '@/store/dataset-store';
import { workerClient } from '@/lib/worker-client';
import { exportSvgToPng } from '@/lib/export-png';
import {
  ChartType,
  ChartConfig,
  ChartDataResult,
  BarChartResult,
  HistogramResult,
  LineChartResult,
  ScatterPlotResult,
} from '@/types';

// Palet warna ramah buta warna (Okabe-Ito inspired) dengan Deep Steel Teal sebagai warna utama
const PALETTE = [
  '#0F766E', // Deep Steel Teal (Brand Anchor)
  '#0D9488', // Vibrant Teal
  '#0284C7', // Sky Blue
  '#D97706', // Amber / Ochre
  '#4F46E5', // Indigo
  '#059669', // Emerald
  '#7C3AED', // Violet
  '#E11D48', // Crimson Rose
];

export interface VisualizationStudioProps {
  _testDataset?: import('@/types').Dataset | null;
}

export function VisualizationStudio({ _testDataset }: VisualizationStudioProps = {}) {
  const store = useDatasetStore();
  const activeDataset = _testDataset !== undefined ? _testDataset : store.activeDataset;
  const [activeChartType, setActiveChartType] = useState<ChartType>('BAR');

  // Seleksi variabel
  const [barXCol, setBarXCol] = useState<string>('');
  const [barYCol, setBarYCol] = useState<string>('');
  const [barAgg, setBarAgg] = useState<'COUNT' | 'SUM' | 'MEAN'>('COUNT');

  const [histCol, setHistCol] = useState<string>('');
  const [histBins, setHistBins] = useState<number>(10);

  const [lineYCol, setLineYCol] = useState<string>('');
  const [lineXCol, setLineXCol] = useState<string>('');

  const [scatterXCol, setScatterXCol] = useState<string>('');
  const [scatterYCol, setScatterYCol] = useState<string>('');

  // State hasil kalkulasi
  const [chartData, setChartData] = useState<ChartDataResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // State ekspor PNG
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // ID generator untuk label & input accessibility
  const baseId = useId();

  // Filter kolom berdasarkan tipe
  const columns = useMemo(() => activeDataset?.columns || [], [activeDataset?.columns]);
  const numericColumns = useMemo(() => columns.filter((c) => c.type === 'Numeric'), [columns]);
  const categoricalColumns = useMemo(
    () => columns.filter((c) => c.type === 'Text' || c.type === 'Categorical'),
    [columns]
  );

  // Nilai efektif kolom dengan fallback yang deterministik
  const effectiveBarX = useMemo(() => {
    if (barXCol && columns.some((c) => c.id === barXCol || c.name === barXCol)) return barXCol;
    return categoricalColumns[0]?.id || columns[0]?.id || '';
  }, [barXCol, categoricalColumns, columns]);

  const effectiveBarY = useMemo(() => {
    if (barYCol && numericColumns.some((c) => c.id === barYCol || c.name === barYCol)) return barYCol;
    return '';
  }, [barYCol, numericColumns]);

  const effectiveHistCol = useMemo(() => {
    if (histCol && numericColumns.some((c) => c.id === histCol || c.name === histCol)) return histCol;
    return numericColumns[0]?.id || '';
  }, [histCol, numericColumns]);

  const effectiveLineY = useMemo(() => {
    if (lineYCol && numericColumns.some((c) => c.id === lineYCol || c.name === lineYCol)) return lineYCol;
    return numericColumns[0]?.id || '';
  }, [lineYCol, numericColumns]);

  const effectiveLineX = useMemo(() => {
    if (lineXCol && columns.some((c) => c.id === lineXCol || c.name === lineXCol)) return lineXCol;
    return '';
  }, [lineXCol, columns]);

  const effectiveScatterX = useMemo(() => {
    if (scatterXCol && numericColumns.some((c) => c.id === scatterXCol || c.name === scatterXCol))
      return scatterXCol;
    return numericColumns[0]?.id || '';
  }, [scatterXCol, numericColumns]);

  const effectiveScatterY = useMemo(() => {
    if (scatterYCol && numericColumns.some((c) => c.id === scatterYCol || c.name === scatterYCol))
      return scatterYCol;
    return numericColumns[1]?.id || numericColumns[0]?.id || '';
  }, [scatterYCol, numericColumns]);

  // Bangun konfigurasi grafik saat ini
  const buildCurrentConfig = useCallback((): ChartConfig | null => {
    if (!activeDataset) return null;

    switch (activeChartType) {
      case 'BAR':
        if (!effectiveBarX) return null;
        return {
          type: 'BAR',
          xColumn: effectiveBarX,
          yColumn: effectiveBarY || undefined,
          aggregation: effectiveBarY ? barAgg : 'COUNT',
          maxCategories: 20,
        };

      case 'HISTOGRAM':
        if (!effectiveHistCol) return null;
        return {
          type: 'HISTOGRAM',
          column: effectiveHistCol,
          bins: histBins,
        };

      case 'LINE':
        if (!effectiveLineY) return null;
        return {
          type: 'LINE',
          yColumn: effectiveLineY,
          xColumn: effectiveLineX || undefined,
          maxPoints: 2000,
        };

      case 'SCATTER':
        if (!effectiveScatterX || !effectiveScatterY) return null;
        return {
          type: 'SCATTER',
          xColumn: effectiveScatterX,
          yColumn: effectiveScatterY,
          maxPoints: 2500,
        };

      default:
        return null;
    }
  }, [
    activeDataset,
    activeChartType,
    effectiveBarX,
    effectiveBarY,
    barAgg,
    effectiveHistCol,
    histBins,
    effectiveLineY,
    effectiveLineX,
    effectiveScatterX,
    effectiveScatterY,
  ]);

  // Request perhitungan grafik ke Web Worker saat konfigurasi atau dataset berubah
  useEffect(() => {
    if (!activeDataset) {
      return;
    }

    const config = buildCurrentConfig();
    if (!config) {
      return;
    }

    let isMounted = true;
    const { promise, taskId } = workerClient.executeTask('GENERATE_CHART_DATA', {
      datasetId: activeDataset.id,
      config,
    });

    // Mulai loading secara asinkron agar tidak memicu cascading render
    Promise.resolve().then(() => {
      if (isMounted) {
        setIsLoading(true);
        setError(null);
      }
    });

    promise
      .then((res: unknown) => {
        if (!isMounted) return;
        const payload = res as { chartResult: ChartDataResult };
        setChartData(payload.chartResult);
        setIsLoading(false);
      })
      .catch((err: Error) => {
        if (!isMounted) return;
        setError(err.message || 'Gagal memproses visualisasi di Web Worker.');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
      workerClient.cancelTask(taskId);
    };
  }, [activeDataset, buildCurrentConfig]);

  // Handler ekspor PNG
  const handleExportPng = async () => {
    if (!chartContainerRef.current) return;

    const svgElement = chartContainerRef.current.querySelector('svg');
    if (!svgElement) {
      setError('Elemen SVG grafik belum siap untuk diekspor.');
      return;
    }

    try {
      setIsExporting(true);
      setError(null);
      const fileName = `datawise-${activeChartType.toLowerCase()}-${Date.now()}.png`;
      await exportSvgToPng(svgElement, fileName);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengekspor grafik ke PNG.');
    } finally {
      setIsExporting(false);
    }
  };

  // Nama kolom untuk judul dinamis
  const xColName = useMemo(() => {
    if (activeChartType === 'BAR') {
      return columns.find((c) => c.id === effectiveBarX || c.name === effectiveBarX)?.name || effectiveBarX;
    }
    if (activeChartType === 'HISTOGRAM') {
      return columns.find((c) => c.id === effectiveHistCol || c.name === effectiveHistCol)?.name || effectiveHistCol;
    }
    if (activeChartType === 'LINE') {
      return effectiveLineX
        ? columns.find((c) => c.id === effectiveLineX || c.name === effectiveLineX)?.name || effectiveLineX
        : 'Urutan Baris';
    }
    if (activeChartType === 'SCATTER') {
      return columns.find((c) => c.id === effectiveScatterX || c.name === effectiveScatterX)?.name || effectiveScatterX;
    }
    return '';
  }, [activeChartType, columns, effectiveBarX, effectiveHistCol, effectiveLineX, effectiveScatterX]);

  const yColName = useMemo(() => {
    if (activeChartType === 'BAR') {
      return effectiveBarY
        ? columns.find((c) => c.id === effectiveBarY || c.name === effectiveBarY)?.name || effectiveBarY
        : '';
    }
    if (activeChartType === 'LINE') {
      return columns.find((c) => c.id === effectiveLineY || c.name === effectiveLineY)?.name || effectiveLineY;
    }
    if (activeChartType === 'SCATTER') {
      return columns.find((c) => c.id === effectiveScatterY || c.name === effectiveScatterY)?.name || effectiveScatterY;
    }
    return '';
  }, [activeChartType, columns, effectiveBarY, effectiveLineY, effectiveScatterY]);

  // Cek apakah grafik saat ini dalam mode sampling transparan
  const isChartSampled = useMemo(() => {
    if (!chartData) return false;
    if (chartData.type === 'LINE' || chartData.type === 'SCATTER') {
      return Boolean(chartData.isSampled);
    }
    return false;
  }, [chartData]);

  // 1. Empty state jika belum ada dataset
  if (!activeDataset) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
              <BarChart3 className="h-3.5 w-3.5 text-teal-600" />
              Visualization Studio
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Visualisasi Data</h1>
          <p className="text-sm text-slate-500">
            Eksplorasi visual interaktif dengan Bar Chart, Histogram, Line Chart, dan Scatter Plot berbasis data aktual.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 p-12 text-center backdrop-blur-sm shadow-xs">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 shadow-xs ring-1 ring-teal-600/10">
            <FileSpreadsheet className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Belum ada dataset yang dimuat</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Unggah berkas CSV atau Excel di halaman Beranda untuk mulai menganalisis dan memvisualisasikan data Anda.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#115E59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40"
          >
            Buka Beranda
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Page Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50/80 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
              <BarChart3 className="h-3.5 w-3.5 text-teal-700" />
              Visualization Studio
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Client-Side SVG
            </span>
            {isChartSampled && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                <Layers className="h-3.5 w-3.5 text-amber-600" />
                Disampling Transparan
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Visualisasi Data</h1>
          <p className="text-sm text-slate-500">
            Eksplorasi grafik analitik interaktif berbasis data aktif secara lokal dan instan di browser.
          </p>
        </div>

        {/* Dataset Context Chip */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/70 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-slate-700">
            <Database className="h-4 w-4 text-teal-700" />
            <span className="font-semibold text-slate-900">{activeDataset.name}</span>
          </div>
          <span className="text-slate-300">•</span>
          <span className="tabular-data font-mono font-medium text-slate-600">
            {activeDataset.rowCount.toLocaleString('id-ID')} baris
          </span>
          <span className="text-slate-300">•</span>
          <span className="tabular-data font-mono font-medium text-slate-600">
            {columns.length} kolom
          </span>
        </div>
      </div>

      {/* Workspace Grid: Panel Konfigurasi (Kiri) & Area Visualisasi (Kanan) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* =========================================================================
            PANEL KONFIGURASI (Kiri / 4 Kolom)
            ========================================================================= */}
        <div className="space-y-5 lg:col-span-4 xl:col-span-4">
          {/* 1. Pemilih Jenis Grafik */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <TrendingUp className="h-4 w-4 text-[#0F766E]" />
                <span>Pilih Jenis Grafik</span>
              </div>
              <span className="text-[11px] font-medium text-teal-800 bg-teal-50 px-2 py-0.5 rounded">
                4 Opsi
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Pilihan Jenis Grafik">
              <button
                type="button"
                role="tab"
                aria-selected={activeChartType === 'BAR'}
                onClick={() => setActiveChartType('BAR')}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40 ${
                  activeChartType === 'BAR'
                    ? 'border-[#0F766E] bg-teal-50/70 text-[#0F766E] font-semibold shadow-2xs'
                    : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    activeChartType === 'BAR' ? 'bg-[#0F766E] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <BarChart3 className="h-4 w-4" />
                </div>
                <span className="text-xs">Bar Chart</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeChartType === 'HISTOGRAM'}
                onClick={() => setActiveChartType('HISTOGRAM')}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40 ${
                  activeChartType === 'HISTOGRAM'
                    ? 'border-[#0F766E] bg-teal-50/70 text-[#0F766E] font-semibold shadow-2xs'
                    : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    activeChartType === 'HISTOGRAM' ? 'bg-[#0F766E] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Activity className="h-4 w-4" />
                </div>
                <span className="text-xs">Histogram</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeChartType === 'LINE'}
                onClick={() => setActiveChartType('LINE')}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40 ${
                  activeChartType === 'LINE'
                    ? 'border-[#0F766E] bg-teal-50/70 text-[#0F766E] font-semibold shadow-2xs'
                    : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    activeChartType === 'LINE' ? 'bg-[#0F766E] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <LineChartIcon className="h-4 w-4" />
                </div>
                <span className="text-xs">Line Chart</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeChartType === 'SCATTER'}
                onClick={() => setActiveChartType('SCATTER')}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40 ${
                  activeChartType === 'SCATTER'
                    ? 'border-[#0F766E] bg-teal-50/70 text-[#0F766E] font-semibold shadow-2xs'
                    : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    activeChartType === 'SCATTER' ? 'bg-[#0F766E] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <CircleDot className="h-4 w-4" />
                </div>
                <span className="text-xs">Scatter Plot</span>
              </button>
            </div>
          </div>

          {/* 2. Formulir Kontrol Sumbu & Parameter */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Sliders className="h-4 w-4 text-[#0F766E]" />
                <span>Parameter & Sumbu</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Hash className="h-3 w-3 text-sky-600" />
                  {numericColumns.length} num
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <Type className="h-3 w-3 text-slate-500" />
                  {categoricalColumns.length} kat
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {/* Form Bar Chart */}
              {activeChartType === 'BAR' && (
                <>
                  <div>
                    <label htmlFor={`${baseId}-bar-x`} className="block text-xs font-medium text-slate-700">
                      Sumbu X (Kategori / Variabel)
                    </label>
                    <select
                      id={`${baseId}-bar-x`}
                      value={effectiveBarX}
                      onChange={(e) => setBarXCol(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    >
                      {columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.type})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Kardinalitas tinggi (&gt; 20 kategori) akan dikelompokkan ke &quot;Lainnya&quot;.
                    </p>
                  </div>

                  <div>
                    <label htmlFor={`${baseId}-bar-y`} className="block text-xs font-medium text-slate-700">
                      Sumbu Y (Opsional Nilai Numerik)
                    </label>
                    <select
                      id={`${baseId}-bar-y`}
                      value={effectiveBarY}
                      onChange={(e) => setBarYCol(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    >
                      <option value="">(Hitung Frekuensi Baris)</option>
                      {numericColumns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Numerik)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`${baseId}-bar-agg`} className="block text-xs font-medium text-slate-700">
                      Metode Agregasi
                    </label>
                    <select
                      id={`${baseId}-bar-agg`}
                      value={barAgg}
                      onChange={(e) => setBarAgg(e.target.value as 'COUNT' | 'SUM' | 'MEAN')}
                      disabled={!effectiveBarY}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E] disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="COUNT">Frekuensi (Count)</option>
                      <option value="SUM">Jumlah Total (Sum)</option>
                      <option value="MEAN">Rata-rata (Mean)</option>
                    </select>
                    {!effectiveBarY && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Pilih Sumbu Y numerik untuk mengaktifkan SUM atau MEAN.
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Form Histogram */}
              {activeChartType === 'HISTOGRAM' && (
                <>
                  <div>
                    <label htmlFor={`${baseId}-hist-col`} className="block text-xs font-medium text-slate-700">
                      Kolom Numerik
                    </label>
                    <select
                      id={`${baseId}-hist-col`}
                      value={effectiveHistCol}
                      onChange={(e) => setHistCol(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    >
                      {numericColumns.length === 0 ? (
                        <option value="">Tidak ada kolom numerik</option>
                      ) : (
                        numericColumns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} (Numerik)
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                      <label htmlFor={`${baseId}-hist-bins`}>Jumlah Bins</label>
                      <span className="font-mono text-teal-800 font-semibold">{histBins} bins</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        id={`${baseId}-hist-bins`}
                        type="range"
                        min={2}
                        max={50}
                        value={histBins}
                        onChange={(e) => setHistBins(parseInt(e.target.value, 10) || 10)}
                        className="h-2 w-full cursor-pointer accent-[#0F766E]"
                      />
                      <input
                        type="number"
                        min={2}
                        max={50}
                        value={histBins}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) setHistBins(Math.max(2, Math.min(50, val)));
                        }}
                        className="w-16 rounded-md border border-slate-300 px-2 py-1 text-center font-mono text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                        aria-label="Input angka bins"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Rentang interval linier 2 hingga 50 bins otomatis.
                    </p>
                  </div>
                </>
              )}

              {/* Form Line Chart */}
              {activeChartType === 'LINE' && (
                <>
                  <div>
                    <label htmlFor={`${baseId}-line-y`} className="block text-xs font-medium text-slate-700">
                      Sumbu Y (Nilai Numerik)
                    </label>
                    <select
                      id={`${baseId}-line-y`}
                      value={effectiveLineY}
                      onChange={(e) => setLineYCol(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    >
                      {numericColumns.length === 0 ? (
                        <option value="">Tidak ada kolom numerik</option>
                      ) : (
                        numericColumns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} (Numerik)
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`${baseId}-line-x`} className="block text-xs font-medium text-slate-700">
                      Sumbu X (Urutan / Indeks Baris)
                    </label>
                    <select
                      id={`${baseId}-line-x`}
                      value={effectiveLineX}
                      onChange={(e) => setLineXCol(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    >
                      <option value="">(Indeks Baris: 1, 2, 3...)</option>
                      {columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.type})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Urutan observasi data asli dipertahankan tanpa sorting acak.
                    </p>
                  </div>
                </>
              )}

              {/* Form Scatter Plot */}
              {activeChartType === 'SCATTER' && (
                <>
                  <div>
                    <label htmlFor={`${baseId}-scatter-x`} className="block text-xs font-medium text-slate-700">
                      Sumbu X (Numerik)
                    </label>
                    <select
                      id={`${baseId}-scatter-x`}
                      value={effectiveScatterX}
                      onChange={(e) => setScatterXCol(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    >
                      {numericColumns.length === 0 ? (
                        <option value="">Tidak ada kolom numerik</option>
                      ) : (
                        numericColumns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} (Numerik)
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`${baseId}-scatter-y`} className="block text-xs font-medium text-slate-700">
                      Sumbu Y (Numerik)
                    </label>
                    <select
                      id={`${baseId}-scatter-y`}
                      value={effectiveScatterY}
                      onChange={(e) => setScatterYCol(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                    >
                      {numericColumns.length === 0 ? (
                        <option value="">Tidak ada kolom numerik</option>
                      ) : (
                        numericColumns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} (Numerik)
                          </option>
                        ))
                      )}
                    </select>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Pasangan X dan Y dijamin berasal dari baris observasi yang sama persis.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================================
            AREA VISUALISASI (Kanan / 8 Kolom)
            ========================================================================= */}
        <div className="space-y-4 lg:col-span-8 xl:col-span-8">
          {/* Banner Peringatan / Error jika ada */}
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <p>{error}</p>
            </div>
          )}

          {/* Kartu Kanvas Visualisasi Utama */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
            {/* Header Toolbar Canvas */}
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900 text-base">
                    {activeChartType === 'BAR' && `Distribusi: ${xColName || 'Kategori'}`}
                    {activeChartType === 'HISTOGRAM' && `Distribusi Frekuensi: ${xColName || 'Numerik'}`}
                    {activeChartType === 'LINE' && `Tren Observasi: ${yColName || 'Numerik'}`}
                    {activeChartType === 'SCATTER' && `Korelasi: ${xColName} vs ${yColName}`}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {activeChartType === 'BAR' && (effectiveBarY ? `Agregasi ${barAgg}` : 'Frekuensi Count')}
                    {activeChartType === 'HISTOGRAM' && `${histBins} Bins`}
                    {activeChartType === 'LINE' && 'Urutan Baris'}
                    {activeChartType === 'SCATTER' && 'Pair Plot'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {activeChartType === 'BAR' && (effectiveBarY ? `Nilai agregasi ${barAgg} dari kolom ${yColName}` : 'Frekuensi kemunculan setiap kategori')}
                  {activeChartType === 'HISTOGRAM' && `Pembagian nilai numerik ke dalam ${histBins} rentang bin linier`}
                  {activeChartType === 'LINE' && `Nilai observasi ${yColName} sepanjang sumbu ${xColName}`}
                  {activeChartType === 'SCATTER' && `Diagram sebaran pasangan data ${xColName} terhadap ${yColName}`}
                </p>
              </div>

              {/* Action Button: Unduh Gambar (PNG) */}
              <button
                onClick={handleExportPng}
                disabled={isLoading || !chartData || isExporting}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#115E59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40 disabled:cursor-not-allowed disabled:opacity-50"
                id="btn-unduh-png"
                aria-label="Unduh Gambar PNG"
              >
                {exportSuccess ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                    <span>Tersimpan!</span>
                  </>
                ) : isExporting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Mengekspor...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span>Unduh Gambar (PNG)</span>
                  </>
                )}
              </button>
            </div>

            {/* Area Kanvas Grafik Recharts */}
            <div className="relative mt-5 min-h-[460px] w-full">
              {/* State Loading Web Worker */}
              {isLoading && (
                <div className="flex h-[460px] flex-col items-center justify-center gap-3 text-slate-500">
                  <RefreshCw className="h-8 w-8 animate-spin text-[#0F766E]" />
                  <p className="text-sm font-medium">Menghitung visualisasi di Web Worker...</p>
                  <p className="text-xs text-slate-400">Pemrosesan 100% lokal di browser</p>
                </div>
              )}

              {/* State Missing Numeric Column Warning */}
              {!isLoading &&
                (activeChartType === 'HISTOGRAM' || activeChartType === 'SCATTER' || activeChartType === 'LINE') &&
                numericColumns.length === 0 && (
                  <div className="flex h-[460px] flex-col items-center justify-center p-6 text-center text-slate-500">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                      <AlertCircle className="h-6 w-6" />
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-slate-800">Tidak ada kolom bertipe numerik</h3>
                    <p className="mt-1 max-w-md text-xs text-slate-500">
                      Grafik jenis {activeChartType} membutuhkan setidaknya satu variabel bertipe numerik. Anda dapat
                      memeriksa atau mengubah tipe data di halaman Dataset atau Profiling.
                    </p>
                  </div>
                )}

              {/* Render Chart Content */}
              {!isLoading && chartData && (
                <div ref={chartContainerRef} className="h-[460px] w-full" id="datawise-active-chart-svg">
                  {/* 1. Bar Chart */}
                  {chartData.type === 'BAR' && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData.data as BarChartResult['data']}
                        margin={{ top: 20, right: 24, left: 16, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="category"
                          stroke="#64748b"
                          fontSize={11}
                          angle={-25}
                          textAnchor="end"
                          interval={0}
                          tickLine={false}
                        />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const item = payload[0].payload as { category: string; value: number; count: number };
                              return (
                                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                                  <p className="text-xs font-semibold text-slate-900">{item.category}</p>
                                  <p className="mt-1 font-mono text-sm font-bold text-[#0F766E]">
                                    {chartData.aggregation}: {item.value.toLocaleString('id-ID')}
                                  </p>
                                  {chartData.aggregation !== 'COUNT' && (
                                    <p className="text-xs text-slate-500">Frekuensi: {item.count} baris</p>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {chartData.data.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}

                  {/* 2. Histogram */}
                  {chartData.type === 'HISTOGRAM' && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData.bins as HistogramResult['bins']}
                        margin={{ top: 20, right: 24, left: 16, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="#64748b"
                          fontSize={10}
                          angle={-30}
                          textAnchor="end"
                          interval={0}
                          tickLine={false}
                        />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const bin = payload[0].payload as {
                                binStart: number;
                                binEnd: number;
                                count: number;
                                percentage: number;
                              };
                              return (
                                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                                  <p className="text-xs font-semibold text-slate-900">
                                    Rentang: [{bin.binStart} - {bin.binEnd}]
                                  </p>
                                  <p className="mt-1 font-mono text-sm font-bold text-[#0F766E]">
                                    {bin.count.toLocaleString('id-ID')} observasi
                                  </p>
                                  <p className="text-xs text-slate-500">Proporsi: {bin.percentage}%</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="count" fill="#0F766E" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}

                  {/* 3. Line Chart */}
                  {chartData.type === 'LINE' && (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData.data as LineChartResult['data']}
                        margin={{ top: 20, right: 24, left: 16, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="x" stroke="#64748b" fontSize={11} tickLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const pt = payload[0].payload as { index: number; x: string | number; y: number | null };
                              return (
                                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                                  <p className="text-xs text-slate-500">
                                    Observasi #{pt.index} (X: {pt.x})
                                  </p>
                                  <p className="mt-1 font-mono text-sm font-bold text-[#0F766E]">
                                    Y: {pt.y !== null ? pt.y.toLocaleString('id-ID') : 'N/A (Missing)'}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="y"
                          stroke="#0F766E"
                          strokeWidth={2}
                          dot={chartData.displayedPoints <= 60 ? { r: 3 } : false}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}

                  {/* 4. Scatter Plot */}
                  {chartData.type === 'SCATTER' && (
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 24, left: 16, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          type="number"
                          dataKey="x"
                          name={chartData.xColumn}
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          name={chartData.yColumn}
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const pt = payload[0].payload as { rowIndex: number; x: number; y: number };
                              return (
                                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                                  <p className="text-xs text-slate-500">Baris #{pt.rowIndex}</p>
                                  <p className="mt-1 font-mono text-xs text-slate-800">
                                    {chartData.xColumn}: <span className="font-bold">{pt.x}</span>
                                  </p>
                                  <p className="font-mono text-xs text-[#0F766E]">
                                    {chartData.yColumn}: <span className="font-bold">{pt.y}</span>
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Scatter
                          name="Observasi"
                          data={chartData.data as ScatterPlotResult['data']}
                          fill="#0D9488"
                          opacity={0.75}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </div>

            {/* Bilah Ringkasan & Disclosure Metrik Grafik */}
            {chartData && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2.5 py-1 font-medium text-teal-800">
                    <Layers className="h-3.5 w-3.5 text-teal-600" />
                    {chartData.type === 'BAR' && (
                      <>
                        {chartData.totalCategories} kategori total{' '}
                        {chartData.otherCategoriesCount > 0 &&
                          `(Top ${chartData.displayedCategories} ditampilkan, ${chartData.otherCategoriesCount} kategori dikelompokkan ke "Lainnya")`}
                      </>
                    )}
                    {chartData.type === 'HISTOGRAM' && (
                      <>
                        {chartData.validCount.toLocaleString('id-ID')} observasi terdistribusi ke dalam{' '}
                        {chartData.binCount} bins
                        {chartData.isConstant && ' (Data Konstan)'}
                      </>
                    )}
                    {chartData.type === 'LINE' && (
                      <>
                        {chartData.isSampled ? (
                          <span>
                            Menampilkan {chartData.displayedPoints.toLocaleString('id-ID')} titik sampel dari{' '}
                            {chartData.totalPoints.toLocaleString('id-ID')} baris total (urutan observasi dipertahankan)
                          </span>
                        ) : (
                          <span>{chartData.totalPoints.toLocaleString('id-ID')} observasi urut</span>
                        )}
                      </>
                    )}
                    {chartData.type === 'SCATTER' && (
                      <>
                        {chartData.isSampled ? (
                          <span>
                            Menampilkan {chartData.displayedPoints.toLocaleString('id-ID')} titik sampel dari{' '}
                            {chartData.validCount.toLocaleString('id-ID')} pasangan data valid
                          </span>
                        ) : (
                          <span>{chartData.validCount.toLocaleString('id-ID')} pasangan data valid</span>
                        )}
                      </>
                    )}
                  </span>

                  {chartData.missingCount > 0 && (
                    <span className="rounded-md bg-amber-50 px-2.5 py-1 text-amber-800">
                      {chartData.missingCount.toLocaleString('id-ID')} baris dilewati (nilai kosong)
                    </span>
                  )}
                </div>

                <div className="font-mono text-[11px] text-slate-400">
                  DataWise Chart Engine • Client-Side SVG • Zero-Server
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
