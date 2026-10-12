import React from 'react';

export interface MetricCardProps {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  value: string | number;
  description?: string;
  detail?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function MetricCard({
  icon,
  iconBg = 'bg-teal-50 text-[#0F766E] border-teal-100/70',
  label,
  value,
  description,
  detail,
  badge,
  className = '',
}: MetricCardProps) {
  const isNumeric = typeof value === 'number' || /^[0-9,.\s—]+$/.test(String(value).trim());

  return (
    <div
      className={`bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all ${className}`}
    >
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl border ${iconBg}`}
          >
            {icon}
          </div>
          {badge && <div className="shrink-0">{badge}</div>}
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
        {description && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400 font-medium">
        {detail || '—'}
      </div>
    </div>
  );
}
