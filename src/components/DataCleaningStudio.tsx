'use client';

import React, { useState, useEffect, useId, useTransition, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useDatasetStore } from '@/store/dataset-store';
import { workerClient } from '@/lib/worker-client';
import { createRecipeStepId } from '@/lib/recipe-engine';
import {
  RecipeStep,
  ImputationMethod,
  RecipePreviewResult,
  Dataset,
} from '@/types';
import {
  Sparkles,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  Database,
  Eraser,
  Split,
  Tag,
  Scissors,
  Check,
  X,
  FileSpreadsheet,
  Layers,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

export type CleaningTab =
  | 'DROP_MISSING'
  | 'IMPUTE_MISSING'
  | 'DROP_DUPLICATES'
  | 'TRIM_WHITESPACE'
  | 'RENAME_COLUMN'
  | 'DROP_COLUMN';

export interface DataCleaningStudioProps {
  _testDataset?: Dataset | null;
}

interface OperationCategory {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly operations: readonly {
    readonly tab: CleaningTab;
    readonly label: string;
    readonly shortDesc: string;
    readonly icon: React.ComponentType<{ className?: string }>;
    readonly isDestructive?: boolean;
  }[];
}

const OPERATION_CATEGORIES: readonly OperationCategory[] = [
  {
    id: 'missing',
    label: 'Nilai Hilang',
    description: 'Menangani observasi yang memiliki sel kosong',
    operations: [
      {
        tab: 'DROP_MISSING',
        label: 'Hapus Baris Kosong',
        shortDesc: 'Eliminasi baris dengan sel kosong',
        icon: Scissors,
      },
      {
        tab: 'IMPUTE_MISSING',
        label: 'Imputasi Nilai',
        shortDesc: 'Isi sel kosong dengan statistik / nilai tetap',
        icon: Sparkles,
      },
    ],
  },
  {
    id: 'duplicates',
    label: 'Duplikasi',
    description: 'Menghapus observasi kembar identik',
    operations: [
      {
        tab: 'DROP_DUPLICATES',
        label: 'Hapus Duplikat',
        shortDesc: 'Pertahankan kemunculan baris pertama',
        icon: Split,
      },
    ],
  },
  {
    id: 'text',
    label: 'Pembersihan Teks',
    description: 'Merapikan format string dan karakter',
    operations: [
      {
        tab: 'TRIM_WHITESPACE',
        label: 'Trim Spasi Teks',
        shortDesc: 'Hapus spasi di awal & akhir string',
        icon: Tag,
      },
    ],
  },
  {
    id: 'schema',
    label: 'Struktur Kolom',
    description: 'Mengelola nama dan atribut dataset',
    operations: [
      {
        tab: 'RENAME_COLUMN',
        label: 'Ubah Nama Kolom',
        shortDesc: 'Ubah label header skema',
        icon: FileSpreadsheet,
      },
      {
        tab: 'DROP_COLUMN',
        label: 'Hapus Kolom',
        shortDesc: 'Eliminasi kolom atribut dari dataset',
        icon: Trash2,
        isDestructive: true,
      },
    ],
  },
];

// Helper badge untuk tipe operasi pada Recipe Log
function getStepTypeBadge(type: RecipeStep['type']): { label: string; className: string } {
  switch (type) {
    case 'DROP_MISSING':
      return {
        label: 'Drop Missing',
        className: 'bg-rose-50 text-rose-700 border-rose-200/70',
      };
    case 'IMPUTE_MISSING':
      return {
        label: 'Impute',
        className: 'bg-teal-50 text-[#0F766E] border-teal-200/70',
      };
    case 'DROP_DUPLICATES':
      return {
        label: 'Deduplicate',
        className: 'bg-blue-50 text-blue-700 border-blue-200/70',
      };
    case 'TRIM_WHITESPACE':
      return {
        label: 'Trim Text',
        className: 'bg-slate-100 text-slate-700 border-slate-200/70',
      };
    case 'RENAME_COLUMN':
      return {
        label: 'Rename Col',
        className: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
      };
    case 'DROP_COLUMN':
      return {
        label: 'Drop Col',
        className: 'bg-amber-50 text-amber-800 border-amber-200/70',
      };
    default:
      return {
        label: type,
        className: 'bg-slate-100 text-slate-700 border-slate-200/70',
      };
  }
}

export function DataCleaningStudio({ _testDataset }: DataCleaningStudioProps = {}) {
  const store = useDatasetStore();
  const activeDataset = _testDataset !== undefined ? _testDataset : store.activeDataset;
  const {
    datasetPreview,
    activeRecipe,
    updateActiveDatasetAfterCleaning,
    setError,
    clearError,
  } = store;

  const [activeTab, setActiveTab] = useState<CleaningTab>('DROP_MISSING');

  // --- Form States ---
  // Drop Missing
  const [dropMissingMode, setDropMissingMode] = useState<'all' | 'custom'>('all');
  const [dropMissingColumns, setDropMissingColumns] = useState<string[]>([]);

  // Impute Missing
  const [imputeColumn, setImputeColumn] = useState<string>('');
  const [imputeMethod, setImputeMethod] = useState<ImputationMethod>('Mean');
  const [fixedValueInput, setFixedValueInput] = useState<string>('');

  // Trim Whitespace
  const [trimMode, setTrimMode] = useState<'all' | 'custom'>('all');
  const [trimColumns, setTrimColumns] = useState<string[]>([]);

  // Rename Column
  const [renameTarget, setRenameTarget] = useState<string>('');
  const [renameNewName, setRenameNewName] = useState<string>('');

  // Drop Column
  const [dropTarget, setDropTarget] = useState<string>('');

  // --- Live Preview & Action States ---
  const [previewResult, setPreviewResult] = useState<RecipePreviewResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // --- Reset Modal State ---
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // Delete step loading
  const [deletingStepId, setDeletingStepId] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  // Unique IDs for accessibility
  const imputeColId = useId();
  const imputeMethodId = useId();
  const fixedValId = useId();
  const renameTargetId = useId();
  const renameNewNameId = useId();
  const dropTargetId = useId();

  const columns = useMemo(() => activeDataset?.columns || [], [activeDataset?.columns]);

  // Derived effective target columns with automatic fallback
  const effectiveImputeColumn = useMemo(() => {
    if (imputeColumn && columns.some((c) => c.id === imputeColumn)) return imputeColumn;
    const firstNum = columns.find((c) => c.type === 'Numeric');
    return firstNum ? firstNum.id : columns[0]?.id || '';
  }, [columns, imputeColumn]);

  const effectiveRenameTarget = useMemo(() => {
    if (renameTarget && columns.some((c) => c.id === renameTarget)) return renameTarget;
    return columns[0]?.id || '';
  }, [columns, renameTarget]);

  const effectiveRenameNewName = useMemo(() => {
    if (renameNewName !== '') return renameNewName;
    const col = columns.find((c) => c.id === effectiveRenameTarget);
    return col?.name || '';
  }, [columns, effectiveRenameTarget, renameNewName]);

  const effectiveDropTarget = useMemo(() => {
    if (dropTarget && columns.some((c) => c.id === dropTarget)) return dropTarget;
    return columns[0]?.id || '';
  }, [columns, dropTarget]);

  // Bangun objek RecipeStep saat ini untuk dievaluasi preview
  const buildCurrentStep = useCallback((): RecipeStep | null => {
    if (!activeDataset) return null;

    switch (activeTab) {
      case 'DROP_MISSING':
        return {
          id: createRecipeStepId(),
          timestamp: Date.now(),
          type: 'DROP_MISSING',
          targetColumns:
            dropMissingMode === 'custom' && dropMissingColumns.length > 0
              ? dropMissingColumns
              : undefined,
          description:
            dropMissingMode === 'custom' && dropMissingColumns.length > 0
              ? `Hapus baris kosong pada kolom [${dropMissingColumns.join(', ')}]`
              : `Hapus baris yang memiliki nilai kosong pada seluruh kolom`,
        };

      case 'IMPUTE_MISSING': {
        const col = columns.find((c) => c.id === effectiveImputeColumn);
        const colName = col ? col.name : effectiveImputeColumn;
        return {
          id: createRecipeStepId(),
          timestamp: Date.now(),
          type: 'IMPUTE_MISSING',
          targetColumn: effectiveImputeColumn,
          method: imputeMethod,
          fixedValue: imputeMethod === 'FixedValue' ? fixedValueInput : undefined,
          description: `Imputasi missing value kolom '${colName}' dengan ${imputeMethod}${
            imputeMethod === 'FixedValue' ? ` (${fixedValueInput})` : ''
          }`,
        };
      }

      case 'DROP_DUPLICATES':
        return {
          id: createRecipeStepId(),
          timestamp: Date.now(),
          type: 'DROP_DUPLICATES',
          description: `Hapus baris duplikat persis (pertahankan kemunculan pertama)`,
        };

      case 'TRIM_WHITESPACE':
        return {
          id: createRecipeStepId(),
          timestamp: Date.now(),
          type: 'TRIM_WHITESPACE',
          targetColumns:
            trimMode === 'custom' && trimColumns.length > 0 ? trimColumns : undefined,
          description:
            trimMode === 'custom' && trimColumns.length > 0
              ? `Trim whitespace pada kolom [${trimColumns.join(', ')}]`
              : `Trim whitespace pada seluruh kolom teks`,
        };

      case 'RENAME_COLUMN': {
        const col = columns.find((c) => c.id === effectiveRenameTarget);
        const oldName = col ? col.name : effectiveRenameTarget;
        return {
          id: createRecipeStepId(),
          timestamp: Date.now(),
          type: 'RENAME_COLUMN',
          targetColumn: effectiveRenameTarget,
          newName: effectiveRenameNewName.trim(),
          description: `Ubah nama kolom '${oldName}' menjadi '${effectiveRenameNewName.trim()}'`,
        };
      }

      case 'DROP_COLUMN': {
        const col = columns.find((c) => c.id === effectiveDropTarget);
        const colName = col ? col.name : effectiveDropTarget;
        return {
          id: createRecipeStepId(),
          timestamp: Date.now(),
          type: 'DROP_COLUMN',
          targetColumn: effectiveDropTarget,
          description: `Hapus kolom '${colName}' dari dataset`,
        };
      }

      default:
        return null;
    }
  }, [
    activeDataset,
    activeTab,
    dropMissingMode,
    dropMissingColumns,
    columns,
    effectiveImputeColumn,
    imputeMethod,
    fixedValueInput,
    trimMode,
    trimColumns,
    effectiveRenameTarget,
    effectiveRenameNewName,
    effectiveDropTarget,
  ]);

  // Live impact calculation via Web Worker whenever form or activeTab changes
  useEffect(() => {
    if (!activeDataset) return;

    const step = buildCurrentStep();
    if (!step) return;

    let isMounted = true;

    const { promise, taskId } = workerClient.executeTask('PREVIEW_RECIPE_STEP', {
      datasetId: activeDataset.id,
      step,
    });

    promise
      .then((res: unknown) => {
        if (!isMounted) return;
        const payload = res as { preview: RecipePreviewResult };
        setPreviewResult(payload.preview);
        setIsPreviewLoading(false);
      })
      .catch((err: Error) => {
        if (!isMounted) return;
        setPreviewResult({
          canApply: false,
          impactedRows: 0,
          impactedCells: 0,
          summaryMessage: err.message,
          error: err.message,
        });
        setIsPreviewLoading(false);
      });

    return () => {
      isMounted = false;
      workerClient.cancelTask(taskId);
    };
  }, [activeDataset, buildCurrentStep]);

  // Terapkan langkah pembersihan
  const handleApplyStep = async () => {
    if (!activeDataset || !previewResult || !previewResult.canApply) return;

    const step = buildCurrentStep();
    if (!step) return;

    setIsApplying(true);
    clearError();
    setActionSuccessMessage(null);

    try {
      const { promise } = workerClient.executeTask('APPLY_RECIPE', {
        datasetId: activeDataset.id,
        step,
      });

      const res = (await promise) as {
        updatedDataset: Dataset;
        previewData: readonly Record<string, unknown>[];
        recipe: readonly RecipeStep[];
        impactEstimate: number;
      };

      startTransition(() => {
        updateActiveDatasetAfterCleaning(res.updatedDataset, res.previewData, res.recipe);
        setActionSuccessMessage(`Langkah "${step.description}" berhasil diterapkan ke Recipe!`);
      });

      setTimeout(() => {
        setActionSuccessMessage(null);
      }, 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menerapkan langkah pembersihan.';
      setError(msg);
    } finally {
      setIsApplying(false);
    }
  };

  // Hapus satu langkah dari Recipe Log (Worker menghitung ulang dari snapshot asli)
  const handleRemoveStep = async (stepId: string) => {
    if (!activeDataset) return;

    setDeletingStepId(stepId);
    clearError();
    setActionSuccessMessage(null);

    try {
      const { promise } = workerClient.executeTask('REMOVE_RECIPE_STEP', {
        datasetId: activeDataset.id,
        stepId,
      });

      const res = (await promise) as {
        updatedDataset: Dataset;
        previewData: readonly Record<string, unknown>[];
        recipe: readonly RecipeStep[];
      };

      startTransition(() => {
        updateActiveDatasetAfterCleaning(res.updatedDataset, res.previewData, res.recipe);
        setActionSuccessMessage('Langkah berhasil dibatalkan dan dataset telah dihitung ulang.');
      });

      setTimeout(() => {
        setActionSuccessMessage(null);
      }, 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membatalkan langkah recipe.';
      setError(msg);
    } finally {
      setDeletingStepId(null);
    }
  };

  // Reset ke data asli 100%
  const handleResetRecipe = async () => {
    if (!activeDataset) return;

    setIsResetting(true);
    clearError();

    try {
      const { promise } = workerClient.executeTask('RESET_RECIPE', {
        datasetId: activeDataset.id,
      });

      const res = (await promise) as {
        updatedDataset: Dataset;
        previewData: readonly Record<string, unknown>[];
        recipe: readonly RecipeStep[];
      };

      startTransition(() => {
        updateActiveDatasetAfterCleaning(res.updatedDataset, res.previewData, res.recipe);
        setShowResetModal(false);
        setActionSuccessMessage('Dataset berhasil dikembalikan 100% ke kondisi asli.');
      });

      setTimeout(() => {
        setActionSuccessMessage(null);
      }, 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mereset ke data asli.';
      setError(msg);
    } finally {
      setIsResetting(false);
    }
  };

  const selectedColSchema = columns.find((c) => c.id === effectiveImputeColumn);

  // Menutup modal dengan ESC
  useEffect(() => {
    if (!showResetModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowResetModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResetModal]);

  return (
    <div className="space-y-6">
      {/* 1. Top Executive Banner & Dataset Context */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E] border border-teal-100/70 shadow-2xs mt-0.5">
              <Eraser className="h-6 w-6 text-[#0F766E]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Pembersihan Data
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-[#0F766E] border border-teal-200/60 font-mono">
                  Data Cleaning Studio
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <CheckCircle2 className="h-3 w-3" />
                  Non-Destruktif
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                Transformasi data non-destruktif dengan pelacakan riwayat Immutable Recipe Engine. Dataset mentah asli dipertahankan utuh di memori.
              </p>
            </div>
          </div>

          {/* Dataset Status Summary Pill */}
          {activeDataset && (
            <div className="flex items-center gap-3.5 bg-slate-50/80 px-4 py-2.5 rounded-xl border border-slate-200/70 shrink-0 self-start lg:self-auto">
              <Database className="h-4 w-4 text-[#0F766E] shrink-0" />
              <div className="text-xs">
                <div className="font-semibold text-slate-900 truncate max-w-[200px]" title={activeDataset.name}>
                  {activeDataset.name}
                </div>
                <div className="text-slate-500 font-mono tabular-nums">
                  {new Intl.NumberFormat('id-ID').format(activeDataset.rowCount)} baris × {activeDataset.columnCount} kolom
                </div>
              </div>
              <span className="text-slate-300">|</span>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-lg bg-white border border-slate-200/70 text-slate-700">
                {activeRecipe.length > 0 ? `${activeRecipe.length} Langkah Recipe` : 'Snapshot Asli'}
              </span>
            </div>
          )}
        </div>

        {/* Success / Feedback Alert */}
        {actionSuccessMessage && (
          <div
            role="status"
            className="mt-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium animate-in fade-in"
          >
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{actionSuccessMessage}</span>
            </div>
            <button
              onClick={() => setActionSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-800 p-1 rounded-lg hover:bg-emerald-100/50 transition-colors"
              aria-label="Tutup pesan sukses"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 2. Main Studio Grid: Left Config Panel & Right Recipe Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7-8 cols): Categorized Action Panel & Configuration */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            {/* Categorized Operation Selector Ribbon */}
            <div className="border-b border-slate-100 bg-slate-50/70 p-4">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-[#0F766E]" />
                Katalog Operasi Pembersihan
              </div>

              {/* Grouped buttons across the 4 logical categories */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
                {OPERATION_CATEGORIES.map((category) => (
                  <div key={category.id} className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      {category.label}
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {category.operations.map((op) => {
                        const Icon = op.icon;
                        const isActive = activeTab === op.tab;
                        const isDestructive = op.isDestructive;

                        return (
                          <button
                            key={op.tab}
                            type="button"
                            onClick={() => setActiveTab(op.tab)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left w-full ${
                              isActive
                                ? isDestructive
                                  ? 'bg-rose-600 text-white shadow-xs font-bold border border-rose-600'
                                  : 'bg-[#0F766E] text-white shadow-xs font-bold border border-[#0F766E]'
                                : isDestructive
                                ? 'bg-white text-slate-700 hover:text-rose-700 hover:border-rose-300 border border-slate-200/80 hover:bg-rose-50/40'
                                : 'bg-white text-slate-700 hover:text-[#0F766E] hover:border-teal-300 border border-slate-200/80 hover:bg-teal-50/30'
                            } focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40`}
                          >
                            <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-white' : isDestructive ? 'text-rose-500' : 'text-slate-500'}`} />
                            <span className="truncate">{op.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Form Configuration Body */}
            <div className="p-6 space-y-6">
              {/* TAB 1: DROP MISSING */}
              {activeTab === 'DROP_MISSING' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60 uppercase">
                        Nilai Hilang
                      </span>
                      <h3 className="text-sm font-bold text-slate-900">
                        Hapus Baris yang Memiliki Nilai Kosong (Drop Missing Rows)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Menghapus baris observasi yang mengandung nilai kosong murni (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">null</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">undefined</code>, atau <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">&quot;&quot;</code>).
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="text-xs font-semibold text-slate-700 block">Cakupan Kolom:</label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/70 hover:bg-slate-100/70 transition-colors">
                        <input
                          type="radio"
                          name="dropMissingMode"
                          checked={dropMissingMode === 'all'}
                          onChange={() => setDropMissingMode('all')}
                          className="text-[#0F766E] focus:ring-[#0F766E]"
                        />
                        <span>Seluruh Kolom (Kosong di kolom manapun)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/70 hover:bg-slate-100/70 transition-colors">
                        <input
                          type="radio"
                          name="dropMissingMode"
                          checked={dropMissingMode === 'custom'}
                          onChange={() => setDropMissingMode('custom')}
                          className="text-[#0F766E] focus:ring-[#0F766E]"
                        />
                        <span>Kolom Tertentu Saja</span>
                      </label>
                    </div>

                    {dropMissingMode === 'custom' && (
                      <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
                        <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                          <span className="font-semibold">Pilih kolom target eliminasi:</span>
                          <div className="space-x-2">
                            <button
                              type="button"
                              onClick={() => setDropMissingColumns(columns.map((c) => c.id))}
                              className="text-[#0F766E] hover:underline font-semibold"
                            >
                              Pilih Semua
                            </button>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => setDropMissingColumns([])}
                              className="text-slate-500 hover:underline font-semibold"
                            >
                              Kosongkan
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                          {columns.map((c) => (
                            <label
                              key={c.id}
                              className="flex items-center gap-2 text-xs text-slate-700 p-2 rounded-lg bg-white border border-slate-200/60 hover:bg-slate-100 cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={dropMissingColumns.includes(c.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setDropMissingColumns([...dropMissingColumns, c.id]);
                                  } else {
                                    setDropMissingColumns(dropMissingColumns.filter((id) => id !== c.id));
                                  }
                                }}
                                className="rounded text-[#0F766E] focus:ring-[#0F766E]"
                              />
                              <span className="truncate font-mono" title={c.name}>{c.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: IMPUTE MISSING */}
              {activeTab === 'IMPUTE_MISSING' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-[#0F766E] border border-teal-200/60 uppercase">
                        Nilai Hilang
                      </span>
                      <h3 className="text-sm font-bold text-slate-900">
                        Imputasi Nilai Kosong (Impute Missing Values)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Mengisi sel kosong pada kolom terpilih dengan estimasi statistik (Mean, Median, Modus) atau nilai tetap.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    {/* Pilih Kolom */}
                    <div className="space-y-1.5">
                      <label htmlFor={imputeColId} className="text-xs font-semibold text-slate-700">
                        Kolom Target:
                      </label>
                      <select
                        id={imputeColId}
                        value={effectiveImputeColumn}
                        onChange={(e) => setImputeColumn(e.target.value)}
                        className="w-full text-xs font-medium bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30 focus:border-[#0F766E]"
                      >
                        {columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Metode Imputasi */}
                    <div className="space-y-1.5">
                      <label htmlFor={imputeMethodId} className="text-xs font-semibold text-slate-700">
                        Metode Pengisian:
                      </label>
                      <select
                        id={imputeMethodId}
                        value={imputeMethod}
                        onChange={(e) => setImputeMethod(e.target.value as ImputationMethod)}
                        className="w-full text-xs font-medium bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30 focus:border-[#0F766E]"
                      >
                        <option value="Mean">Mean (Rata-rata — Khusus Numerik)</option>
                        <option value="Median">Median (Nilai Tengah Linear Type-7 — Khusus Numerik)</option>
                        <option value="Mode">Modus (Nilai Terbanyak)</option>
                        <option value="FixedValue">Nilai Tetap (Konstan)</option>
                      </select>
                    </div>
                  </div>

                  {/* Input Nilai Tetap jika method FixedValue */}
                  {imputeMethod === 'FixedValue' && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                      <label htmlFor={fixedValId} className="text-xs font-semibold text-slate-700">
                        Masukkan Nilai Tetap Pengganti:
                      </label>
                      {selectedColSchema?.type === 'Boolean' ? (
                        <select
                          id={fixedValId}
                          value={fixedValueInput}
                          onChange={(e) => setFixedValueInput(e.target.value)}
                          className="w-full text-xs font-medium bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        >
                          <option value="">Pilih Nilai Boolean...</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          id={fixedValId}
                          type={selectedColSchema?.type === 'Numeric' ? 'number' : 'text'}
                          value={fixedValueInput}
                          onChange={(e) => setFixedValueInput(e.target.value)}
                          placeholder={
                            selectedColSchema?.type === 'Numeric'
                              ? 'Contoh: 0 atau 24.5'
                              : 'Masukkan teks pengganti...'
                          }
                          className="w-full text-xs font-medium bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: DROP DUPLICATES */}
              {activeTab === 'DROP_DUPLICATES' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 uppercase">
                        Duplikasi
                      </span>
                      <h3 className="text-sm font-bold text-slate-900">
                        Hapus Baris Duplikat Persis (Drop Exact Duplicates)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Menghapus baris yang memiliki nilai identik di seluruh kolom. Kemunculan pertama akan selalu dipertahankan.
                    </p>
                  </div>

                  <div className="p-4 bg-teal-50/70 rounded-xl border border-teal-200/70 flex items-start gap-3">
                    <Info className="h-4 w-4 text-[#0F766E] shrink-0 mt-0.5" />
                    <div className="text-xs text-teal-900 leading-relaxed">
                      Pendeteksian duplikat dilakukan dengan serialisasi tipe eksak (<code className="font-mono bg-teal-100/60 px-1 py-0.5 rounded">1</code> numerik tidak dianggap sama dengan <code className="font-mono bg-teal-100/60 px-1 py-0.5 rounded">&quot;1&quot;</code> teks).
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: TRIM WHITESPACE */}
              {activeTab === 'TRIM_WHITESPACE' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/60 uppercase">
                        Pembersihan Teks
                      </span>
                      <h3 className="text-sm font-bold text-slate-900">
                        Trim Whitespace Teks
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Menghapus spasi di awal dan akhir teks (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">&quot;  teks  &quot; → &quot;teks&quot;</code>). Kolom numerik atau boolean tidak akan diubah.
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="text-xs font-semibold text-slate-700 block">Cakupan Kolom Teks:</label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/70 hover:bg-slate-100/70 transition-colors">
                        <input
                          type="radio"
                          name="trimMode"
                          checked={trimMode === 'all'}
                          onChange={() => setTrimMode('all')}
                          className="text-[#0F766E] focus:ring-[#0F766E]"
                        />
                        <span>Seluruh Kolom Teks</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/70 hover:bg-slate-100/70 transition-colors">
                        <input
                          type="radio"
                          name="trimMode"
                          checked={trimMode === 'custom'}
                          onChange={() => setTrimMode('custom')}
                          className="text-[#0F766E] focus:ring-[#0F766E]"
                        />
                        <span>Pilih Kolom Teks Tertentu</span>
                      </label>
                    </div>

                    {trimMode === 'custom' && (
                      <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                          {columns
                            .filter((c) => c.type === 'Text' || c.type === 'Categorical' || c.type === 'DateTime')
                            .map((c) => (
                              <label
                                key={c.id}
                                className="flex items-center gap-2 text-xs text-slate-700 p-2 rounded-lg bg-white border border-slate-200/60 hover:bg-slate-100 cursor-pointer transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={trimColumns.includes(c.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setTrimColumns([...trimColumns, c.id]);
                                    } else {
                                      setTrimColumns(trimColumns.filter((id) => id !== c.id));
                                    }
                                  }}
                                  className="rounded text-[#0F766E] focus:ring-[#0F766E]"
                                />
                                <span className="truncate font-mono" title={c.name}>{c.name}</span>
                              </label>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: RENAME COLUMN */}
              {activeTab === 'RENAME_COLUMN' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 uppercase">
                        Struktur Kolom
                      </span>
                      <h3 className="text-sm font-bold text-slate-900">
                        Ubah Nama Kolom (Rename Column)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Ubah label nama header kolom tanpa mengubah isi data baris.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <label htmlFor={renameTargetId} className="text-xs font-semibold text-slate-700">
                        Kolom yang Ingin Diubah:
                      </label>
                      <select
                        id={renameTargetId}
                        value={effectiveRenameTarget}
                        onChange={(e) => {
                          setRenameTarget(e.target.value);
                          const col = columns.find((c) => c.id === e.target.value);
                          setRenameNewName(col?.name || '');
                        }}
                        className="w-full text-xs font-medium bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30 focus:border-[#0F766E]"
                      >
                        {columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor={renameNewNameId} className="text-xs font-semibold text-slate-700">
                        Nama Kolom Baru:
                      </label>
                      <input
                        id={renameNewNameId}
                        type="text"
                        value={effectiveRenameNewName}
                        onChange={(e) => setRenameNewName(e.target.value)}
                        placeholder="Ketik nama kolom baru..."
                        className="w-full text-xs font-medium bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30 focus:border-[#0F766E]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: DROP COLUMN */}
              {activeTab === 'DROP_COLUMN' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60 uppercase">
                        Struktur Kolom
                      </span>
                      <h3 className="text-sm font-bold text-rose-900">
                        Hapus Kolom (Drop Column)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Hapus satu kolom secara permanen dari dataset aktif. Tindakan ini selalu dapat dibatalkan melalui Recipe Log.
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <label htmlFor={dropTargetId} className="text-xs font-semibold text-slate-700">
                      Pilih Kolom yang Akan Dihapus:
                    </label>
                    <select
                      id={dropTargetId}
                      value={effectiveDropTarget}
                      onChange={(e) => setDropTarget(e.target.value)}
                      className="w-full text-xs font-medium bg-white border border-rose-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                    >
                      {columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* 3. LIVE IMPACT PREVIEW CARD */}
              <div className="pt-4 border-t border-slate-100">
                <div
                  className={`rounded-2xl p-5 border transition-all ${
                    previewResult?.canApply
                      ? 'bg-teal-50/40 border-teal-200/80'
                      : previewResult?.error || !previewResult?.canApply
                      ? 'bg-amber-50/40 border-amber-200/80'
                      : 'bg-slate-50/80 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <Sparkles className="h-4 w-4 text-[#0F766E]" />
                      <span>Live Impact Preview (Sebelum Diterapkan)</span>
                    </div>
                    {isPreviewLoading ? (
                      <span className="text-[11px] text-[#0F766E] font-mono animate-pulse flex items-center gap-1.5 font-semibold">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#0F766E] animate-ping" />
                        Menghitung dampak di Web Worker...
                      </span>
                    ) : previewResult?.canApply ? (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/70 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Siap Diterapkan ke Recipe
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/70 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Peringatan Validasi
                      </span>
                    )}
                  </div>

                  {previewResult ? (
                    <div className="space-y-3">
                      <p
                        className={`text-xs leading-relaxed ${
                          previewResult.canApply
                            ? 'text-slate-700 font-medium'
                            : 'text-amber-800 font-medium'
                        }`}
                      >
                        {previewResult.summaryMessage}
                      </p>

                      {/* Stat chips */}
                      <div className="flex items-center gap-2.5 flex-wrap text-xs">
                        {previewResult.impactedRows > 0 ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-rose-50 text-rose-700 font-mono font-bold border border-rose-200/60">
                            -{new Intl.NumberFormat('id-ID').format(previewResult.impactedRows)} Baris Dihapus
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-slate-100 text-slate-600 font-mono font-medium border border-slate-200/60">
                            0 Baris Terhapus
                          </span>
                        )}

                        {previewResult.impactedCells > 0 ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-teal-50 text-[#0F766E] font-mono font-bold border border-teal-200/60">
                            {new Intl.NumberFormat('id-ID').format(previewResult.impactedCells)} Sel Terdampak
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-slate-100 text-slate-600 font-mono font-medium border border-slate-200/60">
                            0 Sel Berubah
                          </span>
                        )}

                        {previewResult.replacementValue !== undefined && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-slate-100 text-slate-800 font-mono font-medium border border-slate-200">
                            Nilai: {String(previewResult.replacementValue)}
                          </span>
                        )}
                      </div>

                      {/* Error or Warning Banner */}
                      {!previewResult.canApply && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>{previewResult.error || previewResult.summaryMessage}</span>
                        </div>
                      )}

                      <p className="text-[11px] text-slate-400 italic">
                        Pratinjau non-destruktif: Data aktif belum diubah sampai Anda menekan tombol &quot;Terapkan ke Recipe&quot;.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Pilih operasi dan parameter untuk melihat estimasi dampak perubahan.
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 mt-5">
                  <button
                    type="button"
                    disabled={isApplying || isPreviewLoading || !previewResult?.canApply}
                    onClick={handleApplyStep}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/50"
                  >
                    {isApplying ? (
                      <>
                        <div className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Menerapkan...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Terapkan ke Recipe
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (4-5 cols): Recipe Log & Audit Trail */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Recipe Log</h3>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {activeRecipe.length} langkah
                </span>
              </div>

              {activeRecipe.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset ke Data Asli
                </button>
              )}
            </div>

            {/* Step list */}
            {activeRecipe.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50/60 rounded-xl border border-dashed border-slate-200/80">
                <ShieldCheck className="h-9 w-9 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  Snapshot Mentah Asli (100% Identik)
                </p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Dataset aktif saat ini 100% identik dengan berkas asli yang diunggah. Belum ada langkah transformasi yang diterapkan.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {activeRecipe.map((step, idx) => {
                  const badge = getStepTypeBadge(step.type);

                  return (
                    <div
                      key={step.id}
                      className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:border-slate-300 transition-colors flex items-start justify-between gap-2"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700">
                            #{idx + 1}
                          </span>
                          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${badge.className}`}>
                            {badge.label}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {new Date(step.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-800 leading-snug break-words">
                          {step.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={deletingStepId === step.id}
                        onClick={() => handleRemoveStep(step.id)}
                        title="Batalkan langkah ini (Dataset akan dihitung ulang secara otomatis)"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                        aria-label={`Batalkan langkah ${idx + 1}`}
                      >
                        {deletingStepId === step.id ? (
                          <div className="h-3.5 w-3.5 border-2 border-slate-400/30 border-t-rose-600 rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Navigation Card */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-600 space-y-2.5">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Database className="h-4 w-4 text-[#0F766E]" />
              <span>Sinkronisasi Lintas Modul</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Setiap langkah yang diterapkan otomatis memperbarui Data Explorer, Profiling, dan Statistik Deskriptif tanpa perlu memuat ulang halaman.
            </p>
            <div className="pt-1 flex items-center gap-2">
              <Link
                href="/dataset"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 transition-colors text-[11px] shadow-2xs"
              >
                Lihat di Grid
                <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/profiling"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 transition-colors text-[11px] shadow-2xs"
              >
                Cek Profiling
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Active Dataset Sample Preview Table */}
      {datasetPreview && datasetPreview.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#0F766E]" />
              <h3 className="text-sm font-bold text-slate-900">
                Pratinjau Data Aktif Hasil Pembersihan (5 Baris Pertama)
              </h3>
            </div>
            <Link
              href="/dataset"
              className="text-xs font-semibold text-[#0F766E] hover:underline inline-flex items-center gap-1"
            >
              Buka Semua di Data Explorer
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80 shadow-2xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                <tr>
                  <th scope="col" className="px-3.5 py-2.5 text-slate-400 font-mono w-12 text-center">#</th>
                  {columns.map((c) => (
                    <th key={c.id} scope="col" className="px-3.5 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono">{c.name}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-200/60 text-slate-600 font-mono">
                          {c.type}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-slate-800 bg-white">
                {datasetPreview.slice(0, 5).map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3.5 py-2 text-slate-400 text-center">{rIdx + 1}</td>
                    {columns.map((c) => {
                      const val = row[c.id];
                      const isMissing = val === null || val === undefined || val === '';
                      return (
                        <td key={c.id} className="px-3.5 py-2 whitespace-nowrap">
                          {isMissing ? (
                            <span className="italic text-slate-400 font-sans text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">null</span>
                          ) : (
                            String(val)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Confirmation Modal: Reset to Original Dataset */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 shrink-0 border border-rose-100">
                <AlertCircle className="h-6 w-6 text-rose-600" />
              </div>
              <div>
                <h3 id="reset-modal-title" className="text-base font-bold text-slate-900">
                  Kembalikan ke Data Asli?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tindakan ini akan menghapus seluruh riwayat recipe.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
              Seluruh <strong>{activeRecipe.length} langkah</strong> pembersihan dalam Recipe Log akan dibatalkan. Dataset aktif akan dipulihkan secara persis ke kondisi awal saat berkas pertama kali diimpor.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={handleResetRecipe}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                {isResetting ? 'Mereset...' : 'Ya, Reset ke Data Asli'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
