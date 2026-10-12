import React from 'react';

export type StatusBadgeVariant = 'brand' | 'success' | 'warning' | 'destructive' | 'neutral' | 'info';

export interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: StatusBadgeVariant;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({
  children,
  variant = 'neutral',
  dot = false,
  className = '',
}: StatusBadgeProps) {
  const variantStyles: Record<StatusBadgeVariant, { bg: string; text: string; border: string; dotColor: string }> = {
    brand: {
      bg: 'bg-teal-50',
      text: 'text-[#0F766E]',
      border: 'border-teal-200/70',
      dotColor: 'bg-[#0F766E]',
    },
    success: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200/70',
      dotColor: 'bg-emerald-500',
    },
    warning: {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200/70',
      dotColor: 'bg-amber-500',
    },
    destructive: {
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200/70',
      dotColor: 'bg-rose-500',
    },
    info: {
      bg: 'bg-sky-50',
      text: 'text-sky-700',
      border: 'border-sky-200/70',
      dotColor: 'bg-sky-500',
    },
    neutral: {
      bg: 'bg-slate-50',
      text: 'text-slate-700',
      border: 'border-slate-200/70',
      dotColor: 'bg-slate-400',
    },
  };

  const style = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${style.dotColor}`} aria-hidden="true" />}
      {children}
    </span>
  );
}
