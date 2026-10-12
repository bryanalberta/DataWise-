'use client';

import React from 'react';
import Link from 'next/link';
import { useDatasetStore } from '@/store/dataset-store';
import { DataCleaningStudio } from '@/components/DataCleaningStudio';
import { Eraser, ArrowLeft, UploadCloud } from 'lucide-react';

export interface PembersihanPageProps {
  _testDataset?: import('@/types').Dataset | null;
}

export default function PembersihanPage({ _testDataset }: PembersihanPageProps = {}) {
  const store = useDatasetStore();
  const activeDataset = _testDataset !== undefined ? _testDataset : store.activeDataset;

  if (!activeDataset) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-[#0F766E]">
                <Eraser className="h-4 w-4 text-[#0F766E]" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Pembersihan Data
              </h1>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200/60 px-2.5 py-1 rounded-full font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Belum ada dataset
            </span>
          </div>

          {/* Empty State Body */}
          <div className="p-8 sm:p-14 text-center max-w-md mx-auto">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-[#0F766E] border border-teal-100/70 shadow-2xs mx-auto mb-4">
              <UploadCloud className="h-7 w-7 text-[#0F766E]" />
            </div>
            <h4 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
              Belum Ada Dataset yang Dimuat
            </h4>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
              Silakan unggah berkas CSV atau Excel terlebih dahulu di halaman Beranda untuk menggunakan fitur pembersihan dan Immutable Recipe Engine.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Beranda untuk Unggah File
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <DataCleaningStudio _testDataset={activeDataset} />;
}
