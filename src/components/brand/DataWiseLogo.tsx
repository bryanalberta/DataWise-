import React from 'react';

export interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  showSubtitle?: boolean;
  collapsed?: boolean;
}

/**
 * DataWise Brand Mark (Icon Only)
 * Faceted geometric data-prism symbol combining D/W letterforms and ascending insight arrow.
 */
export function BrandMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform ${className}`}
      aria-label="DataWise Logo Mark"
    >
      {/* Facet 2: Top-Left Data Arc (Deep Steel Teal Anchor) */}
      <polygon
        points="52,14 52,48 20,38"
        fill="#0F766E"
      />
      
      {/* Facet 1: Top-Right Insight Arrow (Vibrant Ascending Vector) */}
      <polygon
        points="52,14 84,24 52,48"
        fill="#0D9488"
      />
      
      {/* Facet 3: Lower-Left Foundation (Grounded W-Apex) */}
      <polygon
        points="20,38 52,48 48,86 16,68"
        fill="#115E59"
      />
      
      {/* Facet 4: Lower-Right Dimension (Luminous Data Facet) */}
      <polygon
        points="52,48 84,24 80,72 48,86"
        fill="#14B8A6"
      />

      {/* Internal Precision Edge Highlights */}
      <line x1="52" y1="14" x2="52" y2="48" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
      <line x1="20" y1="38" x2="52" y2="48" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      <line x1="52" y1="48" x2="84" y2="24" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <line x1="52" y1="48" x2="48" y2="86" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      
      {/* Ascending Insight Apex Dot */}
      <circle cx="84" cy="24" r="3" fill="#5EEAD4" />
    </svg>
  );
}

/**
 * Compact Icon: Optimized for small dimensions (favicon, badge, compact view)
 */
export function CompactIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`inline-flex items-center justify-center p-1 rounded-lg bg-teal-50/90 border border-teal-100/70 shadow-2xs ${className}`}
      aria-label="DataWise Icon"
    >
      <BrandMark size={size} />
    </div>
  );
}

/**
 * Wordmark: "DataWise"
 */
export function BrandWordmark({ className = '', subtitle }: { className?: string; subtitle?: string }) {
  return (
    <div className={`flex flex-col leading-none ${className}`}>
      <div className="flex items-baseline tracking-tight font-sans">
        <span className="font-bold text-slate-900 text-base">Data</span>
        <span className="font-bold text-[#0F766E] text-base">Wise</span>
      </div>
      {subtitle && (
        <span className="text-[10px] tracking-wider uppercase font-semibold text-slate-400 mt-0.5">
          {subtitle}
        </span>
      )}
    </div>
  );
}

/**
 * Full Horizontal Lockup (Mark + Wordmark)
 */
export function DataWiseLogo({
  size = 32,
  className = '',
  showText = true,
  showSubtitle = false,
  collapsed = false,
}: LogoProps) {
  if (collapsed) {
    return (
      <div
        className={`flex items-center justify-center p-1.5 rounded-xl bg-teal-50/80 border border-teal-100/60 shadow-2xs ${className}`}
        title="DataWise Local Analytics"
      >
        <BrandMark size={size} />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <div className="flex items-center justify-center p-1 rounded-lg bg-teal-50/80 border border-teal-100/70 shadow-2xs shrink-0">
        <BrandMark size={size} />
      </div>
      {showText && (
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline tracking-tight font-sans">
            <span className="font-extrabold text-slate-900 text-base tracking-tight">Data</span>
            <span className="font-extrabold text-[#0F766E] text-base tracking-tight">Wise</span>
          </div>
          {showSubtitle ? (
            <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 truncate">
              Local Data Studio
            </span>
          ) : (
            <span className="text-[10px] font-medium text-slate-400 truncate">
              Local Analytics
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default DataWiseLogo;
