export function formatRupiah(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return 'Rp 0';
  const numVal = typeof value === 'number' ? value : (parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0);
  const isNegative = numVal < 0;
  const absValue = Math.abs(numVal);
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(absValue);

  return isNegative ? `-${formatted}` : formatted;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

export function formatDateIndo(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const d = parseSmartDate(dateStr);
    if (!d) return dateStr;
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);
  } catch {
    return dateStr;
  }
}

export function formatDateISO(dateStr: any, fallbackToToday = false, contextMonth?: string, contextYear?: string): string {
  if (!dateStr || dateStr === '-' || dateStr === '0' || dateStr === '0.0' || String(dateStr).toLowerCase() === '0-jan-00' || String(dateStr).toLowerCase() === 'belum so' || String(dateStr).toLowerCase() === 'tidak so') {
    return fallbackToToday ? new Date().toISOString().split('T')[0] : '';
  }
  const d = parseSmartDateWithContext(dateStr, contextMonth, contextYear);
  if (!d) return fallbackToToday ? new Date().toISOString().split('T')[0] : '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'Selesai':
    case 'Disetujui':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'Proses SO':
    case 'Menunggu Approval SPV':
    case 'Menunggu Rekapan':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'Terjadwal':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'Perlu Audit Ulang':
    case 'Ditolak':
    case 'Dibatalkan':
      return 'bg-rose-100 text-rose-800 border-rose-300';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300';
  }
}

export function getRiskBadgeClass(risk: string = ''): string {
  return getZoneBadgeClass(risk);
}

export function getZoneBadgeClass(zone: string = ''): string {
  const z = (zone || '').toLowerCase().trim();
  // 1. Check NON / BUKAN / AMAN / RENDAH first
  if (z.includes('non') || z.includes('bukan') || z.includes('tidak') || z.includes('rendah') || z.includes('low') || z.includes('hijau') || z.includes('reguler') || z === 'aman' || z === '-') {
    return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
  }
  // 2. Check ZONA HITAM / TINGGI
  if (z.includes('hitam') || z.includes('tinggi') || z.includes('high') || z.includes('merah') || z === 'black' || z === 'black zone') {
    return 'bg-rose-50 text-rose-800 border-rose-300 font-extrabold';
  }
  if (z.includes('sedang') || z.includes('medium') || z.includes('kuning')) {
    return 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200 font-medium';
}

export function formatZoneText(zone?: string): string {
  if (!zone) return 'NON ZONA HITAM';
  const clean = zone.trim().toUpperCase();
  if (clean.includes('NON') || clean.includes('BUKAN') || clean.includes('TIDAK') || clean === 'AMAN' || clean === '-') {
    return 'NON ZONA HITAM';
  }
  if (clean.includes('HITAM') || clean === 'BLACK' || clean === 'BLACK ZONE') {
    return 'ZONA HITAM';
  }
  return clean;
}

const INDO_MONTHS: Record<string, number> = {
  jan: 0, januari: 0, january: 0,
  feb: 1, februari: 1, february: 1,
  mar: 2, maret: 2, march: 2,
  apr: 3, april: 3,
  mei: 4, may: 4,
  jun: 5, juni: 5, june: 5,
  jul: 6, juli: 6, july: 6,
  ags: 7, agt: 7, agus: 7, agustus: 7, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  okt: 9, oct: 9, oktober: 9, october: 9,
  nov: 10, nop: 10, november: 10,
  des: 11, dec: 11, desember: 11, december: 11
};

const ID_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Utility parse date secara cerdas untuk format YYYY-MM-DD, DD/MM/YYYY, DD-MMM-YY, Excel serial number, dll.
 * Otomatis menangani desimal Excel (misal 46177.0 / 46177 -> 3 Jun 2026), string kosong, '0-Jan-00', dsb.
 */
export function parseSmartDate(dateStr: any): Date | null {
  return parseSmartDateWithContext(dateStr);
}

export function parseSmartDateWithContext(dateStr: any, contextMonth?: string, contextYear?: string): Date | null {
  if (dateStr === null || dateStr === undefined || dateStr === '') return null;

  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }

  let rawStr = String(dateStr).trim();
  // Strip .0 / .00 suffix from excel
  rawStr = rawStr.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');

  if (
    !rawStr || 
    rawStr === '-' || 
    rawStr === '0' || 
    rawStr === '0.0' || 
    rawStr.toLowerCase() === '0-jan-00' || 
    rawStr.toLowerCase() === '00-jan-00' || 
    rawStr === '0/0/0' || 
    rawStr.toLowerCase() === 'belum so' ||
    rawStr.toLowerCase() === 'null' ||
    rawStr.toLowerCase() === 'undefined'
  ) {
    return null;
  }

  // Handle single day number (e.g. "8", "15", "Tgl 8", "Tgl. 15", "Tanggal 20")
  const tglMatch = rawStr.match(/^(?:tgl|tanggal)?[\s\.]*(\d{1,2})$/i);
  if (tglMatch) {
    const day = parseInt(tglMatch[1], 10);
    if (day >= 1 && day <= 31) {
      const effectiveMonth = contextMonth ? parseInt(contextMonth, 10) - 1 : 8; // default to Sep (month index 8)
      const effectiveYear = contextYear ? parseInt(contextYear, 10) : 2026;
      const dt = new Date(effectiveYear, effectiveMonth, day);
      if (!isNaN(dt.getTime())) return dt;
    }
  }

  // Strip leading day-of-week names e.g. "Rabu, 9 Sep" -> "9 Sep"
  rawStr = rawStr.replace(/^(?:senin|selasa|rabu|kamis|jumat|sabtu|minggu|mon|tue|wed|thu|fri|sat|sun)[\s,.-]+/i, '').trim();

  // Handle Excel Serial Date Number (misal: 42717 = 13 Dec 2016, 46177 = 3 Jun 2026, 46177.0, etc.)
  const numericVal = typeof dateStr === 'number' 
    ? dateStr 
    : (!rawStr.includes('-') && !rawStr.includes('/') && /^\d+(\.\d+)?$/.test(rawStr) ? parseFloat(rawStr) : NaN);

  if (!isNaN(numericVal) && numericVal > 20000 && numericVal < 80000) {
    // Excel 1900 date system leap year offset: 25569 days from 1970-01-01
    const utcMs = Math.round((numericVal - 25569) * 86400000);
    const d = new Date(utcMs);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const dt = d.getUTCDate();
      return new Date(y, m, dt);
    }
  }

  const str = rawStr;

  // 1. Format YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const isoMatch = str.match(/^(\d{4})[\-/\.](\d{1,2})[\-/\.](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const dt = new Date(y, m, d);
    if (!isNaN(dt.getTime())) return dt;
  }

  // 2. Format dengan Nama Bulan: "13-Dec-16", "13-Des-16", "13 Dec 2016", "10-Agus-18", "26-Mei-23", "9-May-26"
  const textMonthMatch = str.match(/^(\d{1,2})[\s\-/\.]+([a-zA-Z]+)[\s\-/\.]+(\d{2,4})$/);
  if (textMonthMatch) {
    const day = parseInt(textMonthMatch[1], 10);
    const monthKey = textMonthMatch[2].toLowerCase();
    let year = parseInt(textMonthMatch[3], 10);

    if (monthKey in INDO_MONTHS) {
      const month = INDO_MONTHS[monthKey];
      if (year < 100) {
        const cur2DigitYear = new Date().getFullYear() % 100;
        year = year <= cur2DigitYear + 10 ? 2000 + year : 1900 + year;
      }
      const dt = new Date(year, month, day);
      if (!isNaN(dt.getTime())) return dt;
    }
  }

  // 2b. Format Nama Bulan Di Depan: "Dec 13, 2016", "Desember 13, 2016"
  const textMonthFirstMatch = str.match(/^([a-zA-Z]+)[\s\-/\.]+(\d{1,2})[\s\-/\.]+(\d{2,4})$/);
  if (textMonthFirstMatch) {
    const monthKey = textMonthFirstMatch[1].toLowerCase();
    const day = parseInt(textMonthFirstMatch[2], 10);
    let year = parseInt(textMonthFirstMatch[3], 10);

    if (monthKey in INDO_MONTHS) {
      const month = INDO_MONTHS[monthKey];
      if (year < 100) {
        const cur2DigitYear = new Date().getFullYear() % 100;
        year = year <= cur2DigitYear + 10 ? 2000 + year : 1900 + year;
      }
      const dt = new Date(year, month, day);
      if (!isNaN(dt.getTime())) return dt;
    }
  }

  // 3. Format Angka DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YY, DD/MM/YY
  const numMatch = str.match(/^(\d{1,2})[\-/\.](\d{1,2})[\-/\.](\d{2,4})$/);
  if (numMatch) {
    const day = parseInt(numMatch[1], 10);
    const month = parseInt(numMatch[2], 10) - 1;
    let year = parseInt(numMatch[3], 10);

    if (year < 100) {
      const cur2DigitYear = new Date().getFullYear() % 100;
      year = year <= cur2DigitYear + 10 ? 2000 + year : 1900 + year;
    }

    const dt = new Date(year, month, day);
    if (!isNaN(dt.getTime())) return dt;
  }

  // 4. Fallback ke Date JS
  const stdDate = new Date(str);
  if (!isNaN(stdDate.getTime())) {
    if (stdDate.getFullYear() < 1980) {
      stdDate.setFullYear(stdDate.getFullYear() + 100);
    }
    return stdDate;
  }

  return null;
}

/**
 * Format tanggal jadwal SO master toko secara cerdas & manusiawi (misal: "3 Jun 2026", "13 Ags 2026").
 * Menghilangkan angka desimal serial excel (46177.0 -> 3 Jun 2026) dan '0-Jan-00' -> '-'.
 */
export function formatSmartSODate(val: any, fallback: string = '-', contextMonth?: string, contextYear?: string): string {
  if (val === null || val === undefined || val === '') return fallback;
  let rawStr = String(val).trim();
  
  // Strip trailing .0 / .00 decimal artifacts (misal dari import excel: 15.0 -> 15, 46177.0 -> 46177)
  rawStr = rawStr.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');

  if (
    !rawStr || 
    rawStr === '-' || 
    rawStr === '0' || 
    rawStr === '0.0' || 
    rawStr === '0.00' ||
    rawStr.toLowerCase() === '0-jan-00' || 
    rawStr.toLowerCase() === '00-jan-00' || 
    rawStr === '0/0/0' || 
    rawStr.toLowerCase() === 'belum so' ||
    rawStr.toLowerCase() === 'tidak so' ||
    rawStr.toLowerCase() === 'null' ||
    rawStr.toLowerCase() === 'undefined'
  ) {
    return fallback;
  }

  const parsed = parseSmartDateWithContext(rawStr, contextMonth, contextYear);
  if (parsed && !isNaN(parsed.getTime())) {
    const d = parsed.getDate();
    const m = ID_MONTH_NAMES[parsed.getMonth()];
    const y = parsed.getFullYear();
    return `${d} ${m} ${y}`;
  }

  // Jika berupa angka tunggal 1 - 31 (misal tgl jadwal bulan berjalan: 15, 3, 28)
  const numOnly = Number(rawStr);
  if (!isNaN(numOnly) && numOnly >= 1 && numOnly <= 31 && Number.isInteger(numOnly)) {
    const mName = contextMonth && parseInt(contextMonth, 10) >= 1 && parseInt(contextMonth, 10) <= 12
      ? ID_MONTH_NAMES[parseInt(contextMonth, 10) - 1]
      : 'Sep';
    const y = contextYear || '2026';
    return `${numOnly} ${mName} ${y}`;
  }

  // If already a readable non-decimal string, return trimmed
  return rawStr;
}

/**
 * Universal extractor specifically tailored to parse current running month SO dates from master store sheets.
 * Accurately translates day numbers (e.g. 9, 15), Excel serial numbers (e.g. 46274), and formatted dates into ISO and display.
 */
export function parseCurrentMonthSODate(
  val: any,
  targetMonth: string = '09',
  targetYear: string = '2026'
): { isoDate: string; displayDate: string; dayNumber: number | null; isValid: boolean } {
  if (val === null || val === undefined || val === '') {
    return { isoDate: '', displayDate: '', dayNumber: null, isValid: false };
  }

  let rawStr = String(val).trim();
  // Strip trailing decimal artifacts e.g. 15.0 -> 15
  rawStr = rawStr.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');

  if (
    !rawStr || 
    rawStr === '-' || 
    rawStr === '0' || 
    rawStr === '0.0' ||
    rawStr.toLowerCase() === '0-jan-00' || 
    rawStr.toLowerCase() === 'belum so' ||
    rawStr.toLowerCase() === 'tidak so' ||
    rawStr.toLowerCase() === 'null' ||
    rawStr.toLowerCase() === 'undefined'
  ) {
    return { isoDate: '', displayDate: '', dayNumber: null, isValid: false };
  }

  // 1. Single day number e.g. "9", "15", "Tgl 9", "Tanggal 15", "Tgl. 15"
  const tglMatch = rawStr.match(/^(?:tgl|tanggal)?[\s\.]*(\d{1,2})$/i);
  if (tglMatch) {
    const d = parseInt(tglMatch[1], 10);
    if (d >= 1 && d <= 31) {
      const mPad = (targetMonth && targetMonth !== 'ALL' ? targetMonth : '09').padStart(2, '0');
      const dPad = String(d).padStart(2, '0');
      const y = (targetYear && targetYear !== 'ALL' ? targetYear : '2026');
      const iso = `${y}-${mPad}-${dPad}`;
      const mIdx = parseInt(mPad, 10) - 1;
      const mName = ID_MONTH_NAMES[mIdx] || 'Sep';
      return {
        isoDate: iso,
        displayDate: `${d} ${mName} ${y}`,
        dayNumber: d,
        isValid: true
      };
    }
  }

  // 2. Excel serial number e.g. 46274
  const numVal = Number(rawStr);
  if (!isNaN(numVal) && numVal > 20000 && numVal < 80000) {
    const utcMs = Math.round((numVal - 25569) * 86400000);
    const dateObj = new Date(utcMs);
    if (!isNaN(dateObj.getTime())) {
      const y = dateObj.getUTCFullYear();
      const m = dateObj.getUTCMonth();
      const d = dateObj.getUTCDate();
      const mPad = String(m + 1).padStart(2, '0');
      const dPad = String(d).padStart(2, '0');
      return {
        isoDate: `${y}-${mPad}-${dPad}`,
        displayDate: `${d} ${ID_MONTH_NAMES[m]} ${y}`,
        dayNumber: d,
        isValid: true
      };
    }
  }

  // 3. Natural Date string with context month & year
  const parsed = parseSmartDateWithContext(rawStr, targetMonth !== 'ALL' ? targetMonth : '09', targetYear !== 'ALL' ? targetYear : '2026');
  if (parsed && !isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = parsed.getMonth();
    const d = parsed.getDate();
    const mPad = String(m + 1).padStart(2, '0');
    const dPad = String(d).padStart(2, '0');
    return {
      isoDate: `${y}-${mPad}-${dPad}`,
      displayDate: `${d} ${ID_MONTH_NAMES[m]} ${y}`,
      dayNumber: d,
      isValid: true
    };
  }

  return { isoDate: '', displayDate: rawStr, dayNumber: null, isValid: false };
}

/**
 * Logika hitung Lama Bekerja: (Tanggal Hari Ini / Hari H) dikurangi (Tanggal Masuk Bekerja)
 */
export function calculateLamaBekerja(joinDateStr: string, refDateStr?: string): string {
  if (!joinDateStr) return '-';
  try {
    const start = parseSmartDate(joinDateStr);
    const ref = refDateStr ? parseSmartDate(refDateStr) : new Date();
    
    if (!start || !ref || isNaN(start.getTime()) || isNaN(ref.getTime())) return '-';
    if (start > ref) return '0 Hr (Baru)';

    let years = ref.getFullYear() - start.getFullYear();
    let months = ref.getMonth() - start.getMonth();
    let days = ref.getDate() - start.getDate();

    if (days < 0) {
      months -= 1;
      const prevMonthLastDay = new Date(ref.getFullYear(), ref.getMonth(), 0).getDate();
      days += prevMonthLastDay;
    }

    if (months < 0) {
      years -= 1;
      months += 12;
    }

    const parts: string[] = [];
    if (years > 0) parts.push(`${years} Thn`);
    if (months > 0) parts.push(`${months} Bln`);
    if (days > 0 || parts.length === 0) parts.push(`${days} Hr`);

    return parts.join(' ');
  } catch {
    return '-';
  }
}

/**
 * Detect smart month and year from active master dataset and current stores
 * E.g. "MASTER JADWAL SEPTEMBER" or stores with soSeptember -> month '09', year '2026'
 */
export function detectSmartMonthAndYear(
  datasets?: any[],
  stores?: any[],
  fallbackMonth?: string,
  fallbackYear?: string
): { month: string; year: string; source: 'active_dataset' | 'stores' | 'system_clock' } {
  const now = new Date();
  const defaultMonth = fallbackMonth || String(now.getMonth() + 1).padStart(2, '0');
  const defaultYear = fallbackYear || String(now.getFullYear());

  // 1. Check active dataset first
  if (datasets && Array.isArray(datasets) && datasets.length > 0) {
    const activeDataset = datasets.find(d => d.isActiveForScheduling) || datasets[0];
    if (activeDataset) {
      const textToSearch = `${activeDataset.title || ''} ${activeDataset.filename || ''} ${activeDataset.periodOrQuarter || ''} ${activeDataset.notes || ''}`.toLowerCase();
      
      // Match month keywords
      for (const [key, mIndex] of Object.entries(INDO_MONTHS)) {
        if (textToSearch.includes(key)) {
          const detectedMonth = String(mIndex + 1).padStart(2, '0');
          // Match year if present e.g. 2026 or 2025 or 2027
          const yearMatch = textToSearch.match(/\b(20\d{2})\b/);
          const detectedYear = yearMatch ? yearMatch[1] : defaultYear;
          return { month: detectedMonth, year: detectedYear, source: 'active_dataset' };
        }
      }
    }
  }

  // 2. Check stores content and frequency of dates across all months
  if (stores && Array.isArray(stores) && stores.length > 0) {
    const monthCounts: Record<string, number> = {};
    let detectedStoreYear = defaultYear;

    stores.forEach(s => {
      // Check specific month fields
      if (s.soSeptember && s.soSeptember !== '-' && s.soSeptember !== '0' && !s.soSeptember.toLowerCase().includes('belum')) {
        monthCounts['09'] = (monthCounts['09'] || 0) + 1;
      }
      if (s.soAgustus && s.soAgustus !== '-' && s.soAgustus !== '0' && !s.soAgustus.toLowerCase().includes('belum')) {
        monthCounts['08'] = (monthCounts['08'] || 0) + 1;
      }
      if (s.soOktober && s.soOktober !== '-' && s.soOktober !== '0') {
        monthCounts['10'] = (monthCounts['10'] || 0) + 1;
      }
      if (s.soNovember && s.soNovember !== '-' && s.soNovember !== '0') {
        monthCounts['11'] = (monthCounts['11'] || 0) + 1;
      }
      if (s.soDesember && s.soDesember !== '-' && s.soDesember !== '0') {
        monthCounts['12'] = (monthCounts['12'] || 0) + 1;
      }
      if (s.tglSoJuli && s.tglSoJuli !== '-' && s.tglSoJuli !== '0') {
        monthCounts['07'] = (monthCounts['07'] || 0) + 1;
      }
      if (s.tglSoJuni && s.tglSoJuni !== '-' && s.tglSoJuni !== '0') {
        monthCounts['06'] = (monthCounts['06'] || 0) + 1;
      }
      if (s.tglSoMei && s.tglSoMei !== '-' && s.tglSoMei !== '0') {
        monthCounts['05'] = (monthCounts['05'] || 0) + 1;
      }

      // Check generic scheduledDate or tglSo
      const candDate = s.scheduledDate || s.tglSo || s.tglSoApproved;
      if (candDate) {
        const parsed = parseSmartDate(candDate);
        if (parsed) {
          const m = String(parsed.getMonth() + 1).padStart(2, '0');
          monthCounts[m] = (monthCounts[m] || 0) + 1;
          detectedStoreYear = String(parsed.getFullYear());
        }
      }
    });

    let bestMonth = '';
    let maxCount = 0;
    Object.entries(monthCounts).forEach(([m, count]) => {
      if (count > maxCount) {
        maxCount = count;
        bestMonth = m;
      }
    });

    if (bestMonth && maxCount > 0) {
      return { month: bestMonth, year: detectedStoreYear, source: 'stores' };
    }
  }

  return { month: defaultMonth, year: defaultYear, source: 'system_clock' };
}
