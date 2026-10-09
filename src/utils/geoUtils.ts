import { Store, RegionArea, SOSchedule, OfficerClusterRoute, StoreDistancePair, ClusterProximityLevel } from '../types/stockOpname';

export interface ParsedCoordinate {
  latitude?: number;
  longitude?: number;
  isValid: boolean;
  formattedDMS?: string;
  formattedDD?: string;
}

/**
 * Universal Coordinate Parser
 * Parses Decimal Degrees (DD), Degrees Minutes Seconds (DMS), and Google Maps strings.
 * Examples handled:
 * - "S8 45 27.3 E115 10 36.1"
 * - "8°41'18.55\"S 115°14'17.47\"E"
 * - "S 8 37 55.01 E115 11 53.17"
 * - "-8.5442796, 115.1425756"
 * - "8.5442796 S, 115.1425756 E"
 */
export function parseCoordinates(rawInput: any): ParsedCoordinate {
  if (!rawInput) return { isValid: false };

  const str = String(rawInput).trim();
  if (!str) return { isValid: false };

  // 1. Google Maps URL or @lat,lng format
  const urlMatch = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || str.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (urlMatch) {
    const lat = parseFloat(urlMatch[1]);
    const lng = parseFloat(urlMatch[2]);
    return finalizeCoordinate(lat, lng, str);
  }

  // Normalize string for regex parsing: replace degree/minute/second symbols with spaces
  const cleanStr = str
    .replace(/[°'"]/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  // 2. Try DMS Regex with S/N/E/W direction tags
  // Lat match: (S|N) then degrees, minutes, seconds OR degrees, minutes, seconds, (S|N)
  const dmsLatMatch = cleanStr.match(/(S|N)\s*(\d{1,2})\s+(\d{1,2})\s+(\d{1,2}(?:\.\d+)?)/) ||
                      cleanStr.match(/(S|N)\s*(\d{1,2})\s+(\d{1,2}(?:\.\d+)?)/) ||
                      cleanStr.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{1,2}(?:\.\d+)?)\s*(S|N)/) ||
                      cleanStr.match(/(\d{1,2})\s+(\d{1,2}(?:\.\d+)?)\s*(S|N)/);

  const dmsLngMatch = cleanStr.match(/(E|W)\s*(\d{1,3})\s+(\d{1,2})\s+(\d{1,2}(?:\.\d+)?)/) ||
                      cleanStr.match(/(E|W)\s*(\d{1,3})\s+(\d{1,2}(?:\.\d+)?)/) ||
                      cleanStr.match(/(\d{1,3})\s+(\d{1,2})\s+(\d{1,2}(?:\.\d+)?)\s*(E|W)/) ||
                      cleanStr.match(/(\d{1,3})\s+(\d{1,2}(?:\.\d+)?)\s*(E|W)/);

  if (dmsLatMatch && dmsLngMatch) {
    let latDir = 'S';
    let latDeg = 0, latMin = 0, latSec = 0;

    if (dmsLatMatch[1] === 'S' || dmsLatMatch[1] === 'N') {
      latDir = dmsLatMatch[1];
      latDeg = parseFloat(dmsLatMatch[2]) || 0;
      latMin = parseFloat(dmsLatMatch[3]) || 0;
      latSec = parseFloat(dmsLatMatch[4]) || 0;
    } else {
      latDeg = parseFloat(dmsLatMatch[1]) || 0;
      latMin = parseFloat(dmsLatMatch[2]) || 0;
      latSec = parseFloat(dmsLatMatch[3]) || 0;
      latDir = dmsLatMatch[4] || (str.toUpperCase().includes('S') ? 'S' : 'N');
    }

    let lngDir = 'E';
    let lngDeg = 0, lngMin = 0, lngSec = 0;

    if (dmsLngMatch[1] === 'E' || dmsLngMatch[1] === 'W') {
      lngDir = dmsLngMatch[1];
      lngDeg = parseFloat(dmsLngMatch[2]) || 0;
      lngMin = parseFloat(dmsLngMatch[3]) || 0;
      lngSec = parseFloat(dmsLngMatch[4]) || 0;
    } else {
      lngDeg = parseFloat(dmsLngMatch[1]) || 0;
      lngMin = parseFloat(dmsLngMatch[2]) || 0;
      lngSec = parseFloat(dmsLngMatch[3]) || 0;
      lngDir = dmsLngMatch[4] || (str.toUpperCase().includes('W') ? 'W' : 'E');
    }

    let lat = latDeg + (latMin / 60) + (latSec / 3600);
    if (latDir === 'S') lat = -lat;

    let lng = lngDeg + (lngMin / 60) + (lngSec / 3600);
    if (lngDir === 'W') lng = -lng;

    return finalizeCoordinate(lat, lng, str);
  }

  // 3. Fallback: Extract floating point / signed numbers
  const numberMatches = str.match(/-?\d+(?:\.\d+)?/g);
  if (numberMatches && numberMatches.length >= 2) {
    // If there are 6 or more numbers, they could be DMS without S/E tags (e.g., 8 45 27.3 115 10 36.1)
    if (numberMatches.length >= 6) {
      const d1 = Math.abs(parseFloat(numberMatches[0]));
      const m1 = parseFloat(numberMatches[1]);
      const s1 = parseFloat(numberMatches[2]);

      const d2 = Math.abs(parseFloat(numberMatches[3]));
      const m2 = parseFloat(numberMatches[4]);
      const s2 = parseFloat(numberMatches[5]);

      if (d1 < 90 && m1 < 60 && s1 < 60 && d2 < 180 && m2 < 60 && s2 < 60) {
        let lat = d1 + m1 / 60 + s1 / 3600;
        if (str.toUpperCase().includes('S') || parseFloat(numberMatches[0]) < 0) lat = -lat;

        let lng = d2 + m2 / 60 + s2 / 3600;
        if (str.toUpperCase().includes('W') || parseFloat(numberMatches[3]) < 0) lng = -lng;

        return finalizeCoordinate(lat, lng, str);
      }
    }

    let n1 = parseFloat(numberMatches[0]);
    let n2 = parseFloat(numberMatches[1]);

    if (str.toUpperCase().includes('S') && n1 > 0) n1 = -n1;
    if (str.toUpperCase().includes('W') && n2 > 0) n2 = -n2;

    return finalizeCoordinate(n1, n2, str);
  }

  return { isValid: false };
}

function finalizeCoordinate(lat: number, lng: number, originalStr?: string): ParsedCoordinate {
  if (isNaN(lat) || isNaN(lng)) return { isValid: false };

  // Sanity check for swapped lat/lng in Indonesia
  // Indonesia Latitude is ~ -11 to +6, Longitude is ~ 95 to 141
  if (Math.abs(lat) > 50 && Math.abs(lng) <= 20) {
    const temp = lat;
    lat = lng;
    lng = temp;
  }

  // Auto-correct Bali/Indonesia Southern Hemisphere if latitude was mistakenly given positive (e.g. +8 instead of -8)
  if (lat > 0 && lat < 12 && (lng > 95 && lng < 141)) {
    // In Indonesia, positive latitude <= 6 is North of equator, but Bali is South (-8.x).
    // If original string contains 'S' or location context is Bali, make it negative.
    if (originalStr && (originalStr.toUpperCase().includes('S') || originalStr.toUpperCase().includes('BALI'))) {
      lat = -lat;
    } else if (lat > 5 && lat < 10) {
      // 8.xx in Indonesia is Bali/Java (Southern hemisphere)
      lat = -lat;
    }
  }

  // Auto-correct missing digit '5' in Bali longitude (e.g., 11.52608 -> 115.52608)
  if (lat >= -9.5 && lat <= -7.5 && lng >= 11.0 && lng <= 12.0) {
    const lngStr = String(lng);
    if (lngStr.startsWith('11.')) {
      lng = parseFloat(lngStr.replace('11.', '115.'));
    } else {
      lng = lng + 104;
    }
  }

  // Ensure lat in [-90, 90] and lng in [-180, 180]
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { isValid: false };
  }

  // Sanity check: Ensure coordinates are within valid Indonesian territory (lat [-11, 6], lng [95, 141])
  // Reject non-Indonesian coordinates (e.g. Africa/Atlantic Ocean) as invalid
  if (lat < -11 || lat > 6 || lng < 95 || lng > 141) {
    return { isValid: false };
  }

  const roundedLat = Math.round(lat * 10000000) / 10000000;
  const roundedLng = Math.round(lng * 10000000) / 10000000;

  // Format to standard DMS string for display
  const absLat = Math.abs(roundedLat);
  const latD = Math.floor(absLat);
  const latM = Math.floor((absLat - latD) * 60);
  const latS = Math.round(((absLat - latD) * 60 - latM) * 60 * 10) / 10;

  const absLng = Math.abs(roundedLng);
  const lngD = Math.floor(absLng);
  const lngM = Math.floor((absLng - lngD) * 60);
  const lngS = Math.round(((absLng - lngD) * 60 - lngM) * 60 * 10) / 10;

  const formattedDMS = `${roundedLat < 0 ? 'S' : 'N'}${latD}° ${latM}' ${latS}" ${roundedLng < 0 ? 'W' : 'E'}${lngD}° ${lngM}' ${lngS}"`;
  const formattedDD = `${roundedLat}, ${roundedLng}`;

  return {
    latitude: roundedLat,
    longitude: roundedLng,
    isValid: true,
    formattedDMS,
    formattedDD
  };
}

export function getKabupatenFromCoordinates(lat: number, lng: number): string | null {
  if (lat < -9.5 || lat > -7.5 || lng < 114.0 || lng > 117.0) {
    return null;
  }

  // 1. Mataram / Lombok (East of 115.85)
  if (lng >= 115.85) {
    return 'MATARAM';
  }

  // 2. Jembrana (West Bali, West of 114.95)
  if (lng < 114.95) {
    return 'JEMBRANA';
  }

  // 3. Buleleng (North Bali: lat is NORTH of -8.28, i.e. lat > -8.28, Lng 114.85 to 115.38)
  if (lat > -8.28 && lng >= 114.85 && lng <= 115.38) {
    return 'BULELENG';
  }

  // 4. Karangasem (East Bali, Lng >= 115.48)
  if (lng >= 115.48) {
    return 'KARANGASEM';
  }

  // 5. Bangli (Central Mountainous: Lat between -8.20 and -8.48, Lng 115.28 to 115.42)
  if (lat <= -8.20 && lat >= -8.48 && lng >= 115.28 && lng <= 115.42) {
    return 'BANGLI';
  }

  // 6. Klungkung (Southeast Bali & Nusa Penida)
  if ((lat <= -8.52 && lat >= -8.65 && lng >= 115.36 && lng <= 115.48) || (lat <= -8.65 && lat >= -8.88 && lng >= 115.40 && lng <= 115.60)) {
    return 'KLUNGKUNG';
  }

  // 7. Gianyar (Central South, Lng 115.22 to 115.35, Lat between -8.38 and -8.62)
  if (lng >= 115.22 && lng <= 115.35 && lat <= -8.38 && lat >= -8.62) {
    return 'GIANYAR';
  }

  // 8. Tabanan (Central West, Lng 114.95 to 115.16)
  if (lng >= 114.95 && lng < 115.16) {
    return 'TABANAN';
  }

  // 9. Kota Denpasar (Capital region: Lat -8.60 to -8.72, Lng 115.18 to 115.26)
  if (lat <= -8.60 && lat >= -8.72 && lng >= 115.18 && lng <= 115.26) {
    return 'DENPASAR';
  }

  // 10. Badung (Default for remaining Badung corridor: Kuta, Jimbaran, Nusa Dua, Mengwi, Canggu, Abiansemal, Petang, etc.)
  return 'BADUNG';
}

/**
 * Auto-detects and synchronizes `region`, `city`, and `kabupaten` for a store
 * based on coordinates (lat, lng), store code, name, address, and text metadata.
 * PRESERVES exact user-uploaded master data and never injects fake dummy coordinates.
 */
export function autoSyncStoreRegionAndKabupaten(store: Store): Store {
  if (!store) return store;

  const updatedStore = { ...store };

  // 1. Extract & parse existing coordinates if present (Do NOT inject synthetic dummy lat/lng!)
  let lat = updatedStore.latitude;
  let lng = updatedStore.longitude;

  if (updatedStore.koordinat) {
    const parsed = parseCoordinates(updatedStore.koordinat);
    if (parsed.isValid && parsed.latitude !== undefined && parsed.longitude !== undefined) {
      lat = parsed.latitude;
      lng = parsed.longitude;
      updatedStore.latitude = lat;
      updatedStore.longitude = lng;
    }
  } else if (lat !== undefined && lng !== undefined) {
    const parsed = parseCoordinates(`${lat}, ${lng}`);
    if (parsed.isValid && parsed.latitude !== undefined && parsed.longitude !== undefined) {
      lat = parsed.latitude;
      lng = parsed.longitude;
      updatedStore.latitude = lat;
      updatedStore.longitude = lng;
      if (!updatedStore.koordinat) {
        updatedStore.koordinat = `${lat}, ${lng}`;
      }
    }
  }

  // 2. Only infer kabupaten if store.kabupaten (and store.city) is missing/empty
  const existingKab = (updatedStore.kabupaten || updatedStore.city || '').trim();
  if (!existingKab) {
    let detectedKabupaten = '';

    // Check if valid Bali/Lombok coordinates exist and derive kabupaten
    if (lat !== undefined && lng !== undefined && lat <= -7.8 && lat >= -9.2 && lng >= 114.2 && lng <= 116.8) {
      const coordKab = getKabupatenFromCoordinates(lat, lng);
      if (coordKab) {
        detectedKabupaten = coordKab;
      }
    }

    // Check address/district text if still not found
    if (!detectedKabupaten) {
      const addressText = `${updatedStore.address || ''} ${updatedStore.district || ''} ${updatedStore.kecamatan || ''}`.toLowerCase();
      if (/buleleng|singaraja|seririt|grokgak|busungbiu|sawan|sukasada|banjar|kubutambahan|tejakula/i.test(addressText)) {
        detectedKabupaten = 'BULELENG';
      } else if (/jembrana|negara|mendoyo|melaya|pekutatan|pengambengan|gilimanuk/i.test(addressText)) {
        detectedKabupaten = 'JEMBRANA';
      } else if (/gianyar|ubud|sukawati|blahbatuh|tegallalang|payangan|tampak/i.test(addressText)) {
        detectedKabupaten = 'GIANYAR';
      } else if (/tabanan|kediri|selemadeg|baturiti|marga|penebel|pupuan/i.test(addressText)) {
        detectedKabupaten = 'TABANAN';
      } else if (/klungkung|semarapura|nusa penida|banjarangkan|dawan/i.test(addressText)) {
        detectedKabupaten = 'KLUNGKUNG';
      } else if (/bangli|kintamani|susut|tembuku/i.test(addressText)) {
        detectedKabupaten = 'BANGLI';
      } else if (/karangasem|amlapura|manggis|rendang|selat|kubu|bebandem|candidasa/i.test(addressText)) {
        detectedKabupaten = 'KARANGASEM';
      } else if (/denpasar|renon|sanur|teuku umar|sesetan|pemogan|gatot subroto|ubung|sidakarya|pedungan/i.test(addressText)) {
        detectedKabupaten = 'DENPASAR';
      } else if (/mataram|lombok|cakranegara|ampenan|senggigi/i.test(addressText)) {
        detectedKabupaten = 'MATARAM';
      } else if (/badung|kuta|jimbaran|nusa dua|mengwi|canggu|abiansemal|petang|legian|seminyak|kerobokan|tuban|kedonganan|dalung/i.test(addressText)) {
        detectedKabupaten = 'BADUNG';
      }
    }

    if (detectedKabupaten) {
      const formattedKabupaten = detectedKabupaten === 'DENPASAR' || detectedKabupaten === 'MATARAM' 
        ? `KOTA ${detectedKabupaten}` 
        : `KAB. ${detectedKabupaten}`;
      updatedStore.kabupaten = formattedKabupaten;
      updatedStore.city = formattedKabupaten;
    }
  }

  return updatedStore;
}

/**
 * Reference Geographic Centroids for Bali Regencies & Cities (and Mataram/Lombok)
 */
export const BALI_CENTROID_KABUPATEN: Record<string, { lat: number; lng: number }> = {
  'KOTA DENPASAR': { lat: -8.6705, lng: 115.2126 },
  'DENPASAR': { lat: -8.6705, lng: 115.2126 },
  'KAB. BADUNG': { lat: -8.5830, lng: 115.1700 },
  'BADUNG': { lat: -8.5830, lng: 115.1700 },
  'KAB. GIANYAR': { lat: -8.5400, lng: 115.3250 },
  'GIANYAR': { lat: -8.5400, lng: 115.3250 },
  'KAB. TABANAN': { lat: -8.5411, lng: 115.1246 },
  'TABANAN': { lat: -8.5411, lng: 115.1246 },
  'KAB. BULELENG': { lat: -8.1120, lng: 115.0882 },
  'BULELENG': { lat: -8.1120, lng: 115.0882 },
  'KAB. KARANGASEM': { lat: -8.4489, lng: 115.6128 },
  'KARANGASEM': { lat: -8.4489, lng: 115.6128 },
  'KAB. JEMBRANA': { lat: -8.3589, lng: 114.6186 },
  'JEMBRANA': { lat: -8.3589, lng: 114.6186 },
  'KAB. KLUNGKUNG': { lat: -8.5369, lng: 115.4050 },
  'KLUNGKUNG': { lat: -8.5369, lng: 115.4050 },
  'KAB. BANGLI': { lat: -8.4539, lng: 115.3549 },
  'BANGLI': { lat: -8.4539, lng: 115.3549 },
  'KOTA MATARAM & LOMBOK': { lat: -8.5833, lng: 116.1167 },
  'MATARAM': { lat: -8.5833, lng: 116.1167 }
};

/**
 * Detailed Bali Subdistricts / Kecamatans coordinate index for granular distance calculation
 */
export const BALI_CENTROID_KECAMATAN: Array<{ regex: RegExp; lat: number; lng: number; kab: string }> = [
  // Denpasar
  { regex: /denpasar\s+selatan|sanur|sidakarya|panjer|sesetan|pemogan|serangan/i, lat: -8.6970, lng: 115.2280, kab: 'KOTA DENPASAR' },
  { regex: /denpasar\s+barat|pemecutan|teuku\s+umar|gatot\s+subroto\s+barat|gunung\s+agung/i, lat: -8.6650, lng: 115.2010, kab: 'KOTA DENPASAR' },
  { regex: /denpasar\s+timur|kesiman|penatih|gatot\s+subroto\s+timur|tohpati/i, lat: -8.6430, lng: 115.2450, kab: 'KOTA DENPASAR' },
  { regex: /denpasar\s+utara|ubung|peguyangan|tonja/i, lat: -8.6250, lng: 115.2150, kab: 'KOTA DENPASAR' },

  // Badung
  { regex: /kuta\s+selatan|jimbaran|nusa\s+dua|benoa|ungasan|pecatu|tanjung\s+benoa/i, lat: -8.7980, lng: 115.1950, kab: 'KAB. BADUNG' },
  { regex: /kuta\s+utara|canggu|kerobokan|dalung|tibubeneng|berawa/i, lat: -8.6500, lng: 115.1580, kab: 'KAB. BADUNG' },
  { regex: /kuta|legian|seminyak|tuban|kedonganan/i, lat: -8.7185, lng: 115.1686, kab: 'KAB. BADUNG' },
  { regex: /mengwi|kapang|lukluk|sembung|mengwitani|baha|gulingan/i, lat: -8.5442, lng: 115.1725, kab: 'KAB. BADUNG' },
  { regex: /abiansemal|sangeh|sibang|sedang|mambal/i, lat: -8.5200, lng: 115.2150, kab: 'KAB. BADUNG' },
  { regex: /petang|plaga|belok/i, lat: -8.3850, lng: 115.2200, kab: 'KAB. BADUNG' },

  // Gianyar
  { regex: /sukawati|batubulan|celuk|singapadu|guwang|kemenuh/i, lat: -8.5950, lng: 115.2830, kab: 'KAB. GIANYAR' },
  { regex: /blahbatuh|bedulu|belebatu|saba|keramas/i, lat: -8.5720, lng: 115.3050, kab: 'KAB. GIANYAR' },
  { regex: /ubud|campuhan|sayan|penestanan|kedewatan/i, lat: -8.5070, lng: 115.2630, kab: 'KAB. GIANYAR' },
  { regex: /tampaksiring|manukaya|pejeng/i, lat: -8.4550, lng: 115.3080, kab: 'KAB. GIANYAR' },
  { regex: /tegallalang|taro|sebatu|ceking/i, lat: -8.4420, lng: 115.2800, kab: 'KAB. GIANYAR' },
  { regex: /payangan|buahan|bresela/i, lat: -8.3650, lng: 115.2480, kab: 'KAB. GIANYAR' },
  { regex: /gianyar|abianbase|bengkek|tulikup/i, lat: -8.5420, lng: 115.3280, kab: 'KAB. GIANYAR' },

  // Tabanan
  { regex: /kediri|banjar\s+anyar|nyitdah|kaba-kaba|pejaten/i, lat: -8.5600, lng: 115.1450, kab: 'KAB. TABANAN' },
  { regex: /tabanan|dauhpuri|dajanpuri|delodpuri/i, lat: -8.5411, lng: 115.1246, kab: 'KAB. TABANAN' },
  { regex: /kerambitan|baturiti|candikuning|bedugul/i, lat: -8.3250, lng: 115.1850, kab: 'KAB. TABANAN' },
  { regex: /marga|tua|kukuh/i, lat: -8.4900, lng: 115.1750, kab: 'KAB. TABANAN' },
  { regex: /penebel|jatiluwih|buruan/i, lat: -8.4450, lng: 115.1420, kab: 'KAB. TABANAN' },
  { regex: /selemadeg|bajera|antap|lalanglinggah/i, lat: -8.4950, lng: 115.0250, kab: 'KAB. TABANAN' },
  { regex: /pupuan|belimbing|padangan/i, lat: -8.3450, lng: 115.0250, kab: 'KAB. TABANAN' },

  // Klungkung
  { regex: /klungkung|semarapura/i, lat: -8.5370, lng: 115.4050, kab: 'KAB. KLUNGKUNG' },
  { regex: /banjarangkan|takmung|tusan/i, lat: -8.5350, lng: 115.3750, kab: 'KAB. KLUNGKUNG' },
  { regex: /dawan|kusamba|gunaksa/i, lat: -8.5450, lng: 115.4450, kab: 'KAB. KLUNGKUNG' },
  { regex: /nusa\s+penida|lembongan|ceningan/i, lat: -8.7280, lng: 115.5450, kab: 'KAB. KLUNGKUNG' },

  // Bangli
  { regex: /bangli|kawan|cempaga|kubu/i, lat: -8.4539, lng: 115.3549, kab: 'KAB. BANGLI' },
  { regex: /susut|sulahan|kayubihi/i, lat: -8.4650, lng: 115.3250, kab: 'KAB. BANGLI' },
  { regex: /tembuku|peninjoan|jehem/i, lat: -8.4600, lng: 115.3950, kab: 'KAB. BANGLI' },
  { regex: /kintamani|batur|songan|sukawana/i, lat: -8.2450, lng: 115.3280, kab: 'KAB. BANGLI' },

  // Karangasem
  { regex: /karangasem|amlapura|subagan/i, lat: -8.4489, lng: 115.6128, kab: 'KAB. KARANGASEM' },
  { regex: /manggis|candidasa|antiga|padangbai/i, lat: -8.4950, lng: 115.5250, kab: 'KAB. KARANGASEM' },
  { regex: /rendang|besakih|menanga/i, lat: -8.4350, lng: 115.4350, kab: 'KAB. KARANGASEM' },
  { regex: /selat|duda|amerta\s+bhuana/i, lat: -8.4400, lng: 115.4750, kab: 'KAB. KARANGASEM' },
  { regex: /bebandem|jungutan|sibetan/i, lat: -8.4350, lng: 115.5650, kab: 'KAB. KARANGASEM' },
  { regex: /abang|tirtagangga|culik/i, lat: -8.3950, lng: 115.6150, kab: 'KAB. KARANGASEM' },
  { regex: /kubu|tulamben|tianyar/i, lat: -8.2650, lng: 115.5550, kab: 'KAB. KARANGASEM' },
  { regex: /sidemen|telaga\s+tawang/i, lat: -8.4850, lng: 115.4550, kab: 'KAB. KARANGASEM' },

  // Buleleng
  { regex: /singaraja|buleleng|banyuasri|kampung\s+anyar/i, lat: -8.1120, lng: 115.0882, kab: 'KAB. BULELENG' },
  { regex: /sukasada|ambengan|gitgit|panji/i, lat: -8.1550, lng: 115.1050, kab: 'KAB. BULELENG' },
  { regex: /sawan|sangsit|bebandung|sinabun/i, lat: -8.1250, lng: 115.1650, kab: 'KAB. BULELENG' },
  { regex: /kubutambahan|bila|bontihing/i, lat: -8.1150, lng: 115.2250, kab: 'KAB. BULELENG' },
  { regex: /tejakula|les|sambirenteng|julah/i, lat: -8.1350, lng: 115.3450, kab: 'KAB. BULELENG' },
  { regex: /banjar|dencarik|temukus|kaliasem/i, lat: -8.1950, lng: 114.9650, kab: 'KAB. BULELENG' },
  { regex: /seririt|tangguwisia|sulangai/i, lat: -8.1950, lng: 114.9350, kab: 'KAB. BULELENG' },
  { regex: /busungbiu|pelapuan|tinggarsari/i, lat: -8.2650, lng: 114.9750, kab: 'KAB. BULELENG' },
  { regex: /gerokgak|pejarakan|celukan\s+bawang|sumberkima/i, lat: -8.1850, lng: 114.7750, kab: 'KAB. BULELENG' },

  // Jembrana
  { regex: /negara|pendem|dauhwaru|baler\s+bale\s+agung/i, lat: -8.3589, lng: 114.6186, kab: 'KAB. JEMBRANA' },
  { regex: /jembrana|yeh\s+kuning|perancak/i, lat: -8.3450, lng: 114.6450, kab: 'KAB. JEMBRANA' },
  { regex: /mendoyo|pohsanten|penyaringan/i, lat: -8.3750, lng: 114.7350, kab: 'KAB. JEMBRANA' },
  { regex: /pekutatan|pulukan|medewi|gumbrih/i, lat: -8.4150, lng: 114.8850, kab: 'KAB. JEMBRANA' },
  { regex: /melaya|gilimanuk|candikusuma|warnasari/i, lat: -8.2450, lng: 114.4850, kab: 'KAB. JEMBRANA' },

  // Lombok / Mataram
  { regex: /mataram|ampenan|cakranegara|sandubaya|selaparang|lombok/i, lat: -8.5833, lng: 116.1167, kab: 'KOTA MATARAM & LOMBOK' }
];

/**
 * Resolves reliable coordinates for any store in Bali / Lombok.
 * Checks:
 * 1. Store's exact GPS latitude / longitude
 * 2. Store's `koordinat` string
 * 3. Matching Kecamatan / subdistrict keywords
 * 4. Matching Kabupaten / regency centroid
 * Adds a small deterministic micro-dispersion based on store code hash so
 * neighboring stores within a district reflect accurate relative geographic distance.
 */
export function resolveStoreCoordinates(store?: Partial<Store> | null): {
  latitude: number;
  longitude: number;
  isEstimated: boolean;
  precision: 'GPS_EXACT' | 'KECAMATAN' | 'KABUPATEN' | 'PROVINSI';
} {
  if (!store) {
    return { latitude: -8.50, longitude: 115.20, isEstimated: true, precision: 'PROVINSI' };
  }

  // 1. Direct numbers
  if (
    typeof store.latitude === 'number' &&
    typeof store.longitude === 'number' &&
    !isNaN(store.latitude) &&
    !isNaN(store.longitude) &&
    store.latitude <= -7.5 &&
    store.latitude >= -9.5 &&
    store.longitude >= 114.0 &&
    store.longitude <= 117.0
  ) {
    return { latitude: store.latitude, longitude: store.longitude, isEstimated: false, precision: 'GPS_EXACT' };
  }

  // 2. Parse from koordinat string if present
  if (store.koordinat) {
    const parsed = parseCoordinates(store.koordinat);
    if (parsed.isValid && parsed.latitude !== undefined && parsed.longitude !== undefined) {
      return { latitude: parsed.latitude, longitude: parsed.longitude, isEstimated: false, precision: 'GPS_EXACT' };
    }
  }

  // Deterministic micro-dispersion based on store code hash (~50m to 300m)
  const code = (store.code || store.id || 'STORE').toUpperCase();
  let codeHash = 0;
  for (let i = 0; i < code.length; i++) {
    codeHash = (codeHash * 31 + code.charCodeAt(i)) % 10000;
  }
  const jitterLat = ((codeHash % 100) - 50) * 0.00025; // ~20m to 150m
  const jitterLng = (((Math.floor(codeHash / 100)) % 100) - 50) * 0.00025;

  // 3. Match by Kecamatan / District / Address keywords
  const fullText = `${store.kecamatan || ''} ${store.district || ''} ${store.name || ''} ${store.address || ''}`.toLowerCase();
  for (const item of BALI_CENTROID_KECAMATAN) {
    if (item.regex.test(fullText)) {
      return {
        latitude: Math.round((item.lat + jitterLat) * 10000) / 10000,
        longitude: Math.round((item.lng + jitterLng) * 10000) / 10000,
        isEstimated: true,
        precision: 'KECAMATAN'
      };
    }
  }

  // 4. Match by Kabupaten / City / Region
  const rawKab = (store.kabupaten || store.city || store.region || '').toUpperCase().trim();
  const cleanKabKey = Object.keys(BALI_CENTROID_KABUPATEN).find(k => rawKab.includes(k) || k.includes(rawKab));
  if (cleanKabKey && BALI_CENTROID_KABUPATEN[cleanKabKey]) {
    const center = BALI_CENTROID_KABUPATEN[cleanKabKey];
    return {
      latitude: Math.round((center.lat + jitterLat * 2) * 10000) / 10000,
      longitude: Math.round((center.lng + jitterLng * 2) * 10000) / 10000,
      isEstimated: true,
      precision: 'KABUPATEN'
    };
  }

  // Fallback to Bali Island Center
  return {
    latitude: Math.round((-8.5000 + jitterLat * 3) * 10000) / 10000,
    longitude: Math.round((115.2000 + jitterLng * 3) * 10000) / 10000,
    isEstimated: true,
    precision: 'PROVINSI'
  };
}

/**
 * Calculates distance between two stores in Kilometers using accurate coordinates.
 * Resolves coordinates automatically if not yet defined.
 */
export function calculateHaversineDistanceBetweenStores(
  storeA?: Partial<Store> | null,
  storeB?: Partial<Store> | null
): number {
  if (!storeA || !storeB) return 0;
  if (storeA.id === storeB.id || (storeA.code && storeB.code && storeA.code === storeB.code)) {
    return 0;
  }

  const coordA = resolveStoreCoordinates(storeA);
  const coordB = resolveStoreCoordinates(storeB);

  return calculateHaversineDistance(coordA.latitude, coordA.longitude, coordB.latitude, coordB.longitude);
}

/**
 * Ensures a Store object has clean, accurate latitude and longitude numbers.
 * Auto-parses `store.koordinat` if present, synchronizes kabupaten/region,
 * and provisions reliable geographic coordinates for all Bali stores.
 */
export function ensureStoreCoordinates(store: Store): Store {
  const synchronized = autoSyncStoreRegionAndKabupaten(store);
  if (synchronized.latitude === undefined || synchronized.longitude === undefined) {
    const resolved = resolveStoreCoordinates(synchronized);
    synchronized.latitude = resolved.latitude;
    synchronized.longitude = resolved.longitude;
    if (!synchronized.koordinat) {
      synchronized.koordinat = `${resolved.latitude}, ${resolved.longitude}`;
    }
  }
  return synchronized;
}

/**
 * Calculates the great-circle distance between two points on the Earth
 * using the Haversine formula.
 * @returns Distance in kilometers
 */
export function calculateHaversineDistance(
  lat1?: number, 
  lon1?: number, 
  lat2?: number, 
  lon2?: number
): number {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return 0;
  }

  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

/**
 * Evaluates proximity level based on max distance between scheduled stores in a cluster.
 */
export function getProximityLevel(maxDistanceKm: number): ClusterProximityLevel {
  if (maxDistanceKm <= 15) return 'Optimal (<15km)';
  if (maxDistanceKm <= 30) return 'Sedang (15-30km)';
  return 'Terlalu Jauh (>30km)';
}

/**
 * Groups schedules by Officer & Date to evaluate geographic clustering.
 */
export function analyzeOfficerClusters(
  schedules: SOSchedule[],
  stores: Store[],
  targetDate?: string,
  targetOfficer?: string
): OfficerClusterRoute[] {
  const storeMap = new Map<string, Store>();
  stores.forEach(s => {
    storeMap.set(s.id, s);
    storeMap.set(s.code, s);
  });

  // Map key: "OFFICER|DATE"
  const groups = new Map<string, { officer: string; date: string; scheds: SOSchedule[] }>();

  schedules.forEach(sched => {
    // Only analyze valid non-cancelled schedules
    if (sched.status === 'Dibatalkan') return;

    if (targetDate && targetDate !== 'ALL' && sched.scheduledDate !== targetDate) return;
    const officer = sched.officerInCharge || sched.spvInCharge || 'Officer Korlap Bali';
    if (targetOfficer && targetOfficer !== 'ALL' && officer !== targetOfficer) return;

    const key = `${officer}|${sched.scheduledDate}`;
    if (!groups.has(key)) {
      groups.set(key, { officer, date: sched.scheduledDate, scheds: [] });
    }
    groups.get(key)!.scheds.push(sched);
  });

  const clusterRoutes: OfficerClusterRoute[] = [];

  groups.forEach(({ officer, date, scheds }) => {
    const matchedStores: Store[] = [];
    scheds.forEach(sc => {
      const st = storeMap.get(sc.storeId) || storeMap.get(sc.storeCode);
      if (st && st.latitude && st.longitude) {
        if (!matchedStores.some(existing => existing.id === st.id)) {
          matchedStores.push(st);
        }
      }
    });

    const pairs: StoreDistancePair[] = [];
    let totalDist = 0;
    let maxDist = 0;

    if (matchedStores.length >= 2) {
      for (let i = 0; i < matchedStores.length - 1; i++) {
        const storeA = matchedStores[i];
        const storeB = matchedStores[i + 1];
        const dist = calculateHaversineDistance(
          storeA.latitude, storeA.longitude,
          storeB.latitude, storeB.longitude
        );

        const isFarWarning = dist > 25;
        pairs.push({ storeA, storeB, distanceKm: dist, isFarWarning });
        totalDist += dist;
        if (dist > maxDist) maxDist = dist;
      }
    }

    const avgDist = pairs.length > 0 ? Math.round((totalDist / pairs.length) * 10) / 10 : 0;
    const proximityLevel = getProximityLevel(maxDist);

    clusterRoutes.push({
      officerName: officer,
      date,
      schedules: scheds,
      stores: matchedStores,
      maxDistanceKm: maxDist,
      avgDistanceKm: avgDist,
      totalDistanceKm: Math.round(totalDist * 10) / 10,
      proximityLevel,
      pairs
    });
  });

  // Sort by date descending
  return clusterRoutes.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Normalizes Kabupaten name from various store fields (kabupaten, region, city).
 */
export function normalizeKabupaten(rawKab?: string, rawRegion?: string, rawCity?: string): string {
  const str = (rawKab || rawRegion || rawCity || '').trim();
  if (!str) return 'Lainnya';
  
  const upper = str.toUpperCase();
  if (upper.includes('DENPASAR')) return 'Kota Denpasar';
  if (upper.includes('BADUNG')) return 'Kab. Badung';
  if (upper.includes('GIANYAR')) return 'Kab. Gianyar';
  if (upper.includes('TABANAN')) return 'Kab. Tabanan';
  if (upper.includes('BULELENG') || upper.includes('SINGARAJA')) return 'Kab. Buleleng';
  if (upper.includes('KARANGASEM') || upper.includes('AMLAPURA')) return 'Kab. Karangasem';
  if (upper.includes('JEMBRANA') || upper.includes('NEGARA')) return 'Kab. Jembrana';
  if (upper.includes('KLUNGKUNG') || upper.includes('SEMARAPURA') || upper.includes('NUSA PENIDA')) return 'Kab. Klungkung';
  if (upper.includes('BANGLI')) return 'Kab. Bangli';
  if (upper.includes('LOMBOK') || upper.includes('MATARAM')) return 'Kota Mataram & Lombok';

  return str.replace(/^KAB(\.|\s+)?/i, 'Kab. ').replace(/^KOTA(\s+)?/i, 'Kota ').trim();
}

/**
 * Normalizes Kecamatan name from store fields (kecamatan, district, storeName).
 */
export function normalizeKecamatan(rawKec?: string, rawDistrict?: string, storeName?: string): string {
  const str = (rawKec || rawDistrict || '').trim();
  if (str) {
    const cleaned = str.replace(/^KEC(\.|\s+)?/i, '').trim();
    if (cleaned) {
      return cleaned
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }
  
  // Try extracting from store name suffix e.g. "SUKAWATI - GIANYAR" or "BATUBULAN"
  if (storeName && storeName.includes('-')) {
    const parts = storeName.split('-');
    if (parts.length >= 2) {
      const candidate = parts[0].trim();
      if (candidate.length > 2 && !candidate.startsWith('T') && !candidate.startsWith('F')) {
        return candidate
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
      }
    }
  }
  return 'Lainnya';
}

/**
 * Extracts a clean mapping of Kabupaten -> list of Kecamatans from stores array
 */
export function extractKabupatenKecamatanMap(stores: Store[]): {
  kabupatenList: string[];
  kecamatanByKabupaten: Record<string, string[]>;
  allKecamatanList: string[];
} {
  const kabSet = new Set<string>();
  const allKecSet = new Set<string>();
  const kecMap: Record<string, Set<string>> = {};

  stores.forEach(s => {
    const kab = normalizeKabupaten(s.kabupaten, s.region, s.city);
    const kec = normalizeKecamatan(s.kecamatan, s.district, s.name);

    kabSet.add(kab);
    allKecSet.add(kec);

    if (!kecMap[kab]) {
      kecMap[kab] = new Set<string>();
    }
    if (kec && kec !== 'Lainnya') {
      kecMap[kab].add(kec);
    }
  });

  const kabupatenList = Array.from(kabSet).sort((a, b) => {
    if (a === 'Lainnya') return 1;
    if (b === 'Lainnya') return -1;
    return a.localeCompare(b);
  });

  const kecamatanByKabupaten: Record<string, string[]> = {};
  kabupatenList.forEach(kab => {
    kecamatanByKabupaten[kab] = Array.from(kecMap[kab] || []).sort();
  });

  const allKecamatanList = Array.from(allKecSet).filter(k => k !== 'Lainnya').sort();

  return {
    kabupatenList,
    kecamatanByKabupaten,
    allKecamatanList
  };
}

