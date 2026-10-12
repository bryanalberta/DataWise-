import React from 'react';

export interface SectionHeadingProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function SectionHeading({
  title,
  description,
  icon,
  badge,
  actions,
  className = '',
}: SectionHeadingProps) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-[#0F766E] border border-teal-100/60 shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">{title}</h2>
            {badge}
          </div>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
      </div>

      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
