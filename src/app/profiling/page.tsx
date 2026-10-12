'use client';

import React from 'react';
import Link from 'next/link';
import { useDatasetStore } from '@/store/dataset-store';
import { DataQualitySummary } from '@/components/DataQualitySummary';
import { ShieldCheck, ArrowRight, Table2, Hash, FileSpreadsheet } from 'lucide-react';
import { DataType } from '@/types';

export interface ProfilingPageProps {
  _testDataset?: import('@/types').Dataset | null;
}

// Badge visual styling per tipe data sesuai Design System
function getTypeBadgeStyle(type: DataType): { bg: string; text: string; border: string } {
  switch (type) {
    case 'Numeric':
      return { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200/70' };
    case 'Categorical':
      return { bg: 'bg-teal-50', text: 'text-[#0F766E]', border: 'border-teal-200/70' };
    case 'DateTime':
      return { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200/70' };
    case 'Boolean':
      return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200/70' };
    case 'Text':
    default:
      return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200/70' };
  }
}

export default function ProfilingPage({ _testDataset }: ProfilingPageProps = {}) {
  const store = useDatasetStore();
  const activeDataset = _testDataset !== undefined ? _testDataset : store.activeDataset;
  const previewRow = store.datasetPreview?.[0];
  const qualityStats = store.dataQualityStats;

  if (!activeDataset) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-[#0F766E]">
              <ShieldCheck className="h-4 w-4 text-[#0F766E]" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Profiling & Kualitas Data</h1>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200/60 px-2.5 py-1 rounded-full font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Belum ada dataset
          </span>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
            <ShieldCheck className="h-6 w-6 text-slate-400" />
          </div>
          <h4 className="text-sm font-bold text-slate-800 mb-1">
            Belum Ada Dataset untuk Profiling
          </h4>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-4">
            Unggah dataset Anda di Beranda untuk menganalisis integritas data, deteksi missing values, dan deteksi baris duplikat.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#0F766E] text-white hover:bg-[#115E59] transition-colors shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
          >
            Unggah Dataset di Beranda
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Halaman Profiling */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E] border border-teal-100/70 shadow-2xs mt-0.5">
            <ShieldCheck className="h-6 w-6 text-[#0F766E]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Profiling & Kualitas Data
              </h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/70">
                <FileSpreadsheet className="h-3 w-3 text-slate-500" />
                {activeDataset.name}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
              Audit integritas dataset mencakup deteksi nilai hilang (native &amp; dirty whitespace) dan duplikasi baris.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200/70 self-start sm:self-auto shrink-0 font-mono">
          <span className="font-semibold text-slate-800">
            {new Intl.NumberFormat('id-ID').format(activeDataset.rowCount)} baris
          </span>
          <span className="text-slate-300">|</span>
          <span className="font-semibold text-slate-800">{activeDataset.columnCount} kolom</span>
        </div>
      </div>

      {/* Komponen Ringkasan Kualitas Data (FND-06) */}
      <section className="w-full">
        <DataQualitySummary _testDataset={activeDataset} />
      </section>

      {/* Profil Skema Kolom */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-[#0F766E]" />
            <h3 className="text-base font-bold text-slate-900">Skema & Profil Tipe Kolom</h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {activeDataset.columns.length} kolom terdefinisi
          </span>
        </div>

        <div className="border border-slate-200/80 rounded-xl overflow-x-auto shadow-2xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th scope="col" className="py-2.5 px-4 min-w-[180px]">Nama Kolom</th>
                <th scope="col" className="py-2.5 px-4 min-w-[130px]">Tipe Data Terdeteksi</th>
                <th scope="col" className="py-2.5 px-4 min-w-[150px]">Observasi Valid / Kosong</th>
                <th scope="col" className="py-2.5 px-4 min-w-[130px]">Kepercayaan Inferensi</th>
                <th scope="col" className="py-2.5 px-4 min-w-[120px]">Format Regional</th>
                <th scope="col" className="py-2.5 px-4 min-w-[140px]">Sampel Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {activeDataset.columns.map((col) => {
                const badge = getTypeBadgeStyle(col.type);
                const colStat = qualityStats?.columnStats.find(
                  (s) => s.columnId === col.id || s.columnId === col.name
                );

                const missingCount = colStat ? colStat.effectiveMissingCount : 0;
                const validCount = Math.max(0, activeDataset.rowCount - missingCount);
                const missingPct = colStat ? colStat.effectiveMissingPercentage : 0;

                const rawSample = previewRow
                  ? (previewRow[col.id] !== undefined ? previewRow[col.id] : previewRow[col.name])
                  : undefined;
                const sampleText =
                  rawSample !== undefined && rawSample !== null && rawSample !== ''
                    ? String(rawSample)
                    : '—';

                return (
                  <tr key={col.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Nama Kolom */}
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="font-mono font-medium text-slate-900 truncate max-w-[200px]"
                          title={col.name}
                        >
                          {col.name}
                        </span>
                        {col.profile?.isIdentifier && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200/60"
                            title="Kolom diidentifikasi sebagai Primary Key / Identifier"
                          >
                            <Hash className="h-2.5 w-2.5" />
                            ID
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Tipe Data Terdeteksi */}
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold font-mono border ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {col.type}
                      </span>
                    </td>

                    {/* Observasi Valid / Kosong */}
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900">
                          {new Intl.NumberFormat('id-ID').format(validCount)}
                        </span>
                        {missingCount > 0 ? (
                          <span className="text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/60">
                            +{new Intl.NumberFormat('id-ID').format(missingCount)} ({missingPct.toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1 py-0.2 rounded">
                            Lengkap
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Kepercayaan Inferensi */}
                    <td className="py-2.5 px-4 text-slate-600 font-mono tabular-nums">
                      {col.profile ? (
                        <div className="inline-flex items-center gap-1.5">
                          <span>{col.profile.confidenceScore}%</span>
                          <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                            <div
                              className="h-full bg-[#0F766E] rounded-full"
                              style={{ width: `${Math.min(100, Math.max(0, col.profile.confidenceScore))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Format Regional */}
                    <td className="py-2.5 px-4 text-slate-500 font-medium">
                      {col.profile?.regionalFormat || 'Standar'}
                    </td>

                    {/* Pratinjau Nilai Sampel */}
                    <td className="py-2.5 px-4">
                      <span
                        className="font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60 truncate max-w-[150px] inline-block align-middle"
                        title={sampleText}
                      >
                        {sampleText}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
