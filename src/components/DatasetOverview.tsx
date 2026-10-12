'use client';

import React from 'react';
import { useDatasetStore } from '@/store/dataset-store';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  AlertCircle, 
  Rows, 
  Columns, 
  Layers, 
  CheckCircle2, 
  AlertTriangle,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { Dataset } from '@/types';

type StoreState = ReturnType<typeof useDatasetStore.getState>;

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface MetricCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  description: string;
  value: string;
  detail?: string;
}

function MetricCard({ icon, iconBg, label, description, value, detail }: MetricCardProps) {
  const isNumeric = typeof value === 'number' || /^[0-9,.\s—]+$/.test(String(value).trim());
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 hover:shadow-sm transition-all">
      <div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg} mb-3.5 shadow-2xs`}>
          {icon}
        </div>
        <p
          className={`${
            isNumeric ? 'text-3xl font-extrabold font-mono tabular-nums' : 'text-xl font-bold font-sans'
          } tracking-tight text-slate-900 truncate`}
          title={String(value)}
        >
          {value}
        </p>
        <p className="text-sm font-bold text-slate-800 mt-1">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400 font-medium font-mono truncate">
        {detail || '—'}
      </div>
    </div>
  );
}

export function DatasetOverview({ _testState }: { _testState?: Partial<StoreState> }) {
  const storeState = useDatasetStore();
  const stateToUse = _testState || storeState;

  const error = stateToUse.error as string | null;
  const isProcessing = stateToUse.isProcessing as boolean;
  const processingMessage = stateToUse.processingMessage as string | null;
  const activeDataset = stateToUse.activeDataset as Dataset | null;

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4 rounded-2xl">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Kesalahan Analisis</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (isProcessing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-40 rounded-lg" />
          <Skeleton className="h-4 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-8 w-16 rounded-md" />
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-3 w-20 mt-2 rounded-md" />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2 font-mono">{processingMessage || 'Menganalisis metrik dataset...'}</p>
      </div>
    );
  }

  // Empty state — 4-card grid with informative placeholders
  if (!activeDataset) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Ringkasan Dataset</h3>
          <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200/60 px-3 py-1 rounded-full font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Belum ada dataset
            <span className="sr-only">Belum Ada Metrik Dataset</span>
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={<Rows className="h-5 w-5 text-sky-600" />}
            iconBg="bg-sky-50 border border-sky-100/70"
            label="Jumlah Baris"
            description="Total record dalam dataset"
            value="—"
            detail="Menunggu unggahan berkas"
          />
          <MetricCard
            icon={<Columns className="h-5 w-5 text-[#0F766E]" />}
            iconBg="bg-teal-50 border border-teal-100/70"
            label="Jumlah Kolom"
            description="Total kolom dalam dataset"
            value="—"
            detail="Menunggu unggahan berkas"
          />
          <MetricCard
            icon={<Layers className="h-5 w-5 text-emerald-600" />}
            iconBg="bg-emerald-50 border border-emerald-100/70"
            label="Tipe Data"
            description="Distribusi tipe data per kolom"
            value="—"
            detail="Menunggu unggahan berkas"
          />
          <MetricCard
            icon={<CheckCircle2 className="h-5 w-5 text-slate-400" />}
            iconBg="bg-slate-100 border border-slate-200/70"
            label="Status Integritas"
            description="Audit struktur dan kelengkapan"
            value="—"
            detail="Belum ada dataset"
          />
        </div>
      </div>
    );
  }

  const { rowCount, columnCount, estimatedMemoryBytes, integrityStatus } = activeDataset;

  const getIntegrityLabel = () => {
    switch (integrityStatus) {
      case 'VALID': return 'Struktur Valid';
      case 'WARNING': return 'Peringatan Struktural';
      case 'INVALID': return 'Tidak Valid';
      default: return 'Tidak Diketahui';
    }
  };

  const getIntegrityIcon = () => {
    switch (integrityStatus) {
      case 'VALID': return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
      case 'WARNING': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'INVALID': return <XCircle className="h-5 w-5 text-rose-600" />;
      default: return <HelpCircle className="h-5 w-5 text-slate-400" />;
    }
  };

  const formattedMemory = estimatedMemoryBytes !== undefined 
    ? formatBytes(estimatedMemoryBytes) 
    : 'Tidak tersedia';

  // Count unique data types
  const typeSet = new Set(activeDataset.columns.map(c => c.type));
  const uniqueTypeCount = typeSet.size;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Ringkasan Dataset</h3>
        <span className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 border border-slate-200/60 px-3 py-1 rounded-full font-medium">
          <span className={`h-1.5 w-1.5 rounded-full inline-block ${integrityStatus === 'VALID' ? 'bg-emerald-500' : integrityStatus === 'WARNING' ? 'bg-amber-400' : 'bg-rose-500'}`} />
          {activeDataset.name}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Rows className="h-5 w-5 text-sky-600" />}
          iconBg="bg-sky-50 border border-sky-100/70"
          label="Jumlah Baris"
          description="Total record dalam dataset"
          value={new Intl.NumberFormat('id-ID').format(rowCount)}
          detail={`Estimasi memori: ${formattedMemory}`}
        />
        <MetricCard
          icon={<Columns className="h-5 w-5 text-[#0F766E]" />}
          iconBg="bg-teal-50 border border-teal-100/70"
          label="Jumlah Kolom"
          description="Total kolom dalam dataset"
          value={new Intl.NumberFormat('id-ID').format(columnCount)}
          detail={`${uniqueTypeCount} tipe data terdeteksi`}
        />
        <MetricCard
          icon={<Layers className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50 border border-emerald-100/70"
          label="Tipe Data"
          description="Distribusi tipe data per kolom"
          value={String(uniqueTypeCount)}
          detail={Array.from(typeSet).join(', ') || '—'}
        />
        <MetricCard
          icon={getIntegrityIcon()}
          iconBg={integrityStatus === 'VALID' ? 'bg-emerald-50 border border-emerald-100/70' : integrityStatus === 'WARNING' ? 'bg-amber-50 border border-amber-100/70' : 'bg-rose-50 border border-rose-100/70'}
          label="Status File"
          description={getIntegrityLabel()}
          value={getIntegrityLabel()}
          detail={getIntegrityLabel()}
        />
      </div>
    </div>
  );
}
