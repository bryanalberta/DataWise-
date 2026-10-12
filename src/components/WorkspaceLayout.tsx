'use client';

import React from 'react';
import Link from 'next/link';
import { AppSidebar } from './AppSidebar';
import { useDatasetStore } from '@/store/dataset-store';
import { Database, ShieldCheck, Laptop } from 'lucide-react';

export interface WorkspaceLayoutProps {
  children: React.ReactNode;
}

export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const { activeDataset } = useDatasetStore();

  return (
    <div className="flex min-h-screen bg-slate-50/70 font-sans text-slate-900">
      {/* Sidebar Navigasi Bersama */}
      <AppSidebar />

      {/* Main Workspace Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Sticky Header */}
        <header className="sticky top-0 z-20 h-16 shrink-0 flex items-center justify-between border-b border-slate-200/80 bg-white/95 backdrop-blur-md px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-slate-400 font-medium hidden md:inline truncate">
              Studio Analisis Dataset Browser
            </span>

            {/* Active Dataset Pill di Header jika ada dataset aktif */}
            {activeDataset && (
              <Link
                href="/dataset"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200/80 text-xs font-semibold text-[#0F766E] hover:bg-teal-100/70 hover:border-teal-300 transition-all shadow-2xs group"
                title="Buka Data Explorer untuk dataset aktif ini"
              >
                <Database className="h-3.5 w-3.5 shrink-0 text-[#0F766E]" />
                <span className="font-mono max-w-[170px] sm:max-w-[240px] truncate text-slate-800">
                  {activeDataset.name}
                </span>
                <span className="text-teal-300">·</span>
                <span className="font-mono tabular-nums text-teal-800">
                  {new Intl.NumberFormat('id-ID').format(activeDataset.rowCount)} baris
                </span>
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3 ml-auto shrink-0">
            {/* Privacy Guarantee Pill */}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50/80 border border-emerald-200/60 text-[11px] font-semibold text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Privat &amp; Zero-Server</span>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 pl-3 border-l border-slate-200">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 border border-slate-200/80 shadow-2xs">
                <Laptop className="h-3.5 w-3.5 text-slate-600" />
              </div>
              <span className="hidden sm:inline font-medium text-slate-700">Ruang Kerja Lokal</span>
            </div>
          </div>
        </header>

        {/* Workspace Body Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-[1400px] mx-auto w-full space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
