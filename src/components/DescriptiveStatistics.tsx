'use client';

import React, { useState, useEffect, useRef, useId } from 'react';
import Link from 'next/link';
import { useDatasetStore } from '@/store/dataset-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sigma,
  ArrowUpDown,
  AlertCircle,
  BarChart3,
  X,
  HelpCircle,
  Loader2,
  RefreshCw,
  Info
} from 'lucide-react';
import { workerClient } from '@/lib/worker-client';
import {
  Dataset,
  NumericColumnStats,
  CategoricalColumnStats,
  WorkerCalculateDescriptiveStatsSuccessResponse,
} from '@/types';

type StoreState = ReturnType<typeof useDatasetStore.getState>;

interface DescriptiveStatisticsProps {
  _testState?: Partial<StoreState>;
}

// Format integer dengan pemisah ribuan
function formatInteger(val: number | null | undefined): React.ReactNode {
  if (val === null || val === undefined) {
    return <span className="text-slate-400 font-mono text-xs">N/A</span>;
  }
  return (
    <span className="tabular-nums font-mono text-slate-800" title={val.toString()}>
      {new Intl.NumberFormat('id-ID').format(val)}
    </span>
  );
}

// Format continuous float dengan 4 angka desimal, atau N/A jika null
function formatContinuous(
  val: number | null | undefined,
  options?: { isVarianceOrStdDev?: boolean; count?: number }
): React.ReactNode {
  if (val === null || val === undefined) {
    if (options?.isVarianceOrStdDev && (options.count ?? 0) === 1) {
      return (
        <span
          className="text-slate-400 font-mono text-xs cursor-help inline-flex items-center gap-1"
          title="Memerlukan minimal 2 observasi non-null"
        >
          N/A
          <HelpCircle className="h-3 w-3 text-slate-400 inline" />
        </span>
      );
    }
    return (
      <span className="text-slate-400 font-mono text-xs" title="Nilai tidak tersedia">
        N/A
      </span>
    );
  }

  // Jika nilai benar-benar 0
  if (val === 0) {
    return (
      <span className="tabular-nums font-mono text-slate-800" title="0 (Eksak)">
        0.0000
      </span>
    );
  }

  return (
    <span
      className="tabular-nums font-mono text-slate-800 cursor-help"
      title={`Presisi penuh: ${val}`}
    >
      {val.toFixed(4)}
    </span>
  );
}

// Format persentase dengan 2 angka desimal
function formatPercentage(val: number | null | undefined): React.ReactNode {
  if (val === null || val === undefined) {
    return <span className="text-slate-400 font-mono text-xs">N/A</span>;
  }
  if (val === 0) {
    return <span className="tabular-nums font-mono text-slate-800">0.00%</span>;
  }
  return (
    <span className="tabular-nums font-mono text-slate-800" title={`${val}%`}>
      {val.toFixed(2)}%
    </span>
  );
}

// Modal Distribusi Frekuensi Kategorikal
interface CategoryDistributionModalProps {
  columnName: string;
  totalRecords: number;
  stats: CategoricalColumnStats;
  onClose: () => void;
}

function CategoryDistributionModal({
  columnName,
  totalRecords,
  stats,
  onClose,
}: CategoryDistributionModalProps) {
  const modalId = useId();

  // Tangani tombol ESC untuk menutup modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div>
            <h3 id={`${modalId}-title`} className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#0f766e]" />
              Distribusi Frekuensi: <span className="font-mono text-[#0f766e]">{columnName}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {stats.uniqueCount} nilai unik dari {new Intl.NumberFormat('id-ID').format(stats.count)} observasi valid (total {new Intl.NumberFormat('id-ID').format(totalRecords)} baris)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]"
            aria-label="Tutup modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Isi Modal */}
        <div className="p-6 overflow-y-auto flex-1">
          {stats.frequencies.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Tidak ada kategori yang tercatat.</p>
          ) : (
            <div className="border border-slate-200/80 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Kategori / Nilai</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold text-right">Frekuensi</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold text-right">Proporsi (%)</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold w-40">Bilah Visual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.frequencies.map((item, idx) => (
                    <tr key={`${item.value}-${idx}`} className="hover:bg-teal-50/30 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-slate-700">
                          {item.value}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {new Intl.NumberFormat('id-ID').format(item.count)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 font-medium">
                        {formatPercentage(item.percentage)}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-[#0f766e] h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(item.percentage, 1))}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

export function DescriptiveStatistics({ _testState }: DescriptiveStatisticsProps) {
  const store = useDatasetStore();
  const stateToUse = _testState || store;

  const activeDataset = stateToUse.activeDataset as Dataset | null;
  const descriptiveStats = stateToUse.descriptiveStats;
  const isProcessing = stateToUse.isProcessing as boolean;
  const storeError = stateToUse.error as string | null;

  // Local state untuk kontrol UI
  const [activeTab, setActiveTab] = useState<'numeric' | 'categorical'>('numeric');
  const [isTransposed, setIsTransposed] = useState<boolean>(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [selectedCategoryModal, setSelectedCategoryModal] = useState<{
    columnName: string;
    stats: CategoricalColumnStats;
  } | null>(null);

  const activeTaskIdRef = useRef<string | null>(null);
  const inFlightRef = useRef<boolean>(false);

  // Status perhitungan aktif diderivasi secara murni (mencegah cascading render ESLint error)
  const isCalculating = Boolean(activeDataset && !descriptiveStats && !storeError && !calcError);

  // Trigger perhitungan Web Worker saat activeDataset berubah atau belum ada statistik
  useEffect(() => {
    // Jika sedang dalam lingkungan testing dengan state mock khusus, lewati pemanggilan Worker
    if (_testState) return;

    if (activeDataset && !descriptiveStats && !storeError && !calcError && !inFlightRef.current) {
      inFlightRef.current = true;

      const { promise, taskId } = workerClient.executeTask('CALCULATE_DESCRIPTIVE_STATS', {
        datasetId: activeDataset.id,
        columns: activeDataset.columns,
        options: { treatWhitespaceAsMissing: true }
      });

      activeTaskIdRef.current = taskId;

      promise
        .then((payload) => {
          const res = payload as WorkerCalculateDescriptiveStatsSuccessResponse['payload'];
          // Hanya simpan jika dataset masih sesuai dengan yang aktif saat ini
          if (activeDataset.id === res.datasetId) {
            store.setDescriptiveStats(res.stats);
          }
        })
        .catch((err: Error) => {
          if (err.message !== 'Task Cancelled') {
            console.error('Gagal menghitung statistik deskriptif:', err);
            setCalcError(err.message || 'Gagal menghitung statistik deskriptif.');
          }
        })
        .finally(() => {
          inFlightRef.current = false;
          activeTaskIdRef.current = null;
        });
    }
  }, [activeDataset, descriptiveStats, storeError, calcError, store, _testState]);

  // Bersihkan tugas aktif jika komponen di-unmount atau dataset ID berubah
  useEffect(() => {
    return () => {
      if (activeTaskIdRef.current) {
        workerClient.cancelTask(activeTaskIdRef.current);
        activeTaskIdRef.current = null;
        inFlightRef.current = false;
      }
    };
  }, [activeDataset?.id]);

  const handleCancel = () => {
    if (activeTaskIdRef.current) {
      workerClient.cancelTask(activeTaskIdRef.current);
      activeTaskIdRef.current = null;
      inFlightRef.current = false;
      setCalcError('Perhitungan statistik dibatalkan oleh pengguna.');
    }
  };

  const handleRetry = () => {
    inFlightRef.current = false;
    setCalcError(null);
    store.setDescriptiveStats(null);
  };

  // 1. Error State
  if (storeError || calcError) {
    const displayError = calcError || storeError;
    return (
      <Card className="mb-6 border-l-4 border-l-red-500 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Kesalahan Statistik Deskriptif
            </span>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Coba Lagi
            </button>
          </CardTitle>
          <CardDescription className="text-red-700 text-xs">
            {displayError}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // 2. Loading State
  if (isCalculating || (isProcessing && !descriptiveStats)) {
    return (
      <Card className="mb-6 border-l-4 border-l-[#0f766e] shadow-xs">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <Loader2 className="h-4 w-4 text-[#0f766e] animate-spin" />
              Menghitung Statistik Deskriptif...
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Mengevaluasi mean, standar deviasi sampel, kuartil Type-7, modus, dan sebaran frekuensi di Web Worker.
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]"
          >
            Batal
          </button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 pt-2">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // 3. Empty State (Belum ada dataset aktif)
  if (!activeDataset) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-[#0f766e]">
              <Sigma className="h-4 w-4 text-[#0f766e]" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Statistik Deskriptif</h1>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200/60 px-2.5 py-1 rounded-full font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Belum ada dataset
            <span className="sr-only">Belum Ada Statistik Deskriptif</span>
          </span>
        </div>
        <div className="flex flex-col items-center justify-center py-14 text-center px-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
            <BarChart3 className="h-6 w-6 text-slate-400" />
          </div>
          <h4 className="text-sm font-bold text-slate-800 mb-1">
            Belum Ada Statistik untuk Ditampilkan
          </h4>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-4">
            Unggah dataset CSV atau Excel untuk menghitung ringkasan statistik numerik dan kategorikal secara komprehensif.
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

  // Verifikasi apakah descriptiveStats cocok dengan dataset aktif
  const statsMatch = descriptiveStats && descriptiveStats.datasetId === activeDataset.id;
  if (!statsMatch) {
    return null;
  }

  // Pisahkan statistik numerik dan kategorikal
  const numericColumnStats = descriptiveStats.columnStats.filter((c) => c.numericStats !== undefined);
  const categoricalColumnStats = descriptiveStats.columnStats.filter((c) => c.categoricalStats !== undefined);

  // Konfigurasi baris metrik numerik sesuai PRD 6.5.6 & PRD Bagian 4.3
  const NUMERIC_METRICS = [
    {
      id: 'count',
      label: 'Count (N Valid)',
      description: 'Jumlah observasi valid non-null',
      getValue: (s: NumericColumnStats) => formatInteger(s.count),
    },
    {
      id: 'missing',
      label: 'Missing Count',
      description: 'Jumlah observasi kosong atau tidak valid',
      getValue: (s: NumericColumnStats) => (
        s.missing > 0 ? (
          <span className="inline-flex items-center gap-1 text-amber-700 font-medium font-mono tabular-nums">
            {formatInteger(s.missing)}
          </span>
        ) : (
          formatInteger(s.missing)
        )
      ),
    },
    {
      id: 'sum',
      label: 'Sum',
      description: 'Penjumlahan total IEEE 754 float64',
      getValue: (s: NumericColumnStats) => formatContinuous(s.sum),
    },
    {
      id: 'mean',
      label: 'Mean (Rata-rata)',
      description: 'Rata-rata hitung sampel',
      getValue: (s: NumericColumnStats) => formatContinuous(s.mean),
    },
    {
      id: 'median',
      label: 'Median (Q2)',
      description: 'Nilai tengah (Persentil 50%, Linear Interpolation Type-7)',
      getValue: (s: NumericColumnStats) => formatContinuous(s.median),
    },
    {
      id: 'mode',
      label: 'Modus (Mode)',
      description: 'Nilai kemunculan tertinggi dengan evaluasi tie-breaking',
      getValue: (s: NumericColumnStats) => {
        if (!s.mode || s.mode.length === 0) {
          if (s.count > 1) {
            return (
              <span
                className="text-slate-500 italic text-xs cursor-help"
                title="Semua observasi bernilai unik (frekuensi masing-masing = 1)"
              >
                Tidak Ada Modus
              </span>
            );
          }
          return <span className="text-slate-400 font-mono text-xs">N/A</span>;
        }

        const primaryMode = s.mode[0];

        if (s.mode.length === 1) {
          return (
            <span className="tabular-nums font-mono text-slate-800" title={primaryMode.toString()}>
              {primaryMode.toFixed(4)}
            </span>
          );
        }

        // Multimodal ties
        return (
          <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
            <span className="tabular-nums font-mono text-slate-800 font-medium">
              {primaryMode.toFixed(4)}
            </span>
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-50 text-[#0f766e] border border-teal-200 cursor-help"
              title={`Multimodal: [${s.mode.map((v) => v.toFixed(4)).join(', ')}]`}
            >
              Multimodal ({s.mode.length} nilai)
            </span>
          </div>
        );
      },
    },
    {
      id: 'standardDeviation',
      label: 'Sample Std Dev (s)',
      description: "Standar deviasi sampel dengan koreksi Bessel (ddof=1, pembagi N-1)",
      getValue: (s: NumericColumnStats) =>
        formatContinuous(s.standardDeviation, { isVarianceOrStdDev: true, count: s.count }),
    },
    {
      id: 'variance',
      label: 'Sample Variance (s²)',
      description: "Varians sampel dengan koreksi Bessel (ddof=1, pembagi N-1)",
      getValue: (s: NumericColumnStats) =>
        formatContinuous(s.variance, { isVarianceOrStdDev: true, count: s.count }),
    },
    {
      id: 'min',
      label: 'Minimum',
      description: 'Nilai observasi terkecil',
      getValue: (s: NumericColumnStats) => formatContinuous(s.min),
    },
    {
      id: 'max',
      label: 'Maksimum',
      description: 'Nilai observasi terbesar',
      getValue: (s: NumericColumnStats) => formatContinuous(s.max),
    },
    {
      id: 'q1',
      label: 'Kuartil 1 (Q1 - 25%)',
      description: 'Persentil 25% berbasis Linear Interpolation Type-7',
      getValue: (s: NumericColumnStats) => formatContinuous(s.q1),
    },
    {
      id: 'q3',
      label: 'Kuartil 3 (Q3 - 75%)',
      description: 'Persentil 75% berbasis Linear Interpolation Type-7',
      getValue: (s: NumericColumnStats) => formatContinuous(s.q3),
    },
    {
      id: 'iqr',
      label: 'IQR (Interquartile Range)',
      description: 'Rentang antarkuartil (Q3 - Q1)',
      getValue: (s: NumericColumnStats) => formatContinuous(s.iqr),
    },
  ];

  // Konfigurasi baris metrik kategorikal sesuai PRD 6.5.6
  const CATEGORICAL_METRICS = [
    {
      id: 'count',
      label: 'Count (N Valid)',
      description: 'Jumlah observasi teks/kategori valid non-null',
      getValue: (s: CategoricalColumnStats) => formatInteger(s.count),
    },
    {
      id: 'missing',
      label: 'Missing Count',
      description: 'Jumlah sel teks kosong atau whitespace',
      getValue: (s: CategoricalColumnStats) => (
        s.missing > 0 ? (
          <span className="inline-flex items-center gap-1 text-amber-700 font-medium font-mono tabular-nums">
            {formatInteger(s.missing)}
          </span>
        ) : (
          formatInteger(s.missing)
        )
      ),
    },
    {
      id: 'uniqueCount',
      label: 'Nilai Unik (Unique Count)',
      description: 'Jumlah kategori unik yang berbeda',
      getValue: (s: CategoricalColumnStats) => formatInteger(s.uniqueCount),
    },
    {
      id: 'topValue',
      label: 'Nilai Teratas (Top Value)',
      description: 'Kategori dengan kemunculan paling banyak',
      getValue: (s: CategoricalColumnStats) =>
        s.topValue !== null ? (
          <span className="font-mono bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-xs truncate max-w-[150px] inline-block align-middle" title={s.topValue}>
            {s.topValue}
          </span>
        ) : (
          <span className="text-slate-400 font-mono text-xs">N/A</span>
        ),
    },
    {
      id: 'topValueFrequency',
      label: 'Frekuensi Nilai Teratas',
      description: 'Jumlah kemunculan kategori teratas beserta proporsinya',
      getValue: (s: CategoricalColumnStats) => {
        if (s.topValueFrequency === null || s.count === 0) {
          return <span className="text-slate-400 font-mono text-xs">N/A</span>;
        }
        const pct = (s.topValueFrequency / s.count) * 100;
        return (
          <span className="inline-flex items-baseline gap-1.5 font-mono tabular-nums text-slate-800">
            <span>{new Intl.NumberFormat('id-ID').format(s.topValueFrequency)}</span>
            <span className="text-[11px] text-slate-500 font-normal">({pct.toFixed(2)}%)</span>
          </span>
        );
      },
    },
    {
      id: 'frequencies',
      label: 'Frekuensi Kategorikal',
      description: 'Distribusi frekuensi absolut dan relatif seluruh kategori',
      getValue: (s: CategoricalColumnStats, colName: string) => {
        if (s.frequencies.length === 0) {
          return <span className="text-slate-400 text-xs">Kosong</span>;
        }

        const top3 = s.frequencies.slice(0, 3);
        return (
          <div className="flex flex-col gap-1 items-end">
            <div className="flex flex-wrap gap-1 justify-end max-w-xs">
              {top3.map((f, i) => (
                <span
                  key={`${f.value}-${i}`}
                  className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono truncate max-w-[120px]"
                  title={`${f.value}: ${f.count} (${f.percentage.toFixed(2)}%)`}
                >
                  {f.value}: {f.count}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSelectedCategoryModal({ columnName: colName, stats: s })}
              className="text-[11px] font-semibold text-[#0f766e] hover:text-[#0d9488] hover:underline transition-colors mt-0.5 inline-flex items-center gap-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#0f766e]"
            >
              Lihat Distribusi ({s.frequencies.length})
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs mb-6">
      {/* Header Kartu Statistik */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E] border border-teal-100/70 shadow-2xs mt-0.5">
            <Sigma className="h-5 w-5 text-[#0F766E]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Statistik Deskriptif
              </h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/70">
                {activeDataset.name}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-[#0F766E] border border-teal-200/60 font-mono">
                {activeDataset.columns.length} Kolom
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
              Kalkulasi matematis presisi di Web Worker (koreksi Bessel s², persentil Linear Type-7, dan evaluasi multimodal).
            </p>
          </div>
        </div>

        {/* Kontrol Tab & Opsi Tata Letak */}
        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          {/* Tab Numerik vs Kategorikal */}
          <div
            className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/60"
            role="tablist"
            aria-label="Pilih Tipe Statistik"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'numeric'}
              onClick={() => setActiveTab('numeric')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'numeric'
                  ? 'bg-white text-[#0F766E] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              } focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]`}
            >
              <span>Metrik Numerik</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === 'numeric' ? 'bg-teal-50 text-[#0F766E]' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {numericColumnStats.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'categorical'}
              onClick={() => setActiveTab('categorical')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'categorical'
                  ? 'bg-white text-[#0F766E] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              } focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]`}
            >
              <span>Metrik Kategorikal</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === 'categorical' ? 'bg-teal-50 text-[#0F766E]' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {categoricalColumnStats.length}
              </span>
            </button>
          </div>

          {/* Tombol Transpose / Tukar Baris-Kolom */}
          <button
            type="button"
            onClick={() => setIsTransposed(!isTransposed)}
            className={`p-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              isTransposed
                ? 'bg-teal-50 border-teal-200 text-[#0F766E]'
                : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'
            } focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]`}
            title={isTransposed ? 'Tampilan: Variabel per Baris (Aktif)' : 'Tukar Baris & Kolom (Transpose)'}
            aria-label="Tukar baris dan kolom tampilan statistik"
          >
            <ArrowUpDown className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">
              {isTransposed ? 'Variabel per Baris' : 'Metrik per Baris'}
            </span>
          </button>
        </div>
      </div>

      {/* Quick Summary Context Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3 bg-slate-50/80 border-b border-slate-100 text-xs">
        <div className="flex flex-col">
          <span className="text-slate-500 font-medium text-[11px]">Total Observasi (N)</span>
          <span className="font-mono tabular-nums font-bold text-slate-900 text-sm">
            {new Intl.NumberFormat('id-ID').format(descriptiveStats.totalRecords)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-500 font-medium text-[11px]">Variabel Numerik</span>
          <span className="font-mono tabular-nums font-bold text-slate-900 text-sm">
            {numericColumnStats.length} kolom
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-500 font-medium text-[11px]">Variabel Kategorikal</span>
          <span className="font-mono tabular-nums font-bold text-slate-900 text-sm">
            {categoricalColumnStats.length} kolom
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-500 font-medium text-[11px]">Mode Tampilan</span>
          <span className="font-mono font-semibold text-[#0F766E] text-xs mt-0.5">
            {isTransposed ? 'Variabel per Baris' : 'Metrik per Baris'}
          </span>
        </div>
      </div>

      {/* Konten Tab Statistik Numerik */}
      {activeTab === 'numeric' && (
        <div>
          {numericColumnStats.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mx-auto mb-3">
                <Info className="h-5 w-5 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Dataset tidak memiliki kolom bertipe Numerik</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Semua kolom saat ini teridentifikasi sebagai teks, kategorikal, tanggal, atau boolean. Anda dapat mengubah tipe kolom di Pratinjau Dataset jika perlu.
              </p>
            </div>
          ) : !isTransposed ? (
            // Default PRD 6.5.6: Kolom sebagai variabel, Baris sebagai metrik
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200">
                    {/* Header Metrik Kolom Tetap (Sticky) */}
                    <th
                      scope="col"
                      className="sticky left-0 z-10 bg-slate-50 py-3.5 px-4 font-bold text-slate-800 border-r border-slate-200/80 min-w-[210px] shadow-2xs"
                    >
                      Metrik / Statistik
                    </th>
                    {/* Header untuk setiap Kolom Numerik */}
                    {numericColumnStats.map((col) => (
                      <th
                        key={col.columnId}
                        scope="col"
                        className="py-3.5 px-4 font-bold text-slate-800 text-right min-w-[160px] whitespace-nowrap"
                      >
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-semibold text-slate-900 truncate max-w-[180px]" title={col.columnName}>
                            {col.columnName}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 border border-sky-200/60 font-mono">
                            Numeric
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {NUMERIC_METRICS.map((metric, metricIdx) => (
                    <tr
                      key={metric.id}
                      className={metricIdx % 2 === 0 ? 'bg-white hover:bg-teal-50/20' : 'bg-slate-50/40 hover:bg-teal-50/20'}
                    >
                      {/* Label Metrik Sticky di Kiri */}
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-inherit py-2.5 px-4 font-semibold text-slate-700 border-r border-slate-200/80 shadow-2xs whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5" title={metric.description}>
                          <span>{metric.label}</span>
                        </div>
                      </th>
                      {/* Nilai untuk setiap variabel */}
                      {numericColumnStats.map((col) => (
                        <td
                          key={`${col.columnId}-${metric.id}`}
                          className="py-2.5 px-4 text-right whitespace-nowrap"
                        >
                          {col.numericStats ? metric.getValue(col.numericStats) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            // Mode Transposed: Kolom sebagai metrik, Baris sebagai variabel
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200">
                    <th
                      scope="col"
                      className="sticky left-0 z-10 bg-slate-50 py-3.5 px-4 font-bold text-slate-800 border-r border-slate-200/80 min-w-[180px] shadow-2xs"
                    >
                      Variabel / Kolom
                    </th>
                    {NUMERIC_METRICS.map((metric) => (
                      <th
                        key={metric.id}
                        scope="col"
                        className="py-3.5 px-4 font-bold text-slate-800 text-right min-w-[130px] whitespace-nowrap"
                        title={metric.description}
                      >
                        {metric.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {numericColumnStats.map((col, rowIdx) => (
                    <tr
                      key={col.columnId}
                      className={rowIdx % 2 === 0 ? 'bg-white hover:bg-teal-50/20' : 'bg-slate-50/40 hover:bg-teal-50/20'}
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-inherit py-2.5 px-4 font-semibold text-slate-900 border-r border-slate-200/80 shadow-2xs whitespace-nowrap"
                      >
                        <span className="truncate max-w-[160px] inline-block align-middle" title={col.columnName}>
                          {col.columnName}
                        </span>
                      </th>
                      {NUMERIC_METRICS.map((metric) => (
                        <td
                          key={`${col.columnId}-${metric.id}`}
                          className="py-2.5 px-4 text-right whitespace-nowrap"
                        >
                          {col.numericStats ? metric.getValue(col.numericStats) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Konten Tab Statistik Kategorikal */}
      {activeTab === 'categorical' && (
        <div>
          {categoricalColumnStats.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mx-auto mb-3">
                <Info className="h-5 w-5 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Dataset tidak memiliki kolom bertipe Kategorikal / Teks</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Seluruh variabel saat ini bertipe numerik. Anda dapat menetapkan tipe kolom ke Categorical atau Text di Pratinjau jika diperlukan.
              </p>
            </div>
          ) : !isTransposed ? (
            // Default PRD 6.5.6: Kolom sebagai variabel, Baris sebagai metrik
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200">
                    <th
                      scope="col"
                      className="sticky left-0 z-10 bg-slate-50 py-3.5 px-4 font-bold text-slate-800 border-r border-slate-200/80 min-w-[210px] shadow-2xs"
                    >
                      Metrik / Statistik
                    </th>
                    {categoricalColumnStats.map((col) => (
                      <th
                        key={col.columnId}
                        scope="col"
                        className="py-3.5 px-4 font-bold text-slate-800 text-right min-w-[180px] whitespace-nowrap"
                      >
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-semibold text-slate-900 truncate max-w-[180px]" title={col.columnName}>
                            {col.columnName}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                            {col.type}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {CATEGORICAL_METRICS.map((metric, metricIdx) => (
                    <tr
                      key={metric.id}
                      className={metricIdx % 2 === 0 ? 'bg-white hover:bg-teal-50/20' : 'bg-slate-50/40 hover:bg-teal-50/20'}
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-inherit py-2.5 px-4 font-semibold text-slate-700 border-r border-slate-200/80 shadow-2xs whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5" title={metric.description}>
                          <span>{metric.label}</span>
                        </div>
                      </th>
                      {categoricalColumnStats.map((col) => (
                        <td
                          key={`${col.columnId}-${metric.id}`}
                          className="py-2.5 px-4 text-right"
                        >
                          {col.categoricalStats ? metric.getValue(col.categoricalStats, col.columnName) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            // Mode Transposed: Kolom sebagai metrik, Baris sebagai variabel
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200">
                    <th
                      scope="col"
                      className="sticky left-0 z-10 bg-slate-50 py-3.5 px-4 font-bold text-slate-800 border-r border-slate-200/80 min-w-[180px] shadow-2xs"
                    >
                      Variabel / Kolom
                    </th>
                    {CATEGORICAL_METRICS.map((metric) => (
                      <th
                        key={metric.id}
                        scope="col"
                        className="py-3.5 px-4 font-bold text-slate-800 text-right min-w-[140px] whitespace-nowrap"
                        title={metric.description}
                      >
                        {metric.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categoricalColumnStats.map((col, rowIdx) => (
                    <tr
                      key={col.columnId}
                      className={rowIdx % 2 === 0 ? 'bg-white hover:bg-teal-50/20' : 'bg-slate-50/40 hover:bg-teal-50/20'}
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-inherit py-2.5 px-4 font-semibold text-slate-900 border-r border-slate-200/80 shadow-2xs whitespace-nowrap"
                      >
                        <span className="truncate max-w-[160px] inline-block align-middle" title={col.columnName}>
                          {col.columnName}
                        </span>
                      </th>
                      {CATEGORICAL_METRICS.map((metric) => (
                        <td
                          key={`${col.columnId}-${metric.id}`}
                          className="py-2.5 px-4 text-right"
                        >
                          {col.categoricalStats ? metric.getValue(col.categoricalStats, col.columnName) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Footer Ringkasan */}
      <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <span>
            Total Record: <strong className="text-slate-800 font-mono tabular-nums">{new Intl.NumberFormat('id-ID').format(descriptiveStats.totalRecords)}</strong>
          </span>
          <span className="text-slate-300">|</span>
          <span>
            Variabel: <strong className="text-slate-800 font-mono tabular-nums">{numericColumnStats.length}</strong> Numerik, <strong className="text-slate-800 font-mono tabular-nums">{categoricalColumnStats.length}</strong> Kategorikal
          </span>
        </div>
        <div className="text-[11px] text-slate-400">
          Arahkan kursor ke angka untuk melihat presisi numerik penuh.
        </div>
      </div>

      {/* Modal Distribusi Frekuensi jika dibuka */}
      {selectedCategoryModal && (
        <CategoryDistributionModal
          columnName={selectedCategoryModal.columnName}
          totalRecords={descriptiveStats.totalRecords}
          stats={selectedCategoryModal.stats}
          onClose={() => setSelectedCategoryModal(null)}
        />
      )}
    </div>
  );
}
