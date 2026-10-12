'use client';

import React, { useEffect, useState } from 'react';
import { useDatasetStore } from '@/store/dataset-store';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldCheck,
  Copy,
  Eraser,
  FileDigit,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { workerClient } from '@/lib/worker-client';
import { Dataset, WorkerCalculateStatsSuccessResponse } from '@/types';

export interface DataQualitySummaryProps {
  _testDataset?: Dataset | null;
}

export function DataQualitySummary({ _testDataset }: DataQualitySummaryProps = {}) {
  const store = useDatasetStore();
  const activeDataset = _testDataset !== undefined ? _testDataset : store.activeDataset;
  const { dataQualityStats, setDataQualityStats, isProcessing, error } = store;

  const [calcError, setCalcError] = useState<string | null>(null);

  useEffect(() => {
    // Jika tidak ada dataset, lewati
    if (!activeDataset) return;

    // Jika _testDataset diberikan dari mock/test tanpa kalkulasi worker, lewati pemanggilan worker
    if (_testDataset && !store.activeDataset) return;

    if (!dataQualityStats && !isProcessing && !error && !calcError) {
      // Trigger perhitungan kualitas data di Worker
      const { promise } = workerClient.executeTask('CALCULATE_STATS', {
        datasetId: activeDataset.id,
        columns: activeDataset.columns,
        options: { treatWhitespaceAsMissing: true },
      });

      promise
        .then((payload) => {
          const res = payload as WorkerCalculateStatsSuccessResponse['payload'];
          if (activeDataset.id === res.datasetId) {
            setDataQualityStats(res.stats);
            setCalcError(null);
          }
        })
        .catch((err: Error) => {
          if (err.message !== 'Task Cancelled') {
            console.error('Gagal menghitung statistik kualitas data:', err);
            setCalcError(err.message || 'Gagal menghitung kualitas data.');
          }
        });
    }
  }, [activeDataset, dataQualityStats, isProcessing, error, calcError, setDataQualityStats, _testDataset, store.activeDataset]);

  if (!activeDataset) return null;

  const handleRetry = () => {
    setCalcError(null);
    setDataQualityStats(null);
  };

  // State Error
  if (calcError) {
    return (
      <div className="bg-white border border-rose-200 rounded-2xl p-6 shadow-xs mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-rose-700">
            <AlertCircle className="h-5 w-5 text-rose-600" />
            <div>
              <h4 className="text-sm font-bold text-slate-900">Gagal Menganalisis Kualitas Data</h4>
              <p className="text-xs text-rose-600 mt-0.5">{calcError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors border border-rose-200/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  // State Loading / Sedang Dihitung
  if (isProcessing && !dataQualityStats) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs mb-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div>
              <Skeleton className="h-5 w-48 mb-1.5" />
              <Skeleton className="h-3.5 w-64" />
            </div>
          </div>
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!dataQualityStats) return null;

  const {
    totalRecords,
    totalEffectiveMissing,
    totalNativeMissing,
    totalWhitespace,
    duplicateOccurrences,
    rowsParticipatingInDuplicates,
    columnStats,
  } = dataQualityStats;

  const totalCells = totalRecords * activeDataset.columnCount;
  const duplicatePercentage = totalRecords > 0 ? (rowsParticipatingInDuplicates / totalRecords) * 100 : 0;
  const missingPercentage =
    totalRecords > 0 && activeDataset.columnCount > 0
      ? (totalEffectiveMissing / totalCells) * 100
      : 0;

  const healthScore = Math.max(
    0,
    Math.min(100, Math.round(100 - missingPercentage * 0.7 - duplicatePercentage * 0.3))
  );

  const isHealthy = healthScore >= 90;
  const isModerate = healthScore >= 70 && healthScore < 90;

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs mb-6">
      {/* Executive Header & Integrity Summary */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-slate-100">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E] border border-teal-100/70 shadow-2xs mt-0.5">
            <ShieldCheck className="h-6 w-6 text-[#0F766E]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                Ringkasan Kualitas Data
              </h3>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  isHealthy
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : isModerate
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {isHealthy ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : isModerate ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                )}
                Skor Integritas: {healthScore}/100
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Analisis integritas nilai kosong (native &amp; dirty whitespace) dan duplikasi baris.
            </p>
          </div>
        </div>

        {/* Health Completeness Indicator */}
        <div className="w-full lg:w-72 bg-slate-50 border border-slate-200/70 p-3.5 rounded-xl self-start lg:self-auto shrink-0">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <span className="text-slate-600 font-semibold">Kelengkapan Data</span>
            <span className="font-mono tabular-nums text-slate-900 font-bold">
              {(100 - missingPercentage).toFixed(1)}%
            </span>
          </div>
          <div className="h-2.5 w-full bg-slate-200/80 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isHealthy ? 'bg-[#0F766E]' : isModerate ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.max(2, 100 - missingPercentage)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 flex justify-between">
            <span>Valid non-null</span>
            <span className="font-mono tabular-nums">
              {new Intl.NumberFormat('id-ID').format(Math.max(0, totalCells - totalEffectiveMissing))} / {new Intl.NumberFormat('id-ID').format(totalCells)} sel
            </span>
          </p>
        </div>
      </div>

      {/* 4 Diagnostic Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6 mb-6">
        {/* Card 1: Native Missing */}
        <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Eraser className="h-3.5 w-3.5 text-slate-500" />
              Native Missing
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-600">
              Null / Blank
            </span>
          </div>
          <div className="mt-3.5">
            <p className="text-2xl font-extrabold tabular-nums font-mono text-slate-900 tracking-tight">
              {new Intl.NumberFormat('id-ID').format(totalNativeMissing)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Sel kosong / null</p>
          </div>
        </div>

        {/* Card 2: Dirty Whitespace */}
        <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between transition-all">
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-help"
              title="String yang hanya berisi spasi atau tab."
            >
              <FileDigit className="h-3.5 w-3.5 text-amber-600" />
              Dirty Whitespace
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60">
              Spasi Kotor
            </span>
          </div>
          <div className="mt-3.5">
            <p className="text-2xl font-extrabold tabular-nums font-mono text-slate-900 tracking-tight">
              {new Intl.NumberFormat('id-ID').format(totalWhitespace)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Spasi/tab tanpa konten</p>
          </div>
        </div>

        {/* Card 3: Duplicate Rows */}
        <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Copy className="h-3.5 w-3.5 text-blue-600" />
              Baris Duplikat
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/60">
              Exact Match
            </span>
          </div>
          <div className="mt-3.5">
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-extrabold tabular-nums font-mono text-slate-900 tracking-tight">
                {new Intl.NumberFormat('id-ID').format(duplicateOccurrences)}
              </p>
              <span className="text-xs font-mono font-semibold text-slate-500">
                ({duplicatePercentage.toFixed(1)}%)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Kemunculan baris identik</p>
          </div>
        </div>

        {/* Card 4: Effective Missing */}
        <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#0F766E]" />
              Effective Missing
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-50 text-[#0F766E] border border-teal-200/60">
              Total Hilang
            </span>
          </div>
          <div className="mt-3.5">
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-extrabold tabular-nums font-mono text-slate-900 tracking-tight">
                {new Intl.NumberFormat('id-ID').format(totalEffectiveMissing)}
              </p>
              <span className="text-xs font-mono font-semibold text-slate-500">
                ({missingPercentage.toFixed(2)}%)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Total native + whitespace</p>
          </div>
        </div>
      </div>

      {/* Tabel Rincian Kolom */}
      <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200/80 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-[#0F766E]" />
            Audit Integritas per Kolom
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            {columnStats.length} atribut dianalisis
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50/70 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th scope="col" className="px-4 py-2.5">Kolom</th>
                <th scope="col" className="px-4 py-2.5 text-right">Native Missing</th>
                <th scope="col" className="px-4 py-2.5 text-right">Whitespace</th>
                <th scope="col" className="px-4 py-2.5 text-right">% Kosong</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {columnStats.map((stat) => (
                <tr key={stat.columnId} className="hover:bg-slate-50/70 transition-colors">
                  <td
                    className="px-4 py-2.5 font-mono font-medium text-slate-800 truncate max-w-[220px]"
                    title={stat.columnId}
                  >
                    {stat.columnId}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {new Intl.NumberFormat('id-ID').format(stat.nativeMissingCount)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                    {stat.whitespaceCount > 0 ? (
                      <span className="text-amber-700 font-semibold">
                        {new Intl.NumberFormat('id-ID').format(stat.whitespaceCount)}
                      </span>
                    ) : (
                      '0'
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-800">
                    <div className="inline-flex items-center gap-2 justify-end">
                      <span>{stat.effectiveMissingPercentage.toFixed(2)}%</span>
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            stat.effectiveMissingPercentage > 20
                              ? 'bg-rose-500'
                              : stat.effectiveMissingPercentage > 0
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{
                            width: `${Math.min(100, Math.max(0, stat.effectiveMissingPercentage))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
