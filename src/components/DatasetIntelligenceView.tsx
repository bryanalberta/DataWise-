'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Database,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  BarChart3,
  LineChart as LineChartIcon,
  Eraser,
  Fingerprint,
  Tag,
  Calendar,
  Hash,
  DollarSign,
  Percent,
  Clock,
  ToggleLeft,
  FileText,
  Ban,
  Activity,
  Boxes,
} from 'lucide-react';
import { useDatasetStore } from '@/store/dataset-store';
import { workerClient } from '@/lib/worker-client';
import {
  Dataset,
  DatasetIntelligenceResult,
  DatasetFamily,
  SemanticColumnRole,
  IntelligenceConfidence,
  FindingCategory,
  DataType,
} from '@/types';
import { getRoleLabel } from '@/lib/dataset-intelligence';

export interface DatasetIntelligenceViewProps {
  readonly _testDataset?: Dataset | null;
  readonly _testIntelligence?: DatasetIntelligenceResult | null;
}

// Visual badge per tipe data
function getDataTypeBadge(type: DataType) {
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

// Icon & style per semantic column role
function getSemanticRoleConfig(role: SemanticColumnRole) {
  switch (role) {
    case 'IDENTIFIER':
      return {
        icon: Fingerprint,
        bg: 'bg-violet-50',
        text: 'text-violet-700',
        border: 'border-violet-200/70',
      };
    case 'NAME_LABEL':
      return {
        icon: Tag,
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200/70',
      };
    case 'CATEGORY':
      return {
        icon: Boxes,
        bg: 'bg-teal-50',
        text: 'text-[#0F766E]',
        border: 'border-teal-200/70',
      };
    case 'DATE_TIME':
      return {
        icon: Calendar,
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-200/70',
      };
    case 'NUMERIC_METRIC':
      return {
        icon: Hash,
        bg: 'bg-sky-50',
        text: 'text-sky-700',
        border: 'border-sky-200/70',
      };
    case 'CURRENCY':
      return {
        icon: DollarSign,
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200/70',
      };
    case 'PERCENTAGE':
      return {
        icon: Percent,
        bg: 'bg-cyan-50',
        text: 'text-cyan-700',
        border: 'border-cyan-200/70',
      };
    case 'DURATION':
      return {
        icon: Clock,
        bg: 'bg-orange-50',
        text: 'text-orange-800',
        border: 'border-orange-200/70',
      };
    case 'BOOLEAN':
      return {
        icon: ToggleLeft,
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200/70',
      };
    case 'FREE_TEXT':
      return {
        icon: FileText,
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-200/70',
      };
    case 'CONSTANT':
      return {
        icon: Ban,
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200/70',
      };
    case 'UNKNOWN':
    default:
      return {
        icon: HelpCircle,
        bg: 'bg-slate-100',
        text: 'text-slate-600',
        border: 'border-slate-200/70',
      };
  }
}

// Confidence badge style
function getConfidenceBadge(confidence: IntelligenceConfidence) {
  switch (confidence) {
    case 'HIGH':
      return {
        label: 'Tinggi',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
        dotClass: 'bg-emerald-500',
      };
    case 'MEDIUM':
      return {
        label: 'Sedang',
        className: 'bg-amber-50 text-amber-800 border-amber-200/80',
        dotClass: 'bg-amber-500',
      };
    case 'LOW':
    default:
      return {
        label: 'Rendah',
        className: 'bg-slate-100 text-slate-700 border-slate-200/80',
        dotClass: 'bg-slate-400',
      };
  }
}

// Category finding badge
function getFindingCategoryStyle(category: FindingCategory) {
  switch (category) {
    case 'VARIATION':
      return { label: 'Variasi Nilai', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/70' };
    case 'QUALITY':
      return { label: 'Kualitas Data', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200/70' };
    case 'DISTRIBUTION':
      return { label: 'Distribusi', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/70' };
    case 'STRUCTURE':
    default:
      return { label: 'Struktur Data', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/70' };
  }
}

// Helper components declared outside render to satisfy React static-components rules
function FamilyIconDisplay({ family, className }: { family: DatasetFamily; className?: string }) {
  switch (family) {
    case 'EVENT_LOG':
      return <Activity className={className} />;
    case 'TRANSACTION':
      return <DollarSign className={className} />;
    case 'CUSTOMER_RECORDS':
      return <Fingerprint className={className} />;
    case 'PRODUCT_CATALOG':
      return <Boxes className={className} />;
    case 'SURVEY_RESPONSES':
      return <FileText className={className} />;
    case 'TIME_SERIES':
      return <LineChartIcon className={className} />;
    case 'GENERAL_TABULAR':
    default:
      return <Database className={className} />;
  }
}

function RoleIconDisplay({ role, className }: { role: SemanticColumnRole; className?: string }) {
  switch (role) {
    case 'IDENTIFIER':
      return <Fingerprint className={className} />;
    case 'NAME_LABEL':
      return <Tag className={className} />;
    case 'CATEGORY':
      return <Boxes className={className} />;
    case 'DATE_TIME':
      return <Calendar className={className} />;
    case 'NUMERIC_METRIC':
      return <Hash className={className} />;
    case 'CURRENCY':
      return <DollarSign className={className} />;
    case 'PERCENTAGE':
      return <Percent className={className} />;
    case 'DURATION':
      return <Clock className={className} />;
    case 'BOOLEAN':
      return <ToggleLeft className={className} />;
    case 'FREE_TEXT':
      return <FileText className={className} />;
    case 'CONSTANT':
      return <Ban className={className} />;
    case 'UNKNOWN':
    default:
      return <HelpCircle className={className} />;
  }
}

function RecommendationIconDisplay({
  type,
  className,
}: {
  type: 'CHART' | 'ANALYSIS' | 'CLEANING';
  className?: string;
}) {
  if (type === 'ANALYSIS') return <LineChartIcon className={className} />;
  if (type === 'CLEANING') return <Eraser className={className} />;
  return <BarChart3 className={className} />;
}

export function DatasetIntelligenceView({
  _testDataset,
  _testIntelligence,
}: DatasetIntelligenceViewProps = {}) {
  const store = useDatasetStore();
  const activeDataset = _testDataset !== undefined ? _testDataset : store.activeDataset;

  const [fetchedIntelligence, setFetchedIntelligence] = useState<DatasetIntelligenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hasil intelligence aktif: prioritaskan test props, lalu store cache, lalu hasil worker lokal
  const intelligence: DatasetIntelligenceResult | null =
    _testIntelligence ??
    (store.datasetIntelligence && store.datasetIntelligence.datasetId === activeDataset?.id
      ? store.datasetIntelligence
      : fetchedIntelligence && fetchedIntelligence.datasetId === activeDataset?.id
      ? fetchedIntelligence
      : null);

  const isLoading = Boolean(activeDataset) && !_testIntelligence && !intelligence && !error;

  // Fungsi komputasi via Web Worker
  const computeIntelligence = useCallback(
    (dataset: Dataset) => {
      // Jika mode test dengan _testIntelligence, lewati eksekusi worker
      if (_testIntelligence) {
        return;
      }

      const { promise } = workerClient.executeTask('ANALYZE_DATASET_INTELLIGENCE', {
        datasetId: dataset.id,
      });

      promise
        .then((res: unknown) => {
          const payload = res as { datasetId: string; intelligence: DatasetIntelligenceResult };
          setFetchedIntelligence(payload.intelligence);
          store.setDatasetIntelligence(payload.intelligence);
        })
        .catch((err: Error) => {
          if (err.message !== 'Task Cancelled') {
            setError(err.message || 'Gagal memproses Dataset Intelligence di Web Worker.');
          }
        });
    },
    [_testIntelligence, store]
  );

  // Trigger analisis saat dataset aktif tersedia dan hasil belum di-cache
  useEffect(() => {
    if (!activeDataset || _testIntelligence) return;
    if (store.datasetIntelligence && store.datasetIntelligence.datasetId === activeDataset.id) return;
    if (fetchedIntelligence && fetchedIntelligence.datasetId === activeDataset.id) return;

    computeIntelligence(activeDataset);
  }, [activeDataset, _testIntelligence, store.datasetIntelligence, fetchedIntelligence, computeIntelligence]);

  // Tombol Analisis Ulang (Refresh)
  const handleRefresh = () => {
    if (!activeDataset) return;
    store.setDatasetIntelligence(null);
    setFetchedIntelligence(null);
    setError(null);
    computeIntelligence(activeDataset);
  };

  // =========================================================================
  // EMPTY STATE (Belum Ada Dataset yang Dimuat)
  // =========================================================================
  if (!activeDataset) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-[#0F766E] border border-teal-200/60">
              <Sparkles className="h-4 w-4 text-[#0F766E]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Insight Dataset</h1>
              <p className="text-xs text-slate-500">Dataset Intelligence &amp; Rekomendasi Analisis</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200/60 px-2.5 py-1 rounded-full font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Belum ada dataset
          </span>
        </div>

        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-[#0F766E] border border-teal-200/60 mb-4 shadow-xs">
            <Sparkles className="h-8 w-8 text-[#0F766E]" />
          </div>
          <h4 className="text-base sm:text-lg font-bold text-slate-900 mb-1.5">
            Belum Ada Dataset yang Dimuat
          </h4>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md leading-relaxed mb-6">
            Unggah file CSV atau Excel di Beranda untuk mendapatkan klasifikasi otomatis tipe dataset, inferensi makna kolom, deteksi anomali penting, serta rekomendasi analisis yang relevan.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xs transition-colors"
            >
              <Database className="h-3.5 w-3.5" />
              Muat Dataset di Beranda
            </Link>
            <Link
              href="/dataset"
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200/70 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-200/70 transition-colors"
            >
              Lihat Halaman Dataset
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // LOADING STATE
  // =========================================================================
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E] border border-teal-200/60">
              <Sparkles className="h-5 w-5 text-[#0F766E]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Insight Dataset</h1>
              <p className="text-xs text-slate-500">Menganalisis {activeDataset.name}...</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-16 text-center shadow-xs flex flex-col items-center justify-center">
          <div className="relative mb-4">
            <div className="h-12 w-12 rounded-full border-4 border-teal-100 border-t-[#0F766E] animate-spin" />
            <Sparkles className="h-5 w-5 text-[#0F766E] absolute inset-0 m-auto" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 mb-1">
            Mengevaluasi Pola & Semantik Dataset
          </h3>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
            Menghitung kardinalitas nilai, mendeteksi keluarga dataset, dan menyusun temuan faktual secara lokal di browser...
          </p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ERROR STATE
  // =========================================================================
  if (error) {
    return (
      <div className="bg-white border border-rose-200 rounded-2xl p-8 shadow-xs text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200 mx-auto mb-3">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">
          Gagal Memproses Dataset Intelligence
        </h3>
        <p className="text-xs text-rose-600 max-w-md mx-auto mb-6">{error}</p>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Coba Lagi
        </button>
      </div>
    );
  }

  if (!intelligence) {
    return null;
  }

  const { typeInference, columnProfiles, keyFindings, recommendations } = intelligence;
  const familyBadge = getConfidenceBadge(typeInference.confidence);

  return (
    <div className="space-y-6">
      {/* 1. Header & Dataset Summary */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E] border border-teal-200/70 shadow-xs">
              <Sparkles className="h-5 w-5 text-[#0F766E]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Insight Dataset
                </h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-teal-50/90 text-[#0F766E] border border-teal-200/70 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="h-3 w-3" />
                  100% In-Memory Browser
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                Inferensi otomatis jenis dataset, perkiraan peran semantik kolom, anomali terukur, dan rekomendasi analisis terarah.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl text-xs text-slate-700 font-medium">
              <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-semibold text-slate-900 truncate max-w-[160px]" title={activeDataset.name}>
                {activeDataset.name}
              </span>
              <span className="text-slate-300">|</span>
              <span>{activeDataset.rowCount.toLocaleString('id-ID')} baris</span>
              <span className="text-slate-300">|</span>
              <span>{activeDataset.columnCount} kolom</span>
              <span className="text-slate-300">|</span>
              <span className="text-[11px] text-slate-500">
                {activeDataset.hasHeader ? 'Header Terdeteksi' : 'Tanpa Header'}
              </span>
            </div>

            <button
              onClick={handleRefresh}
              title="Analisis Ulang Dataset"
              aria-label="Analisis Ulang Dataset"
              className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden sm:inline">Analisis Ulang</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Perkiraan Jenis Dataset (Dataset Family Inference) */}
      <section className="bg-gradient-to-br from-teal-50/50 via-white to-slate-50/40 border border-teal-200/80 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0F766E]">
                Klasifikasi Heuristik Dataset
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold border px-2.5 py-0.5 rounded-full ${familyBadge.className}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${familyBadge.dotClass}`} />
                Confidence {familyBadge.label}
              </span>
            </div>

            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-[#0F766E] border border-teal-200">
                <FamilyIconDisplay family={typeInference.family} className="h-5 w-5 text-[#0F766E]" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                {typeInference.label}
              </h2>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl mb-4">
              {typeInference.description}
            </p>

            {/* Faktor Pendukung */}
            {typeInference.supportingFactors.length > 0 && (
              <div className="space-y-1.5 mb-3">
                <h3 className="text-xs font-bold text-slate-800">
                  Faktor yang Mendukung Kesimpulan:
                </h3>
                <ul className="space-y-1">
                  {typeInference.supportingFactors.map((factor, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#0F766E] shrink-0 mt-0.5" />
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Peringatan / Keterbatasan Heuristik */}
            {typeInference.caveats && typeInference.caveats.length > 0 && (
              <div className="mt-4 bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-800 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-amber-900 leading-relaxed">
                  <span className="font-bold">Catatan & Keterbatasan Klasifikasi:</span>
                  {typeInference.caveats.map((c, i) => (
                    <p key={i}>{c}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Deteksi Peran Semantik Kolom (Column Semantics Table) */}
      <section className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Peran Semantik Setiap Kolom
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Estimasi peran dan fungsi variabel berdasarkan kardinalitas, format nilai, dan sebaran observasi.
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium bg-slate-50 border border-slate-200/70 px-2.5 py-1 rounded-lg">
            {columnProfiles.length} kolom teranalisis
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Nama Kolom & Tipe</th>
                <th className="py-3 px-4">Peran Semantik</th>
                <th className="py-3 px-4">Keyakinan</th>
                <th className="py-3 px-4">Sampel Nilai</th>
                <th className="py-3 px-4">Keunikan & Missing</th>
                <th className="py-3 px-4">Alasan & Bukti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-normal">
              {columnProfiles.map((col) => {
                const roleConfig = getSemanticRoleConfig(col.role);
                const confBadge = getConfidenceBadge(col.confidence);
                const typeStyle = getDataTypeBadge(col.inferredType);

                return (
                  <tr key={col.columnId} className="hover:bg-slate-50/50 transition-colors">
                    {/* Kolom & Tipe Inferensi */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="font-semibold text-slate-900">{col.columnName}</span>
                        <span
                          className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}
                        >
                          {col.inferredType}
                        </span>
                      </div>
                    </td>

                    {/* Peran Semantik */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${roleConfig.bg} ${roleConfig.text} ${roleConfig.border}`}
                      >
                        <RoleIconDisplay role={col.role} className="h-3.5 w-3.5" />
                        {col.roleLabel || getRoleLabel(col.role)}
                      </span>
                    </td>

                    {/* Tingkat Keyakinan */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium border px-2 py-0.5 rounded-full ${confBadge.className}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${confBadge.dotClass}`} />
                        {confBadge.label}
                      </span>
                    </td>

                    {/* Sampel Nilai */}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {col.evidence?.sampleValues && col.evidence.sampleValues.length > 0 ? (
                          col.evidence.sampleValues.slice(0, 3).map((val, vIdx) => (
                            <span
                              key={vIdx}
                              className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/70 truncate max-w-[120px]"
                              title={String(val)}
                            >
                              {String(val)}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </div>
                    </td>

                    {/* Rasio Unik & Kardinalitas */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex flex-col text-slate-600">
                        <span className="font-semibold text-slate-800">
                          {(col.evidence?.uniqueCount ?? 0).toLocaleString('id-ID')} unik
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Rasio: {((col.evidence?.uniquenessRatio ?? 0) * 100).toFixed(1)}%
                          {(col.evidence?.nullCount ?? 0) > 0 && (
                            <span className="text-amber-800 ml-1">
                              • {((col.evidence?.nullRatio ?? 0) * 100).toFixed(1)}% kosong
                            </span>
                          )}
                        </span>
                      </div>
                    </td>

                    {/* Alasan & Bukti */}
                    <td className="py-3 px-4 max-w-sm">
                      <p className="text-xs text-slate-600 leading-relaxed">{col.rationale}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Temuan-Temuan Penting (Key Findings) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Temuan Penting dalam Dataset
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pola numerik, anomali variasi nilai, dan karakteristik kualitas data yang terukur.
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium bg-white border border-slate-200/70 px-2.5 py-1 rounded-lg">
            {keyFindings.length} temuan terdeteksi
          </span>
        </div>

        {keyFindings.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center text-slate-500 text-xs">
            Tidak ditemukan anomali atau variasi ekstrem yang mencolok pada dataset ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {keyFindings.map((finding) => {
              const catStyle = getFindingCategoryStyle(finding.category);

              return (
                <div
                  key={finding.id}
                  className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
                      >
                        {catStyle.label}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60">
                        {finding.numericalEvidence.formattedValue}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 mb-1">{finding.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed mb-3">
                      {finding.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Kolom Terkait:</span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {finding.targetColumns.map((col, idx) => (
                        <span
                          key={idx}
                          className="font-mono text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/70"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Rekomendasi Analisis & Visualisasi Praktis */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Rekomendasi Analisis & Visualisasi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Langkah analitik yang didukung oleh mesin DataWise berdasarkan struktur kolom yang tersedia.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recommendations.map((rec) => {
            let typeBadge = { label: 'Visualisasi', bg: 'bg-teal-50', text: 'text-[#0F766E]' };
            let actionBtnText = 'Buka di Visualisasi';

            if (rec.type === 'ANALYSIS') {
              typeBadge = { label: 'Analisis Statistik', bg: 'bg-sky-50', text: 'text-sky-700' };
              actionBtnText = 'Buka di Analisis';
            } else if (rec.type === 'CLEANING') {
              typeBadge = { label: 'Studio Pembersihan', bg: 'bg-amber-50', text: 'text-amber-800' };
              actionBtnText = 'Buka di Pembersihan';
            }

            return (
              <div
                key={rec.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-teal-200/90 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${typeBadge.bg} ${typeBadge.text}`}
                    >
                      {typeBadge.label}
                    </span>
                    <RecommendationIconDisplay type={rec.type} className="h-4 w-4 text-slate-400" />
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mb-1.5">{rec.title}</h3>

                  <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-2.5 mb-2.5 text-xs">
                    <span className="font-semibold text-slate-800 block mb-0.5">
                      Pertanyaan yang Dijawab:
                    </span>
                    <p className="text-slate-600 leading-relaxed">{rec.questionAnswered}</p>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed mb-3">{rec.rationale}</p>
                </div>

                <div>
                  <div className="mb-3.5 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-400 font-medium">Kolom:</span>
                    {rec.targetColumns.map((colName, cIdx) => (
                      <span
                        key={cIdx}
                        className="font-mono text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60"
                      >
                        {colName}
                      </span>
                    ))}
                  </div>

                  <Link
                    href={rec.targetRoute}
                    className="w-full inline-flex items-center justify-center gap-2 bg-[#0F766E] hover:bg-[#0D655E] text-white text-xs font-semibold py-2.5 px-3 rounded-xl shadow-xs transition-colors"
                  >
                    <span>{actionBtnText}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
