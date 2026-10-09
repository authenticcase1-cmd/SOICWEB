import { Store, SOSchedule, SOResult } from '../types/stockOpname';
import { 
  formatSmartSODate, 
  formatDateISO, 
  parseSmartDate, 
  parseSmartDateWithContext, 
  parseCurrentMonthSODate, 
  detectSmartMonthAndYear,
  getCurrentCalendarMonth,
  getCurrentCalendarYear
} from './formatters';
import { normalizeKorlapName, resolveStoreDefaultKorlap } from './korlapUtils';
import { generateInitialStores, generateInitialSchedules } from '../data/initialData';

/**
 * Check if a store belongs to ZONA HITAM (Black Zone)
 * Strictly adheres to reading column Zona / Keterangan Zona Hitam from Master Toko.
 * Stores marked with 'NON ZONA HITAM', 'NON HITAM', 'AMAN', '-', empty, etc. will NOT be treated as Zona Hitam.
 */
export function isStoreZonaHitam(store: Partial<Store> | any): boolean {
  if (!store) return false;

  // Extract all potential fields that might hold zona info
  const zonaStr = String(
    store.zona || 
    store.kriteriaZona || 
    store.keteranganZona || 
    store.zonaKeterangan || 
    store['ZONA-KETERANGAN ZONA HITAM'] || 
    store['ZONA - KETERANGAN ZONA HITAM'] || 
    store['KETERANGAN ZONA HITAM'] || 
    ''
  ).toUpperCase().trim();

  const ketStr = String(store.keterangan || store.notes || '').toUpperCase().trim();

  // 1. Explicit NON / BUKAN / AMAN / REGULER checks FIRST (Must NEVER be classified as Zona Hitam)
  if (
    zonaStr.includes('NON') || 
    zonaStr.includes('BUKAN') || 
    zonaStr.includes('TIDAK') || 
    zonaStr === 'AMAN' || 
    zonaStr === 'NO' || 
    zonaStr === '-' ||
    zonaStr === '0' ||
    zonaStr === 'REGULER' ||
    zonaStr === 'NORMAL' ||
    zonaStr === 'RENDAH' ||
    zonaStr === 'SEDANG' ||
    zonaStr === 'NON ZONA HITAM' ||
    zonaStr === 'NON HITAM' ||
    zonaStr === 'NON ZONA'
  ) {
    return false;
  }

  // 2. Explicit check on Keterangan field if it explicitly states NON-ZONA
  if (
    ketStr.includes('NON ZONA') || 
    ketStr.includes('NON-ZONA') || 
    ketStr.includes('BUKAN ZONA HITAM') || 
    ketStr.includes('NON HITAM') ||
    ketStr.includes('BUKAN HITAM')
  ) {
    return false;
  }

  // 3. Positive check: does Zona or Keterangan say ZONA HITAM / HITAM / BLACK ZONE / YA?
  if (
    zonaStr === 'ZONA HITAM' || 
    zonaStr === 'HITAM' || 
    zonaStr === 'BLACK' || 
    zonaStr === 'BLACK ZONE' || 
    zonaStr === 'YA' || 
    zonaStr === 'YES' ||
    zonaStr === '1' ||
    zonaStr === 'ZH' ||
    (zonaStr.includes('HITAM') && !zonaStr.includes('NON') && !zonaStr.includes('BUKAN') && !zonaStr.includes('TIDAK'))
  ) {
    return true;
  }

  if (
    ketStr === 'ZONA HITAM' || 
    ketStr === 'HITAM' || 
    ketStr === 'BLACK ZONE' ||
    (ketStr.includes('ZONA HITAM') && !ketStr.includes('NON') && !ketStr.includes('BUKAN') && !ketStr.includes('TIDAK'))
  ) {
    return true;
  }

  // 4. If explicit boolean is set, only trust it if zonaStr was not empty or explicitly indicated
  if (store.isZonaHitam === true && zonaStr !== '' && !zonaStr.includes('NON') && !zonaStr.includes('BUKAN')) {
    return true;
  }

  // Default is false (Regular / Non-Zona Hitam Store)
  return false;
}

/**
 * Check if a store or schedule requires SO AKTIVA based on column SO Aktiva in Master Toko Bali.
 * If the cell contains "SO AKTIVA", "AKTIVA", "YA", "Y", "TRUE", "1", etc. -> true.
 * If blank, "-", "NON", "TIDAK", or empty -> false.
 */
export function isStoreSOAktiva(storeOrSchedule: Partial<Store | SOSchedule> | any): boolean {
  if (!storeOrSchedule) return false;
  
  const raw = String(
    storeOrSchedule.soAktiva || 
    storeOrSchedule['SO AKTIVA'] || 
    storeOrSchedule['SO_AKTIVA'] || 
    storeOrSchedule['AKTIVA'] || 
    ''
  ).trim().toUpperCase();

  if (!raw || raw === '-' || raw === '0' || raw === 'TIDAK' || raw === 'NON' || raw === 'FALSE' || raw === 'NON SO AKTIVA' || raw === 'BUKAN') {
    return false;
  }

  return raw.includes('AKTIVA') || raw === 'YA' || raw === 'Y' || raw === 'TRUE' || raw === '1' || raw.includes('ADA');
}

/**
 * Returns clean standard label for SO Aktiva: 'SO AKTIVA' or 'NON SO AKTIVA'.
 * As requested: If column has "SO AKTIVA" then show "SO AKTIVA", if blank give "NON SO AKTIVA".
 */
export function getSOAktivaLabel(storeOrSchedule: Partial<Store | SOSchedule> | any): 'SO AKTIVA' | 'NON SO AKTIVA' {
  return isStoreSOAktiva(storeOrSchedule) ? 'SO AKTIVA' : 'NON SO AKTIVA';
}

/**
 * Clean and normalize Type SO from Master Toko Bali (e.g. M, Q3, Q1, Q2, etc.)
 */
export function getCleanTypeSo(storeOrSchedule: Partial<Store | SOSchedule> | any): string {
  if (!storeOrSchedule) return '';
  const raw = String(
    storeOrSchedule.typeSo || 
    storeOrSchedule.qm || 
    storeOrSchedule['TYPE SO'] || 
    storeOrSchedule['TYPE_SO'] || 
    storeOrSchedule['Q/M'] || 
    ''
  ).trim();

  if (!raw || raw === '-' || raw === '0') return '';
  return raw.toUpperCase();
}

/**
 * Get the unified SPV Approval Status for a Store
 * Values: 'Sudah Approve' | 'Belum Terapprove' | 'Belum SO'
 */
export function getStoreSOApprovalStatus(
  store: Store,
  schedules?: SOSchedule[],
  results?: SOResult[]
): 'Sudah Approve' | 'Belum SO' | 'Belum Terapprove' {
  if (!store) return 'Belum SO';

  const codeKey = (store.code || '').trim().toUpperCase();
  const idKey = (store.id || '').trim().toUpperCase();

  // 1. Highest Priority: Actual submitted audit results (Hasil SO)
  if (results && results.length > 0) {
    const matchingResults = results.filter(r => 
      (codeKey && r.storeCode && r.storeCode.trim().toUpperCase() === codeKey) || 
      (idKey && r.storeId && r.storeId.trim().toUpperCase() === idKey)
    );

    if (matchingResults.some(r => r.approvalStatus === 'Disetujui')) {
      return 'Sudah Approve';
    }

    if (matchingResults.some(r => 
      r.approvalStatus === 'Menunggu Approval SPV' || 
      r.approvalStatus === 'Perlu Audit Ulang' ||
      (!r.approvalStatus && r.id) ||
      ((r.approvalStatus as string) !== 'Disetujui' && (r.approvalStatus as string) !== 'Ditolak')
    )) {
      return 'Belum Terapprove';
    }
  }

  // 2. Second Priority: Actual Schedule Status
  if (schedules && schedules.length > 0) {
    const matchingSchedules = schedules.filter(sch => 
      (codeKey && sch.storeCode && sch.storeCode.trim().toUpperCase() === codeKey) || 
      (idKey && sch.storeId && sch.storeId.trim().toUpperCase() === idKey)
    );

    if (matchingSchedules.some(sch => sch.spvApprovalStatus === 'Disetujui')) {
      return 'Sudah Approve';
    }

    if (matchingSchedules.some(sch => 
      sch.status === 'Selesai' || 
      sch.status === 'Menunggu Rekapan' || 
      sch.spvApprovalStatus === 'Menunggu Approval SPV'
    )) {
      return 'Belum Terapprove';
    }
  }

  // 3. Third Priority: Explicit statusApproveSO property from sheet or direct store edit
  if (store.statusApproveSO) {
    const s = String(store.statusApproveSO).toLowerCase().trim();
    if (s.includes('sudah') || s.includes('approved') || s.includes('setuju')) return 'Sudah Approve';
    if (s.includes('belum terapprove') || s.includes('menunggu') || s.includes('pending') || s.includes('belum approve')) return 'Belum Terapprove';
    if (s.includes('belum so')) return 'Belum SO';
  }

  // 4. Fourth Priority: Explicit tglSoApproved date
  if (store.tglSoApproved && store.tglSoApproved !== '-' && store.tglSoApproved !== '0' && !store.tglSoApproved.toLowerCase().includes('belum')) {
    return 'Sudah Approve';
  }

  return 'Belum SO';
}

/**
 * Check if a store has been approved / completed SO in a specific month & year
 * NOTE: Scheduled stores (e.g. only having SO date in soSeptember) are NOT approved until SPV approves!
 */
export function isStoreSOApprovedInMonth(
  store: Store,
  schedules: SOSchedule[],
  results?: SOResult[],
  targetMonth: string = '09', // '01'..'12' or 'ALL'
  targetYear: string = '2026'
): boolean {
  if (!store) return false;

  // 1. Check matching schedule with SPV approval or completed status
  const hasApprovedSchedule = schedules.some(sch => {
    const isMatched = sch.storeCode === store.code || sch.storeId === store.id || sch.storeName?.toLowerCase() === store.name?.toLowerCase();
    if (!isMatched) return false;

    // Check approval status: MUST be approved by SPV or completed
    const isApproved = (sch.spvApprovalStatus as string) === 'Disetujui' || ((sch.status as string) === 'Selesai' && (sch.spvApprovalStatus as string) === 'Disetujui');
    if (!isApproved) return false;

    if (targetMonth === 'ALL') return true;

    if (sch.scheduledDate) {
      const [sYear, sMonth] = sch.scheduledDate.split('-');
      if (sMonth === targetMonth && (targetYear === 'ALL' || sYear === targetYear)) {
        return true;
      }
    }
    return false;
  });

  if (hasApprovedSchedule) return true;

  // 2. Check matching results with SPV approval
  if (results && results.length > 0) {
    const hasApprovedResult = results.some(r => {
      const isMatched = r.storeCode === store.code || r.storeId === store.id;
      if (!isMatched) return false;
      if (r.approvalStatus === 'Disetujui' || (r.approvalStatus !== 'Menunggu Approval SPV' && r.approvalStatus !== 'Ditolak' && !!r.baNumber)) {
        if (targetMonth === 'ALL') return true;
        if (r.soDate) {
          const [rYear, rMonth] = r.soDate.split('-');
          if (rMonth === targetMonth && (targetYear === 'ALL' || rYear === targetYear)) return true;
        }
      }
      return false;
    });
    if (hasApprovedResult) return true;
  }

  // 3. Check general tglSoApproved if explicitly set
  if (store.tglSoApproved && store.tglSoApproved !== '-' && store.tglSoApproved !== '0' && !store.tglSoApproved.toLowerCase().includes('belum')) {
    if (targetMonth === 'ALL') return true;
    const parsed = parseSmartDateWithContext(store.tglSoApproved, targetMonth, targetYear);
    if (parsed && !isNaN(parsed.getTime())) {
      const pMonth = String(parsed.getMonth() + 1).padStart(2, '0');
      const pYear = String(parsed.getFullYear());
      if (pMonth === targetMonth && (targetYear === 'ALL' || pYear === targetYear)) {
        return true;
      }
    }
  }

  // 4. Explicit statusApproveSO property from store: only valid if targetMonth is ALL or matching current month
  if (targetMonth === 'ALL' && store.statusApproveSO) {
    const s = String(store.statusApproveSO).toLowerCase();
    if (s.includes('sudah') || s.includes('approved') || s.includes('setuju')) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate FREKUENSI TIDAK SO based on historical monthly columns (Mei, Juni, Juli, Agustus, September)
 */
export function calculateStoreFrekuensiTidakSO(
  store: Store,
  currentMonth: string = getCurrentCalendarMonth()
): number {
  if (!store) return 0;

  const hasSO = (val?: any): boolean => {
    if (!val) return false;
    const str = String(val).trim();
    return str !== '' && str !== '-' && str !== '0' && str !== '0.0' && str !== '0-Jan-00' && str.toLowerCase() !== 'belum so';
  };

  const history = [
    hasSO(store.tglSoMei),       // 0: Mei (05)
    hasSO(store.tglSoJuni),      // 1: Juni (06)
    hasSO(store.tglSoJuli),      // 2: Juli (07)
    hasSO(store.soAgustus),      // 3: Agt (08)
    hasSO(store.soSeptember),    // 4: Sep (09)
    hasSO(store.soOktober),      // 5: Okt (10)
    hasSO(store.soNovember),     // 6: Nov (11)
    hasSO(store.soDesember)      // 7: Des (12)
  ];

  const mNum = parseInt(currentMonth, 10);
  const activeIdx = (mNum >= 5 && mNum <= 12) ? (mNum - 5) : 5;

  // If already SO'd in current active month, frequency is 0
  if (history[activeIdx]) {
    return 0;
  }

  // Count consecutive months not SO'd leading up to active month
  let count = 0;
  for (let i = activeIdx; i >= 0; i--) {
    if (!history[i]) {
      count++;
    } else {
      break;
    }
  }

  return count;
}

/**
 * Auto update store with approved schedule date in the active month
 */
export function autoSyncStoreWithApprovedSchedule(
  store: Store,
  scheduleOrDate: SOSchedule | string
): Store {
  if (!scheduleOrDate) return store;

  let dateStr = '';
  let officerName = '';

  if (typeof scheduleOrDate === 'string') {
    dateStr = scheduleOrDate;
  } else {
    dateStr = scheduleOrDate.scheduledDate || '';
    officerName = scheduleOrDate.officerInCharge || '';
  }

  if (!dateStr) return store;

  const parts = dateStr.split('-');
  const month = parts[1] || getCurrentCalendarMonth();
  const year = parts[0] || getCurrentCalendarYear();

  const updated: Store = { ...store };
  updated.lastSODate = dateStr;
  updated.tglSoApproved = dateStr;
  updated.statusApproveSO = 'Sudah Approve';

  if (officerName && officerName !== 'Petugas SO') {
    updated.korlap = officerName;
    updated.managerName = officerName;
  }

  // Populate month specific field
  if (month === '10') {
    updated.soOktober = dateStr;
  } else if (month === '09') {
    updated.soSeptember = dateStr;
  } else if (month === '11') {
    updated.soNovember = dateStr;
  } else if (month === '12') {
    updated.soDesember = dateStr;
  } else if (month === '08') {
    updated.soAgustus = dateStr;
  } else if (month === '07') {
    updated.tglSoJuli = dateStr;
  } else if (month === '06') {
    updated.tglSoJuni = dateStr;
  } else if (month === '05') {
    updated.tglSoMei = dateStr;
  }

  // Dynamic monthly history
  if (!updated.monthlySOHistory) updated.monthlySOHistory = {};
  updated.monthlySOHistory[`${month}_${year}`] = dateStr;

  // Recalculate frekuensi tidak SO
  updated.frekuensiTidakSO = calculateStoreFrekuensiTidakSO(updated, month);

  return updated;
}

/**
 * Extract target SO date for a store in a specific month and year reliably.
 * Handles specific month columns, generic scheduledDate/tglSo, day numbers, and Excel formats.
 */
export function extractStoreSODateForPeriod(
  st: Store, 
  targetMonth: string = getCurrentCalendarMonth(), 
  targetYear: string = getCurrentCalendarYear()
): { isoDate: string; rawVal: string; displayDate?: string } {
  if (!st) return { isoDate: '', rawVal: '', displayDate: '' };

  const anySt = st as any;
  let rawDateVal = '';

  const MONTH_KEYWORDS: Record<string, string[]> = {
    '01': ['januari', 'jan', 'january'],
    '02': ['februari', 'feb', 'february'],
    '03': ['maret', 'mar', 'march'],
    '04': ['april', 'apr'],
    '05': ['mei', 'may'],
    '06': ['juni', 'jun', 'june'],
    '07': ['juli', 'jul', 'july'],
    '08': ['agustus', 'ags', 'agt', 'agus', 'august', 'aug'],
    '09': ['september', 'sep', 'sept'],
    '10': ['oktober', 'okt', 'october', 'oct'],
    '11': ['november', 'nov', 'nop'],
    '12': ['desember', 'des', 'december', 'dec']
  };

  const isValValid = (v?: any): boolean => {
    if (v === null || v === undefined) return false;
    const str = String(v).trim().toLowerCase();
    return str !== '' && str !== '-' && str !== '0' && str !== '0.0' && str !== '0-jan-00' && str !== '00-jan-00' && str !== 'belum so' && str !== 'null' && str !== 'undefined';
  };

  // Helper to extract raw date string for a specific month
  const getMonthVal = (m: string): string => {
    // 1. Direct standard property checks
    if (m === '01' && isValValid(st.soJanuari)) return String(st.soJanuari);
    if (m === '02' && isValValid(st.soFebruari)) return String(st.soFebruari);
    if (m === '03' && isValValid(st.soMaret)) return String(st.soMaret);
    if (m === '04' && isValValid(st.soApril)) return String(st.soApril);
    if (m === '05' && isValValid(st.tglSoMei)) return String(st.tglSoMei);
    if (m === '06' && isValValid(st.tglSoJuni)) return String(st.tglSoJuni);
    if (m === '07' && isValValid(st.tglSoJuli)) return String(st.tglSoJuli);
    if (m === '08' && isValValid(st.soAgustus)) return String(st.soAgustus);
    if (m === '09' && isValValid(st.soSeptember)) return String(st.soSeptember);
    if (m === '10' && isValValid(st.soOktober)) return String(st.soOktober);
    if (m === '11' && isValValid(st.soNovember)) return String(st.soNovember);
    if (m === '12' && isValValid(st.soDesember)) return String(st.soDesember);

    // Dynamic monthly history
    if (st.monthlySOHistory) {
      if (isValValid(st.monthlySOHistory[`${m}_${targetYear}`])) return String(st.monthlySOHistory[`${m}_${targetYear}`]);
      if (isValValid(st.monthlySOHistory[m])) return String(st.monthlySOHistory[m]);
    }

    // 2. Dynamic key search across any custom Excel headers
    const keywords = MONTH_KEYWORDS[m] || [];
    for (const key of Object.keys(anySt)) {
      const cleanKey = key.toLowerCase().replace(/['"_\s\-\.]/g, '');
      const hasMonth = keywords.some(kw => cleanKey.includes(kw));
      if (hasMonth) {
        const val = anySt[key];
        if (isValValid(val)) return String(val);
      }
    }

    return '';
  };

  let resolvedMonth = targetMonth;
  if (targetMonth === 'ALL') {
    // Look for any month that has a valid date, prioritizing current calendar month, October (10), November (11), September (09), etc.
    const priorityMonths = ['10', '11', '12', '09', '08', '07', '06', '05', '04', '03', '02', '01'];
    for (const m of priorityMonths) {
      const v = getMonthVal(m);
      if (isValValid(v)) {
        resolvedMonth = m;
        rawDateVal = String(v);
        break;
      }
    }
  } else {
    rawDateVal = getMonthVal(targetMonth);
  }

  const effectiveYear = (targetYear && targetYear !== 'ALL') ? targetYear : getCurrentCalendarYear();
  const fallbackCalMonth = getCurrentCalendarMonth();

  // Check scheduledDate or tglSo if no specific month column matched
  if (!isValValid(rawDateVal)) {
    if (st.scheduledDate && isValValid(st.scheduledDate)) {
      const parsedSched = parseCurrentMonthSODate(st.scheduledDate, resolvedMonth !== 'ALL' ? resolvedMonth : fallbackCalMonth, effectiveYear);
      if (parsedSched.isValid) {
        const m = parsedSched.isoDate.split('-')[1];
        if (targetMonth === 'ALL' || m === targetMonth) {
          rawDateVal = st.scheduledDate;
          resolvedMonth = m;
        }
      }
    }
    if (!isValValid(rawDateVal) && st.tglSo && isValValid(st.tglSo)) {
      const parsedTgl = parseCurrentMonthSODate(st.tglSo, resolvedMonth !== 'ALL' ? resolvedMonth : fallbackCalMonth, effectiveYear);
      if (parsedTgl.isValid) {
        const m = parsedTgl.isoDate.split('-')[1];
        if (targetMonth === 'ALL' || m === targetMonth) {
          rawDateVal = st.tglSo;
          resolvedMonth = m;
        }
      }
    }
    // Also check generic 'TGL SO' or 'JADWAL SO' keys if still empty
    if (!isValValid(rawDateVal)) {
      for (const k of ['TGL SO', 'TANGGAL SO', 'JADWAL SO', 'TGL_SO', 'Jadwal SO', 'TGL SO BALI', 'TGL SO OKT', 'TGL SO SEP', 'TGL AUDIT', 'TGL AUDIT SO', 'TGL JADWAL', 'TGL JADWAL SO']) {
        if (isValValid(anySt[k])) {
          rawDateVal = String(anySt[k]);
          break;
        }
      }
    }
  }

  if (!isValValid(rawDateVal)) {
    return { isoDate: '', rawVal: '', displayDate: '' };
  }

  // Helper to ensure returned date matches targetMonth if specified and includes displayDate
  const validateAndReturn = (iso: string, raw: string) => {
    const disp = raw ? formatSmartSODate(raw, '-', resolvedMonth !== 'ALL' ? resolvedMonth : undefined, effectiveYear) : '';
    if (!iso) return { isoDate: '', rawVal: raw, displayDate: disp };
    if (targetMonth !== 'ALL') {
      const parts = iso.split('-');
      if (parts.length >= 2 && parts[1] !== targetMonth) {
        // Date belongs to another month
        return { isoDate: '', rawVal: raw, displayDate: disp };
      }
    }
    return { isoDate: iso, rawVal: raw, displayDate: disp };
  };

  // 1. Primary parser: parseCurrentMonthSODate handles day numbers ("12"), Excel serials (46274), text ("12 Okt 2026"), slash, and dashes
  const parsedCurrent = parseCurrentMonthSODate(rawDateVal, resolvedMonth !== 'ALL' ? resolvedMonth : fallbackCalMonth, effectiveYear);
  if (parsedCurrent.isValid && parsedCurrent.isoDate) {
    return validateAndReturn(parsedCurrent.isoDate, String(rawDateVal));
  }

  // 2. Check if rawDateVal is a single day number (1-31) or "Tgl 8"
  const tglMatch = String(rawDateVal).trim().match(/^(?:tgl|tanggal)?[\s\.]*(\d{1,2})$/i);
  if (tglMatch) {
    const d = parseInt(tglMatch[1], 10);
    if (d >= 1 && d <= 31) {
      const safeMonth = (resolvedMonth && resolvedMonth !== 'ALL') ? resolvedMonth : fallbackCalMonth;
      const iso = `${effectiveYear}-${safeMonth}-${String(d).padStart(2, '0')}`;
      return validateAndReturn(iso, String(rawDateVal));
    }
  }

  // 3. Check Excel serial number (e.g. 46275)
  const numVal = Number(rawDateVal);
  if (!isNaN(numVal) && numVal > 30000 && numVal < 60000) {
    const excelDate = new Date((numVal - 25569) * 86400 * 1000);
    if (!isNaN(excelDate.getTime())) {
      const y = String(excelDate.getFullYear());
      const m = String(excelDate.getMonth() + 1).padStart(2, '0');
      const d = String(excelDate.getDate()).padStart(2, '0');
      return validateAndReturn(`${y}-${m}-${d}`, String(rawDateVal));
    }
  }

  // 4. parseSmartDateWithContext
  const parsed = parseSmartDateWithContext(rawDateVal, resolvedMonth !== 'ALL' ? resolvedMonth : getCurrentCalendarMonth(), effectiveYear);
  if (parsed && !isNaN(parsed.getTime())) {
    const y = String(parsed.getFullYear());
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return validateAndReturn(`${y}-${m}-${d}`, String(rawDateVal));
  }

  const directIso = formatDateISO(rawDateVal);
  if (directIso && directIso.length >= 10 && !directIso.startsWith('1970')) {
    return validateAndReturn(directIso, String(rawDateVal));
  }

  const fallbackDisp = rawDateVal ? formatSmartSODate(rawDateVal, '-', resolvedMonth !== 'ALL' ? resolvedMonth : undefined, effectiveYear) : '';
  return { isoDate: '', rawVal: String(rawDateVal), displayDate: fallbackDisp };
}

/**
 * Standard mapping of months to standard Master Toko Bali properties and headers
 */
export const MASTER_BALI_MONTH_CONFIGS = [
  { month: '10', name: 'Oktober', standardCol: "SO OKTOBER '26", prop: 'soOktober' },
  { month: '11', name: 'November', standardCol: "SO NOVEMBER '26", prop: 'soNovember' },
  { month: '12', name: 'Desember', standardCol: "SO DESEMBER '26", prop: 'soDesember' },
  { month: '09', name: 'September', standardCol: "SO SEPTEMBER '26", prop: 'soSeptember' },
  { month: '08', name: 'Agustus', standardCol: "SO AGUSTUS '26", prop: 'soAgustus' },
  { month: '07', name: 'Juli', standardCol: "SO JULI '26", prop: 'tglSoJuli' },
  { month: '06', name: 'Juni', standardCol: "SO JUNI '26", prop: 'tglSoJuni' },
  { month: '05', name: 'Mei', standardCol: "SO MEI '26", prop: 'tglSoMei' },
  { month: '04', name: 'April', standardCol: "SO APRIL '26", prop: 'soApril' },
  { month: '03', name: 'Maret', standardCol: "SO MARET '26", prop: 'soMaret' },
  { month: '02', name: 'Februari', standardCol: "SO FEBRUARI '26", prop: 'soFebruari' },
  { month: '01', name: 'Januari', standardCol: "SO JANUARI '26", prop: 'soJanuari' },
] as const;

/**
 * Get monthly scheduling counts and statistics from Master Toko Bali stores
 */
export function getMasterStoresMonthStats(stores: Store[]) {
  const stats: Record<string, { month: string; name: string; standardCol: string; scheduledCount: number; blankCount: number }> = {};
  
  MASTER_BALI_MONTH_CONFIGS.forEach(cfg => {
    stats[cfg.month] = {
      month: cfg.month,
      name: cfg.name,
      standardCol: cfg.standardCol,
      scheduledCount: 0,
      blankCount: 0
    };
  });

  stores.forEach(st => {
    MASTER_BALI_MONTH_CONFIGS.forEach(cfg => {
      const ext = extractStoreSODateForPeriod(st, cfg.month);
      const isScheduled = Boolean(
        ext.isoDate || 
        (ext.rawVal && ext.rawVal !== '-' && ext.rawVal !== '0' && ext.rawVal !== '0-jan-00' && !ext.rawVal.toLowerCase().includes('belum'))
      );
      if (isScheduled) {
        stats[cfg.month].scheduledCount++;
      } else {
        stats[cfg.month].blankCount++;
      }
    });
  });

  return stats;
}

/**
 * Set a store's SO date in the specific month column and history
 */
export function setStoreMonthSOValue(store: Store, month: string, dateStr: string, year?: string): Store {
  const updated: Store = { ...store };
  if (month === '10') updated.soOktober = dateStr;
  else if (month === '09') updated.soSeptember = dateStr;
  else if (month === '08') updated.soAgustus = dateStr;
  else if (month === '11') updated.soNovember = dateStr;
  else if (month === '12') updated.soDesember = dateStr;
  else if (month === '07') updated.tglSoJuli = dateStr;
  else if (month === '06') updated.tglSoJuni = dateStr;
  else if (month === '05') updated.tglSoMei = dateStr;
  else if (month === '04') updated.soApril = dateStr;
  else if (month === '03') updated.soMaret = dateStr;
  else if (month === '02') updated.soFebruari = dateStr;
  else if (month === '01') updated.soJanuari = dateStr;

  if (!updated.monthlySOHistory) updated.monthlySOHistory = {};
  const y = year || (dateStr.includes('-') ? dateStr.split('-')[0] : getCurrentCalendarYear());
  updated.monthlySOHistory[`${month}_${y}`] = dateStr;
  updated.frekuensiTidakSO = calculateStoreFrekuensiTidakSO(updated, month);
  return updated;
}

/**
 * Clear a store's SO date in the specific month column
 */
export function clearStoreMonthSOValue(store: Store, month: string): Store {
  const updated: Store = { ...store };
  if (month === '10') updated.soOktober = '';
  else if (month === '09') updated.soSeptember = '';
  else if (month === '08') updated.soAgustus = '';
  else if (month === '11') updated.soNovember = '';
  else if (month === '12') updated.soDesember = '';
  else if (month === '07') updated.tglSoJuli = '';
  else if (month === '06') updated.tglSoJuni = '';
  else if (month === '05') updated.tglSoMei = '';
  else if (month === '04') updated.soApril = '';
  else if (month === '03') updated.soMaret = '';
  else if (month === '02') updated.soFebruari = '';
  else if (month === '01') updated.soJanuari = '';

  if (updated.monthlySOHistory) {
    Object.keys(updated.monthlySOHistory).forEach(k => {
      if (k.startsWith(`${month}_`) || k === month) {
        delete updated.monthlySOHistory![k];
      }
    });
  }
  updated.frekuensiTidakSO = calculateStoreFrekuensiTidakSO(updated, month);
  return updated;
}

/**
 * Intelligently generate and synchronize SOSchedules from Master Store monthly date columns
 * (e.g. SO OKTOBER '26, SO SEPTEMBER '26 or SO AGUSTUS) when a new master file is uploaded or activated.
 * Correctly handles schedule date modifications from Excel without residual ghost schedules.
 */
export function syncSchedulesFromMasterStores(
  stores: Store[], 
  existingSchedules: SOSchedule[],
  targetMonth: string = getCurrentCalendarMonth(),
  targetYear: string = getCurrentCalendarYear(),
  options?: {
    isReplaceMode?: boolean;
    results?: SOResult[];
  }
): { 
  updatedSchedules: SOSchedule[]; 
  newlyCreatedCount: number; 
  updatedCount: number; 
  removedCount: number;
  staleScheduleIdsToDelete: string[];
} {
  const staleScheduleIdsToDelete: string[] = [];

  if (!stores || stores.length === 0) {
    if (options?.isReplaceMode) {
      const approvedOnly: SOSchedule[] = [];
      existingSchedules.forEach(s => {
        const isApproved = s.spvApprovalStatus === 'Disetujui' || 
          (options?.results && options.results.some(r => r.approvalStatus === 'Disetujui' && (r.storeCode === s.storeCode || r.storeId === s.storeId)));
        if (isApproved) {
          approvedOnly.push(s);
        } else {
          staleScheduleIdsToDelete.push(s.id);
        }
      });
      return { 
        updatedSchedules: approvedOnly, 
        newlyCreatedCount: 0, 
        updatedCount: 0, 
        removedCount: existingSchedules.length - approvedOnly.length,
        staleScheduleIdsToDelete
      };
    }
    return { updatedSchedules: existingSchedules, newlyCreatedCount: 0, updatedCount: 0, removedCount: 0, staleScheduleIdsToDelete: [] };
  }

  const results = options?.results || [];
  const approvedStoreKeySet = new Set<string>();
  results.forEach(r => {
    if (r.approvalStatus === 'Disetujui') {
      if (r.storeCode) approvedStoreKeySet.add(r.storeCode.trim().toUpperCase());
      if (r.storeId) approvedStoreKeySet.add(r.storeId.trim().toUpperCase());
    }
  });

  // 1. Separate schedules into genuinely approved schedules and unapproved schedules
  const approvedSchedules: SOSchedule[] = [];
  const unapprovedMap = new Map<string, SOSchedule[]>();

  existingSchedules.forEach(sch => {
    const codeKey = sch.storeCode ? sch.storeCode.trim().toUpperCase() : '';
    const idKey = sch.storeId ? sch.storeId.trim().toUpperCase() : '';
    const isApproved = sch.spvApprovalStatus === 'Disetujui' || 
      (codeKey && approvedStoreKeySet.has(codeKey)) || 
      (idKey && approvedStoreKeySet.has(idKey));

    if (isApproved) {
      approvedSchedules.push(sch);
    } else {
      const primaryKey = codeKey || idKey;
      if (primaryKey) {
        const list = unapprovedMap.get(primaryKey) || [];
        list.push(sch);
        unapprovedMap.set(primaryKey, list);
      }
    }
  });

  let newlyCreatedCount = 0;
  let updatedCount = 0;
  let removedCount = 0;

  const processedUnapprovedSchedules: SOSchedule[] = [];
  const handledStoreKeys = new Set<string>();

  stores.forEach(st => {
    const codeKey = st.code ? st.code.trim().toUpperCase() : '';
    const idKey = st.id ? st.id.trim().toUpperCase() : '';
    const primaryKey = codeKey || idKey;
    if (!primaryKey || handledStoreKeys.has(primaryKey)) return;
    handledStoreKeys.add(primaryKey);

    // Determine target SO date for this store strictly from the target month column in the uploaded master
    const { isoDate, rawVal: rawDateVal } = extractStoreSODateForPeriod(st, targetMonth, targetYear);
    const hasValidDate = !!isoDate && !isoDate.startsWith('1970') && !isoDate.startsWith('1900') && isoDate.length >= 10;

    const existingUnapprovedList = (codeKey ? unapprovedMap.get(codeKey) : undefined) || 
                                  (idKey ? unapprovedMap.get(idKey) : undefined) || [];

    // If store already has a genuinely approved schedule in this active period, preserve it
    const hasApprovedSchedule = approvedSchedules.some(s => 
      ((codeKey && s.storeCode?.trim().toUpperCase() === codeKey) || 
       (idKey && s.storeId?.trim().toUpperCase() === idKey)) &&
      (targetMonth === 'ALL' || (s.scheduledDate && s.scheduledDate.split('-')[1] === targetMonth))
    );

    if (hasApprovedSchedule) {
      // Store already has an approved SO, purge any leftover unapproved drafts
      if (existingUnapprovedList.length > 0) {
        existingUnapprovedList.forEach(sch => {
          staleScheduleIdsToDelete.push(sch.id);
        });
        removedCount += existingUnapprovedList.length;
      }
      return;
    }

    if (!hasValidDate) {
      if (options?.isReplaceMode) {
        // Only strictly purge unapproved schedule in full replace mode
        if (existingUnapprovedList.length > 0) {
          existingUnapprovedList.forEach(sch => {
            staleScheduleIdsToDelete.push(sch.id);
          });
          removedCount += existingUnapprovedList.length;
        }
        return;
      } else {
        // In merge or two-way sync mode: PRESERVE existing schedule!
        if (existingUnapprovedList.length > 0) {
          processedUnapprovedSchedules.push(...existingUnapprovedList);
        }
        return;
      }
    }

    const resolvedDefaultKorlap = resolveStoreDefaultKorlap({
      kabupaten: st.kabupaten || st.region,
      region: st.region || st.kabupaten,
      as: st.as,
      am: st.am,
      name: st.name,
      address: st.address
    });
    
    // Extract Korlap strictly from Master Toko columns (KORLAP/OFFICER SO, korlap, managerName)
    const rawKorlap = st.korlap || 
      (st as any)['KORLAP/OFFICER SO'] || 
      (st as any)['KORLAP / OFFICER SO'] || 
      (st as any)['KORLAP'] || 
      (st as any)['OFFICER SO'] || 
      (st as any)['OFFICER'] || 
      st.managerName;

    const canonicalOfficer = (rawKorlap && rawKorlap !== 'Petugas SO' && String(rawKorlap).trim() !== '')
      ? (normalizeKorlapName(String(rawKorlap).trim()) || String(rawKorlap).trim()) 
      : (resolvedDefaultKorlap || 'Belum Ditentukan');

    const isHitam = isStoreZonaHitam(st);
    const storeZona = isHitam ? 'ZONA HITAM' : 'NON ZONA HITAM';
    const storeAktiva = st.soAktiva || 'Tidak';
    const storeSaldo = typeof st.saldoToko === 'number' ? st.saldoToko : (parseFloat(String(st.saldoToko || '').replace(/[^0-9.-]/g, '')) || 0);
    const dayName = getDayNameIndo(isoDate);

    if (existingUnapprovedList.length > 0) {
      // Pick the primary existing schedule, mark all duplicate unapproved schedules to be purged
      const targetSched = existingUnapprovedList[0];
      if (existingUnapprovedList.length > 1) {
        for (let i = 1; i < existingUnapprovedList.length; i++) {
          staleScheduleIdsToDelete.push(existingUnapprovedList[i].id);
        }
        removedCount += (existingUnapprovedList.length - 1);
      }

      if (targetSched.scheduledDate !== isoDate) {
        updatedCount++;
      }

      const newId = `SCHED-${st.code || st.id}-${isoDate}`;
      if (targetSched.id !== newId) {
        // Old schedule ID must be purged from storage
        staleScheduleIdsToDelete.push(targetSched.id);
      }

      const effectiveTeam = st.teamName || targetSched.teamName || 'TEAM 1';
      const effectivePersonil = st.personilLeader || targetSched.personilLeader || '';
      const effectiveDay = st.dayName || dayName;

      const updatedSched: SOSchedule = {
        ...targetSched,
        id: newId,
        scheduledDate: isoDate,
        dayName: effectiveDay,
        storeId: st.id,
        storeCode: st.code,
        storeName: st.name,
        zona: storeZona,
        soAktiva: storeAktiva,
        stockRp: storeSaldo > 0 ? storeSaldo : targetSched.stockRp,
        asInitial: st.as || targetSched.asInitial,
        typeSo: st.typeSo || st.qm || targetSched.typeSo || 'M',
        officerInCharge: canonicalOfficer,
        groupName: canonicalOfficer,
        teamName: effectiveTeam,
        teamCategory: effectiveTeam,
        personilLeader: effectivePersonil,
        assignedPersonnelNames: effectivePersonil ? [effectivePersonil] : (targetSched.assignedPersonnelNames || []),
        region: st.region || st.kabupaten || targetSched.region || 'Kota Denpasar',
        status: targetSched.status || 'Terjadwal',
        spvApprovalStatus: targetSched.spvApprovalStatus || 'Menunggu Approval SPV'
      };

      processedUnapprovedSchedules.push(updatedSched);
    } else {
      // Create fresh schedule
      const effectiveTeam = st.teamName || 'TEAM 1';
      const effectivePersonil = st.personilLeader || '';
      const effectiveDay = st.dayName || dayName;
      const cleanTeamId = effectiveTeam.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase();

      const newSchedule: SOSchedule = {
        id: `SCHED-${st.code || st.id}-${isoDate}`,
        storeId: st.id,
        storeCode: st.code,
        storeName: st.name,
        scheduledDate: isoDate,
        scheduledTime: '08:00',
        teamId: cleanTeamId.startsWith('TEAM') ? cleanTeamId : `TEAM-${cleanTeamId}`,
        teamName: effectiveTeam,
        teamCategory: effectiveTeam,
        spvInCharge: 'I GEDE PASEK SANTIKA',
        officerInCharge: canonicalOfficer,
        groupName: canonicalOfficer,
        personilLeader: effectivePersonil,
        assignedPersonnelNames: effectivePersonil ? [effectivePersonil] : [],
        dayName: effectiveDay,
        stockRp: storeSaldo,
        kasToko: st.kasToko || 0,
        typeSo: st.typeSo || st.qm || 'M',
        zona: storeZona,
        soAktiva: storeAktiva,
        asInitial: st.as || '',
        region: st.region || st.kabupaten || 'Kota Denpasar',
        status: 'Terjadwal',
        targetSKUCount: st.totalSKUCount || 1000,
        spvApprovalStatus: 'Menunggu Approval SPV',
        notes: `Otomatis disinkronkan dari Master Toko (Type SO: ${st.typeSo || st.qm || 'M'})`,
        createdAt: new Date().toISOString().slice(0, 10)
      };

      processedUnapprovedSchedules.push(newSchedule);
      newlyCreatedCount++;
    }
  });

  // If in merge mode (not replace mode), retain unapproved schedules of stores not mentioned in incoming list
  if (!options?.isReplaceMode) {
    unapprovedMap.forEach((schedulesList, key) => {
      if (!handledStoreKeys.has(key)) {
        processedUnapprovedSchedules.push(...schedulesList);
      }
    });
  } else {
    // In replace mode, unhandled stores are counted as removed and purged
    unapprovedMap.forEach((schedulesList, key) => {
      if (!handledStoreKeys.has(key)) {
        schedulesList.forEach(sch => {
          staleScheduleIdsToDelete.push(sch.id);
        });
        removedCount += schedulesList.length;
      }
    });
  }

  // Combine approved + processed unapproved schedules, ensuring no duplicate IDs
  const seenIds = new Set<string>();
  const allFinalSchedules: SOSchedule[] = [];

  [...approvedSchedules, ...processedUnapprovedSchedules].forEach(sch => {
    if (!seenIds.has(sch.id)) {
      seenIds.add(sch.id);
      allFinalSchedules.push(sch);
    }
  });

  return { 
    updatedSchedules: allFinalSchedules, 
    newlyCreatedCount, 
    updatedCount, 
    removedCount,
    staleScheduleIdsToDelete
  };
}

/**
 * Get Indonesian day name from date string YYYY-MM-DD
 */
export function getDayNameIndo(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const dayIndex = date.getDay(); // 0 = Minggu, 1 = Senin, ...
  const days = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
  return days[dayIndex] || '';
}

/**
 * Enrich schedule object with real-time Master Store data (Lookup VLOOKUP emulation)
 */
export function enrichScheduleWithMasterStore(schedule: SOSchedule, store?: Store): SOSchedule {
  if (!store) return schedule;

  const day = schedule.dayName || getDayNameIndo(schedule.scheduledDate);
  const stockRp = store.saldoToko !== undefined ? store.saldoToko : schedule.stockRp;
  const kasToko = store.kasToko !== undefined ? store.kasToko : schedule.kasToko;
  const typeSo = store.typeSo || store.qm || schedule.typeSo || 'M';
  const zona = store.zona || (store.isZonaHitam ? 'ZONA HITAM' : 'NON ZONA HITAM') || schedule.zona;
  const asInitial = store.as || schedule.asInitial || '';
  const region = store.region || store.kabupaten || schedule.region;

  const canonicalKorlap = store.korlap && store.korlap !== 'Petugas SO'
    ? normalizeKorlapName(store.korlap)
    : (schedule.officerInCharge || schedule.groupName);

  return {
    ...schedule,
    storeName: store.name || schedule.storeName,
    stockRp,
    kasToko,
    typeSo,
    zona,
    soAktiva: store.soAktiva || schedule.soAktiva || 'Tidak',
    asInitial,
    region,
    dayName: day,
    officerInCharge: canonicalKorlap || schedule.officerInCharge,
    groupName: canonicalKorlap || schedule.groupName
  };
}

/**
 * Complete Two-Way Synchronization between Stores and Schedules
 */
export function twoWaySyncStoresAndSchedules(
  stores: Store[],
  schedules: SOSchedule[],
  month: string = getCurrentCalendarMonth(),
  year: string = getCurrentCalendarYear()
): { updatedStores: Store[]; updatedSchedules: SOSchedule[]; changesCount: number; staleScheduleIdsToDelete: string[] } {
  let changesCount = 0;

  // Resolve effective month and year (fallback intelligently if 'ALL' passed)
  const detected = detectSmartMonthAndYear([], stores);
  const effectiveMonth = (month && month !== 'ALL') ? month : (detected.month || getCurrentCalendarMonth());
  const effectiveYear = (year && year !== 'ALL') ? year : (detected.year || getCurrentCalendarYear());

  const storeMap = new Map<string, Store>();
  stores.forEach(s => {
    const key = (s.code || s.id || '').trim().toUpperCase();
    if (key) storeMap.set(key, { ...s });
  });

  // If stores input was empty, respect user reset and do NOT fall back to initial Bali stores
  if (storeMap.size === 0) {
    return {
      updatedStores: [],
      updatedSchedules: schedules,
      changesCount: 0,
      staleScheduleIdsToDelete: []
    };
  }

  // 1. PRIMARY DIRECTION: MASTER STORE IS THE SOURCE OF TRUTH.
  // Extract schedule dates, Korlap, and store details from Master Stores into SOSchedules.
  // Unapproved schedules are updated to match Master dates and Korlap.
  const { updatedSchedules, newlyCreatedCount, staleScheduleIdsToDelete } = syncSchedulesFromMasterStores(
    Array.from(storeMap.values()), 
    schedules, 
    effectiveMonth, 
    effectiveYear, 
    { isReplaceMode: false }
  );
  changesCount += newlyCreatedCount;

  // 2. SECONDARY DIRECTION: SYNC SCHEDULE APPROVALS & COMPLETED STATUS BACK TO MASTER STORES
  // CRITICAL: We NEVER overwrite a store's valid Master SO date with an unapproved draft schedule!
  updatedSchedules.forEach(sched => {
    if (!sched.scheduledDate) return;

    const codeKey = (sched.storeCode || '').trim().toUpperCase();
    const idKey = (sched.storeId || '').trim().toUpperCase();
    const nameKey = (sched.storeName || '').trim().toLowerCase();

    let matchStore = (codeKey ? storeMap.get(codeKey) : undefined) || 
                     (idKey ? storeMap.get(idKey) : undefined) ||
                     Array.from(storeMap.values()).find(s => 
                       (s.name && s.name.trim().toLowerCase() === nameKey)
                     );

    if (!matchStore) return;

    const smartDate = formatSmartSODate(sched.scheduledDate);
    const hasExistingMasterDate = !!(
      matchStore.soSeptember || 
      matchStore.soAgustus || 
      matchStore.soOktober || 
      matchStore.soNovember || 
      matchStore.soDesember ||
      matchStore.tglSoMei ||
      matchStore.tglSoJuni ||
      matchStore.tglSoJuli ||
      matchStore.scheduledDate ||
      matchStore.tglSo
    );

    // Sync approval status from SPV
    if (sched.spvApprovalStatus === 'Disetujui') {
      if (matchStore.statusApproveSO !== 'Sudah Approve') {
        matchStore.statusApproveSO = 'Sudah Approve';
        matchStore.tglSoApproved = sched.scheduledDate;
        changesCount++;
      }
    } else if (sched.status === 'Selesai') {
      if (matchStore.statusApproveSO !== 'Belum Terapprove' && matchStore.statusApproveSO !== 'Sudah Approve') {
        matchStore.statusApproveSO = 'Belum Terapprove';
        changesCount++;
      }
    } else if (!matchStore.statusApproveSO) {
      matchStore.statusApproveSO = 'Belum SO';
    }

    // Only update master date if store had NO date originally in Master
    if (!hasExistingMasterDate) {
      if (effectiveMonth === '09') {
        matchStore.soSeptember = smartDate;
      } else if (effectiveMonth === '08') {
        matchStore.soAgustus = smartDate;
      } else if (effectiveMonth === '10') {
        matchStore.soOktober = smartDate;
      } else if (effectiveMonth === '11') {
        matchStore.soNovember = smartDate;
      } else if (effectiveMonth === '12') {
        matchStore.soDesember = smartDate;
      }
      matchStore.scheduledDate = sched.scheduledDate;
      matchStore.tglSo = smartDate;
      changesCount++;
    }

    // Ensure korlap is synced if store had no korlap or generic 'Petugas SO'
    if (sched.officerInCharge && (!matchStore.korlap || matchStore.korlap === 'Petugas SO')) {
      const canonical = normalizeKorlapName(sched.officerInCharge);
      matchStore.korlap = canonical || sched.officerInCharge.split(' (')[0];
      changesCount++;
    }
  });

  const updatedStores = Array.from(storeMap.values());

  // 3. Enrich all schedules with latest Master Store details
  const fullyEnrichedSchedules = updatedSchedules.map(sched => {
    const codeKey = (sched.storeCode || '').trim().toUpperCase();
    const idKey = (sched.storeId || '').trim().toUpperCase();
    const st = updatedStores.find(s => 
      (codeKey && s.code?.trim().toUpperCase() === codeKey) || 
      (idKey && s.id?.trim().toUpperCase() === idKey)
    );
    return enrichScheduleWithMasterStore(sched, st);
  });

  // CRITICAL SAFETY CHECK: NEVER purge a schedule ID that exists in fullyEnrichedSchedules
  const survivingIdSet = new Set(fullyEnrichedSchedules.map(s => s.id));
  const safeStaleIdsToDelete = staleScheduleIdsToDelete.filter(id => !survivingIdSet.has(id));

  // ABSOLUTE FALLBACK GUARD: Never return 0 schedules if stores exist!
  let finalSchedules = fullyEnrichedSchedules;
  if (finalSchedules.length === 0) {
    if (schedules.length > 0) {
      finalSchedules = schedules.map(sched => {
        const codeKey = (sched.storeCode || '').trim().toUpperCase();
        const idKey = (sched.storeId || '').trim().toUpperCase();
        const st = updatedStores.find(s => 
          (codeKey && s.code?.trim().toUpperCase() === codeKey) || 
          (idKey && s.id?.trim().toUpperCase() === idKey)
        );
        return enrichScheduleWithMasterStore(sched, st);
      });
    } else if (updatedStores.length > 0) {
      finalSchedules = generateInitialSchedules(updatedStores);
    }
  }

  return {
    updatedStores,
    updatedSchedules: finalSchedules,
    changesCount,
    staleScheduleIdsToDelete: finalSchedules === fullyEnrichedSchedules ? safeStaleIdsToDelete : []
  };
}

/**
 * Reconcile incoming Master Stores (e.g. from a freshly uploaded or edited Excel)
 * with existing stores, schedules, and results so that any store that has ALREADY
 * been approved by SPV SO retains its "Sudah Approve" status and approval date.
 */
export function reconcileStoresWithExistingApprovals(
  incomingStores: Store[],
  existingStores: Store[] = [],
  existingSchedules: SOSchedule[] = [],
  existingResults: SOResult[] = []
): Store[] {
  const approvedMap = new Map<string, {
    statusApproveSO: 'Sudah Approve';
    tglSoApproved: string;
    lastSODate?: string;
    korlap?: string;
    spvApprover?: string;
    lastAccuracyRate?: number;
    monthlyHistory?: Record<string, string | number>;
  }>();

  // 1. Existing audit results with approved status (HIGHEST PRIORITY SOURCE OF TRUTH)
  existingResults.forEach(res => {
    if (res.approvalStatus === 'Disetujui') {
      const payload = {
        statusApproveSO: 'Sudah Approve' as const,
        tglSoApproved: res.soDate || res.approvedAt || '',
        lastSODate: res.soDate || res.approvedAt || '',
        korlap: res.spvApprover,
        spvApprover: res.spvApprover || 'Gean Pratama (SPV SO)',
        lastAccuracyRate: res.accuracyRatePercentage
      };
      if (res.storeCode) approvedMap.set(res.storeCode.trim().toUpperCase(), payload);
      if (res.storeId) approvedMap.set(res.storeId.trim().toUpperCase(), payload);
    }
  });

  // 2. Existing schedules with genuine SPV approval status ONLY
  existingSchedules.forEach(sch => {
    if (sch.spvApprovalStatus === 'Disetujui') {
      const codeKey = sch.storeCode?.trim().toUpperCase();
      const idKey = sch.storeId?.trim().toUpperCase();
      if ((codeKey && !approvedMap.has(codeKey)) || (idKey && !approvedMap.has(idKey))) {
        const payload = {
          statusApproveSO: 'Sudah Approve' as const,
          tglSoApproved: sch.scheduledDate || '',
          lastSODate: sch.scheduledDate || '',
          korlap: sch.officerInCharge,
          spvApprover: sch.spvInCharge || 'Gean Pratama (SPV SO)'
        };
        if (codeKey) approvedMap.set(codeKey, payload);
        if (idKey) approvedMap.set(idKey, payload);
      }
    }
  });

  return incomingStores.map(st => {
    const codeKey = (st.code || '').trim().toUpperCase();
    const idKey = (st.id || '').trim().toUpperCase();
    const approvedInfo = (codeKey ? approvedMap.get(codeKey) : undefined) || (idKey ? approvedMap.get(idKey) : undefined);

    // If incoming store from Excel is already explicitly marked "Sudah Approve", keep it
    if (st.statusApproveSO === 'Sudah Approve') {
      return {
        ...st,
        spvApprover: st.spvApprover || approvedInfo?.spvApprover || 'Gean Pratama (SPV SO)',
        lastAccuracyRate: st.lastAccuracyRate !== undefined ? st.lastAccuracyRate : approvedInfo?.lastAccuracyRate
      };
    }

    // If store has a genuine SPV approval record in the system, preserve the approval!
    if (approvedInfo) {
      return {
        ...st,
        statusApproveSO: 'Sudah Approve',
        tglSoApproved: st.tglSoApproved || approvedInfo.tglSoApproved,
        lastSODate: st.lastSODate || approvedInfo.lastSODate || st.tglSoApproved,
        korlap: (st.korlap && st.korlap !== 'Petugas SO') ? st.korlap : (approvedInfo.korlap || st.korlap),
        spvApprover: st.spvApprover || approvedInfo.spvApprover,
        lastAccuracyRate: st.lastAccuracyRate !== undefined ? st.lastAccuracyRate : approvedInfo.lastAccuracyRate,
        monthlySOHistory: {
          ...(st.monthlySOHistory || {}),
          ...(approvedInfo.monthlyHistory || {})
        }
      };
    }

    // Otherwise, respect incoming store's status without residue
    return {
      ...st,
      statusApproveSO: st.statusApproveSO || 'Belum SO'
    };
  });
}



