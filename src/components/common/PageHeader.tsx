import React from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  className?: string;
}

export function PageHeader({
  title,
  description,
  badge,
  icon,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div
      className={`bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${className}`}
    >
      <div className="flex items-start gap-3.5 min-w-0">
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E] border border-teal-100/70 shadow-2xs mt-0.5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight truncate">{title}</h1>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
          {description && (
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
              {description}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
