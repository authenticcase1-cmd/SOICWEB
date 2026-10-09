import * as XLSX from 'xlsx';
import { Store, SOSchedule } from '../types/stockOpname';
import { parseCoordinates, autoSyncStoreRegionAndKabupaten } from './geoUtils';
import { 
  formatSmartSODate, 
  parseSmartDate, 
  formatDateISO, 
  parseCurrentMonthSODate,
  getDefaultQTypeForMonth,
  getFullMonthNameIndo,
  getCurrentCalendarMonth,
  getCurrentCalendarYear
} from './formatters';
import { normalizeKorlapName, resolveStoreDefaultKorlap } from './korlapUtils';
import { getDeterministicStoreId } from '../services/storageService';
import { isStoreZonaHitam } from './storeSyncUtils';

export interface SheetParseResult {
  sheetName: string;
  stores: Store[];
  indicators: string[];
  rawHeaders: string[];
  extractedSchedules?: SOSchedule[];
  detectedMonth?: string;
  detectedYear?: string;
  detectedPeriodStr?: string;
}

export interface WorkbookParseResult {
  allSheets: SheetParseResult[];
  activeSheet: SheetParseResult | null;
  detectedMonth?: string;
  detectedYear?: string;
  detectedPeriodStr?: string;
}

/**
 * Smart Excel Parser for Stock Opname Master Toko Files
 * - Handles multi-sheet workbooks
 * - Handles title rows at the top (e.g. Rows 1-6)
 * - Handles multi-level headers (e.g. Rows 7-9)
 * - Handles formula/input/type labels (e.g. Row 10)
 * - Auto-detects store code (KDTK/Kode Toko) and store name (Nama Toko/Nama)
 * - Auto-detects indicators (% NKL, Rp Penggantian NKL, Type SO, Toko Fresh, Korlap, Saldo, JOP, Tanggal Buka)
 */
export function parseSmartWorkbook(
  wb: XLSX.WorkBook,
  preferredSheetName: string = 'MASTER TOKO BALI',
  targetMonth?: string,
  targetYear?: string
): WorkbookParseResult {
  const sheetResults: SheetParseResult[] = [];

  // Build global store-to-korlap mapping across all sheets (e.g. sheet ALL TOKO (2) or JADWAL)
  const globalStoreKorlapMap = new Map<string, string>();
  for (const sName of wb.SheetNames) {
    const ws = wb.Sheets[sName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (!matrix || matrix.length < 2) continue;

    let codeCol = -1;
    let korlapCol = -1;

    for (let r = 0; r < Math.min(matrix.length, 10); r++) {
      const row = matrix[r];
      if (!Array.isArray(row)) continue;
      row.forEach((cell, idx) => {
        const u = String(cell || '').trim().toUpperCase();
        if (['KDTK', 'KD TOKO', 'KODE TOKO', 'IDM', 'KDT'].includes(u)) codeCol = idx;
        if (['KORLAP', 'OFFICER', 'GROUP', 'GRUP', 'KORLAP/OFFICER', 'KORLAP / OFFICER', 'KORLAP/OFFICER SO', 'KORLAP / OFFICER SO', 'OFFICER SO'].includes(u)) korlapCol = idx;
      });
      if (codeCol >= 0 && korlapCol >= 0) break;
    }

    if (sName.toUpperCase().includes('ALL TOKO') && codeCol === -1) {
      codeCol = 1;
      korlapCol = 11;
    }

    if (codeCol >= 0 && korlapCol >= 0) {
      for (let r = 0; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row)) continue;
        const code = String(row[codeCol] || '').trim().toUpperCase();
        const rawK = String(row[korlapCol] || '').trim();
        if (code && code.length >= 3 && code.length <= 6 && rawK && !['KORLAP', 'OFFICER', 'LEADER', 'GROUP', 'GRUP'].includes(rawK.toUpperCase())) {
          const canonical = normalizeKorlapName(rawK) || rawK;
          if (canonical && !globalStoreKorlapMap.has(code)) {
            globalStoreKorlapMap.set(code, canonical);
          }
        }
      }
    }
  }

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (!rawMatrix || rawMatrix.length === 0) continue;

    // Helper to identify data rows and avoid false positive header matching
    const isDataRow = (row: any[]): boolean => {
      if (!Array.isArray(row) || row.length === 0) return false;
      for (const cell of row) {
        const s = String(cell || '').trim();
        if (!s) continue;
        if (s.includes('°') || s.includes('"S') || s.includes('"E') || /S\d{1,2}\s+\d{1,2}/i.test(s) || /-?[89]\.\d{3,}/.test(s) || /11[45]\.\d{3,}/.test(s)) return true;
        if (/\d{1,2}-[A-Za-z]{3}-\d{2,4}/.test(s) || /\d{4}-\d{2}-\d{2}/.test(s) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return true;
        const numClean = s.replace(/[^0-9]/g, '');
        if (numClean.length >= 6 && !isNaN(Number(numClean))) return true;
      }
      return false;
    };

    const isHeaderKeyword = (cellVal: any): boolean => {
      const s = String(cellVal || '').trim().toLowerCase();
      if (!s) return false;
      return (
        s === 'kdt' || s === 'kdtk' || s === 'kd toko' || s === 'kd_toko' || s === 'kode toko' || s === 'kode' || s === 'code' || s === 'idm' ||
        s === 'nama' || s === 'nama toko' || s === 'namatoko' || s === 'name' || s === 'store' || s === 'toko' ||
        s === 'team' || s === 'tim' || s === 'group' || s === 'grup' || s === 'personil' || s === 'leader' || s === 'hari' || s === 'day' || s === 'jml orang' || s === 'stock rp' ||
        s === 'koordinat' || s === 'lat' || s === 'long' || s === 'gps' || s === 'coordinate' ||
        s === 'saldo' || s === 'kas' || s === 'do toko' || s === 'saldo toko' || s.startsWith('do toko') || s.startsWith('saldo toko') ||
        s === 'kas tok' || s === 'kas toko' ||
        s === 'ar' || s === 'as' || s === 'am' || s === 'jop' ||
        s === 'wilayah' || s === 'wilaya' || s === 'region' || s === 'area' ||
        s === 'kabupaten' || s === 'kabupate' || s === 'kota' || s === 'city' ||
        s === 'kecamatan' || s === 'district' ||
        s === 'coverage' || s === 'covera' || s === 'type' || s === 'tipe' || s === 'qm' || s === 'q/m' ||
        s.includes('so mei') || s.includes('so juni') || s.includes('so juli') || s.includes('so agustus') || 
        s.includes('so september') || s.includes('so oktober') || s.includes('so november') || s.includes('so desember') ||
        s.includes('tgl so') || s.includes('jadwal') || s.includes('rencana so') ||
        s.includes('frekuensi') || s.includes('keterangan') || s.includes('zona') || s.includes('aktiva') || s.includes('so akti') ||
        s.includes('korlap') || s.includes('officer') || s.includes('petugas') ||
        s === 'no' || s === 'no.' || s === 'nomor' || s === 'no toko' || s === 'kategori' || s === 'tanggal buka' || s === 'tgl buka'
      );
    };

    // 1. Search for header row index (scanning rows 0..30)
    let bestHeaderIdx = -1;
    let maxKeywordMatches = -999;

    for (let i = 0; i < Math.min(rawMatrix.length, 30); i++) {
      const row = rawMatrix[i];
      if (!Array.isArray(row)) continue;
      
      let matches = 0;
      let hasDataPattern = false;
      for (const cell of row) {
        if (isHeaderKeyword(cell)) matches += 2;
        const cellStr = String(cell || '').trim();
        if (cellStr.includes('°') || /\d{1,2}-[A-Za-z]{3}-\d{2,4}/.test(cellStr) || /^\d{6,}$/.test(cellStr.replace(/[^0-9]/g, ''))) {
          hasDataPattern = true;
          matches -= 4;
        }
      }

      if (!hasDataPattern && matches > maxKeywordMatches) {
        maxKeywordMatches = matches;
        bestHeaderIdx = i;
      }
    }

    // Fallback if keywords not explicitly found: look for a row with 3+ non-empty text cells that is not a data row
    if (bestHeaderIdx === -1) {
      for (let i = 0; i < Math.min(rawMatrix.length, 20); i++) {
        const row = rawMatrix[i];
        if (Array.isArray(row) && !isDataRow(row) && row.filter(c => String(c).trim().length > 0).length >= 3) {
          bestHeaderIdx = i;
          break;
        }
      }
    }

    if (bestHeaderIdx === -1) bestHeaderIdx = 0;

    // 2. Build composite headers merging header rows around bestHeaderIdx
    const parentRow = bestHeaderIdx > 0 ? rawMatrix[bestHeaderIdx - 1] : [];
    const headerRow = rawMatrix[bestHeaderIdx] || [];
    const subRowCandidate = bestHeaderIdx + 1 < rawMatrix.length ? rawMatrix[bestHeaderIdx + 1] : [];

    // Critical check: if subRowCandidate is already a real store data row, NEVER merge it as sub-headers!
    const isSubRowData = isDataRow(subRowCandidate);
    const subRow1 = isSubRowData ? [] : subRowCandidate;

    const colKeys: string[] = [];
    let lastParent = '';

    const maxCols = Math.max(
      headerRow.length,
      Array.isArray(parentRow) ? parentRow.length : 0,
      Array.isArray(subRow1) ? subRow1.length : 0
    );

    for (let c = 0; c < maxCols; c++) {
      const pVal = parentRow[c] ? String(parentRow[c]).trim() : '';
      if (pVal && pVal !== lastParent) lastParent = pVal;

      const hVal = headerRow[c] ? String(headerRow[c]).trim() : '';
      const sVal = subRow1[c] ? String(subRow1[c]).trim() : '';

      // Skip subRow text if it's filter keywords like "input", "rumus"
      const isSubRowFormulaLabel = ['input', 'rumus'].includes(sVal.toLowerCase());

      let merged = hVal || pVal || `COL_${c}`;
      if (pVal && hVal && pVal.toLowerCase() !== hVal.toLowerCase()) {
        merged = `${pVal} ${hVal}`;
      }
      if (sVal && !isSubRowFormulaLabel && sVal.toLowerCase() !== hVal.toLowerCase()) {
        merged = `${merged} ${sVal}`;
      }

      colKeys.push(merged);
    }

    // 3. Find data start row index: skip rows containing input/rumus/subtotal/headers
    let dataStartIdx = isSubRowData ? (bestHeaderIdx + 1) : (bestHeaderIdx + 2);
    while (dataStartIdx < Math.min(rawMatrix.length, bestHeaderIdx + 6)) {
      const row = rawMatrix[dataStartIdx];
      if (Array.isArray(row)) {
        if (isDataRow(row)) {
          break; // It is verified data, start here!
        }
        const rowText = row.map(cell => String(cell || '').toLowerCase()).join(' ');
        if (
          rowText.includes('input') || 
          rowText.includes('rumus') || 
          rowText.includes('kriteria') ||
          rowText.trim() === ''
        ) {
          dataStartIdx++;
          continue;
        }
      }
      break;
    }

    // Identify indicator tags
    const detectedInds = new Set<string>();
    colKeys.forEach(col => {
      const lower = col.toLowerCase();
      if (lower.includes('nkl')) detectedInds.add('% NKL & Rp Penggantian');
      if (lower.includes('type so') || lower.includes('status so')) detectedInds.add('Status / Type SO');
      if (lower.includes('approve') || lower.includes('ter-so') || lower.includes('ter so') || lower.includes('approval')) detectedInds.add('Indikator Approval SPV / Ter-SO');
      if (lower.includes('fresh')) detectedInds.add('Toko Fresh');
      if (lower.includes('tanggal buka') || lower.includes('tgl buka')) detectedInds.add('Tanggal Buka Toko');
      if (lower.includes('perubahan') || lower.includes('turun kelas')) detectedInds.add('Perubahan Grade / Turun Kelas');
      if (lower.includes('saldo')) detectedInds.add('Saldo Toko');
      if (lower.includes('korlap')) detectedInds.add('Petugas Korlap');
    });

    if (detectedInds.size === 0) detectedInds.add('Master Data Toko General');

    // 4. Extract Store Rows
    const storesList: Store[] = [];

    // Find column index for store code & name with high precision
    let codeColIdx = -1;
    let nameColIdx = -1;

    colKeys.forEach((key, colIdx) => {
      const lk = key.trim().toLowerCase();
      if (
        codeColIdx === -1 && 
        (lk === 'kdt' || lk === 'kdtk' || lk === 'kd toko' || lk === 'kd_toko' || 
         lk === 'kode toko' || lk === 'kode' || lk === 'kodetoko' || lk === 'code' || 
         lk === 'store code' || lk === 'storecode' || lk === 'idm' || lk === 'id toko' ||
         lk === 'kd' || lk.startsWith('kdt') ||
         lk.includes('kd toko') || lk.includes('kode toko') || lk.includes('kdtk') || lk === 'idm')
      ) {
        codeColIdx = colIdx;
      }
      if (
        nameColIdx === -1 && 
        (lk === 'nama' || lk === 'nama toko' || lk === 'namatoko' || lk === 'name' || 
         lk === 'store name' || lk === 'storename' || lk === 'toko' || lk === 'store' ||
         lk.includes('nama toko') || 
         lk.includes('namatoko') || (lk.startsWith('nama') && !lk.includes('korlap') && !lk.includes('kabupaten') && !lk.includes('personil')))
      ) {
        nameColIdx = colIdx;
      }
    });

    // Smart fallback: inspect sample row at dataStartIdx to definitively locate code & name columns
    if (codeColIdx === -1 || nameColIdx === -1 || codeColIdx === nameColIdx) {
      const sampleRow = rawMatrix[dataStartIdx] || [];
      if (Array.isArray(sampleRow)) {
        const c0 = String(sampleRow[0] || '').trim();
        const c1 = String(sampleRow[1] || '').trim();
        if (/^[A-Z0-9]{3,6}$/i.test(c0) && isNaN(Number(c0))) {
          codeColIdx = 0;
          nameColIdx = 1;
        } else if (/^\d{1,4}$/.test(c0) && /^[A-Z0-9]{3,6}$/i.test(c1) && isNaN(Number(c1))) {
          codeColIdx = 1;
          nameColIdx = 2;
        } else {
          if (codeColIdx === -1) codeColIdx = 0;
          if (nameColIdx === -1 || nameColIdx === codeColIdx) nameColIdx = codeColIdx + 1;
        }
      }
    }

    // Intelligently detect effective scheduling month & year for this sheet
    const now = new Date();
    const currentCalMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentCalYear = String(now.getFullYear());

    const colKeysClean = colKeys.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const hasOctober = colKeysClean.some(k => k.includes('oktober') || k.includes('okt') || k.includes('october') || k.includes('oct'));
    const hasSeptember = colKeysClean.some(k => k.includes('september') || k.includes('sep'));
    const hasNovember = colKeysClean.some(k => k.includes('november') || k.includes('nov'));
    const hasDecember = colKeysClean.some(k => k.includes('desember') || k.includes('des'));
    const hasAugust = colKeysClean.some(k => k.includes('agustus') || k.includes('ags') || k.includes('agt'));

    let effectiveM = (targetMonth && targetMonth !== 'ALL') ? targetMonth : '';
    let effectiveY = (targetYear && targetYear !== 'ALL') ? targetYear : currentCalYear;

    // Smart Month Rollover & Column Authority:
    // If targetMonth is unspecified OR if targetMonth was from an older month (e.g. '09')
    // while the sheet contains an updated October column (or current calendar month is October),
    // automatically promote effectiveM to October ('10') so updated sheets are read seamlessly!
    if (!effectiveM || (effectiveM === '09' && (hasOctober || currentCalMonth === '10'))) {
      if (currentCalMonth === '10' && hasOctober) {
        effectiveM = '10';
      } else if (currentCalMonth === '11' && hasNovember) {
        effectiveM = '11';
      } else if (currentCalMonth === '12' && hasDecember) {
        effectiveM = '12';
      } else if (hasOctober) {
        effectiveM = '10';
      } else if (hasNovember) {
        effectiveM = '11';
      } else if (hasDecember) {
        effectiveM = '12';
      } else if (hasSeptember && currentCalMonth === '09') {
        effectiveM = '09';
      } else if (hasSeptember && !hasOctober) {
        effectiveM = '09';
      } else if (hasAugust) {
        effectiveM = '08';
      } else {
        effectiveM = currentCalMonth;
      }
    }

    for (let r = dataStartIdx; r < rawMatrix.length; r++) {
      const row = rawMatrix[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      let rawCode = row[codeColIdx] !== undefined ? String(row[codeColIdx]).trim() : '';
      let rawName = row[nameColIdx] !== undefined ? String(row[nameColIdx]).trim() : '';

      // Check if rawCode / rawName is in another adjacent cell if empty
      if (!rawCode && !rawName) {
        for (let c = 0; c < Math.min(row.length, 6); c++) {
          const val = String(row[c] || '').trim();
          if (val && val.length >= 3 && val.length <= 6 && /^[A-Z0-9]+$/i.test(val) && val !== 'Input' && val !== 'Rumus') {
            rawCode = val;
            if (row[c + 1]) rawName = String(row[c + 1]).trim();
            break;
          }
        }
      }

      // Skip non-store rows (e.g. totals, empty lines, instructions)
      if (!rawCode && !rawName) continue;
      if (rawCode.toLowerCase().includes('total') || rawName.toLowerCase().includes('total')) continue;
      if (rawCode.toLowerCase() === 'kdtk' || rawName.toLowerCase() === 'nama toko') continue;
      if (rawCode.toLowerCase() === 'input' || rawCode.toLowerCase() === 'rumus') continue;

      const storeCode = rawCode || `TK-${Math.floor(1000 + Math.random() * 9000)}`;
      const storeName = rawName || `TOKO ${storeCode}`;

      // Build row map for remaining values
      const rowObj: Record<string, any> = {};
      colKeys.forEach((key, c) => {
        rowObj[key] = row[c];
      });

      const findVal = (possibleKeys: string[]) => {
        const rowKeys = Object.keys(rowObj);

        // 1. Exact match first (returns row value directly if column exists)
        for (const key of possibleKeys) {
          const matchedKey = rowKeys.find(k => k.trim().toLowerCase() === key.toLowerCase());
          if (matchedKey) {
            const v = rowObj[matchedKey];
            return (v !== undefined && v !== null) ? String(v).trim() : '';
          }
        }

        // 2. Normalized alphanumeric match (removes punctuation, spaces, quotes)
        for (const key of possibleKeys) {
          const cleanTarget = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!cleanTarget) continue;
          const matchedKey = rowKeys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget);
          if (matchedKey) {
            const v = rowObj[matchedKey];
            return (v !== undefined && v !== null) ? String(v).trim() : '';
          }
        }

        // 3. Word boundary regex match (avoids matching substring inside 'nama toko' or 'alamat')
        for (const key of possibleKeys) {
          const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${key.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:$|[^a-zA-Z0-9])`, 'i');
          const matchedKey = rowKeys.find(k => regex.test(k.trim()));
          if (matchedKey) {
            const v = rowObj[matchedKey];
            return (v !== undefined && v !== null) ? String(v).trim() : '';
          }
        }

        return '';
      };

      const kabVal = findVal(['kabupate', 'kabupaten', 'kota', 'kab', 'city', 'nama kabupaten']);
      const kecVal = findVal(['kecamatan', 'nama kecamatan', 'district', 'kec']);
      const addressVal = findVal(['alamat', 'address', 'lokasi']);
      const amVal = findVal(['am', 'area manager']);
      const asVal = findVal(['as', 'assistant manager']);
      const region = findVal(['wilaya', 'wilayah', 'cabang', 'region', 'area']) || 'BALI';
      const coverageVal = findVal(['covera', 'coverage', 'dc/igr', 'dc / igr', 'distribusi']);
      const typeSoVal = findVal(['type so', 'status so', 'type_so', 'tipe so', 'tipe_so', 'type', 'tipe', 'q/m', 'q / m', 'qm', 'periode so', 'jenis so', 'kategori so']);
      const korlapRaw = findVal([
        'korlap/officer so',
        'korlap / officer so',
        'korlap/officer',
        'korlap / officer',
        'korlap',
        'officer so',
        'officer',
        'petugas korlap',
        'petugas so',
        'penanggung jawab',
        'koordinator lapangan',
        'group korlap',
        'nama korlap'
      ]);
      const korlap = normalizeKorlapName(korlapRaw) || korlapRaw;
      const jop = findVal(['jop']);
      const saldoRaw = findVal(['do toko sept', 'saldo toko sept', 'do toko', 'saldo toko agustus', 'saldo toko', 'saldo_toko', 'saldo']);
      const kasRaw = findVal(['kas tok', 'kas toko', 'kas']);
      let saldoTokoNum: number | string = saldoRaw || kasRaw;
      if (saldoRaw || kasRaw) {
        const targetVal = saldoRaw || kasRaw;
        const cleaned = targetVal.replace(/[^0-9.-]/g, '');
        saldoTokoNum = !isNaN(Number(cleaned)) && cleaned !== '' ? Number(cleaned) : targetVal;
      }

      // Parse coordinates if provided
      const rawCoord = findVal(['koordinat', 'koordinat toko', 'koordinat_toko', 'lat long', 'lat/long', 'lat,long', 'gps', 'location', 'lokasi', 'coordinate', 'coordinates', 'coord', 'titik', 'posisi', 'map', 'geo']);
      const latStr = findVal(['latitude', 'lat', 'y']);
      const lngStr = findVal(['longitude', 'long', 'lng', 'lon', 'x']);

      let parsedLat: number | undefined = undefined;
      let parsedLng: number | undefined = undefined;

      if (rawCoord) {
        const parsed = parseCoordinates(rawCoord);
        if (parsed.isValid) {
          parsedLat = parsed.latitude;
          parsedLng = parsed.longitude;
        }
      }

      if ((parsedLat === undefined || parsedLng === undefined) && latStr && lngStr) {
        const parsed = parseCoordinates(`${latStr}, ${lngStr}`);
        if (parsed.isValid) {
          parsedLat = parsed.latitude;
          parsedLng = parsed.longitude;
        }
      }

      // Smart fallback: If coordinates still missing, scan all cells in this row for lat/lng pattern
      if (parsedLat === undefined || parsedLng === undefined) {
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || '').trim();
          if (!val || val.length < 5) continue;
          if (val.includes('-8.') || val.includes('-9.') || val.includes('115.') || val.includes('114.') || val.includes('116.')) {
            const parsed = parseCoordinates(val);
            if (parsed.isValid && parsed.latitude !== undefined && parsed.longitude !== undefined) {
              parsedLat = parsed.latitude;
              parsedLng = parsed.longitude;
              break;
            }
          }
        }
      }

      const skuVal = findVal(['totalsku', 'total sku', 'sku']);
      const totalSKUCount = skuVal && !isNaN(Number(skuVal.replace(/[^0-9]/g, ''))) ? Number(skuVal.replace(/[^0-9]/g, '')) : undefined;

      // Parse ZONA / KETERANGAN ZONA HITAM (Strict check: 'NON ZONA HITAM', '-', empty are NOT black zone)
      const zonaRaw = findVal([
        'zona - keterangan zona hitam',
        'zona-keterangan zona hitam',
        'keterangan zona hitam',
        'keterangan zona',
        'zona / keterangan',
        'zona hitam',
        'kriteria zona',
        'zona toko',
        'kriteria_zona',
        'status zona',
        'kategori zona',
        'zona'
      ]);
      const ketVal = findVal(['keterangan', 'notes', 'nkl', 'ket']) || 'TOKO EKSIS';

      let isZonaHitam = isStoreZonaHitam({ zona: zonaRaw, keterangan: ketVal });
      let zonaFormatted = isZonaHitam ? 'ZONA HITAM' : 'NON ZONA HITAM';
      let riskLevel: 'Tinggi' | 'Sedang' | 'Rendah' = isZonaHitam ? 'Tinggi' : 'Rendah';

      const accVal = findVal(['akurasi', 'accuracy', 'last accuracy', 'akurasi so']);
      const lastAccuracyRate = accVal && !isNaN(parseFloat(accVal.replace(/[^0-9.]/g, ''))) ? parseFloat(accVal.replace(/[^0-9.]/g, '')) : undefined;

      const jenisTokoVal = findVal(['jenis toko', 'jenis_toko', 'tipetoko', 'tipe toko', 'storetype']);
      
      // Parse SO AKTIVA column: if cell contains SO AKTIVA/AKTIVA/YA/1 -> 'SO AKTIVA', else blank '' (NON SO AKTIVA)
      const soAktivaRaw = findVal(['so aktiva', 'so_aktiva', 'so akti', 'aktiva', 'so aktiva tetap', 'aktiva so', 'status aktiva']);
      let soAktivaVal: string = '';
      if (soAktivaRaw) {
        const aUpper = soAktivaRaw.toUpperCase().trim();
        if (aUpper.includes('AKTIVA') || aUpper === 'YA' || aUpper === 'Y' || aUpper === 'TRUE' || aUpper === '1' || aUpper.includes('ADA')) {
          soAktivaVal = 'SO AKTIVA';
        }
      }

      const phoneVal = findVal(['notelp', 'no telp', 'phone', 'telepon']);

      const rowKeys = Object.keys(rowObj);
      const hasSpecificSeptemberCol = rowKeys.some(k => {
        const lk = k.trim().toLowerCase();
        return lk.includes('september') || lk.includes('sep 26') || lk.includes('so sep') || lk.includes("so september '");
      });
      const hasSpecificOktoberCol = rowKeys.some(k => {
        const lk = k.trim().toLowerCase();
        return lk.includes('oktober') || lk.includes('okt 26') || lk.includes('so okt') || lk.includes("so oktober '");
      });

      const tglSoMei = formatSmartSODate(findVal(["so mei '", "so mei '26", 'so mei 2026', 'so mei', 'tgl so mei', 'mei', 'may']));
      const tglSoJuni = formatSmartSODate(findVal(["so juni '", "so juni '26", 'so juni 2026', 'so juni', 'tgl so juni', 'juni', 'so jun', 'jun']));
      const tglSoJuli = formatSmartSODate(findVal(["so juli '", "so juli '26", 'so juli 2026', 'so juli', 'tgl so juli', 'juli', 'so jul', 'jul']));
      const soAgustusRaw = findVal(["so agustus '", "so agustus '26", 'so agustus 2026', 'so agustus', 'tgl so agustus', 'agustus', 'so ags 26', 'so ags', 'so agt 26', 'so agt', 'ags', 'agt']);
      const soAgustus = formatSmartSODate(soAgustusRaw);
      const soSeptemberRaw = findVal([
        "so september '", "so september '26", 'so september 2026', 'so september', 'tgl so september', 
        'september \'26', 'september 2026', 'september', 'so sep 26', 'so sep \'26', 'so sep', 'tgl so sep', 'sep \'26', 'sep 26', 'sep'
      ]);
      let soSeptember = formatSmartSODate(soSeptemberRaw);
      const soOktoberRaw = findVal([
        "so oktober '", "so oktober '26", 'so oktober 2026', 'so oktober', 'tgl so oktober', 
        'oktober \'26', 'oktober 2026', 'oktober', 'so okt 26', 'so okt \'26', 'so okt', 'tgl so okt', 'okt \'26', 'okt 26', 'okt', 'october', 'so oct'
      ]);
      let soOktober = formatSmartSODate(soOktoberRaw);
      const soNovemberRaw = findVal([
        "so november '", "so november '26", 'so november 2026', 'so november', 'tgl so november', 
        'november \'26', 'november 2026', 'november', 'so nov 26', 'so nov \'26', 'so nov', 'tgl so nov', 'nov \'26', 'nov 26', 'nov'
      ]);
      let soNovember = formatSmartSODate(soNovemberRaw);
      const soDesemberRaw = findVal([
        "so desember '", "so desember '26", 'so desember 2026', 'so desember', 'tgl so desember', 
        'desember \'26', 'desember 2026', 'desember', 'so des 26', 'so des \'26', 'so des', 'tgl so des', 'des \'26', 'des 26', 'des'
      ]);
      let soDesember = formatSmartSODate(soDesemberRaw);
      
      // Generic SO schedule date (e.g. from a monthly master sheet with header "TGL SO" or "JADWAL SO")
      const genericScheduleRaw = findVal([
        'tgl so', 'tanggal so', 'jadwal so', 'tgl jadwal so', 'tgl pelaksanaan so', 
        'tgl pelaksanaan', 'tanggal pelaksanaan', 'jadwal pelaksanaan', 'jadwal so bali',
        'tgl rencana so', 'rencana so', 'tgl audit so', 'tgl audit', 'so periode ini', 'so bulan ini'
      ]);
      const genericScheduleDate = formatSmartSODate(genericScheduleRaw);

      // Determine active scheduled date dynamically according to effectiveM (Oktober, September, etc.)
      let activeScheduledDateIso: string | undefined = undefined;
      let activeTglSo: string | undefined = undefined;

      let rawForParsing = '';
      if (effectiveM === '10') rawForParsing = soOktoberRaw;
      else if (effectiveM === '09') rawForParsing = soSeptemberRaw;
      else if (effectiveM === '11') rawForParsing = soNovemberRaw;
      else if (effectiveM === '12') rawForParsing = soDesemberRaw;
      else if (effectiveM === '08') rawForParsing = soAgustusRaw;
      else if (effectiveM === '07') rawForParsing = tglSoJuli;
      else if (effectiveM === '06') rawForParsing = tglSoJuni;
      else if (effectiveM === '05') rawForParsing = tglSoMei;

      if (!rawForParsing) {
        rawForParsing = genericScheduleRaw;
      }

      if (rawForParsing) {
        const parsedCurrent = parseCurrentMonthSODate(rawForParsing, effectiveM, effectiveY);
        if (parsedCurrent.isValid && parsedCurrent.isoDate) {
          activeScheduledDateIso = parsedCurrent.isoDate;
          activeTglSo = parsedCurrent.displayDate;
          if (effectiveM === '10' && (!soOktober || soOktober === '-')) soOktober = parsedCurrent.displayDate;
          if (effectiveM === '09' && (!soSeptember || soSeptember === '-')) soSeptember = parsedCurrent.displayDate;
        } else {
          const parsed = parseSmartDate(rawForParsing);
          if (parsed) {
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const d = String(parsed.getDate()).padStart(2, '0');
            const y = String(parsed.getFullYear());
            if (m === effectiveM || genericScheduleRaw) {
              activeScheduledDateIso = `${y}-${m}-${d}`;
              activeTglSo = formatSmartSODate(rawForParsing);
            }

            if (m === '09' && (!soSeptember || soSeptember === '-')) soSeptember = activeTglSo || formatSmartSODate(rawForParsing);
            else if (m === '10' && (!soOktober || soOktober === '-')) soOktober = activeTglSo || formatSmartSODate(rawForParsing);
            else if (m === '11' && (!soNovember || soNovember === '-')) soNovember = activeTglSo || formatSmartSODate(rawForParsing);
            else if (m === '12' && (!soDesember || soDesember === '-')) soDesember = activeTglSo || formatSmartSODate(rawForParsing);
          } else if (genericScheduleDate && genericScheduleDate !== '-') {
            if (effectiveM === '10' && !hasSpecificOktoberCol && (!soOktober || soOktober === '-')) {
              soOktober = genericScheduleDate;
              activeTglSo = genericScheduleDate;
              const iso = formatDateISO(genericScheduleDate);
              if (iso) activeScheduledDateIso = iso;
            } else if (effectiveM === '09' && !hasSpecificSeptemberCol && (!soSeptember || soSeptember === '-')) {
              soSeptember = genericScheduleDate;
              activeTglSo = genericScheduleDate;
              const iso = formatDateISO(genericScheduleDate);
              if (iso) activeScheduledDateIso = iso;
            }
          }
        }
      } else {
        if (effectiveM === '10' && soOktober && soOktober !== '-') {
          activeTglSo = soOktober;
          const iso = formatDateISO(soOktober);
          if (iso) activeScheduledDateIso = iso;
        } else if (effectiveM === '09' && soSeptember && soSeptember !== '-') {
          activeTglSo = soSeptember;
          const iso = formatDateISO(soSeptember);
          if (iso) activeScheduledDateIso = iso;
        }
      }

      // Explicit SPV approval date ONLY (must NOT match generic "tgl so")
      const tglSoApprovedRaw = findVal([
        'tgl so approved',
        'tgl approved so',
        'tgl approve so',
        'tanggal so approved',
        'tanggal approve so',
        'tgl approval spv',
        'tgl approved spv',
        'tgl so disetujui',
        'tanggal disetujui spv'
      ]);
      const tglSoApproved = formatSmartSODate(tglSoApprovedRaw);

      // Parse status approve SO column / Indikator Ter-SO SPV
      const rawStatusApprove = findVal([
        'status approve so',
        'status approval so',
        'status approval spv',
        'status approve spv',
        'approval spv',
        'approval so',
        'status approve',
        'approve so',
        'sudah approve so',
        'sudah approve',
        'status so terapprove',
        'status so approved',
        'indikator ter-so',
        'status ter-so'
      ]);

      let statusApproveSO: 'Sudah Approve' | 'Belum SO' | 'Belum Terapprove' = 'Belum SO';
      if (rawStatusApprove) {
        const sUpper = rawStatusApprove.toUpperCase().trim();
        if (
          sUpper.includes('SUDAH APPROVE') || 
          sUpper.includes('SUDAH DISETUJUI') || 
          sUpper.includes('APPROVED SPV') || 
          sUpper.includes('DISETUJUI') || 
          sUpper === 'APPROVED' || 
          sUpper === 'TER-SO' || 
          sUpper === 'TER SO'
        ) {
          statusApproveSO = 'Sudah Approve';
        } else if (
          sUpper.includes('BELUM TERAPPROVE') || 
          sUpper.includes('MENUNGGU') || 
          sUpper.includes('PENDING') || 
          sUpper.includes('AUDIT ULANG') ||
          sUpper.includes('BELUM APPROVE') ||
          sUpper.includes('SELESAI')
        ) {
          statusApproveSO = 'Belum Terapprove';
        } else {
          statusApproveSO = 'Belum SO';
        }
      } else if (tglSoApproved && tglSoApproved !== '-' && tglSoApproved.length > 3) {
        statusApproveSO = 'Sudah Approve';
      }

      // Parse FREKUENSI TIDAK SO
      const freqRaw = findVal(['frekuensi tidak so', 'frekuensi_tidak_so', 'freq tidak so', 'tidak so']);
      let frekuensiTidakSO = 0;
      if (freqRaw && !isNaN(Number(freqRaw))) {
        frekuensiTidakSO = Number(freqRaw);
      } else {
        // Calculate dynamically based on monthly columns up to effective month
        const hasMei = tglSoMei && tglSoMei !== '-';
        const hasJuni = tglSoJuni && tglSoJuni !== '-';
        const hasJuli = tglSoJuli && tglSoJuli !== '-';
        const hasAgs = soAgustus && soAgustus !== '-';
        const hasSep = soSeptember && soSeptember !== '-';
        const hasOkt = soOktober && soOktober !== '-';

        if (effectiveM === '10') {
          if (hasOkt) {
            frekuensiTidakSO = 0;
          } else {
            const hist = [hasMei, hasJuni, hasJuli, hasAgs, hasSep];
            for (let m = 4; m >= 0; m--) {
              if (!hist[m]) frekuensiTidakSO++;
              else break;
            }
          }
        } else if (effectiveM === '09') {
          if (hasSep) {
            frekuensiTidakSO = 0;
          } else {
            const hist = [hasMei, hasJuni, hasJuli, hasAgs];
            for (let m = 3; m >= 0; m--) {
              if (!hist[m]) frekuensiTidakSO++;
              else break;
            }
          }
        } else if (effectiveM === '11') {
          const hasNov = soNovember && soNovember !== '-';
          if (hasNov) {
            frekuensiTidakSO = 0;
          } else {
            const hist = [hasMei, hasJuni, hasJuli, hasAgs, hasSep, hasOkt];
            for (let m = 5; m >= 0; m--) {
              if (!hist[m]) frekuensiTidakSO++;
              else break;
            }
          }
        } else if (effectiveM === '12') {
          const hasDes = soDesember && soDesember !== '-';
          if (hasDes) {
            frekuensiTidakSO = 0;
          } else {
            const hist = [hasMei, hasJuni, hasJuli, hasAgs, hasSep, hasOkt, soNovember && soNovember !== '-'];
            for (let m = 6; m >= 0; m--) {
              if (!hist[m]) frekuensiTidakSO++;
              else break;
            }
          }
        } else {
          if (hasAgs) frekuensiTidakSO = 0;
          else frekuensiTidakSO = 1;
        }
      }

      const teamVal = findVal(['team', 'tim', 'regu']);
      const groupVal = findVal(['group', 'grup']);
      const personilVal = findVal(['personil', 'leader', 'nama personil', 'auditor']);
      const hariVal = findVal(['hari', 'day', 'hari so']);
      const isSaturday = hariVal.toUpperCase().includes('SABTU');

      // Normalize Type SO (M, Q1, Q2, Q3) with dynamic month-quarter intelligence
      let cleanTypeSo = (typeSoVal || 'M').trim().toUpperCase();
      const naturalQType = getDefaultQTypeForMonth(effectiveM); // e.g. Q1 for Oktober (10), Q3 for September (09)
      
      if (cleanTypeSo.includes('Q1')) {
        cleanTypeSo = 'Q1';
      } else if (cleanTypeSo.includes('Q2')) {
        cleanTypeSo = 'Q2';
      } else if (cleanTypeSo.includes('Q3')) {
        // If master has transitioned to October (month 10) and this store is scheduled in October,
        // or if the spreadsheet's Q criteria has advanced to Q1:
        if (effectiveM === '10' && (soOktoberRaw || (soOktober && soOktober !== '-') || activeScheduledDateIso?.includes('-10-'))) {
          cleanTypeSo = 'Q1';
        } else {
          cleanTypeSo = 'Q3';
        }
      } else if (cleanTypeSo.startsWith('Q') || cleanTypeSo === 'QUARTER' || cleanTypeSo === 'TRIWULAN') {
        cleanTypeSo = naturalQType;
      } else if (cleanTypeSo.includes('M') || cleanTypeSo.includes('BULAN') || cleanTypeSo === 'REGULER') {
        cleanTypeSo = 'M';
      } else {
        cleanTypeSo = 'M';
      }

      const storeObj: Store = {
        id: getDeterministicStoreId({ code: storeCode, name: storeName }),
        code: storeCode,
        name: storeName,
        region: region as any,
        address: addressVal || `Jl. Raya ${storeName}`,
        city: kabVal,
        kabupaten: kabVal,
        district: kecVal,
        kecamatan: kecVal,
        latitude: parsedLat,
        longitude: parsedLng,
        koordinat: rawCoord || (parsedLat && parsedLng ? `${parsedLat}, ${parsedLng}` : undefined),
        am: amVal,
        as: asVal,
        saldoToko: saldoTokoNum,
        coverage: coverageVal || 'DC',
        typeSo: cleanTypeSo,
        qm: cleanTypeSo,
        smartClassification: findVal(['perubahan', 'kategori', 'klasifikasi', 'turun kelas']) || '',
        korlap: korlap || (groupVal ? (normalizeKorlapName(groupVal) || groupVal) : undefined) || globalStoreKorlapMap.get(storeCode) || resolveStoreDefaultKorlap({ kabupaten: kabVal, region: region, as: asVal, am: amVal, name: storeName, address: addressVal }),
        keterangan: ketVal,
        zona: zonaFormatted,
        isZonaHitam: isZonaHitam,
        soAktiva: soAktivaVal,
        frekuensiTidakSO: frekuensiTidakSO,
        jenisToko: jenisTokoVal || 'REGULER',
        jop: jop,
        teamName: teamVal || undefined,
        personilLeader: personilVal || undefined,
        dayName: isSaturday ? 'SABTU' : (hariVal || undefined),
        tglSoMei: tglSoMei !== '-' ? tglSoMei : undefined,
        tglSoJuni: tglSoJuni !== '-' ? tglSoJuni : undefined,
        tglSoJuli: tglSoJuli !== '-' ? tglSoJuli : undefined,
        soAgustus: soAgustus !== '-' ? soAgustus : undefined,
        soSeptember: soSeptember !== '-' ? soSeptember : undefined,
        soOktober: soOktober !== '-' ? soOktober : undefined,
        soNovember: soNovember !== '-' ? soNovember : undefined,
        soDesember: soDesember !== '-' ? soDesember : undefined,
        scheduledDate: activeScheduledDateIso,
        tglSo: activeTglSo,
        statusApproveSO: statusApproveSO,
        tglSoApproved: tglSoApproved !== '-' ? tglSoApproved : undefined,
        storeType: 'Regular Minimarket',
        managerName: korlap || 'Kepala Toko',
        phone: phoneVal || '08123456789',
        totalSKUCount,
        riskLevel,
        lastAccuracyRate
      };

      storesList.push(autoSyncStoreRegionAndKabupaten(storeObj));
    }

    sheetResults.push({
      sheetName,
      stores: storesList,
      indicators: Array.from(detectedInds),
      rawHeaders: colKeys,
      detectedMonth: effectiveM,
      detectedYear: effectiveY,
      detectedPeriodStr: `${getFullMonthNameIndo(effectiveM)} ${effectiveY}`
    });
  }

  // 2. Specialized extraction of operational SO schedules from "JADWAL" sheet
  const SATURDAY_STORES_SET = new Set([
    'TD8L', 'TEEK', 'T8TZ', 'T1X2', 'FQ18', 'FEVA', 'FOFL', 'T1FF', 'T5DA', 'FTZZ', 'F4SD', 'TECP'
  ]);

  const jadwalSheetKey = wb.SheetNames.find(n => n.trim().toUpperCase() === 'JADWAL' || n.trim().toUpperCase().includes('JADWAL'));
  const extractedSchedules: SOSchedule[] = [];
  const jadwalStoreMap = new Map<string, any>();

  if (jadwalSheetKey && wb.Sheets[jadwalSheetKey]) {
    const wsJadwal = wb.Sheets[jadwalSheetKey];
    const rows = XLSX.utils.sheet_to_json<any[]>(wsJadwal, { header: 1, defval: '' });

    // Locate header row in JADWAL (typically row 3 with NO, TEAM, GROUP, PERSONIL, HARI, IDM, TOKO, etc.)
    let jCodeIdx = 6;
    let jNameIdx = 7;
    let jTeamIdx = 1;
    let jGroupIdx = 2;
    let jPersonilIdx = 3;
    let jDayIdx = 4;
    let jStockIdx = 8;
    let jTglIdx = 9;
    let jTypeIdx = 10;
    let jKasIdx = 11;
    let jAktivaIdx = 12;
    let jZonaIdx = 13;
    let jAsIdx = 15;
    let headerRowIdx = -1;

    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const joined = row.map(c => String(c || '').trim().toUpperCase()).join(' ');
      if (joined.includes('IDM') || joined.includes('TOKO') || joined.includes('PERSONIL')) {
        headerRowIdx = r;
        row.forEach((cell, idx) => {
          const u = String(cell || '').trim().toUpperCase();
          if (u === 'IDM' || u === 'KDTK' || u === 'KD TOKO') jCodeIdx = idx;
          else if (u === 'TOKO' || u === 'NAMA TOKO') jNameIdx = idx;
          else if (u === 'TEAM' || u === 'TIM') jTeamIdx = idx;
          else if (u === 'GROUP' || u === 'GRUP') jGroupIdx = idx;
          else if (u === 'PERSONIL' || u === 'LEADER') jPersonilIdx = idx;
          else if (u === 'HARI' || u === 'DAY') jDayIdx = idx;
          else if (u.includes('STOCK')) jStockIdx = idx;
          else if (u.includes('TGL')) jTglIdx = idx;
          else if (u === 'Q/M' || u === 'TYPE' || u === 'TYPE SO') jTypeIdx = idx;
          else if (u.includes('KAS')) jKasIdx = idx;
          else if (u.includes('AKTIVA')) jAktivaIdx = idx;
          else if (u.includes('ZONA')) jZonaIdx = idx;
          else if (u === 'AS') jAsIdx = idx;
        });
        break;
      }
    }

    const startDataRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 4;
    for (let r = startDataRow; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row) || row.length === 0) continue;
      const code = String(row[jCodeIdx] || '').trim().toUpperCase();
      if (!code || code === 'IDM' || code === 'TOTAL' || code === 'KDTK' || code.length < 3 || code.length > 6 || !isNaN(Number(code))) continue;

      const name = String(row[jNameIdx] || '').trim();
      const team = String(row[jTeamIdx] || '').trim();
      const group = String(row[jGroupIdx] || '').trim();
      const personil = String(row[jPersonilIdx] || '').trim();
      let day = String(row[jDayIdx] || '').trim().toUpperCase();
      const stockRaw = row[jStockIdx];
      const tglRaw = row[jTglIdx];
      const typeSo = String(row[jTypeIdx] || 'M').trim();
      const kasRaw = row[jKasIdx];
      const aktivaRaw = String(row[jAktivaIdx] || '').trim();
      const zonaRaw = String(row[jZonaIdx] || '').trim();
      const asRaw = String(row[jAsIdx] || '').trim();

      let schedDate = '2026-09-01';
      const parsedTgl = parseCurrentMonthSODate(tglRaw, '09', '2026');
      if (parsedTgl.isValid && parsedTgl.isoDate) {
        schedDate = parsedTgl.isoDate;
      } else if (day === 'SABTU' || SATURDAY_STORES_SET.has(code)) {
        schedDate = '2026-09-12';
        day = 'SABTU';
      } else if (day === 'SELASA') {
        schedDate = '2026-09-01';
      } else if (day === 'RABU') {
        schedDate = '2026-09-02';
      } else if (day === 'KAMIS') {
        schedDate = '2026-09-03';
      } else if (day === 'JUMAT') {
        schedDate = '2026-09-04';
      } else if (day === 'SENIN') {
        schedDate = '2026-09-07';
      }

      const canonicalKorlap = normalizeKorlapName(group) || group || globalStoreKorlapMap.get(code) || resolveStoreDefaultKorlap({ name }) || 'Belum Ditentukan';
      const cleanStock = typeof stockRaw === 'number' ? stockRaw : (parseFloat(String(stockRaw || '').replace(/[^0-9.-]/g, '')) || 0);
      const cleanKas = typeof kasRaw === 'number' ? kasRaw : (parseFloat(String(kasRaw || '').replace(/[^0-9.-]/g, '')) || 0);
      const cleanZona = zonaRaw.toUpperCase().includes('HITAM') && !zonaRaw.toUpperCase().includes('NON') ? 'ZONA HITAM' : 'NON ZONA HITAM';
      const cleanAktiva = aktivaRaw.toUpperCase().includes('YA') || aktivaRaw.toUpperCase().includes('AKTIVA') ? 'SO AKTIVA' : '';
      const cleanTeam = team || 'TEAM 1';

      const schedItem: SOSchedule = {
        id: `SCHED-${code}-${schedDate}`,
        storeId: getDeterministicStoreId({ code, name: name || `TOKO ${code}` }),
        storeCode: code,
        storeName: name || `TOKO ${code}`,
        scheduledDate: schedDate,
        scheduledTime: '08:00',
        teamId: `TEAM-${cleanTeam.replace(/[^a-zA-Z0-9]/g, '')}`,
        teamName: cleanTeam,
        teamCategory: cleanTeam,
        spvInCharge: 'I GEDE PASEK SANTIKA',
        officerInCharge: canonicalKorlap,
        groupName: canonicalKorlap,
        personilLeader: personil,
        assignedPersonnelNames: personil ? [personil] : [],
        dayName: day,
        stockRp: cleanStock,
        kasToko: cleanKas,
        typeSo: typeSo || 'M',
        zona: cleanZona,
        soAktiva: cleanAktiva,
        asInitial: asRaw,
        region: 'BALI',
        status: 'Terjadwal',
        targetSKUCount: 1000,
        spvApprovalStatus: 'Menunggu Approval SPV',
        notes: `Jadwal operasional SO dari file Excel (${day}, ${cleanTeam})`,
        createdAt: new Date().toISOString().slice(0, 10)
      };

      extractedSchedules.push(schedItem);
      jadwalStoreMap.set(code, schedItem);
    }
  }

  // Cross-enrich stores in all sheets with the operational schedule details from JADWAL
  sheetResults.forEach(res => {
    if (res.sheetName.toUpperCase().includes('JADWAL')) {
      res.extractedSchedules = extractedSchedules;
    }
    res.stores.forEach(st => {
      const codeKey = (st.code || '').trim().toUpperCase();
      const sched = jadwalStoreMap.get(codeKey);
      if (sched) {
        st.scheduledDate = sched.scheduledDate;
        st.tglSo = formatSmartSODate(sched.scheduledDate);
        st.soSeptember = formatSmartSODate(sched.scheduledDate);
        st.dayName = sched.dayName;
        st.teamName = sched.teamName;
        st.personilLeader = sched.personilLeader;
        st.korlap = sched.officerInCharge;
        st.managerName = sched.officerInCharge;
        st.typeSo = sched.typeSo;
        st.qm = sched.typeSo;
        st.soAktiva = sched.soAktiva;
        st.zona = sched.zona;
        st.isZonaHitam = sched.zona === 'ZONA HITAM';
        if (sched.stockRp > 0) st.saldoToko = sched.stockRp;
        if (sched.kasToko > 0) st.kasToko = sched.kasToko;
        if (sched.asInitial) st.as = sched.asInitial;
      }
    });
  });

  // Prioritize comprehensive master store sheet (Strictly prioritizing MASTER TOKO BALI)
  let bestSheet: SheetParseResult | null = null;
  const cleanPref = preferredSheetName ? preferredSheetName.trim().toUpperCase().replace(/[\s_-]/g, '') : '';

  // 1. If preferredSheetName was explicitly provided:
  if (cleanPref) {
    bestSheet = sheetResults.find(s => {
      const sClean = s.sheetName.trim().toUpperCase().replace(/[\s_-]/g, '');
      return sClean === cleanPref || sClean.includes(cleanPref) || cleanPref.includes(sClean);
    }) || null;
  }

  // 2. Prioritize sheets explicitly named "MASTER TOKO BALI" (standard operational master)
  if (!bestSheet) {
    bestSheet = sheetResults.find(s => {
      const u = s.sheetName.trim().toUpperCase().replace(/[\s_-]/g, '');
      return u === 'MASTERTOKOBALI' || u.includes('MASTERTOKOBALI') || (u.includes('MASTER') && u.includes('BALI'));
    }) || null;
  }

  // 3. Next fallback: Sheet containing 'MASTER TOKO'
  if (!bestSheet) {
    bestSheet = sheetResults.find(s => {
      const u = s.sheetName.trim().toUpperCase().replace(/[\s_-]/g, '');
      return u.includes('MASTERTOKO');
    }) || null;
  }

  // 4. Next fallback: Sheet containing 'MASTER' with store schedules/dates
  if (!bestSheet) {
    const masterWithDates = sheetResults.filter(s => {
      const u = s.sheetName.toUpperCase();
      return u.includes('MASTER') && s.stores.some(st => st.scheduledDate || st.soOktober || st.soSeptember || st.tglSo);
    });
    if (masterWithDates.length > 0) {
      bestSheet = masterWithDates.reduce((best, cur) => cur.stores.length > best.stores.length ? cur : best);
    }
  }

  // 5. Next fallback: Sheet containing 'MASTER', 'ALL TOKO', or 'DATA TOKO'
  if (!bestSheet) {
    const masterCandidates = sheetResults.filter(s => {
      const u = s.sheetName.toUpperCase();
      return u.includes('MASTER') || u.includes('ALL TOKO') || u.includes('DATA TOKO') || u.includes('TOKO');
    });
    if (masterCandidates.length > 0) {
      bestSheet = masterCandidates.reduce((best, cur) => cur.stores.length > best.stores.length ? cur : best);
    }
  }

  // 6. Absolute fallback: sheet with maximum stores
  if (!bestSheet) {
    bestSheet = sheetResults.reduce<SheetParseResult | null>((best, current) => {
      if (!best) return current;
      return current.stores.length > best.stores.length ? current : best;
    }, null);
  }

  if (bestSheet && extractedSchedules.length > 0) {
    bestSheet.extractedSchedules = extractedSchedules;
  }

  const detectedMonth = bestSheet?.detectedMonth || getCurrentCalendarMonth();
  const detectedYear = bestSheet?.detectedYear || getCurrentCalendarYear();
  const detectedPeriodStr = bestSheet?.detectedPeriodStr || `${getFullMonthNameIndo(detectedMonth)} ${detectedYear}`;

  return {
    allSheets: sheetResults,
    activeSheet: bestSheet,
    detectedMonth,
    detectedYear,
    detectedPeriodStr
  };
}
