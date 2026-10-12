import React from 'react';
import Link from 'next/link';
import { ArrowRight, Database } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionText?: string;
  actionHref?: string;
  action?: React.ReactNode;
  badgeText?: string;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  actionText = 'Unggah Dataset di Beranda',
  actionHref = '/',
  action,
  badgeText = 'Belum ada dataset',
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs ${className}`}
    >
      {badgeText && (
        <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Status Modul
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200/60 px-2.5 py-1 rounded-full font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            {badgeText}
          </span>
        </div>
      )}

      <div className="flex flex-col items-center justify-center py-16 px-6 text-center max-w-md mx-auto">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-[#0F766E] border border-teal-100/70 shadow-2xs mb-4">
          {icon || <Database className="h-6 w-6 text-[#0F766E]" />}
        </div>
        <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1.5">{title}</h3>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">{description}</p>

        {action ? (
          action
        ) : actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-[#0F766E] text-white hover:bg-[#115E59] transition-all shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/50"
          >
            <span>{actionText}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
