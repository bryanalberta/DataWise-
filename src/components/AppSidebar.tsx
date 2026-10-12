'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Database,
  BarChart3,
  LineChart,
  Eraser,
  PieChart,
  Download,
  ChevronLeft,
  ChevronRight,
  Shield,
  Sparkles,
} from 'lucide-react';

import { DataWiseLogo } from './brand/DataWiseLogo';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  available: boolean;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'beranda', label: 'Beranda', href: '/', icon: Home, available: true },
  { id: 'dataset', label: 'Dataset', href: '/dataset', icon: Database, available: true },
  { id: 'insight', label: 'Insight Dataset', href: '/insight', icon: Sparkles, available: true },
  { id: 'profiling', label: 'Profiling', href: '/profiling', icon: BarChart3, available: true },
  { id: 'analisis', label: 'Analisis', href: '/analisis', icon: LineChart, available: true },
  { id: 'pembersihan', label: 'Pembersihan', href: '/pembersihan', icon: Eraser, available: true },
  { id: 'visualisasi', label: 'Visualisasi', href: '/visualisasi', icon: PieChart, available: true },
  { id: 'ekspor', label: 'Ekspor', href: '/ekspor', icon: Download, available: true },
];

export interface AppSidebarProps {
  currentPath?: string;
}

export function AppSidebar({ currentPath }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const hookPath = usePathname();
  const pathname = currentPath || hookPath || '/';

  const isItemActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed bottom-5 left-5 z-50 lg:hidden flex items-center justify-center h-12 w-12 rounded-2xl bg-[#0F766E] text-white shadow-lg hover:bg-[#115E59] active:bg-[#134E4A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/50 focus-visible:ring-offset-2 transition-all"
        aria-label="Toggle navigation"
      >
        <Database className="h-5 w-5" />
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full bg-white border-r border-slate-200/90
          flex flex-col transition-all duration-200 ease-in-out shadow-xs
          lg:sticky lg:top-0 lg:z-20
          ${collapsed ? 'w-[72px]' : 'w-[236px]'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Sidebar brand header */}
        <div
          className={`flex items-center h-16 border-b border-slate-200/80 shrink-0 ${
            collapsed ? 'justify-center px-2' : 'px-4'
          }`}
        >
          <DataWiseLogo size={collapsed ? 26 : 24} collapsed={collapsed} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3.5 overflow-y-auto" aria-label="Main navigation">
          <ul className="space-y-1 px-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = isItemActive(item.href);

              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      group relative w-full flex items-center justify-between rounded-xl text-xs sm:text-sm font-medium transition-all
                      ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
                      ${
                        isActive
                          ? 'bg-teal-50/80 text-[#0F766E] font-semibold border-l-[3px] border-[#0F766E] shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-[3px] border-transparent'
                      }
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/40 focus-visible:ring-offset-1
                    `}
                    title={collapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          isActive
                            ? 'text-[#0F766E]'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </div>
                    {!collapsed && item.badge && (
                      <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200/60 shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom section */}
        <div className={`shrink-0 ${collapsed ? 'px-2 py-3 border-t border-slate-200/80' : 'p-3'}`}>
          {!collapsed && (
            <div className="rounded-xl border border-teal-100/80 bg-teal-50/50 p-3 mb-2 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-100/80 text-[#0F766E] mt-0.5">
                  <Shield className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 leading-tight">100% Lokal di Browser</p>
                  <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                    Data Anda aman &amp; privat, zero external server transmission.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Collapse toggle - desktop only */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/50"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed && <span>Tutup Sidebar</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
