import React, { useState } from 'react';
import { 
  Building2, 
  CheckCircle2, 
  AlertTriangle, 
  Percent, 
  FileCheck,
  ShieldAlert,
  Flame,
  Clock,
  ArrowRight,
  Target,
  SlidersHorizontal,
  Check,
  Layers,
  Sparkles,
  CalendarCheck2
} from 'lucide-react';
import { DashboardSummary } from '../../types/stockOpname';
import { 
  formatRupiah, 
  formatNumber,
  getFullMonthNameIndo,
  getDefaultQTypeForMonth,
  getDefaultTargetSoTypes
} from '../../utils/formatters';

interface SummaryCardsProps {
  summary: DashboardSummary;
  onNavigateTab: (tab: 'schedules' | 'results' | 'stores') => void;
  onFilterZonaHitam?: () => void;
  targetSoTypes?: string[];
  onChangeTargetTypes?: (types: string[]) => void;
  selectedMonth?: string;
  selectedYear?: string;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ 
  summary, 
  onNavigateTab, 
  onFilterZonaHitam,
  targetSoTypes = ['M', 'Q1'],
  onChangeTargetTypes,
  selectedMonth = '10',
  selectedYear = '2026'
}) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const effectiveMonth = selectedMonth && selectedMonth !== 'ALL' ? selectedMonth : '10';
  const effectiveYear = selectedYear && selectedYear !== 'ALL' ? selectedYear : '2026';
  const monthNameIndo = getFullMonthNameIndo(effectiveMonth) || 'Oktober';
  const naturalQType = getDefaultQTypeForMonth(effectiveMonth);
  const naturalTargetTypes = getDefaultTargetSoTypes(effectiveMonth);
  const yearShort = effectiveYear.slice(-2);

  const achPercentZona = summary.achievePercentZonaHitam ?? (summary.totalZonaHitam > 0 ? Math.round((summary.zonaHitamTerSO / summary.totalZonaHitam) * 100) : 0);
  const achPercentWajib = summary.achievePercentWajibSO ?? (summary.totalTokoWajibSO > 0 ? Math.round((summary.tokoWajibSOTerSO / summary.totalTokoWajibSO) * 100) : 0);

  const ALL_POSSIBLE_TYPES = ['M', 'Q1', 'Q2', 'Q3'];

  const handleToggleType = (type: string) => {
    if (!onChangeTargetTypes) return;
    const upper = type.toUpperCase();
    if (targetSoTypes.includes(upper)) {
      if (targetSoTypes.length === 1) return; // Keep at least one
      onChangeTargetTypes(targetSoTypes.filter(t => t !== upper));
    } else {
      onChangeTargetTypes([...targetSoTypes, upper]);
    }
  };

  const handleResetToNaturalMonthPreset = () => {
    if (onChangeTargetTypes) {
      onChangeTargetTypes(naturalTargetTypes);
    }
  };

  const handleSetPresetAll = () => {
    if (onChangeTargetTypes) {
      onChangeTargetTypes(['M', 'Q1', 'Q2', 'Q3']);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Primary KPI Cards Grid (5-column responsive) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
        
        {/* 1. Total Master Toko */}
        <div 
          onClick={() => onNavigateTab('stores')}
          className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <p className="text-slate-500 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">
                Total Master Toko
              </p>
              <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-extrabold text-slate-800 mt-1">
              {formatNumber(summary.totalStores)}
            </p>
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500 mt-2 pt-1 border-t border-slate-100">
            <span className="text-emerald-600 font-semibold">Wilayah BALI</span>
            <span className="font-medium text-slate-600">{summary.totalZonaHitam} Zona Hitam</span>
          </div>
        </div>

        {/* 2. Toko Wajib SO (Type M & Q3 / Target Acuan) */}
        <div 
          onClick={() => onNavigateTab('stores')}
          className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white p-3 sm:p-3.5 rounded-xl border border-indigo-700/60 shadow-xs hover:border-indigo-500 transition cursor-pointer group relative overflow-hidden flex flex-col justify-between"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                <p className="text-indigo-300 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">
                  Wajib SO (Type {targetSoTypes.join(' & ')})
                </p>
              </div>
              <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 group-hover:bg-indigo-600 group-hover:text-white transition">
                <Target className="w-4 h-4" />
              </div>
            </div>
            
            <div className="mt-1 flex items-baseline justify-between relative z-10">
              <p className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {summary.totalTokoWajibSO ?? 0} <span className="text-xs font-normal text-slate-300">Toko</span>
              </p>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                achPercentWajib >= 80 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                achPercentWajib >= 50 ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {achPercentWajib}% Ach
              </span>
            </div>
          </div>

          <div className="relative z-10 mt-2">
            <div className="w-full bg-slate-700/60 h-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  achPercentWajib >= 80 ? 'bg-emerald-400' :
                  achPercentWajib >= 50 ? 'bg-indigo-400' : 'bg-amber-400'
                }`}
                style={{ width: `${Math.min(100, achPercentWajib)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-300 mt-1.5 font-medium">
              <span className="text-emerald-400 font-bold">{summary.tokoWajibSOTerSO ?? 0} Ter-SO</span>
              <span className="text-rose-300 font-bold">{summary.tokoWajibSOBelumSO ?? 0} Belum</span>
            </div>
          </div>
        </div>

        {/* 3. Zona Hitam Achievement Highlight Card */}
        <div 
          onClick={() => {
            if (onFilterZonaHitam) onFilterZonaHitam();
            else onNavigateTab('stores');
          }}
          className="bg-gradient-to-br from-slate-900 via-slate-800 to-rose-950 text-white p-3 sm:p-3.5 rounded-xl border border-slate-700 shadow-xs hover:border-rose-500/50 transition cursor-pointer group relative overflow-hidden flex flex-col justify-between"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <p className="text-rose-300 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">
                  Zona Hitam (Prioritas)
                </p>
              </div>
              <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 group-hover:bg-rose-500 group-hover:text-white transition">
                <Flame className="w-4 h-4" />
              </div>
            </div>
            
            <div className="mt-1 flex items-baseline justify-between relative z-10">
              <p className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {summary.totalZonaHitam} <span className="text-xs font-normal text-slate-300">Toko</span>
              </p>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                achPercentZona >= 80 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                achPercentZona >= 50 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}>
                {achPercentZona}% Ach
              </span>
            </div>
          </div>

          <div className="relative z-10 mt-2">
            <div className="w-full bg-slate-700/60 h-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  achPercentZona >= 80 ? 'bg-emerald-400' :
                  achPercentZona >= 50 ? 'bg-amber-400' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, achPercentZona)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-300 mt-1.5 font-medium">
              <span className="text-emerald-400 font-bold">{summary.zonaHitamTerSO} Ter-SO</span>
              <span className="text-rose-300 font-bold">{summary.zonaHitamBelumSO} Belum SO</span>
            </div>
          </div>
        </div>

        {/* 4. Progress SO Selesai Bulan Ini */}
        <div 
          onClick={() => onNavigateTab('schedules')}
          className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <p className="text-slate-500 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">
                Selesai / Terjadwal
              </p>
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <p className="text-xl sm:text-2xl font-extrabold text-slate-800">
                {summary.completedThisMonth}
              </p>
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500">
                Tgt {summary.scheduledThisMonth} Toko
              </span>
            </div>
          </div>

          <div className="mt-2">
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${summary.scheduledThisMonth > 0 ? Math.min(100, Math.round((summary.completedThisMonth / summary.scheduledThisMonth) * 100)) : 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500 mt-1.5">
              <span className="text-indigo-600 font-medium">{summary.inProgressCount} Sedang Proses</span>
              <span className="font-semibold text-slate-700">{summary.scheduledThisMonth > 0 ? Math.round((summary.completedThisMonth / summary.scheduledThisMonth) * 100) : 0}% Selesai</span>
            </div>
          </div>
        </div>

        {/* 5. Approval Pending & Variance */}
        <div 
          onClick={() => onNavigateTab('results')}
          className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition cursor-pointer group flex flex-col justify-between col-span-2 sm:col-span-2 lg:col-span-1"
        >
          <div>
            <div className="flex items-center justify-between">
              <p className="text-slate-500 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">
                Pending SPV Approval
              </p>
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition">
                <FileCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <p className="text-xl sm:text-2xl font-extrabold text-amber-600">
                {summary.pendingApprovalCount}
              </p>
              {summary.pendingApprovalCount > 0 ? (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                  Needs Review
                </span>
              ) : (
                <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Semua Clear
                </span>
              )}
            </div>
          </div>

          <div className="mt-2 pt-1 border-t border-slate-100">
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
              Net Var: <strong className={summary.totalVarianceRp < 0 ? 'text-rose-600 font-mono font-bold' : 'text-emerald-600 font-mono font-bold'}>{formatRupiah(summary.totalVarianceRp)}</strong>
            </p>
          </div>
        </div>

      </div>

      {/* Status Progres Toko Global (Terjadwal, Belum Terjadwal, Sudah Ter-SO, Belum Ter-SO) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
            <h4 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wider">
              Status Keseluruhan Master Toko Bali (Jadwal & Realisasi SO)
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Total Basis: <strong className="text-slate-800 font-bold">{formatNumber(summary.totalMasterStores || summary.totalStores)}</strong> Toko Bali
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Toko Terjadwal (Membaca SO September '26) */}
          <div 
            onClick={() => onNavigateTab('schedules')}
            className="p-2.5 sm:p-3 rounded-lg bg-indigo-50/70 border border-indigo-100 hover:bg-indigo-50 transition cursor-pointer flex items-center justify-between"
          >
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">
                Toko Terjadwal
              </span>
              <p className="text-lg sm:text-xl font-black text-indigo-900 mt-0.5">
                {formatNumber(summary.tokoTerjadwal ?? 0)} <span className="text-xs font-semibold text-indigo-600">Toko</span>
              </p>
              <span className="text-[9px] text-indigo-600/80 font-medium">SO {monthNameIndo} &apos;{yearShort}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-200/60 text-indigo-800">
                {Math.round(((summary.tokoTerjadwal ?? 0) / Math.max(1, summary.totalMasterStores || summary.totalStores)) * 100)}%
              </span>
            </div>
          </div>

          {/* Toko Belum Terjadwal */}
          <div 
            onClick={() => onNavigateTab('stores')}
            className="p-2.5 sm:p-3 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100/80 transition cursor-pointer flex items-center justify-between"
          >
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Belum Terjadwal
              </span>
              <p className="text-lg sm:text-xl font-black text-slate-800 mt-0.5">
                {formatNumber(summary.tokoBelumTerjadwal ?? 0)} <span className="text-xs font-semibold text-slate-500">Toko</span>
              </p>
              <span className="text-[9px] text-slate-500 font-medium">Belum ada tanggal</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                {Math.round(((summary.tokoBelumTerjadwal ?? 0) / Math.max(1, summary.totalMasterStores || summary.totalStores)) * 100)}%
              </span>
            </div>
          </div>

          {/* Sudah Ter-SO (Approval SPV) */}
          <div 
            onClick={() => onNavigateTab('results')}
            className="p-2.5 sm:p-3 rounded-lg bg-emerald-50/70 border border-emerald-100 hover:bg-emerald-50 transition cursor-pointer flex items-center justify-between"
          >
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Sudah Ter-SO (Approved)
              </span>
              <p className="text-lg sm:text-xl font-black text-emerald-900 mt-0.5">
                {formatNumber(summary.tokoSudahTerSO ?? 0)} <span className="text-xs font-semibold text-emerald-600">Toko</span>
              </p>
              <span className="text-[9px] text-emerald-700/80 font-medium">Disetujui SPV</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-xs">
                {summary.persentaseTerSO ?? 0}%
              </span>
            </div>
          </div>

          {/* Belum Ter-SO */}
          <div 
            onClick={() => onNavigateTab('stores')}
            className="p-2.5 sm:p-3 rounded-lg bg-amber-50/70 border border-amber-100 hover:bg-amber-50 transition cursor-pointer flex items-center justify-between"
          >
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
                Belum Ter-SO
              </span>
              <p className="text-lg sm:text-xl font-black text-amber-900 mt-0.5">
                {formatNumber(summary.tokoBelumTerSO ?? 0)} <span className="text-xs font-semibold text-amber-600">Toko</span>
              </p>
              <span className="text-[9px] text-amber-700/80 font-medium">Sisa Target</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-600 text-white shadow-xs">
                {summary.persentaseBelumTerSO ?? 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Breakdown Status Approve SO & Toko Sedang SO (Hari-H Aktif) */}
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Sudah Approve</span>
              <span className="font-extrabold text-emerald-800 text-sm">{formatNumber(summary.tokoSudahApproveSO ?? summary.tokoSudahTerSO ?? 0)} Toko</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/50 border border-amber-100">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Belum Terapprove</span>
              <span className="font-extrabold text-amber-800 text-sm">{formatNumber(summary.tokoBelumTerapproveSO ?? summary.pendingApprovalCount ?? 0)} Toko</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
            <Layers className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Belum SO</span>
              <span className="font-extrabold text-slate-800 text-sm">{formatNumber(summary.tokoBelumSO ?? summary.tokoBelumTerSO ?? 0)} Toko</span>
            </div>
          </div>

          <div 
            onClick={() => onNavigateTab('schedules')}
            className="flex items-center gap-2 p-2 rounded-lg bg-indigo-50 border border-indigo-200 cursor-pointer hover:bg-indigo-100/70 transition"
          >
            <CalendarCheck2 className="w-4 h-4 text-indigo-600 shrink-0" />
            <div>
              <span className="text-[10px] text-indigo-700 font-bold uppercase block">Sedang SO (Hari-H)</span>
              <span className="font-extrabold text-indigo-900 text-sm">{formatNumber(summary.inProgressCount ?? 0)} Jadwal Aktif</span>
            </div>
          </div>
        </div>
      </div>

      {/* Widget Interaktif 1: Kontrol & Monitoring Pencapaian Toko Wajib SO (Type M & Q3) */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-800/60 rounded-xl p-3 sm:p-4 text-white shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0 text-indigo-300">
              <CalendarCheck2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm sm:text-base text-white">
                  Target Acuan Toko Wajib SO
                </h4>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-md border border-indigo-400/40">
                  Bulan {monthNameIndo} {effectiveYear}: Type {targetSoTypes.join(' + ')}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Perhitungan otomatis jumlah toko wajib SO berdasarkan kolom <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300 font-mono">Type SO</code> dan kolom tanggal <code className="bg-slate-800 px-1 py-0.5 rounded text-emerald-300 font-mono">SO {monthNameIndo.toUpperCase()} &apos;{yearShort}</code>.
              </p>
            </div>
          </div>

          {/* Interactive Type Selector Chips */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-[11px] font-semibold text-slate-400">Pilih Acuan Type:</span>
            {ALL_POSSIBLE_TYPES.map(type => {
              const isSelected = targetSoTypes.includes(type);
              const countForType = summary.breakdownTypeSO?.[type]?.total ?? 0;
              const terSoCount = summary.breakdownTypeSO?.[type]?.terSO ?? 0;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleToggleType(type)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-xs'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                  title={`Klik untuk ${isSelected ? 'menonaktifkan' : 'mengaktifkan'} acuan Type ${type}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-300' : 'bg-slate-500'}`} />
                  <span>Type {type}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-700 text-slate-400'}`}>
                    {countForType} toko ({terSoCount} SO)
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={handleResetToNaturalMonthPreset}
              className="text-[11px] text-amber-300 hover:text-amber-200 underline font-semibold ml-1 cursor-pointer"
            >
              Reset ke Acuan {monthNameIndo} (M + {naturalQType})
            </button>
          </div>
        </div>

        {/* Target Real-time Metrics Summary & Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800">
          <div className="bg-slate-800/90 px-3 py-1.5 rounded-lg border border-slate-700/80">
            <span className="text-[10px] text-slate-400 block font-medium">Total Wajib SO</span>
            <span className="text-sm font-black text-white">{summary.totalTokoWajibSO ?? 0} Toko</span>
          </div>

          <div className="bg-emerald-950/50 px-3 py-1.5 rounded-lg border border-emerald-700/60">
            <span className="text-[10px] text-emerald-400 block font-medium">Sudah Ter-SO</span>
            <span className="text-sm font-black text-emerald-300">{summary.tokoWajibSOTerSO ?? 0} Toko</span>
          </div>

          <div className="bg-rose-950/50 px-3 py-1.5 rounded-lg border border-rose-700/60">
            <span className="text-[10px] text-rose-400 block font-medium">Belum SO</span>
            <span className="text-sm font-black text-rose-300">{summary.tokoWajibSOBelumSO ?? 0} Toko</span>
          </div>

          <div className="bg-indigo-950/50 px-3 py-1.5 rounded-lg border border-indigo-700/60">
            <span className="text-[10px] text-indigo-300 block font-medium">Realisasi</span>
            <span className="text-sm font-black text-indigo-200">{achPercentWajib}% Ach</span>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('stores')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-xs cursor-pointer ml-auto lg:ml-0 active:scale-95"
          >
            <span>Lihat Daftar Toko Wajib</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Widget Interaktif 2: Zona Hitam Deep-Dive Widget Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm sm:text-base text-white">
                Monitoring Pencapaian Toko Zona Hitam (Audit Prioritas)
              </h4>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-900/60 text-rose-300 px-2 py-0.5 rounded-md border border-rose-700/50">
                Wajib SO
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Target kepatuhan audit untuk toko-toko berkategori Zona Hitam berdasarkan persetujuan jadwal master & bulan berjalan.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60">
            <span className="text-[10px] text-slate-400 block font-medium">Total Zona Hitam</span>
            <span className="text-sm font-black text-white">{summary.totalZonaHitam} Toko</span>
          </div>

          <div className="bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-800/50">
            <span className="text-[10px] text-emerald-400 block font-medium">Sudah Ter-SO (Disetujui)</span>
            <span className="text-sm font-black text-emerald-300">{summary.zonaHitamTerSO} Toko</span>
          </div>

          <div className="bg-rose-950/40 px-3 py-1.5 rounded-lg border border-rose-800/50">
            <span className="text-[10px] text-rose-400 block font-medium">Belum SO</span>
            <span className="text-sm font-black text-rose-300">{summary.zonaHitamBelumSO} Toko</span>
          </div>

          <div className="bg-indigo-950/40 px-3 py-1.5 rounded-lg border border-indigo-800/50">
            <span className="text-[10px] text-indigo-300 block font-medium">Presentase Pencapaian</span>
            <span className="text-sm font-black text-indigo-200">{achPercentZona}% Ach</span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onFilterZonaHitam) onFilterZonaHitam();
              else onNavigateTab('stores');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-xs cursor-pointer ml-auto md:ml-0 active:scale-95"
          >
            <span>Lihat Daftar Toko</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};


