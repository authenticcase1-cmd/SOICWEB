import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Wand2, 
  Search, 
  Filter, 
  Download, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Edit3, 
  Building2,
  Users,
  FileSpreadsheet,
  UserCheck,
  ClipboardList,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Layers,
  MapPin,
  DollarSign,
  ShieldAlert,
  CalendarDays,
  RotateCcw,
  X,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  CheckSquare,
  AlertTriangle,
  Flame,
  ArrowUpDown,
  PowerOff,
  Tag
} from 'lucide-react';
import { SOSchedule, Store, SOTeam, RegionArea, UserRole, AuditorPersonnel, SOResult } from '../../types/stockOpname';
import { REGIONS } from '../../data/initialData';
import { getStatusBadgeClass, formatDateIndo, formatRupiah, parseSmartDate, parseSmartDateWithContext, formatDateISO } from '../../utils/formatters';
import { getDayNameIndo, isStoreSOAktiva, getSOAktivaLabel } from '../../utils/storeSyncUtils';
import { exportToCSV } from '../../services/storageService';
import { KorlapDashboard } from './KorlapDashboard';
import { KorlapAvatarBar } from './KorlapAvatarBar';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { ToastNotification } from '../Common/ToastNotification';
import { SpreadsheetSyncModal } from '../Stores/SpreadsheetSyncModal';
import { 
  getLocalSpreadsheetConfig, 
  deactivateSpreadsheetSync,
  GoogleSpreadsheetConfig 
} from '../../services/googleSpreadsheetService';
import { 
  getAvailableKorlapList, 
  isKorlapMatch, 
  normalizeKorlapName, 
  resolveSchedulePersonnelDisplay,
  resolveStoreDefaultKorlap
} from '../../utils/korlapUtils';

interface ScheduleManagerProps {
  schedules: SOSchedule[];
  stores: Store[];
  teams: SOTeam[];
  personnel?: AuditorPersonnel[];
  results?: SOResult[];
  currentRole?: UserRole;
  onOpenCreateModal: () => void;
  onOpenAutoGenerator: () => void;
  onOpenKorlapImageModal?: () => void;
  onOpenInputModal?: (scheduleOrId?: SOSchedule | string) => void;
  onUpdateStatus: (scheduleId: string, status: SOSchedule['status']) => void;
  onDeleteSchedule: (scheduleId: string) => void;
  onAssignPersonnel?: (schedule: SOSchedule) => void;
  onOpenGagalPindahModal?: (schedule: SOSchedule) => void;
  onConfirmScheduleFinished?: (scheduleId: string) => void;
  onApproveSchedule?: (scheduleId: string) => void;
  onRejectSchedule?: (scheduleId: string, reason?: string) => void;
  onTwoWaySync?: () => void;
  onResetSchedules?: () => void;
  onResetMasterAndSchedules?: () => void;
}

export const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  schedules,
  stores,
  teams,
  personnel = [],
  results = [],
  currentRole = 'ALL',
  onOpenCreateModal,
  onOpenAutoGenerator,
  onOpenKorlapImageModal,
  onOpenInputModal,
  onUpdateStatus,
  onDeleteSchedule,
  onAssignPersonnel,
  onOpenGagalPindahModal,
  onConfirmScheduleFinished,
  onApproveSchedule,
  onRejectSchedule,
  onTwoWaySync,
  onResetSchedules,
  onResetMasterAndSchedules
}) => {
  const [activeScheduleTab, setActiveScheduleTab] = useState<'HARI_H' | 'H_MINUS_1' | 'ALL_SEPTEMBER'>('ALL_SEPTEMBER');
  const [isSpreadsheetModalOpen, setIsSpreadsheetModalOpen] = useState(false);
  const [spreadsheetConfig, setSpreadsheetConfig] = useState<GoogleSpreadsheetConfig>(() => getLocalSpreadsheetConfig());
  const [isDeactivatingSpreadsheet, setIsDeactivatingSpreadsheet] = useState(false);

  // Keep spreadsheet config in sync
  useEffect(() => {
    const handleConfigEvent = (e: any) => {
      if (e.detail) {
        setSpreadsheetConfig(e.detail);
      } else {
        setSpreadsheetConfig(getLocalSpreadsheetConfig());
      }
    };
    window.addEventListener('spreadsheet_config_updated', handleConfigEvent);
    return () => window.removeEventListener('spreadsheet_config_updated', handleConfigEvent);
  }, []);

  const handleDeactivateSpreadsheet = async () => {
    if (!window.confirm('Apakah Anda yakin ingin menonaktifkan sinkronisasi Google Spreadsheet?')) {
      return;
    }
    setIsDeactivatingSpreadsheet(true);
    try {
      const updated = await deactivateSpreadsheetSync();
      setSpreadsheetConfig(updated);
      setToastMessage('Sinkronisasi Google Spreadsheet telah dinonaktifkan.');
    } catch (err: any) {
      setToastMessage('Gagal menonaktifkan sinkronisasi: ' + (err?.message || 'Error'));
    } finally {
      setIsDeactivatingSpreadsheet(false);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedGroupKorlap, setSelectedGroupKorlap] = useState<string>('ALL');
  const [selectedSOAktivaFilter, setSelectedSOAktivaFilter] = useState<'ALL' | 'SO_AKTIVA' | 'NON_SO_AKTIVA'>('ALL');
  const [tableLayoutMode, setTableLayoutMode] = useState<'SHEET_JADWAL' | 'COMPACT'>('SHEET_JADWAL');

  // Date, Month, Year Filter States
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedDay, setSelectedDay] = useState<string>('ALL');
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<string>('ALL');
  const [selectedSpecificDate, setSelectedSpecificDate] = useState<string>('');
  const [isResetConfirmModalOpen, setIsResetConfirmModalOpen] = useState<boolean>(false);
  const [resetConfirmInput, setResetConfirmInput] = useState<string>('');
  
  const [superAdminRoleMode, setSuperAdminRoleMode] = useState<'SUPERVISOR' | 'OFFICER'>('SUPERVISOR');
  const [viewMode, setViewMode] = useState<'list' | 'officer' | 'calendar' | 'approval'>(
    currentRole === 'OFFICER' ? 'officer' : 'list'
  );
  const [approvalTab, setApprovalTab] = useState<'SELESAI' | 'PINDAH' | 'GAGAL'>('SELESAI');
  const [scheduleToDelete, setScheduleToDelete] = useState<SOSchedule | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);

  // Main Korlap groups from sheet JADWAL & PERSONIL
  const primaryKorlaps = useMemo(() => {
    return getAvailableKorlapList(personnel);
  }, [personnel]);

  // Compute available regions strictly from store master data
  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    stores.forEach(s => {
      if (s.region) set.add(s.region);
      else if (s.kabupaten) set.add(s.kabupaten);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [stores]);

  // Compute available years dynamically from schedules
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    set.add('2026');
    set.add('2025');
    set.add('2027');
    schedules.forEach(s => {
      const parsed = parseSmartDate(s.scheduledDate);
      if (parsed) {
        set.add(String(parsed.getFullYear()));
      } else if (s.scheduledDate) {
        const m = s.scheduledDate.match(/\b(20\d{2})\b/);
        if (m) set.add(m[1]);
      }
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [schedules]);

  const monthOptions = [
    { value: 'ALL', label: 'Semua Bulan' },
    { value: '01', label: '01 - Januari' },
    { value: '02', label: '02 - Februari' },
    { value: '03', label: '03 - Maret' },
    { value: '04', label: '04 - April' },
    { value: '05', label: '05 - Mei' },
    { value: '06', label: '06 - Juni' },
    { value: '07', label: '07 - Juli' },
    { value: '08', label: '08 - Agustus' },
    { value: '09', label: '09 - September' },
    { value: '10', label: '10 - Oktober' },
    { value: '11', label: '11 - November' },
    { value: '12', label: '12 - Desember' }
  ];

  const dayOptions = useMemo(() => {
    return Array.from({ length: 31 }, (_, i) => {
      const dayNum = i + 1;
      const dayVal = String(dayNum).padStart(2, '0');
      return { value: dayVal, label: `Tgl ${dayNum}` };
    });
  }, []);

  const isDateFilterActive = selectedYear !== 'ALL' || selectedMonth !== 'ALL' || selectedDay !== 'ALL' || selectedDayOfWeek !== 'ALL' || Boolean(selectedSpecificDate);

  const handleResetDateFilters = () => {
    setSelectedYear('ALL');
    setSelectedMonth('ALL');
    setSelectedDay('ALL');
    setSelectedDayOfWeek('ALL');
    setSelectedSpecificDate('');
    setActiveScheduleTab('ALL_SEPTEMBER');
  };

  const handleSetToday = () => {
    const today = new Date();
    const iso = formatDateISO(today);
    setSelectedSpecificDate(iso);
    setSelectedYear(String(today.getFullYear()));
    setSelectedMonth(String(today.getMonth() + 1).padStart(2, '0'));
    setSelectedDay(String(today.getDate()).padStart(2, '0'));
    setSelectedDayOfWeek(getDayNameIndo(iso));
  };

  // Helper to accurately resolve Korlap for schedule based on Master Store as Primary Source of Truth
  const getEffectiveKorlapForSchedule = React.useCallback((s: SOSchedule): string => {
    // 1. PRIORITAS UTAMA: Kolom Korlap / Officer pada Master Toko
    const matchingStore = stores.find(st => 
      (st.code && s.storeCode && st.code.trim().toUpperCase() === s.storeCode.trim().toUpperCase()) || 
      (st.id && s.storeId && st.id.trim().toUpperCase() === s.storeId.trim().toUpperCase()) ||
      (st.name && s.storeName && st.name.trim().toLowerCase() === s.storeName.trim().toLowerCase())
    );
    if (matchingStore?.korlap && matchingStore.korlap !== 'Petugas SO' && matchingStore.korlap !== 'PETUGAS SO' && matchingStore.korlap !== 'Belum Ditentukan') {
      return normalizeKorlapName(matchingStore.korlap) || matchingStore.korlap;
    }

    // 2. Fallback jika master toko belum memiliki korlap: gunakan data group/officer dari jadwal
    if (s.groupName && s.groupName !== 'Petugas SO' && s.groupName !== 'PETUGAS SO') {
      return normalizeKorlapName(s.groupName) || s.groupName;
    }
    if (s.officerInCharge && s.officerInCharge !== 'Petugas SO' && s.officerInCharge !== 'PETUGAS SO') {
      return normalizeKorlapName(s.officerInCharge) || s.officerInCharge;
    }

    // 3. Fallback wilayah jika belum ada korlap sama sekali
    const fallbackDefault = resolveStoreDefaultKorlap({
      kabupaten: matchingStore?.kabupaten || matchingStore?.region || s.region,
      region: matchingStore?.region || s.region,
      as: matchingStore?.as || s.asInitial,
      am: matchingStore?.am,
      name: s.storeName,
      address: matchingStore?.address
    });
    return fallbackDefault || 'Belum Ditentukan';
  }, [stores]);

  // Helper to dynamically calculate day name strictly from the schedule date
  const getScheduleDayName = React.useCallback((s: SOSchedule): string => {
    if (s.scheduledDate) {
      const parsed = parseSmartDateWithContext(s.scheduledDate, '09', '2026');
      if (parsed && !isNaN(parsed.getTime())) {
        return getDayNameIndo(formatDateISO(parsed));
      }
    }
    return s.dayName || '-';
  }, []);

  // Pending approval schedule groups
  const pendingSelesai = schedules.filter(s => s.status === 'Selesai' && (s.spvApprovalStatus === 'Menunggu Approval SPV' || !s.spvApprovalStatus));
  const pendingPindah = schedules.filter(s => (s.status === 'Pindah Toko' || s.failureOrMoveType === 'Pindah Toko') && (s.spvApprovalStatus === 'Menunggu Approval SPV' || !s.spvApprovalStatus));
  const pendingGagal = schedules.filter(s => (s.status === 'Gagal SO' || s.failureOrMoveType === 'Gagal SO') && (s.spvApprovalStatus === 'Menunggu Approval SPV' || !s.spvApprovalStatus));
  const totalPendingApprovalCount = pendingSelesai.length + pendingPindah.length + pendingGagal.length;

  // Effective role for layout rendering
  const activeRoleContext = currentRole === 'ALL' ? superAdminRoleMode : currentRole;

  // Sync viewMode if currentRole changes
  React.useEffect(() => {
    if (activeRoleContext === 'OFFICER') {
      if (viewMode === 'approval') {
        setViewMode('officer');
      }
    }
  }, [currentRole, superAdminRoleMode, activeRoleContext, viewMode]);

  // Filtered schedules
  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      const matchesSearch = 
        s.storeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.storeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.teamName && s.teamName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.teamCategory && s.teamCategory.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.groupName && s.groupName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.personilLeader && s.personilLeader.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.officerInCharge && s.officerInCharge.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.spvInCharge && s.spvInCharge.toLowerCase().includes(searchQuery.toLowerCase()));
      
      let matchesRegion = true;
      if (selectedRegion !== 'ALL') {
        const schedReg = (s.region || '').trim().toLowerCase();
        const targetReg = selectedRegion.trim().toLowerCase();
        const matchingStore = stores.find(st => 
          (st.code && s.storeCode && st.code.trim().toUpperCase() === s.storeCode.trim().toUpperCase()) || 
          (st.id && s.storeId && st.id.trim().toUpperCase() === s.storeId.trim().toUpperCase())
        );
        const storeReg = (matchingStore?.region || '').trim().toLowerCase();
        const storeKab = (matchingStore?.kabupaten || matchingStore?.city || '').trim().toLowerCase();
        
        matchesRegion = 
          schedReg === targetReg ||
          storeReg === targetReg ||
          storeKab === targetReg ||
          (schedReg.length > 3 && targetReg.includes(schedReg)) ||
          (targetReg.length > 3 && schedReg.includes(targetReg)) ||
          (storeReg.length > 3 && targetReg.includes(storeReg)) ||
          (targetReg.length > 3 && storeReg.includes(targetReg));
      }
      
      const matchesStatus = selectedStatus === 'ALL' || s.status === selectedStatus;
      
      let matchesGroup = true;
      if (selectedGroupKorlap !== 'ALL') {
        const effKorlap = getEffectiveKorlapForSchedule(s);
        matchesGroup = !!effKorlap && effKorlap !== 'Belum Ditentukan' && isKorlapMatch(effKorlap, selectedGroupKorlap);
      }

      // Date Filtering Logic
      let matchesDate = true;
      const parsed = parseSmartDateWithContext(s.scheduledDate, '09', '2026');
      const iso = (parsed && !isNaN(parsed.getTime())) ? formatDateISO(parsed) : s.scheduledDate;

      if (selectedSpecificDate) {
        matchesDate = (iso === selectedSpecificDate);
      } else if (selectedYear !== 'ALL' || selectedMonth !== 'ALL' || selectedDay !== 'ALL') {
        if (parsed && !isNaN(parsed.getTime())) {
          const y = String(parsed.getFullYear());
          const m = String(parsed.getMonth() + 1).padStart(2, '0');
          const d = String(parsed.getDate()).padStart(2, '0');

          const matchesYear = selectedYear === 'ALL' || y === selectedYear;
          // In September 2026 scheduling context, if day is selected but month is ALL, default to September '09'
          const effectiveMonthFilter = (selectedMonth === 'ALL' && selectedDay !== 'ALL') ? '09' : selectedMonth;
          const matchesMonth = effectiveMonthFilter === 'ALL' || m === effectiveMonthFilter;
          const matchesDay = selectedDay === 'ALL' || d === selectedDay;

          matchesDate = matchesYear && matchesMonth && matchesDay;
        } else {
          matchesDate = false;
        }
      }

      let matchesDayOfWeek = true;
      if (selectedDayOfWeek !== 'ALL') {
        const scheduleDay = getScheduleDayName(s);
        matchesDayOfWeek = scheduleDay.trim().toUpperCase() === selectedDayOfWeek.trim().toUpperCase();
      }

      let matchesSOAktiva = true;
      if (selectedSOAktivaFilter !== 'ALL') {
        const matchingStore = stores.find(st => 
          (st.code && s.storeCode && st.code.trim().toUpperCase() === s.storeCode.trim().toUpperCase()) || 
          (st.id && s.storeId && st.id.trim().toUpperCase() === s.storeId.trim().toUpperCase())
        );
        const isAktiva = isStoreSOAktiva(matchingStore || s);
        if (selectedSOAktivaFilter === 'SO_AKTIVA' && !isAktiva) matchesSOAktiva = false;
        if (selectedSOAktivaFilter === 'NON_SO_AKTIVA' && isAktiva) matchesSOAktiva = false;
      }

      return matchesSearch && matchesRegion && matchesStatus && matchesGroup && matchesDate && matchesDayOfWeek && matchesSOAktiva;
    });
  }, [schedules, searchQuery, selectedRegion, selectedStatus, selectedGroupKorlap, selectedSOAktivaFilter, selectedYear, selectedMonth, selectedDay, selectedDayOfWeek, selectedSpecificDate, stores, getEffectiveKorlapForSchedule, getScheduleDayName]);

  // Dashboard Stats Calculations
  const dashboardStats = useMemo(() => {
    const total = schedules.length;
    const filtered = filteredSchedules.length;
    let scheduled = 0;
    let inProgress = 0;
    let completed = 0;
    let kendala = 0;
    let zonaHitam = 0;

    filteredSchedules.forEach(s => {
      if (s.status === 'Terjadwal') scheduled++;
      else if (s.status === 'Proses SO' || s.status === 'Menunggu Rekapan') inProgress++;
      else if (s.status === 'Selesai' || s.spvApprovalStatus === 'Disetujui SPV') completed++;
      else if (s.status === 'Gagal SO' || s.status === 'Pindah Toko') kendala++;

      const matchingStore = stores.find(st => st.code === s.storeCode || st.id === s.storeId);
      const zVal = (s.zona || matchingStore?.zona || '').toUpperCase();
      if (!zVal.includes('NON') && !zVal.includes('BUKAN') && !zVal.includes('TIDAK') && (zVal.includes('HITAM') || matchingStore?.isZonaHitam === true)) {
        zonaHitam++;
      }
    });

    return { total, filtered, scheduled, inProgress, completed, kendala, zonaHitam };
  }, [schedules, filteredSchedules, stores]);

  // Active filters count for notification badge
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedGroupKorlap !== 'ALL') count++;
    if (selectedRegion !== 'ALL') count++;
    if (selectedStatus !== 'ALL') count++;
    if (selectedYear !== 'ALL') count++;
    if (selectedMonth !== 'ALL') count++;
    if (selectedDay !== 'ALL') count++;
    if (selectedSpecificDate) count++;
    return count;
  }, [selectedGroupKorlap, selectedRegion, selectedStatus, selectedYear, selectedMonth, selectedDay, selectedSpecificDate]);

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setSelectedGroupKorlap('ALL');
    setSelectedRegion('ALL');
    setSelectedStatus('ALL');
    handleResetDateFilters();
  };

  const getAccurateRegionForSchedule = (s: SOSchedule): string => {
    const matchingStore = stores.find(st => st.code === s.storeCode || st.id === s.storeId);
    if (matchingStore) {
      if (matchingStore.kabupaten) return matchingStore.kabupaten;
      if (matchingStore.region) return matchingStore.region;
    }
    return s.region || 'Kab. Badung';
  };

  const handleExportSchedules = () => {
    const data = filteredSchedules.map((s, idx) => ({
      'NO': idx + 1,
      'TEAM': s.teamCategory || s.teamName || 'TEAM 1',
      'GROUP': getEffectiveKorlapForSchedule(s),
      'PERSONIL': s.personilLeader || (s.assignedPersonnelNames && s.assignedPersonnelNames[0]) || '',
      'HARI': getScheduleDayName(s),
      'KODE TOKO': s.storeCode,
      'NAMA TOKO': s.storeName,
      'STOCK RP': s.stockRp || 0,
      'TGL SO': s.scheduledDate,
      'TYPE SO': s.typeSo || 'M',
      'KAS TOKO': s.kasToko || 0,
      'ZONA': s.zona || 'NON ZONA HITAM',
      'AS': s.asInitial || '',
      'STATUS': s.status,
      'WILAYAH': getAccurateRegionForSchedule(s),
      'ANGGOTA TIM': s.assignedPersonnelNames && s.assignedPersonnelNames.length > 0 ? s.assignedPersonnelNames.join('; ') : 'Belum Dialokasikan',
      'CATATAN': s.notes || ''
    }));
    exportToCSV('Penjadwalan_SO_Sheet_Jadwal.csv', data);
  };

  // Date Calculations for Kolom Hitam
  const now = new Date();
  const todayStr = formatDateISO(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDateISO(tomorrow);

  const todayCount = useMemo(() => {
    return schedules.filter(s => {
      const parsed = parseSmartDateWithContext(s.scheduledDate, '09', '2026');
      const iso = (parsed && !isNaN(parsed.getTime())) ? formatDateISO(parsed) : s.scheduledDate;
      return iso === todayStr || s.scheduledDate === todayStr;
    }).length;
  }, [schedules, todayStr]);

  const tomorrowCount = useMemo(() => {
    return schedules.filter(s => {
      const parsed = parseSmartDateWithContext(s.scheduledDate, '09', '2026');
      const iso = (parsed && !isNaN(parsed.getTime())) ? formatDateISO(parsed) : s.scheduledDate;
      return iso === tomorrowStr || s.scheduledDate === tomorrowStr;
    }).length;
  }, [schedules, tomorrowStr]);

  const handleSelectScheduleTab = (tab: 'HARI_H' | 'H_MINUS_1' | 'ALL_SEPTEMBER') => {
    setActiveScheduleTab(tab);
    if (tab === 'HARI_H') {
      setSelectedSpecificDate(todayStr);
    } else if (tab === 'H_MINUS_1') {
      setSelectedSpecificDate(tomorrowStr);
    } else {
      setSelectedSpecificDate('');
      setSelectedYear('2026');
      setSelectedMonth('09');
      setSelectedDay('ALL');
      setSelectedDayOfWeek('ALL');
    }
  };

  // Total stores for selected Korlap throughout entire month of September
  const korlapTotalMonthCount = useMemo(() => {
    if (selectedGroupKorlap === 'ALL') return schedules.length;
    return schedules.filter(s => {
      const effectiveKorlap = getEffectiveKorlapForSchedule(s);
      return !!effectiveKorlap && isKorlapMatch(effectiveKorlap, selectedGroupKorlap);
    }).length;
  }, [schedules, selectedGroupKorlap, getEffectiveKorlapForSchedule]);

  return (
    <div className="space-y-4">
      
      {/* 1. Header Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-indigo-600" />
                Penjadwalan Stock Opname (SO) Harian
              </h2>
              {currentRole === 'ALL' && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-1">
                  👑 Super Account Mode ({superAdminRoleMode === 'SUPERVISOR' ? 'View: Supervisor' : 'View: Korlap'})
                </span>
              )}
              {currentRole === 'OFFICER' && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Portal Korlap / Officer
                </span>
              )}
              {currentRole === 'SUPERVISOR' && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Portal Supervisor
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeRoleContext === 'OFFICER' 
                ? 'Portal Eksekusi & Monitoring Lapangan Hari-H & H-1 untuk Korlap & Auditor SO'
                : 'Struktur Penjadwalan terhubung langsung dengan Sheet Jadwal & Master Toko Bali'}
            </p>
          </div>

          {/* Role Switcher for Super Account */}
          {currentRole === 'ALL' && (
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-purple-200 shadow-2xs">
              <button
                onClick={() => {
                  setSuperAdminRoleMode('SUPERVISOR');
                  setViewMode('list');
                }}
                className={`w-full sm:w-auto px-3 py-2 text-xs font-black rounded-lg transition flex items-center justify-center gap-1.5 ${
                  superAdminRoleMode === 'SUPERVISOR'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                <span>👔 Portal Supervisor</span>
              </button>

              <button
                onClick={() => {
                  setSuperAdminRoleMode('OFFICER');
                  setViewMode('officer');
                }}
                className={`w-full sm:w-auto px-3 py-2 text-xs font-black rounded-lg transition flex items-center justify-center gap-1.5 ${
                  superAdminRoleMode === 'OFFICER'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <span>📱 Portal Korlap (H-1 & Hari-H)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. KOLOM HITAM (JADWAL HARI-H, H-1, DAN SEMUA JADWAL) - DITARUH DIATAS AVATAR KORLAP */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-xl border border-indigo-500/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                Portal Operasional Korlap Mobile
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold">
                Auto Terhubung Master Toko Bali
              </span>
            </div>
            <h2 className="text-base sm:text-xl font-black text-white tracking-tight">
              Jadwal SO Hari-H Korlap
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-300 max-w-2xl leading-relaxed">
              Tampilan operasional khusus Korlap: fokus pada <strong>Kode, Nama, Stock, Kas Toko, Tgl SO + Hari, SO Aktiva, Zona, dan Catatan SPV</strong> dengan aksi cepat mobile.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setIsSpreadsheetModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white text-xs font-bold transition border border-emerald-400/40 flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Sinkronkan pembaruan jadwal dari Google Spreadsheet Master Toko"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>Sinkron Spreadsheet</span>
              {spreadsheetConfig.url && spreadsheetConfig.isActive !== false && (
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse ml-0.5" title="Sinkron aktif" />
              )}
            </button>
            {spreadsheetConfig.url && spreadsheetConfig.isActive !== false && (
              <button
                onClick={handleDeactivateSpreadsheet}
                disabled={isDeactivatingSpreadsheet}
                className="px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Nonaktifkan sinkronisasi Google Spreadsheet"
              >
                <PowerOff className="w-3.5 h-3.5 text-rose-400" />
                <span>{isDeactivatingSpreadsheet ? 'Menonaktifkan...' : 'Nonaktifkan Sinkron'}</span>
              </button>
            )}
            <button
              onClick={handleExportSchedules}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-98 text-white text-xs font-bold transition border border-white/10 flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Export CSV Hari-H</span>
            </button>
          </div>
        </div>

        {/* Tab Selection: Hari-H vs H-1 vs Semua September */}
        <div className="mt-3.5 pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-2">
          
          <button
            type="button"
            onClick={() => handleSelectScheduleTab('HARI_H')}
            className={`p-3 rounded-xl text-left transition flex items-center justify-between border ${
              activeScheduleTab === 'HARI_H'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span className="font-bold text-xs">📍 Jadwal Hari-H (Hari Ini)</span>
                <span className={`px-1.5 py-0.2 text-[10px] font-black rounded-md ${todayCount > 0 ? 'bg-emerald-400 text-slate-900' : 'bg-white/10 text-slate-400'}`}>
                  {todayCount} toko
                </span>
              </div>
              <p className="text-[10px] opacity-80 mt-0.5">
                Target: {todayStr} ({getDayNameIndo(todayStr)})
              </p>
            </div>
            {activeScheduleTab === 'HARI_H' && (
              <span className="px-2 py-0.5 rounded-md bg-white/20 text-[10px] font-black">Aktif</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectScheduleTab('H_MINUS_1')}
            className={`p-3 rounded-xl text-left transition flex items-center justify-between border ${
              activeScheduleTab === 'H_MINUS_1'
                ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs">📅 Jadwal H-1 (Persiapan Besok)</span>
                <span className={`px-1.5 py-0.2 text-[10px] font-black rounded-md ${tomorrowCount > 0 ? 'bg-amber-300 text-slate-900' : 'bg-white/10 text-slate-400'}`}>
                  {tomorrowCount} toko
                </span>
              </div>
              <p className="text-[10px] opacity-80 mt-0.5">
                Target: {tomorrowStr} ({getDayNameIndo(tomorrowStr)})
              </p>
            </div>
            {activeScheduleTab === 'H_MINUS_1' && (
              <span className="px-2 py-0.5 rounded-md bg-white/20 text-[10px] font-black">Aktif</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectScheduleTab('ALL_SEPTEMBER')}
            className={`p-3 rounded-xl text-left transition flex items-center justify-between border ${
              activeScheduleTab === 'ALL_SEPTEMBER'
                ? 'bg-purple-600 text-white border-purple-400 shadow-lg'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-purple-300" />
                <span className="font-bold text-xs">🗓️ Semua Jadwal September</span>
                <span className="px-1.5 py-0.2 text-[10px] font-black rounded-md bg-purple-300 text-slate-900">
                  {schedules.length} toko
                </span>
              </div>
              <p className="text-[10px] opacity-80 mt-0.5">
                Total {schedules.length} Toko Master Terhubung
              </p>
            </div>
            {activeScheduleTab === 'ALL_SEPTEMBER' && (
              <span className="px-2 py-0.5 rounded-md bg-white/20 text-[10px] font-black">Aktif</span>
            )}
          </button>

        </div>
      </div>

      {/* 3. AVATAR KORLAP (DIBAWAHNYA KOLOM HITAM) */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs">
        <KorlapAvatarBar
          schedules={schedules}
          stores={stores}
          personnel={personnel}
          selectedKorlap={selectedGroupKorlap}
          onSelectKorlap={(korlapName) => {
            setSelectedGroupKorlap(korlapName);
            if (korlapName !== 'ALL') {
              // Check how many stores exist for this Korlap on current filter
              const countOnCurrentFilter = schedules.filter(s => {
                const effectiveKorlap = getEffectiveKorlapForSchedule(s);
                if (!isKorlapMatch(effectiveKorlap, korlapName)) return false;
                if (selectedSpecificDate) {
                  const normDate = formatDateISO(s.scheduledDate);
                  return normDate === selectedSpecificDate || s.scheduledDate === selectedSpecificDate;
                }
                if (activeScheduleTab === 'HARI_H') {
                  const normDate = formatDateISO(s.scheduledDate);
                  return normDate === todayStr || s.scheduledDate === todayStr;
                }
                if (activeScheduleTab === 'H_MINUS_1') {
                  const normDate = formatDateISO(s.scheduledDate);
                  return normDate === tomorrowStr || s.scheduledDate === tomorrowStr;
                }
                return true;
              }).length;

              // If 0 stores on the currently filtered single day, auto-switch to ALL_SEPTEMBER so stores appear immediately!
              if (countOnCurrentFilter === 0) {
                setActiveScheduleTab('ALL_SEPTEMBER');
                setSelectedSpecificDate('');
                setSelectedYear('2026');
                setSelectedMonth('09');
                setSelectedDay('ALL');
                setSelectedDayOfWeek('ALL');
              }
            }
          }}
        />
      </div>

      {/* 4. COLLAPSIBLE FILTER & ACTION TOOLBAR */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        
        {/* Top Search & Toggle Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-500" />
            <input
              type="text"
              placeholder="Cari toko, IDM, personil, group korlap, zona..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 hover:border-slate-400 focus:border-indigo-500 focus:bg-white rounded-xl text-xs sm:text-sm pl-10 pr-9 py-2.5 text-slate-900 font-medium placeholder-slate-400 transition focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 bg-slate-200/60 w-5 h-5 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filter Pill Buttons + Toggle Button */}
          <div className="flex items-center gap-2 flex-wrap">
            
            {/* Toggle Button for Collapsible Advanced Filters */}
            <button
              type="button"
              onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shadow-2xs ${
                isFilterExpanded || activeFiltersCount > 0
                  ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
              <span>{isFilterExpanded ? 'Sembunyikan Filter' : 'Opsi Filter'}</span>
              {activeFiltersCount > 0 && (
                <span className="bg-indigo-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {activeFiltersCount}
                </span>
              )}
              {isFilterExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 ml-0.5 text-indigo-600" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 ml-0.5 text-slate-400" />
              )}
            </button>

            {/* Quick Date Shortcuts */}
            <button
              type="button"
              onClick={handleSetToday}
              className="px-2.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition shrink-0"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSpecificDate('');
                setSelectedYear('2026');
                setSelectedMonth('09');
                setSelectedDay('ALL');
                setSelectedDayOfWeek('ALL');
                setActiveScheduleTab('ALL_SEPTEMBER');
              }}
              className="px-2.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl border border-purple-200 transition shrink-0"
            >
              Sep 2026 ({schedules.length})
            </button>
            {onTwoWaySync && (
              <button
                type="button"
                id="btn-two-way-sync-primary"
                onClick={() => {
                  onTwoWaySync();
                  setToastMessage('✅ Sinkronisasi 2-Arah Berhasil: Seluruh jadwal toko dan korlap diperbarui langsung dari Master Toko!');
                }}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl border border-emerald-500 shadow-sm transition flex items-center gap-1.5 shrink-0"
                title="Tarik dan sinkronkan jadwal dari Master Toko ke daftar jadwal & korlap"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-100" />
                <span>2-Way Sync (Baca Master)</span>
              </button>
            )}

            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="px-2.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition flex items-center gap-1 shrink-0"
                title="Reset semua filter"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
          </div>

        </div>

        {/* Active Filter Chips (Always visible when active for quick feedback) */}
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
            <span className="text-slate-400 font-medium">Filter aktif:</span>
            
            {selectedGroupKorlap !== 'ALL' && (
              <span className="bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                Korlap: {primaryKorlaps.find(k => k === selectedGroupKorlap) || selectedGroupKorlap}
                <button type="button" onClick={() => setSelectedGroupKorlap('ALL')} className="hover:text-rose-600 font-black">×</button>
              </span>
            )}

            {selectedRegion !== 'ALL' && (
              <span className="bg-slate-100 border border-slate-200 text-slate-800 font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                Wilayah: {selectedRegion}
                <button type="button" onClick={() => setSelectedRegion('ALL')} className="hover:text-rose-600 font-black">×</button>
              </span>
            )}

            {selectedStatus !== 'ALL' && (
              <span className="bg-slate-100 border border-slate-200 text-slate-800 font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                Status: {selectedStatus}
                <button type="button" onClick={() => setSelectedStatus('ALL')} className="hover:text-rose-600 font-black">×</button>
              </span>
            )}

            {selectedSOAktivaFilter !== 'ALL' && (
              <span className="bg-purple-100 border border-purple-300 text-purple-900 font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                SO Aktiva: {selectedSOAktivaFilter === 'SO_AKTIVA' ? 'SO AKTIVA' : 'NON SO AKTIVA'}
                <button type="button" onClick={() => setSelectedSOAktivaFilter('ALL')} className="hover:text-rose-600 font-black">×</button>
              </span>
            )}

            {isDateFilterActive && (
              <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                <CalendarDays className="w-3 h-3 text-indigo-600" />
                <span>
                  {selectedSpecificDate 
                    ? formatDateIndo(selectedSpecificDate)
                    : `${selectedDay !== 'ALL' ? `Tgl ${parseInt(selectedDay)} ` : ''}${selectedMonth !== 'ALL' ? `${monthOptions.find(m => m.value === selectedMonth)?.label.split(' - ')[1]} ` : ''}${selectedYear !== 'ALL' ? selectedYear : ''}`
                  }
                </span>
                <button type="button" onClick={handleResetDateFilters} className="hover:text-rose-600 font-black">×</button>
              </span>
            )}
          </div>
        )}

        {/* Collapsible Advanced Filters Content */}
        {isFilterExpanded && (
          <div className="pt-3 border-t border-slate-100 space-y-3 animate-fadeIn">
            
            {/* Dropdown Filters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              
              {/* Group Korlap Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  🎯 Group Korlap:
                </label>
                <select
                  value={selectedGroupKorlap}
                  onChange={(e) => setSelectedGroupKorlap(e.target.value)}
                  className="w-full bg-slate-50 border border-indigo-200 hover:border-indigo-400 text-xs font-bold rounded-xl px-3 py-2 text-indigo-950 focus:outline-none focus:border-indigo-500 cursor-pointer transition"
                >
                  <option value="ALL">Semua Group Korlap ({primaryKorlaps.length})</option>
                  {primaryKorlaps.map(k => (
                    <option key={k} value={k}>Group: {k}</option>
                  ))}
                </select>
              </div>

              {/* Region / Kabupaten */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  📍 Kabupaten / Wilayah:
                </label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 hover:border-slate-400 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer transition"
                >
                  <option value="ALL">Semua Kabupaten ({availableRegions.length})</option>
                  {availableRegions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Status SO */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  🏷️ Status Audit SO:
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 hover:border-slate-400 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer transition"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="Terjadwal">Terjadwal</option>
                  <option value="Proses SO">Proses SO</option>
                  <option value="Menunggu Rekapan">Menunggu Rekapan</option>
                  <option value="Selesai">Selesai</option>
                  <option value="Gagal SO">Gagal SO</option>
                  <option value="Pindah Toko">Pindah Toko</option>
                </select>
              </div>

              {/* SO Aktiva Filter */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-purple-600" />
                  <span>SO Aktiva:</span>
                </label>
                <select
                  value={selectedSOAktivaFilter}
                  onChange={(e) => setSelectedSOAktivaFilter(e.target.value as any)}
                  className="w-full bg-slate-50 border border-purple-200 hover:border-purple-400 text-xs font-bold rounded-xl px-3 py-2 text-purple-950 focus:outline-none focus:border-purple-500 cursor-pointer transition"
                >
                  <option value="ALL">Semua SO Aktiva</option>
                  <option value="SO_AKTIVA">🏷️ Perlu SO Aktiva (SO AKTIVA)</option>
                  <option value="NON_SO_AKTIVA">NON SO AKTIVA</option>
                </select>
              </div>

            </div>

            {/* Date / Month / Day Selection Row */}
            <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
              
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 shrink-0">
                  <CalendarDays className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Waktu SO:</span>
                </div>

                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setSelectedSpecificDate('');
                  }}
                  className="bg-slate-50 border border-slate-300 hover:border-slate-400 text-xs font-bold rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer transition"
                >
                  <option value="ALL">Semua Tahun</option>
                  {availableYears.map(y => (
                    <option key={y} value={y}>Tahun {y}</option>
                  ))}
                </select>

                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setSelectedSpecificDate('');
                  }}
                  className="bg-slate-50 border border-slate-300 hover:border-slate-400 text-xs font-bold rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer transition"
                >
                  {monthOptions.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>

                <select
                  value={selectedDay}
                  onChange={(e) => {
                    setSelectedDay(e.target.value);
                    setSelectedSpecificDate('');
                  }}
                  className="bg-slate-50 border border-slate-300 hover:border-slate-400 text-xs font-bold rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer transition"
                >
                  <option value="ALL">Semua Tgl (1-31)</option>
                  {dayOptions.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>

                <select
                  value={selectedDayOfWeek}
                  onChange={(e) => setSelectedDayOfWeek(e.target.value)}
                  className="bg-slate-50 border border-slate-300 hover:border-slate-400 text-xs font-bold rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer transition"
                  title="Filter spesifik hari kerja (Senin - Minggu)"
                >
                  <option value="ALL">Semua Hari</option>
                  <option value="SENIN">Senin</option>
                  <option value="SELASA">Selasa</option>
                  <option value="RABU">Rabu</option>
                  <option value="KAMIS">Kamis</option>
                  <option value="JUMAT">Jumat</option>
                  <option value="SABTU">Sabtu</option>
                  <option value="MINGGU">Minggu</option>
                </select>

                <input
                  type="date"
                  value={selectedSpecificDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedSpecificDate(val);
                    if (val) {
                      const [y, m, d] = val.split('-');
                      setSelectedYear(y || 'ALL');
                      setSelectedMonth(m || 'ALL');
                      setSelectedDay(d || 'ALL');
                      setSelectedDayOfWeek(getDayNameIndo(val));
                    }
                  }}
                  className="bg-slate-50 border border-slate-300 hover:border-slate-400 text-xs font-semibold rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer transition"
                  title="Pilih tanggal spesifik dari kalender"
                />
              </div>

              {/* Collapse Button */}
              <button
                type="button"
                onClick={() => setIsFilterExpanded(false)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-indigo-50 transition"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Tutup Panel Filter</span>
              </button>
            </div>

            {/* Action Buttons inside Collapsible */}
            <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              {onTwoWaySync && (
                <button
                  onClick={() => {
                    onTwoWaySync();
                    setActiveScheduleTab('ALL_SEPTEMBER');
                    setSelectedSpecificDate('');
                    setSelectedGroupKorlap('ALL');
                    setSelectedRegion('ALL');
                    setSelectedStatus('ALL');
                    setSearchQuery('');
                    setToastMessage('Sinkronisasi 2-Arah Berhasil: Semua Jadwal & Master Toko Bali Berhasil Dihubungkan!');
                  }}
                  className="w-full sm:w-auto px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2-Way Sync</span>
                </button>
              )}

              {activeRoleContext !== 'OFFICER' && viewMode !== 'officer' && (
                <>
                  {onOpenKorlapImageModal && (
                    <button
                      onClick={onOpenKorlapImageModal}
                      className="w-full sm:w-auto px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-200 shrink-0" />
                      <span>Input Korlap & Image</span>
                    </button>
                  )}

                  <button
                    onClick={onOpenAutoGenerator}
                    className="w-full sm:w-auto px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition flex items-center justify-center gap-1.5"
                  >
                    <Wand2 className="w-4 h-4 text-purple-200 shrink-0" />
                    <span>Auto-Schedule</span>
                  </button>

                  <button
                    onClick={onOpenCreateModal}
                    className="w-full sm:w-auto px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4 text-indigo-200 shrink-0" />
                    <span>+ Tambah Jadwal</span>
                  </button>
                </>
              )}

              <button
                onClick={handleExportSchedules}
                className="w-full sm:w-auto px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold border border-slate-300 transition flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <Download className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Export CSV</span>
              </button>

              {onResetSchedules && (
                <button
                  type="button"
                  id="btn-reset-penjadwalan-clean"
                  onClick={() => setIsResetConfirmModalOpen(true)}
                  className="w-full sm:w-auto px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs"
                  title="Reset bersih penjadwalan SO tanpa menghapus personil, alat, atau seragam"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>Reset Penjadwalan SO</span>
                </button>
              )}
            </div>

          </div>
        )}

        {/* Sub-Menu Tabs Pill Box */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3 overflow-x-auto">
          
          <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
                viewMode === 'list' 
                  ? 'bg-slate-900 text-white shadow-xs font-black' 
                  : 'text-slate-600 hover:text-slate-900 font-bold hover:bg-white/60'
              }`}
            >
              <span>📋 List Jadwal SO</span>
            </button>

            <button
              onClick={() => setViewMode('officer')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
                viewMode === 'officer' 
                  ? 'bg-emerald-600 text-white shadow-xs font-black' 
                  : 'text-slate-700 hover:text-emerald-700 font-bold hover:bg-emerald-50'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Menu Korlap (H-1 & Hari-H)</span>
            </button>

            {activeRoleContext !== 'OFFICER' && (
              <button
                onClick={() => setViewMode('approval')}
                className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-all flex items-center gap-2 relative shrink-0 ${
                  viewMode === 'approval' 
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs font-black' 
                    : 'text-indigo-900 hover:text-indigo-700 font-extrabold hover:bg-indigo-50/80 bg-indigo-50/40 border border-indigo-200/60'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                <span>Approval SPV</span>
                {totalPendingApprovalCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce shadow-xs">
                    {totalPendingApprovalCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
                viewMode === 'calendar' 
                  ? 'bg-rose-600 text-white shadow-xs font-black' 
                  : 'text-slate-600 hover:text-slate-900 font-bold hover:bg-white/60'
              }`}
            >
              <span>📅 Kalender</span>
            </button>
          </div>

        </div>

      </div>

      {/* 5. MAIN CONTENT VIEW (DAFTAR TOKO) */}
      {viewMode === 'officer' ? (
        <KorlapDashboard
          schedules={schedules}
          stores={stores}
          personnel={personnel}
          results={results}
          hideTopBanner={true}
          activeTab={activeScheduleTab}
          onTabChange={handleSelectScheduleTab}
          selectedOfficer={selectedGroupKorlap}
          onSelectOfficer={setSelectedGroupKorlap}
          selectedDateSpecific={selectedSpecificDate || 'ALL'}
          onSelectDateSpecific={setSelectedSpecificDate}
          searchQueryProp={searchQuery}
          onOpenAssignPersonnel={onAssignPersonnel || (() => {})}
          onOpenGagalPindahModal={onOpenGagalPindahModal || (() => {})}
          onOpenInputResultModal={onOpenInputModal || (() => {})}
          onConfirmScheduleFinished={onConfirmScheduleFinished || ((id) => onUpdateStatus(id, 'Selesai'))}
        />
      ) : viewMode === 'list' ? (
        <div className="space-y-3">
          {/* Dashboard Metrics Strip (Target & Toko Ter-SO di atas Tabel Daftar Toko) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {/* Metric 1: Total Jadwal */}
            <div 
              onClick={() => setSelectedStatus('ALL')}
              className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs cursor-pointer hover:border-indigo-300 hover:shadow-xs transition"
            >
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold">
                <span>Total Jadwal</span>
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                  {dashboardStats.filtered}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  / {dashboardStats.total} total
                </span>
              </div>
              <div className="text-[10px] text-indigo-600 font-semibold mt-0.5 truncate">
                {selectedGroupKorlap === 'ALL' ? 'Semua Korlap' : `Korlap: ${selectedGroupKorlap}`}
              </div>
            </div>

            {/* Metric 2: Terjadwal & Dalam Proses */}
            <div 
              onClick={() => setSelectedStatus('Terjadwal')}
              className="bg-white p-3 sm:p-3.5 rounded-2xl border border-blue-200/80 shadow-2xs cursor-pointer hover:border-blue-400 hover:shadow-xs transition"
            >
              <div className="flex items-center justify-between text-blue-700 text-[11px] font-bold">
                <span>Terjadwal / Proses</span>
                <Clock className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-blue-900 font-mono">
                  {dashboardStats.scheduled + dashboardStats.inProgress}
                </span>
                <span className="text-[10px] text-blue-600/80 font-medium">toko</span>
              </div>
              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                {dashboardStats.inProgress > 0 ? `${dashboardStats.inProgress} sedang proses SO` : 'Siap audit lapangan'}
              </div>
            </div>

            {/* Metric 3: Selesai SO */}
            <div 
              onClick={() => setSelectedStatus('Selesai')}
              className="bg-white p-3 sm:p-3.5 rounded-2xl border border-emerald-200/80 shadow-2xs cursor-pointer hover:border-emerald-400 hover:shadow-xs transition"
            >
              <div className="flex items-center justify-between text-emerald-700 text-[11px] font-bold">
                <span>Selesai SO</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-emerald-800 font-mono">
                  {dashboardStats.completed}
                </span>
                <span className="text-[10px] text-emerald-600 font-medium">toko</span>
              </div>
              <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
                {dashboardStats.filtered > 0 ? `${Math.round((dashboardStats.completed / dashboardStats.filtered) * 100)}% selesai` : '0%'}
              </div>
            </div>

            {/* Metric 4: Pindah & Gagal SO (Kendala) */}
            <div 
              onClick={() => setSelectedStatus(dashboardStats.kendala > 0 ? 'Gagal SO' : 'ALL')}
              className="bg-white p-3 sm:p-3.5 rounded-2xl border border-rose-200/80 shadow-2xs cursor-pointer hover:border-rose-400 hover:shadow-xs transition"
            >
              <div className="flex items-center justify-between text-rose-700 text-[11px] font-bold">
                <span>Kendala / Gagal</span>
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-rose-800 font-mono">
                  {dashboardStats.kendala}
                </span>
                <span className="text-[10px] text-rose-600 font-medium">toko</span>
              </div>
              <div className="text-[10px] text-rose-600 font-medium mt-0.5">
                {dashboardStats.kendala > 0 ? 'Perlu tindakan SPV' : 'Semua lancar'}
              </div>
            </div>

            {/* Metric 5: Zona Hitam */}
            <div 
              className="col-span-2 sm:col-span-1 bg-slate-900 p-3 sm:p-3.5 rounded-2xl border border-slate-800 shadow-2xs text-white"
            >
              <div className="flex items-center justify-between text-rose-300 text-[11px] font-bold">
                <span className="flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                  Zona Hitam
                </span>
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-white font-mono">
                  {dashboardStats.zonaHitam}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">toko</span>
              </div>
              <div className="text-[10px] text-rose-300 font-medium mt-0.5">
                Pengawasan ketat
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          
          {/* Table Header Controls: Toggle Columns View */}
          <div className="p-3 px-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-800">
                Daftar Jadwal ({filteredSchedules.length} Toko)
              </span>
              <span className="text-[11px] text-slate-500">
                • {selectedGroupKorlap === 'ALL' ? 'Semua Group' : `Group: ${selectedGroupKorlap}`}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setTableLayoutMode('SHEET_JADWAL')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  tableLayoutMode === 'SHEET_JADWAL'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📊 Format Sheet Jadwal (Lengkap)
              </button>
              <button
                type="button"
                onClick={() => setTableLayoutMode('COMPACT')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  tableLayoutMode === 'COMPACT'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📱 Format Ringkas
              </button>
            </div>
          </div>

          {/* MOBILE VIEW: SLEEK TOUCH-FRIENDLY STORE CARDS (< md) */}
          <div className="block md:hidden divide-y divide-slate-100 p-2.5 space-y-2.5">
            {filteredSchedules.length > 0 ? (
              filteredSchedules.map((s, idx) => {
                const matchingStore = stores.find(st => st.code === s.storeCode || st.id === s.storeId);
                const zVal = (s.zona || matchingStore?.zona || '').toUpperCase();
                const isBlackZone = !zVal.includes('NON') && !zVal.includes('BUKAN') && !zVal.includes('TIDAK') && (zVal.includes('HITAM') || matchingStore?.isZonaHitam === true);
                const assignedMembers = s.assignedPersonnelNames || [];
                const personilLeaderText = s.personilLeader || (assignedMembers.length > 0 ? assignedMembers[0] : '-');

                return (
                  <div 
                    key={s.id} 
                    className={`p-3.5 rounded-2xl border transition-all ${
                      isBlackZone 
                        ? 'bg-rose-50/40 border-rose-200' 
                        : 'bg-white border-slate-200/90 shadow-2xs'
                    }`}
                  >
                    {/* Header Card: Code, Name, Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                            {s.storeCode}
                          </span>
                          <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
                            Type {s.typeSo || matchingStore?.typeSo || 'M'}
                          </span>
                          {isStoreSOAktiva(matchingStore || s) ? (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-lg bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-0.5 shadow-2xs">
                              🏷️ SO AKTIVA
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200">
                              NON SO AKTIVA
                            </span>
                          )}
                          {isBlackZone && (
                            <span className="text-[10px] font-black bg-slate-900 text-rose-300 border border-rose-500 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                              <Flame className="w-3 h-3 text-rose-400" />
                              ZONA HITAM
                            </span>
                          )}
                        </div>
                        <h4 className="font-black text-slate-900 text-sm mt-1">
                          {s.storeName}
                        </h4>
                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{getAccurateRegionForSchedule(s)}</span>
                          {s.asInitial && <span>• AS: {s.asInitial}</span>}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span className={`px-2 py-1 text-[10px] rounded-full font-bold shrink-0 ${getStatusBadgeClass(s.status)}`}>
                        {s.status}
                      </span>
                    </div>

                    {/* Meta info grid */}
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400 font-medium">Tanggal SO</div>
                        <div className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                          <CalendarDays className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>{s.scheduledDate || '-'}</span>
                          <span className="text-[10px] text-slate-500">({getScheduleDayName(s)})</span>
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 font-medium">Group Korlap & Tim</div>
                        <div className="font-bold text-indigo-950 mt-0.5 truncate">
                          {getEffectiveKorlapForSchedule(s)}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          Leader: {personilLeaderText}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 font-medium">Stock Toko</div>
                        <div className="font-mono font-bold text-slate-900 mt-0.5">
                          {formatRupiah(s.stockRp || 0)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 font-medium">Kas Toko</div>
                        <div className="font-mono font-bold text-emerald-700 mt-0.5">
                          {formatRupiah(s.kasToko || 0)}
                        </div>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        {onAssignPersonnel && (
                          <button
                            type="button"
                            onClick={() => onAssignPersonnel(s)}
                            className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 transition flex items-center gap-1"
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>Tim ({assignedMembers.length})</span>
                          </button>
                        )}
                        
                        {s.status === 'Terjadwal' && (
                          <button
                            type="button"
                            onClick={() => onUpdateStatus(s.id, 'Proses SO')}
                            className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition"
                          >
                            Mulai SO
                          </button>
                        )}

                        {s.status === 'Proses SO' && (
                          <button
                            type="button"
                            onClick={() => onUpdateStatus(s.id, 'Menunggu Rekapan')}
                            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
                          >
                            Input Rekapan
                          </button>
                        )}

                        {s.status === 'Menunggu Rekapan' && (
                          <button
                            type="button"
                            onClick={() => onUpdateStatus(s.id, 'Selesai')}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition"
                          >
                            Selesai SO
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setScheduleToDelete(s)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Hapus Jadwal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                );
              })
            ) : (
              <div className="py-10 px-4 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-700 font-bold text-xs">Tidak ditemukan jadwal SO yang sesuai filter</p>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs mx-auto">
                  {schedules.length > 0 ? `Ada ${schedules.length} jadwal toko tersimpan. Coba bersihkan filter pencarian atau tanggal.` : 'Belum ada jadwal yang diunggah/dibuat.'}
                </p>
                {schedules.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAllFilters}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-2xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tampilkan Semua ({schedules.length} Toko)</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* DESKTOP VIEW: RICH 14-COLUMN TABLE (hidden on mobile, visible on md+) */}
          <div className="hidden md:block overflow-x-auto">
            {tableLayoutMode === 'SHEET_JADWAL' ? (
              /* Complete 14-Column Sheet Jadwal View */
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-black uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3 w-10 text-center">No</th>
                    <th className="py-3 px-3">Team</th>
                    <th className="py-3 px-3">Group</th>
                    <th className="py-3 px-3">Personil</th>
                    <th className="py-3 px-3">Hari</th>
                    <th className="py-3 px-3">Kode Toko</th>
                    <th className="py-3 px-3">Nama Toko</th>
                    <th className="py-3 px-3 text-right">Stock Rp</th>
                    <th className="py-3 px-3">Tgl SO</th>
                    <th className="py-3 px-3 text-center">Type SO</th>
                    <th className="py-3 px-3 text-right">Kas Toko</th>
                    <th className="py-3 px-3">Zona</th>
                    <th className="py-3 px-3 text-center">SO Aktiva</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSchedules.length > 0 ? (
                    filteredSchedules.map((s, idx) => {
                      const matchingStore = stores.find(st => st.code === s.storeCode || st.id === s.storeId);
                      const zVal = (s.zona || matchingStore?.zona || '').toUpperCase();
                      const isBlackZone = !zVal.includes('NON') && !zVal.includes('BUKAN') && !zVal.includes('TIDAK') && (zVal.includes('HITAM') || matchingStore?.isZonaHitam === true);
                      const isAktiva = isStoreSOAktiva(matchingStore || s);
                      const assignedMembers = s.assignedPersonnelNames || [];
                      const personilLeaderText = s.personilLeader || (assignedMembers.length > 0 ? assignedMembers[0] : '-');

                      return (
                        <tr key={s.id} className={`hover:bg-slate-50/80 transition ${isBlackZone ? 'bg-rose-50/30' : ''}`}>
                          
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-500">
                            {idx + 1}
                          </td>

                          <td className="py-3 px-3 font-bold text-indigo-950 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[11px]">
                              {s.teamCategory || s.teamName || 'TEAM 1'}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                            {getEffectiveKorlapForSchedule(s)}
                          </td>

                          <td className="py-3 px-3 text-slate-800">
                            <div className="font-bold text-slate-900">{personilLeaderText}</div>
                            {assignedMembers.length > 1 && (
                              <span className="text-[10px] text-slate-500">+{assignedMembers.length - 1} personil</span>
                            )}
                          </td>

                          <td className="py-3 px-3 font-bold text-slate-700 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px]">
                              {getScheduleDayName(s)}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-mono font-black text-indigo-700 whitespace-nowrap">
                            {s.storeCode}
                          </td>

                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{s.storeName}</div>
                            <div className="text-[10px] text-slate-500">{getAccurateRegionForSchedule(s)} {s.asInitial ? `• AS: ${s.asInitial}` : ''}</div>
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                            {formatRupiah(s.stockRp || 0)}
                          </td>

                          <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                            {s.scheduledDate}
                          </td>

                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                              {s.typeSo || matchingStore?.typeSo || 'M'}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right font-mono text-emerald-700 font-semibold whitespace-nowrap">
                            {formatRupiah(s.kasToko || 0)}
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isBlackZone 
                                ? 'bg-slate-900 text-rose-300 border border-rose-600 shadow-2xs' 
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            }`}>
                              {isBlackZone ? 'ZONA HITAM' : 'NON ZONA HITAM'}
                            </span>
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap text-center">
                            {isAktiva ? (
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300 inline-flex items-center gap-1 shadow-2xs">
                                🏷️ SO AKTIVA
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                NON SO AKTIVA
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className={`px-2.5 py-1 text-[10px] rounded-full font-bold ${getStatusBadgeClass(s.status)}`}>
                              {s.status}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {onAssignPersonnel && (
                                <button
                                  onClick={() => onAssignPersonnel(s)}
                                  title="Alokasi Personil Tim"
                                  className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                                >
                                  <Users className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                onClick={() => setScheduleToDelete(s)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                                title="Hapus Jadwal"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={15} className="py-12 text-center">
                        <div className="max-w-md mx-auto space-y-3">
                          <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                            <CalendarIcon className="w-6 h-6 stroke-1.5" />
                          </div>
                          <div>
                            <p className="text-slate-800 font-bold text-sm">
                              Tidak ditemukan jadwal SO yang sesuai filter
                              {selectedGroupKorlap !== 'ALL' ? ` untuk Korlap ${selectedGroupKorlap}` : ''}
                              {selectedSpecificDate ? ` pada ${formatDateIndo(selectedSpecificDate)}` : ''}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {selectedGroupKorlap !== 'ALL' && korlapTotalMonthCount > 0 ? (
                                <span>
                                  Korlap <strong>{selectedGroupKorlap}</strong> memiliki total <strong>{korlapTotalMonthCount} toko</strong> di bulan September 2026 (dijadwalkan pada tanggal lain).
                                </span>
                              ) : (
                                `Ada ${schedules.length} jadwal toko terhubung di database. Coba reset filter tanggal atau pencarian.`
                              )}
                            </p>
                          </div>
                          <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                            {selectedGroupKorlap !== 'ALL' && korlapTotalMonthCount > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSpecificDate('');
                                  setActiveScheduleTab('ALL_SEPTEMBER');
                                  setSelectedDay('ALL');
                                  setSelectedDayOfWeek('ALL');
                                }}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition shadow-xs cursor-pointer active:scale-98"
                              >
                                <CalendarDays className="w-4 h-4" />
                                <span>Tampilkan Semua {korlapTotalMonthCount} Toko Korlap {selectedGroupKorlap}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleResetAllFilters}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reset Semua Filter ({schedules.length} Toko)</span>
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              /* Compact Table View */
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4">Toko & Kode</th>
                    <th className="py-3 px-4">Wilayah</th>
                    <th className="py-3 px-4">Tanggal & Jam</th>
                    <th className="py-3 px-4">Group & Tim</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSchedules.length > 0 ? (
                    filteredSchedules.map((s) => {
                      const matchingStore = stores.find(st => st.code === s.storeCode || st.id === s.storeId);
                      return (
                      <tr key={s.id} className="hover:bg-slate-50/80 transition">
                        
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{s.storeName}</div>
                          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" /> {s.storeCode}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-900 border border-amber-200">
                              Type {s.typeSo || matchingStore?.typeSo || 'M'}
                            </span>
                            {isStoreSOAktiva(matchingStore || s) ? (
                              <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-300">
                                SO AKTIVA
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                NON SO AKTIVA
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-slate-600 max-w-[180px] truncate">
                          <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                            {getAccurateRegionForSchedule(s)}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{formatDateIndo(s.scheduledDate)}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{s.scheduledTime} WITA</div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">
                            {s.groupName || s.officerInCharge || 'I WAYAN ANGGA RISTA'}
                          </div>
                          <div className="text-[10px] text-indigo-600 font-medium">
                            {s.teamCategory || s.teamName} • Leader: {s.personilLeader || '-'}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 text-[10px] rounded-full border font-semibold ${getStatusBadgeClass(s.status)}`}>
                            {s.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            
                            {s.status === 'Terjadwal' && (
                              <button
                                onClick={() => onUpdateStatus(s.id, 'Proses SO')}
                                className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-medium transition"
                              >
                                Mulai SO
                              </button>
                            )}

                            {s.status === 'Proses SO' && (
                              <button
                                onClick={() => onUpdateStatus(s.id, 'Menunggu Rekapan')}
                                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-medium transition"
                              >
                                Input Rekapan
                              </button>
                            )}

                            {s.status === 'Menunggu Rekapan' && (
                              <button
                                onClick={() => onUpdateStatus(s.id, 'Selesai')}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-medium transition"
                              >
                                Tandai Selesai
                              </button>
                            )}

                            <button
                              onClick={() => setScheduleToDelete(s)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                              title="Hapus Jadwal"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                          </div>
                        </td>

                      </tr>
                    );
                  })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <div className="max-w-md mx-auto space-y-3">
                          <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                            <CalendarIcon className="w-6 h-6 stroke-1.5" />
                          </div>
                          <div>
                            <p className="text-slate-800 font-bold text-sm">
                              Tidak ditemukan jadwal SO yang sesuai filter
                              {selectedGroupKorlap !== 'ALL' ? ` untuk Korlap ${selectedGroupKorlap}` : ''}
                              {selectedSpecificDate ? ` pada ${formatDateIndo(selectedSpecificDate)}` : ''}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {selectedGroupKorlap !== 'ALL' && korlapTotalMonthCount > 0 ? (
                                <span>
                                  Korlap <strong>{selectedGroupKorlap}</strong> memiliki total <strong>{korlapTotalMonthCount} toko</strong> di bulan September 2026 (dijadwalkan pada tanggal lain).
                                </span>
                              ) : (
                                `Ada ${schedules.length} jadwal toko terhubung di database. Coba reset filter tanggal atau pencarian.`
                              )}
                            </p>
                          </div>
                          <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                            {selectedGroupKorlap !== 'ALL' && korlapTotalMonthCount > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSpecificDate('');
                                  setActiveScheduleTab('ALL_SEPTEMBER');
                                  setSelectedDay('ALL');
                                  setSelectedDayOfWeek('ALL');
                                }}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition shadow-xs cursor-pointer active:scale-98"
                              >
                                <CalendarDays className="w-4 h-4" />
                                <span>Tampilkan Semua {korlapTotalMonthCount} Toko Korlap {selectedGroupKorlap}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleResetAllFilters}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reset Semua Filter ({schedules.length} Toko)</span>
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      ) : viewMode === 'approval' ? (
        /* Approval SPV Interactive Dashboard */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Approval Header & Sub-Tabs */}
          <div className="p-4 bg-slate-900 text-white border-b border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-indigo-400" />
                  Portal Approval Supervisor (Persetujuan Selesai, Pindah & Gagal SO)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sinkronisasi real-time aktivitas Korlap & Officer Hari-H yang memerlukan verifikasi Supervisor.
                </p>
              </div>
              <div className="text-xs bg-indigo-950 border border-indigo-700/60 text-indigo-200 px-3 py-1.5 rounded-lg font-mono">
                Total Menunggu Approval: <strong className="text-white text-sm font-bold">{totalPendingApprovalCount} Toko</strong>
              </div>
            </div>

            {/* Approval Category Tabs */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800 flex-wrap">
              <button
                type="button"
                onClick={() => setApprovalTab('SELESAI')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                  approvalTab === 'SELESAI' ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span>✓ Toko Selesai SO</span>
                <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[10px]">{pendingSelesai.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setApprovalTab('PINDAH')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                  approvalTab === 'PINDAH' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span>↪ Toko Pindah Jadwal</span>
                <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[10px]">{pendingPindah.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setApprovalTab('GAGAL')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                  approvalTab === 'GAGAL' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span>⚠ Toko Gagal SO</span>
                <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[10px]">{pendingGagal.length}</span>
              </button>
            </div>
          </div>

          {/* List of Approval Items */}
          <div className="p-4 bg-slate-50 min-h-[300px]">
            {approvalTab === 'SELESAI' && (
              <div className="space-y-3">
                {pendingSelesai.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-xs font-medium">
                    🎉 Tidak ada pengajuan Toko Selesai SO yang menunggu approval.
                  </div>
                ) : (
                  pendingSelesai.map(item => (
                    <div key={item.id} className="p-4 bg-white rounded-xl border border-emerald-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1 max-w-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded">{item.storeCode}</span>
                          <h4 className="text-sm font-bold text-slate-900">{item.storeName}</h4>
                          <span className="text-[10px] font-medium text-slate-500">({item.region})</span>
                        </div>
                        <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                          <span>📅 Tanggal: <strong>{formatDateIndo(item.scheduledDate)}</strong></span>
                          <span>👤 Korlap: <strong>{item.officerInCharge || item.teamName}</strong></span>
                        </div>
                        {item.notes && <p className="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded font-mono">📝 {item.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onRejectSchedule && onRejectSchedule(item.id, 'Cek ulang fisik & rekapan')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300 font-bold text-xs rounded-lg transition"
                        >
                          ↺ Minta Audit Ulang
                        </button>
                        <button
                          type="button"
                          onClick={() => onApproveSchedule && onApproveSchedule(item.id)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-sm"
                        >
                          ✓ Setujui Selesai SO
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {approvalTab === 'PINDAH' && (
              <div className="space-y-3">
                {pendingPindah.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-xs font-medium">
                    🎉 Tidak ada laporan Pindah Toko yang menunggu approval SPV.
                  </div>
                ) : (
                  pendingPindah.map(item => (
                    <div key={item.id} className="p-4 bg-white rounded-xl border border-amber-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1 max-w-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">{item.storeCode}</span>
                          <h4 className="text-sm font-bold text-slate-900">{item.storeName}</h4>
                          <span className="text-[10px] font-bold bg-amber-500 text-slate-950 px-2 py-0.2 rounded-full">Pindah Toko</span>
                        </div>
                        <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                          <span>📅 Tanggal Asal: <strong>{formatDateIndo(item.scheduledDate)}</strong></span>
                          <span>👤 Korlap/Officer: <strong>{item.officerInCharge || item.teamName}</strong></span>
                        </div>
                        {item.failureOrMoveReason && (
                          <div className="text-xs text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-200">
                            <strong>Alasan Pindah:</strong> {item.failureOrMoveReason}
                            {item.replacementStoreCode && (
                              <div className="mt-1 font-bold text-amber-950">
                                ➔ Toko Pengganti: {item.replacementStoreCode} - {item.replacementStoreName}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onRejectSchedule && onRejectSchedule(item.id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 font-bold text-xs rounded-lg transition"
                        >
                          ✕ Tolak Pindah Toko
                        </button>
                        <button
                          type="button"
                          onClick={() => onApproveSchedule && onApproveSchedule(item.id)}
                          className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition shadow-sm"
                        >
                          ✓ Setujui Pindah Toko
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {approvalTab === 'GAGAL' && (
              <div className="space-y-3">
                {pendingGagal.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-xs font-medium">
                    🎉 Tidak ada laporan Toko Gagal SO yang menunggu approval.
                  </div>
                ) : (
                  pendingGagal.map(item => (
                    <div key={item.id} className="p-4 bg-white rounded-xl border border-rose-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1 max-w-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold bg-rose-100 text-rose-900 px-2 py-0.5 rounded">{item.storeCode}</span>
                          <h4 className="text-sm font-bold text-slate-900">{item.storeName}</h4>
                          <span className="text-[10px] font-bold bg-rose-600 text-white px-2 py-0.2 rounded-full">Gagal SO</span>
                        </div>
                        <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                          <span>📅 Tanggal: <strong>{formatDateIndo(item.scheduledDate)}</strong></span>
                          <span>👤 Korlap/Officer: <strong>{item.officerInCharge || item.teamName}</strong></span>
                        </div>
                        {item.failureOrMoveReason && (
                          <div className="text-xs text-rose-900 bg-rose-50 p-2 rounded-lg border border-rose-200">
                            <strong>Kendala / Alasan Gagal SO:</strong> {item.failureOrMoveReason}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onRejectSchedule && onRejectSchedule(item.id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 font-bold text-xs rounded-lg transition"
                        >
                          ↺ Tolak & Buka Kembali
                        </button>
                        <button
                          type="button"
                          onClick={() => onApproveSchedule && onApproveSchedule(item.id)}
                          className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition shadow-sm"
                        >
                          ✓ Setujui Toko Gagal
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Calendar View Summary */
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-center py-8">
            <CalendarIcon className="w-12 h-12 text-indigo-500 mx-auto mb-3 opacity-80" />
            <h3 className="text-sm font-bold text-slate-800">Visualisasi Kalender Penjadwalan SO</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Menampilkan {filteredSchedules.length} jadwal terdaftar pada bulan ini dalam matriks harian.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-left">
              {['Terjadwal', 'Proses SO', 'Menunggu Rekapan', 'Selesai'].map((st) => {
                const count = filteredSchedules.filter(s => s.status === st).length;
                return (
                  <div key={st} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${getStatusBadgeClass(st)}`}>
                      {st}
                    </span>
                    <div className="text-xl font-bold text-slate-900 mt-2">{count} Toko</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Selective Schedule Reset */}
      {isResetConfirmModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="p-3 bg-rose-100 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Reset Bersih Penjadwalan SO</h3>
                <p className="text-xs text-slate-500">Master toko & jadwal dibersihkan, data personil aman</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 my-4 text-xs text-amber-800 space-y-1.5">
              <p className="font-bold">🛡️ Data yang DIJAMIN AMAN & TIDAK DIHAPUS:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-900">
                <li>Data Personil Tim & Auditor</li>
                <li>Inventaris Peralatan SO</li>
                <li>Data WDCP & Alokasi Seragam</li>
              </ul>
              <p className="pt-1 text-[11px] text-slate-600">
                Tindakan ini hanya akan membersihkan jadwal SO dan data master toko agar Anda dapat mengimpor atau mengatur jadwal ulang dengan bersih tanpa duplikasi.
              </p>
            </div>

            <p className="text-xs text-slate-600 mb-2">
              Ketik kata <span className="font-mono font-bold text-rose-600">RESET</span> untuk konfirmasi:
            </p>
            <input
              type="text"
              value={resetConfirmInput}
              onChange={(e) => setResetConfirmInput(e.target.value.toUpperCase())}
              placeholder="Ketik RESET"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 mb-4"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsResetConfirmModalOpen(false);
                  setResetConfirmInput('');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={resetConfirmInput !== 'RESET'}
                onClick={() => {
                  if (onResetSchedules) {
                    onResetSchedules();
                  }
                  setIsResetConfirmModalOpen(false);
                  setResetConfirmInput('');
                  setToastMessage('✅ Data penjadwalan SO berhasil direset bersih! Data personil, alat, dan seragam tetap terjaga.');
                }}
                className={`px-4 py-2 text-xs font-bold rounded-xl text-white transition flex items-center gap-1.5 ${
                  resetConfirmInput === 'RESET'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-md cursor-pointer'
                    : 'bg-rose-300 cursor-not-allowed'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Konfirmasi Reset</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SPREADSHEET SYNC MODAL */}
      <SpreadsheetSyncModal
        isOpen={isSpreadsheetModalOpen}
        onClose={() => setIsSpreadsheetModalOpen(false)}
        onSyncComplete={(res) => {
          setToastMessage(`Jadwal SO berhasil disinkronkan dari Google Spreadsheet! ${res.storesCount} toko dan ${res.schedulesCount} jadwal ter-update.`);
        }}
        existingStores={stores}
        existingSchedules={schedules}
      />

      {/* Confirmation Modal for Schedule Deletion */}
      <ConfirmDeleteModal
        isOpen={!!scheduleToDelete}
        onClose={() => setScheduleToDelete(null)}
        onConfirm={() => {
          if (scheduleToDelete) {
            onDeleteSchedule(scheduleToDelete.id);
            setToastMessage(`Jadwal SO toko ${scheduleToDelete.storeName} (${scheduleToDelete.storeCode}) berhasil dihapus!`);
            setScheduleToDelete(null);
          }
        }}
        title="Konfirmasi Hapus Penjadwalan SO"
        subtitle="Apakah Anda yakin ingin menghapus jadwal toko ini?"
        itemName={scheduleToDelete ? `${scheduleToDelete.storeCode} - ${scheduleToDelete.storeName}` : undefined}
        itemDetails={scheduleToDelete ? [
          { label: 'Tanggal SO', value: formatDateIndo(scheduleToDelete.scheduledDate) },
          { label: 'Jam Mulai', value: scheduleToDelete.scheduledTime || '08:00 WITA' },
          { label: 'Penanggung Jawab / Korlap', value: scheduleToDelete.officerInCharge || scheduleToDelete.spvInCharge || '-' },
          { label: 'Tim SO', value: scheduleToDelete.teamName || '-' },
          { label: 'Status Saat Ini', value: scheduleToDelete.status }
        ] : []}
        confirmText="Ya, Hapus"
        cancelText="Tidak, Batalkan"
        dangerBadgeText="Toko akan dihapus permanen dari jadwal SO."
      />

      {/* Success Toast Feedback */}
      {toastMessage && (
        <ToastNotification
          type="success"
          title="Sinkronisasi / Aksi Berhasil"
          message={toastMessage}
          onClose={() => setToastMessage(null)}
        />
      )}

    </div>
  );
};
