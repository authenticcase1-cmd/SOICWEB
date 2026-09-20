import { AuditorPersonnel, SOSchedule, Store } from '../types/stockOpname';
import { BALI_PERSONNEL_DATA } from '../data/baliData';

/**
 * Standard 6 Bali Korlap Groups (as defined in JADWAL & PERSONIL Master)
 */
export const PRIMARY_BALI_KORLAPS: string[] = [
  'I WAYAN ANGGA RISTA',
  'ODI TRI ANGGARA',
  'ANGGA ARDIYANSYAH',
  'ABDUL RAHMAN',
  'I GEDE PASEK SANTIKA',
  'PUTU BISMA'
];

/**
 * Known Aliases & Short Names mapping for Bali Korlaps
 */
interface KorlapProfile {
  canonicalName: string;
  shortName: string;
  aliases: string[];
  defaultLeader?: string;
}

export const KORLAP_PROFILES: KorlapProfile[] = [
  {
    canonicalName: 'ODI TRI ANGGARA',
    shortName: 'ODI',
    aliases: [
      'odi',
      'odi tri',
      'odi tri anggara',
      'odi anggara',
      'tim odi',
      'team odi',
      'group odi',
      'tri anggara'
    ],
    defaultLeader: 'MUHAMMAD BAGUS MAULANA'
  },
  {
    canonicalName: 'ANGGA ARDIYANSYAH',
    shortName: 'ANGGA ARDI',
    aliases: [
      'angga ardiyansyah',
      'angga ardi',
      'angga ardian',
      'ardiyansyah',
      'ardian',
      'ardi',
      'tim angga ardiyansyah',
      'team angga ardiyansyah',
      'tim ardiyansyah',
      'tim ardian',
      'team ardian',
      'group ardiyansyah',
      'group ardian'
    ],
    defaultLeader: 'RAFLI SALMAN ADITYA'
  },
  {
    canonicalName: 'I WAYAN ANGGA RISTA',
    shortName: 'ANGGA RISTA',
    aliases: [
      'i wayan angga rista',
      'i wayan angga',
      'wayan angga rista',
      'wayan angga',
      'angga rista',
      'angga',
      'wayan',
      'rista',
      'tim wayan angga',
      'tim angga rista',
      'team wayan angga',
      'team 1',
      'tim 1'
    ],
    defaultLeader: 'YOGI SEPTA ARIF PRATAMA'
  },
  {
    canonicalName: 'ABDUL RAHMAN',
    shortName: 'ABDUL',
    aliases: [
      'abdul rahman',
      'abdul',
      'rahman',
      'tim abdul',
      'team abdul',
      'group abdul',
      'tim abdul rahman'
    ],
    defaultLeader: 'MUHAMMAD FARHAN'
  },
  {
    canonicalName: 'I GEDE PASEK SANTIKA',
    shortName: 'PASEK',
    aliases: [
      'i gede pasek santika',
      'i gede pasek',
      'gede pasek',
      'pasek santika',
      'pasek',
      'santika',
      'tim pasek',
      'team pasek',
      'group pasek'
    ],
    defaultLeader: 'M LUTFILAH'
  },
  {
    canonicalName: 'PUTU BISMA',
    shortName: 'BISMA',
    aliases: [
      'putu bisma',
      'bisma',
      'tim bisma',
      'team bisma',
      'group bisma',
      'bujanga',
      'bujangga',
      'putu'
    ],
    defaultLeader: 'GEDE ARIASA'
  }
];

/**
 * Get all available Korlap names dynamically from Master Personil
 */
export function getAvailableKorlapList(personnel?: AuditorPersonnel[]): string[] {
  const list: string[] = [];
  const seenCanonical = new Set<string>();

  // 1. Ensure standard 6 are included first in preferred canonical order
  PRIMARY_BALI_KORLAPS.forEach(k => {
    const canonical = normalizeKorlapName(k) || k.trim().toUpperCase();
    if (!seenCanonical.has(canonical)) {
      seenCanonical.add(canonical);
      list.push(canonical);
    }
  });

  // 2. Discover from Personnel Master Data if any other distinct Korlaps exist
  if (personnel && personnel.length > 0) {
    personnel.forEach(p => {
      const candidates = [
        p.role === 'Officer / Korlap' ? p.name : undefined,
        p.korlapName
      ].filter(Boolean) as string[];

      candidates.forEach(raw => {
        const canonical = normalizeKorlapName(raw) || raw.trim().toUpperCase();
        if (canonical && !seenCanonical.has(canonical)) {
          seenCanonical.add(canonical);
          list.push(canonical);
        }
      });
    });
  }

  return list;
}

/**
 * Intelligently normalize any raw Korlap string (from Excel or user input)
 * to the official canonical Korlap Name from Master Personil.
 */
export function normalizeKorlapName(rawInput?: string | null): string {
  if (!rawInput) return '';
  const clean = rawInput.trim().toLowerCase();
  if (!clean || clean === '-' || clean === 'null' || clean === 'undefined' || clean === 'petugas so') {
    return '';
  }

  // Strip generic prefixes like "tim ", "team ", "group ", "korlap ", "officer "
  const stripped = clean
    .replace(/^(tim|team|group|korlap|officer)\s+/i, '')
    .replace(/\s+\((officer|korlap|spv|leader)\)$/i, '')
    .trim();

  // 1. Check specific compound names first before generic words!
  
  // A. Check Odi Tri Anggara specifically
  if (
    stripped === 'odi' || 
    stripped.startsWith('odi ') || 
    stripped.endsWith(' odi') ||
    stripped === 'odi tri' ||
    stripped === 'odi tri anggara' ||
    stripped === 'tri anggara' ||
    stripped.includes('odi')
  ) {
    return 'ODI TRI ANGGARA';
  }

  // B. Check Angga Ardiyansyah / Ardian specifically (MUST COME BEFORE GENERIC ANGGA)
  if (
    stripped === 'ardiyansyah' ||
    stripped === 'ardian' ||
    stripped === 'ardi' ||
    stripped === 'angga ardi' ||
    stripped === 'angga ardian' ||
    stripped === 'angga ardiyansyah' ||
    stripped.includes('ardiyansyah') ||
    stripped.includes('ardian')
  ) {
    return 'ANGGA ARDIYANSYAH';
  }

  // C. Check I Wayan Angga Rista specifically
  if (
    stripped === 'wayan' ||
    stripped === 'rista' ||
    stripped === 'angga' ||
    stripped === 'angga rista' ||
    stripped === 'wayan angga' ||
    stripped === 'wayan angga rista' ||
    stripped === 'i wayan angga' ||
    stripped === 'i wayan angga rista' ||
    stripped.includes('wayan') ||
    stripped.includes('rista')
  ) {
    return 'I WAYAN ANGGA RISTA';
  }

  // D. Check Abdul Rahman
  if (
    stripped === 'abdul' ||
    stripped === 'abdul rahman' ||
    stripped === 'rahman' ||
    stripped.includes('abdul') ||
    stripped.includes('rahman')
  ) {
    return 'ABDUL RAHMAN';
  }

  // E. Check I Gede Pasek Santika
  if (
    stripped === 'pasek' ||
    stripped === 'gede pasek' ||
    stripped === 'pasek santika' ||
    stripped === 'i gede pasek' ||
    stripped === 'i gede pasek santika' ||
    stripped === 'santika' ||
    stripped.includes('pasek') ||
    stripped.includes('santika')
  ) {
    return 'I GEDE PASEK SANTIKA';
  }

  // F. Check Putu Bisma
  if (
    stripped === 'bisma' ||
    stripped === 'putu bisma' ||
    stripped === 'bujanga' ||
    stripped === 'bujangga' ||
    stripped.includes('bisma') ||
    stripped.includes('bujanga') ||
    stripped.includes('bujangga')
  ) {
    return 'PUTU BISMA';
  }

  // 2. Generic profile alias search
  for (const profile of KORLAP_PROFILES) {
    if (profile.aliases.includes(stripped) || profile.canonicalName.toLowerCase() === stripped) {
      return profile.canonicalName;
    }
  }

  // 3. Fallback: Return uppercase formatted
  return rawInput.trim().toUpperCase();
}

/**
 * Strict Korlap matching function to prevent false positives (like 'angga rista' matching 'angga ardiyansyah' or 'odi tri anggara').
 * 
 * @param candidate - The schedule's officerInCharge, groupName, or store's korlap
 * @param targetKorlap - The selected Korlap filter (e.g. 'I WAYAN ANGGA RISTA')
 */
export function isKorlapMatch(
  candidate?: string | null,
  targetKorlap?: string | null
): boolean {
  if (!targetKorlap || targetKorlap === 'ALL') return true;
  if (!candidate) return false;

  const normTarget = normalizeKorlapName(targetKorlap) || targetKorlap.trim().toUpperCase();
  const normCandidate = normalizeKorlapName(candidate) || candidate.trim().toUpperCase();

  // 1. Direct canonical comparison
  if (normTarget && normCandidate) {
    if (normTarget === normCandidate) return true;
    // If both have distinct canonical names that differ, it's definitely NOT a match
    if (PRIMARY_BALI_KORLAPS.includes(normTarget) && PRIMARY_BALI_KORLAPS.includes(normCandidate)) {
      return false;
    }
  }

  // 2. Specific alias check against the target profile
  const targetProfile = KORLAP_PROFILES.find(p => p.canonicalName === normTarget);
  if (targetProfile) {
    const rawCandClean = candidate.trim().toLowerCase().replace(/^(tim|team|group|korlap|officer)\s+/i, '').trim();
    if (targetProfile.aliases.includes(rawCandClean)) {
      return true;
    }
  }

  // 3. Strict token & exclusion matching
  const candLower = candidate.toLowerCase().trim();

  // If searching for ODI TRI ANGGARA
  if (normTarget === 'ODI TRI ANGGARA') {
    return candLower.includes('odi');
  }

  // If searching for ANGGA ARDIYANSYAH
  if (normTarget === 'ANGGA ARDIYANSYAH') {
    if (candLower.includes('wayan') || candLower.includes('rista') || candLower.includes('odi')) return false;
    return candLower.includes('ardiyansyah') || candLower.includes('ardian') || candLower.includes('ardi');
  }

  // If searching for I WAYAN ANGGA RISTA:
  // Must NOT have 'odi' or 'ardiyansyah' or 'ardian' or 'ardi'
  if (normTarget === 'I WAYAN ANGGA RISTA') {
    if (candLower.includes('odi') || candLower.includes('ardiyansyah') || candLower.includes('ardian') || candLower.includes('ardi')) {
      return false;
    }
    return candLower === 'angga' || candLower.includes('wayan') || candLower.includes('rista') || candLower.includes('angga rista') || candLower === 'tim 1' || candLower === 'team 1';
  }

  // If searching for ABDUL RAHMAN
  if (normTarget === 'ABDUL RAHMAN') {
    return candLower.includes('abdul') || candLower.includes('rahman');
  }

  // If searching for I GEDE PASEK SANTIKA
  if (normTarget === 'I GEDE PASEK SANTIKA') {
    return candLower.includes('pasek') || candLower.includes('santika');
  }

  // If searching for PUTU BISMA
  if (normTarget === 'PUTU BISMA') {
    return candLower.includes('bisma') || candLower.includes('bujanga') || candLower.includes('bujangga') || candLower.includes('ariasa') || candLower.includes('putu');
  }

  return false;
}

/**
 * Resolve display information for the Personil column:
 * Returns { leaderName, groupDisplayName, roleTag, memberCount }
 */
export function resolveSchedulePersonnelDisplay(
  schedule: SOSchedule,
  store?: Store,
  personnelList: AuditorPersonnel[] = BALI_PERSONNEL_DATA
): {
  leaderName: string;
  groupDisplayName: string;
  isCustomAssigned: boolean;
  assignedCount: number;
} {
  const assigned = schedule.assignedPersonnelNames || [];
  const assignedCount = assigned.length;
  
  // 1. Determine Official Korlap Group Name
  const rawKorlap = schedule.groupName || schedule.officerInCharge || store?.korlap || '';
  const canonicalKorlap = normalizeKorlapName(rawKorlap) || 'I WAYAN ANGGA RISTA';
  
  // Find Profile
  const profile = KORLAP_PROFILES.find(p => p.canonicalName === canonicalKorlap);
  const shortGroupName = profile ? `Tim ${profile.shortName}` : `Tim ${canonicalKorlap.split(' ')[0]}`;

  // 2. Determine Personil Leader
  let leaderName = '';

  if (assigned.length > 0) {
    leaderName = assigned[0];
    return {
      leaderName,
      groupDisplayName: canonicalKorlap,
      isCustomAssigned: true,
      assignedCount
    };
  }

  if (schedule.personilLeader && schedule.personilLeader.trim() && schedule.personilLeader.toLowerCase() !== 'tim' && schedule.personilLeader.toLowerCase() !== 'petugas so') {
    leaderName = schedule.personilLeader.trim();
  } else {
    // Lookup Coordinator in Master Personil for this Korlap
    const matchingCoordinator = personnelList.find(p => 
      p.role === 'Koordinator' && isKorlapMatch(p.korlapName, canonicalKorlap)
    );

    if (matchingCoordinator) {
      leaderName = matchingCoordinator.name;
    } else if (profile?.defaultLeader) {
      leaderName = profile.defaultLeader;
    } else {
      leaderName = canonicalKorlap;
    }
  }

  return {
    leaderName,
    groupDisplayName: canonicalKorlap,
    isCustomAssigned: false,
    assignedCount: 0
  };
}

/**
 * Intelligent Regional Korlap resolver for Bali stores when Korlap column is blank or unassigned
 * Maps stores strictly according to operational areas:
 * - Tabanan & Jembrana -> ODI TRI ANGGARA
 * - Bangli, Gianyar, Karangasem, Klungkung -> ANGGA ARDIYANSYAH
 * - Buleleng / Singaraja -> PUTU BISMA
 * - Badung -> ABDUL RAHMAN / I WAYAN ANGGA RISTA
 * - Denpasar -> I GEDE PASEK SANTIKA / PUTU BISMA / I WAYAN ANGGA RISTA
 */
export function resolveStoreDefaultKorlap(storeOrInfo?: {
  kabupaten?: string;
  region?: string;
  as?: string;
  am?: string;
  name?: string;
  address?: string;
} | null): string | undefined {
  if (!storeOrInfo) return undefined;
  const kab = String(storeOrInfo.kabupaten || storeOrInfo.region || '').trim().toUpperCase();
  const as = String(storeOrInfo.as || '').trim().toUpperCase();
  const name = String(storeOrInfo.name || '').trim().toUpperCase();
  const address = String(storeOrInfo.address || '').trim().toUpperCase();

  if (kab.includes('TABANAN') || kab.includes('JEMBRANA') || as.includes('TABANAN') || as.includes('JEMBRANA') || address.includes('TABANAN') || address.includes('NEGARA') || name.includes('TABANAN')) {
    return 'ODI TRI ANGGARA';
  }
  if (kab.includes('BANGLI') || kab.includes('GIANYAR') || kab.includes('KARANGASEM') || kab.includes('KLUNGKUNG') ||
      as.includes('BANGLI') || as.includes('GIANYAR') || as.includes('KARANGASEM') || as.includes('KLUNGKUNG') ||
      address.includes('BANGLI') || address.includes('GIANYAR') || address.includes('UBUD') || address.includes('AMLAPURA') || address.includes('SEMARAPURA') ||
      name.includes('BANGLI') || name.includes('GIANYAR')) {
    return 'ANGGA ARDIYANSYAH';
  }
  if (kab.includes('BULELENG') || as.includes('BULELENG') || address.includes('SINGARAJA') || address.includes('BULELENG') || name.includes('SINGARAJA') || name.includes('BULELENG')) {
    return 'PUTU BISMA';
  }
  if (kab.includes('BADUNG') || as.includes('BADUNG') || address.includes('KUTA') || address.includes('JIMBARAN') || address.includes('CANGGU') || address.includes('MENGWI') || name.includes('BADUNG')) {
    return 'ABDUL RAHMAN';
  }
  if (kab.includes('DENPASAR') || as.includes('DENPASAR') || address.includes('DENPASAR') || address.includes('SANUR') || name.includes('DPS') || name.includes('DENPASAR')) {
    return 'I GEDE PASEK SANTIKA';
  }
  return undefined;
}
