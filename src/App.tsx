import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  ClipboardCheck, 
  Store as StoreIcon, 
  Menu,
  Sparkles
} from 'lucide-react';
import { 
  getStoredStores, 
  saveStores, 
  getStoredSchedules, 
  saveSchedules, 
  getStoredResults, 
  saveResults, 
  getStoredTeams, 
  getStoredPersonnel,
  savePersonnel,
  getStoredEquipment,
  saveEquipment,
  getStoredRepairLogs,
  saveRepairLogs,
  getStoredMasterTokoDatasets,
  saveMasterTokoDatasets,
  getStoredOnCallPersonnel,
  saveOnCallPersonnel,
  clearAllData,
  exportToCSV,
  syncAllDataFromCloudinary,
  syncAllDataFromFirestore,
  subscribeFirestoreData,
  clearAllDeletedIds,
  recordDeletedId,
  trackDeletedId,
  getDeterministicScheduleId,
  deleteScheduleFromFirestore,
  deleteStoreFromFirestore,
  deleteMasterDatasetFromFirestore,
  deletePersonnelFromFirestore,
  deleteEquipmentFromFirestore,
  deleteRepairLogFromFirestore,
  saveMasterDatasetToFirestore,
  STORAGE_KEYS,
  getDashboardSummary,
  reconcilePendingExcelBackups,
  trackDeletedMasterDataset,
  untrackDeletedMasterDataset,
  isMasterDatasetDeleted,
  deduplicateEntityList,
  normalizeSingleActiveDataset,
  isStoreEquipment,
  isCorruptedEquipmentRecord,
  resetMasterStoresCleanly,
  resetMasterAndSchedulesCleanly,
  resetSchedulesOnlyCleanly
} from './services/storageService';
import { ensureStoreCoordinates, autoSyncStoreRegionAndKabupaten } from './utils/geoUtils';
import { formatSmartSODate, detectSmartMonthAndYear } from './utils/formatters';
import { 
  autoSyncStoreWithApprovedSchedule, 
  syncSchedulesFromMasterStores, 
  twoWaySyncStoresAndSchedules, 
  enrichScheduleWithMasterStore,
  calculateStoreFrekuensiTidakSO,
  getStoreSOApprovalStatus,
  reconcileStoresWithExistingApprovals
} from './utils/storeSyncUtils';
import { normalizeKorlapName } from './utils/korlapUtils';
import { 
  Store, 
  SOSchedule, 
  SOResult, 
  SOTeam, 
  AuditorPersonnel, 
  SOEquipment, 
  EquipmentRepairLog, 
  UserRole, 
  MasterTokoDataset,
  OnCallPersonnelRecord 
} from './types/stockOpname';

import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { RoleAuthModal } from './components/Role/RoleAuthModal';
import { InitialRoleAuthModal } from './components/Role/InitialRoleAuthModal';


import { SummaryCards } from './components/Dashboard/SummaryCards';
import { ChartsSection } from './components/Dashboard/ChartsSection';
import { UpcomingScheduleWidget } from './components/Dashboard/UpcomingScheduleWidget';
import { HighVarianceAlertWidget } from './components/Dashboard/HighVarianceAlertWidget';
import { DailyProgressTrackerWidget } from './components/Dashboard/DailyProgressTrackerWidget';
import { GeneralScheduleMetricsWidget } from './components/Dashboard/GeneralScheduleMetricsWidget';

import { ScheduleManager } from './components/Scheduling/ScheduleManager';
import { CreateScheduleModal } from './components/Scheduling/CreateScheduleModal';
import { AutoGeneratorModal } from './components/Scheduling/AutoGeneratorModal';

import { ResultsManager } from './components/Results/ResultsManager';
import { ResultDetailModal } from './components/Results/ResultDetailModal';
import { InputResultModal } from './components/Results/InputResultModal';

import { StoreDirectory } from './components/Stores/StoreDirectory';
import { MasterTokoManager } from './components/Stores/MasterTokoManager';
import { ZoneStoreChecklist } from './components/Supervisor/ZoneStoreChecklist';
import { StoreRelocationAssistant } from './components/Supervisor/StoreRelocationAssistant';
import { StoreDetailModal } from './components/Stores/StoreDetailModal';
import { AddEditStoreModal } from './components/Stores/AddEditStoreModal';
import { ImportStoresModal } from './components/Stores/ImportStoresModal';
import { KorlapScheduleImageModal } from './components/Scheduling/KorlapScheduleImageModal';
import { AssignPersonnelModal } from './components/Scheduling/AssignPersonnelModal';
import { GagalAtauPindahTokoModal } from './components/Scheduling/GagalAtauPindahTokoModal';

import { TeamManager } from './components/Teams/TeamManager';
import { OnCallPersonnelManager } from './components/Teams/OnCallPersonnelManager';
import { EquipmentManager } from './components/Equipment/EquipmentManager';
import { LeaveRecapManager } from './components/Admin/LeaveRecapManager';
import { AdminSORecapExtractor } from './components/Admin/AdminSORecapExtractor';
import { CompanyPortals } from './components/Portals/CompanyPortals';
import { UniformTracker } from './components/Uniforms/UniformTracker';
import { ReportsAnalytics } from './components/Reports/ReportsAnalytics';
import { SettingsManager } from './components/Settings/SettingsManager';
import { BaliClusterMap } from './components/Map/BaliClusterMap';

import { syncCloudinaryConfigFromFirestore } from './services/cloudinaryService';
import { syncSpreadsheetConfigFromFirestore, syncMasterStoresFromSpreadsheet } from './services/googleSpreadsheetService';

export default function App() {
  const [stores, setStores] = useState<Store[]>([]);
  const [schedules, setSchedules] = useState<SOSchedule[]>([]);
  const [results, setResults] = useState<SOResult[]>([]);
  const [teams, setTeams] = useState<SOTeam[]>([]);
  const [personnel, setPersonnel] = useState<AuditorPersonnel[]>([]);
  const [onCallRecords, setOnCallRecords] = useState<OnCallPersonnelRecord[]>([]);
  const [equipment, setEquipment] = useState<SOEquipment[]>([]);
  const [repairLogs, setRepairLogs] = useState<EquipmentRepairLog[]>([]);
  const [datasets, setDatasets] = useState<MasterTokoDataset[]>([]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [currentRole, setCurrentRole] = useState<UserRole>('ALL');
  const [isRoleAuthModalOpen, setIsRoleAuthModalOpen] = useState(false);
  const [isInitialRoleModalOpen, setIsInitialRoleModalOpen] = useState(false);
  const [targetRoleToAuth, setTargetRoleToAuth] = useState<UserRole>('SUPERVISOR');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const initialDateDetection = detectSmartMonthAndYear(
    getStoredMasterTokoDatasets(),
    getStoredStores()
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(initialDateDetection.month); // '01' to '12' or 'ALL'
  const [selectedYear, setSelectedYear] = useState<string>(initialDateDetection.year); // '2024', '2025', '2026', '2027', '2028' or 'ALL'
  const [selectedDate, setSelectedDate] = useState('ALL'); // 'ALL' or 'YYYY-MM-DD' e.g. '2026-08-04'

  useEffect(() => {
    // Check initial role session from cache
    const savedSession = localStorage.getItem('so_ic_role_auth_session');
    if (savedSession) {
      try {
        const { role, authTime } = JSON.parse(savedSession);
        if (role && authTime && (Date.now() - authTime < 30 * 60 * 1000)) {
          setCurrentRole(role);
          setIsInitialRoleModalOpen(false);
        } else {
          setIsInitialRoleModalOpen(true);
        }
      } catch {
        setIsInitialRoleModalOpen(true);
      }
    } else {
      setIsInitialRoleModalOpen(true);
    }

    // Auto refresh timer check every 30 seconds
    const interval = setInterval(() => {
      const sess = localStorage.getItem('so_ic_role_auth_session');
      if (sess) {
        try {
          const { authTime } = JSON.parse(sess);
          if (authTime && (Date.now() - authTime >= 30 * 60 * 1000)) {
            localStorage.removeItem('so_ic_role_auth_session');
            setIsInitialRoleModalOpen(true);
          }
        } catch {}
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleInitialRoleSuccess = (selectedRole: UserRole) => {
    const sessionData = {
      role: selectedRole,
      authTime: Date.now()
    };
    localStorage.setItem('so_ic_role_auth_session', JSON.stringify(sessionData));
    setCurrentRole(selectedRole);
    setIsInitialRoleModalOpen(false);

    if (selectedRole === 'SUPERVISOR' && activeTab !== 'schedules' && activeTab !== 'stores' && activeTab !== 'map' && activeTab !== 'dashboard') {
      setActiveTab('schedules');
    } else if (selectedRole === 'OFFICER' && activeTab !== 'schedules' && activeTab !== 'results' && activeTab !== 'teams' && activeTab !== 'map' && activeTab !== 'dashboard') {
      setActiveTab('schedules');
    } else if (selectedRole === 'ADMIN' && activeTab !== 'equipment' && activeTab !== 'reports' && activeTab !== 'map' && activeTab !== 'dashboard') {
      setActiveTab('equipment');
    }
  };

  const handleRequestRoleChange = (role: UserRole) => {
    if (role === currentRole) return;
    setTargetRoleToAuth(role);
    setIsRoleAuthModalOpen(true);
  };

  const handleRoleAuthSuccess = (newRole: UserRole) => {
    const sessionData = {
      role: newRole,
      authTime: Date.now()
    };
    localStorage.setItem('so_ic_role_auth_session', JSON.stringify(sessionData));
    setCurrentRole(newRole);
    // Switch active tab appropriately if current active tab is restricted
    if (newRole === 'SUPERVISOR' && activeTab !== 'schedules' && activeTab !== 'stores' && activeTab !== 'map' && activeTab !== 'dashboard') {
      setActiveTab('schedules');
    } else if (newRole === 'OFFICER' && activeTab !== 'schedules' && activeTab !== 'results' && activeTab !== 'teams' && activeTab !== 'map' && activeTab !== 'dashboard') {
      setActiveTab('schedules');
    } else if (newRole === 'ADMIN' && activeTab !== 'equipment' && activeTab !== 'reports' && activeTab !== 'settings' && activeTab !== 'map' && activeTab !== 'dashboard') {
      setActiveTab('equipment');
    }
  };

  // Modals
  const [isCreateScheduleModalOpen, setIsCreateScheduleModalOpen] = useState(false);
  const [isAutoGeneratorModalOpen, setIsAutoGeneratorModalOpen] = useState(false);
  const [isKorlapImageModalOpen, setIsKorlapImageModalOpen] = useState(false);
  const [assignPersonnelSchedule, setAssignPersonnelSchedule] = useState<SOSchedule | null>(null);
  const [gagalPindahSchedule, setGagalPindahSchedule] = useState<SOSchedule | null>(null);
  
  const [isInputResultModalOpen, setIsInputResultModalOpen] = useState(false);
  const [inputResultScheduleId, setInputResultScheduleId] = useState<string | null>(null);
  const [selectedResultDetail, setSelectedResultDetail] = useState<SOResult | null>(null);

  const storesRef = React.useRef(stores);
  storesRef.current = stores;

  const handleOpenInputResultModal = (scheduleOrId?: SOSchedule | string | null) => {
    if (typeof scheduleOrId === 'string') {
      setInputResultScheduleId(scheduleOrId);
    } else if (scheduleOrId && typeof scheduleOrId === 'object' && 'id' in scheduleOrId) {
      setInputResultScheduleId(scheduleOrId.id);
    } else {
      setInputResultScheduleId(null);
    }
    setIsInputResultModalOpen(true);
  };

  const [isAddStoreModalOpen, setIsAddStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [selectedStoreDetail, setSelectedStoreDetail] = useState<Store | null>(null);
  const [isImportStoresModalOpen, setIsImportStoresModalOpen] = useState(false);

  // Helper to sync schedule regions and korlap/officer with updated store regions & vice versa
  const syncScheduleRegionsWithStores = (currentSchedules: SOSchedule[], currentStores: Store[]): SOSchedule[] => {
    const storeMap = new Map<string, Store>();
    currentStores.forEach(st => {
      storeMap.set(st.id, st);
      if (st.code) storeMap.set(st.code, st);
    });

    let changed = false;
    const updatedSchedules = currentSchedules.map(sch => {
      const matchedStore = storeMap.get(sch.storeId) || storeMap.get(sch.storeCode);
      if (matchedStore) {
        let accurateRegion = matchedStore.region;
        const storeText = `${matchedStore.name || ''} ${matchedStore.code || ''} ${matchedStore.kabupaten || ''} ${matchedStore.city || ''}`.toUpperCase();
        
        if (storeText.includes('BADUNG') || storeText.includes('TUBAN') || storeText.includes('KUTA') || storeText.includes('JIMBARAN')) {
          accurateRegion = 'Kab. Badung';
        } else if (storeText.includes('DENPASAR') || storeText.includes('RENON') || storeText.includes('SANUR')) {
          accurateRegion = 'Kota Denpasar';
        } else if (storeText.includes('GIANYAR') || storeText.includes('UBUD')) {
          accurateRegion = 'Kab. Gianyar';
        } else if (storeText.includes('TABANAN')) {
          accurateRegion = 'Kab. Tabanan';
        } else if (storeText.includes('BULELENG')) {
          accurateRegion = 'Kab. Buleleng';
        } else if (storeText.includes('KARANGASEM')) {
          accurateRegion = 'Kab. Karangasem';
        } else if (storeText.includes('JEMBRANA')) {
          accurateRegion = 'Kab. Jembrana';
        } else if (storeText.includes('KLUNGKUNG')) {
          accurateRegion = 'Kab. Klungkung';
        } else if (storeText.includes('BANGLI')) {
          accurateRegion = 'Kab. Bangli';
        } else if (storeText.includes('MATARAM')) {
          accurateRegion = 'Kota Mataram & Lombok';
        }

        let targetOfficer = sch.officerInCharge;
        if (!targetOfficer || targetOfficer === 'Petugas SO') {
          if (matchedStore.korlap && matchedStore.korlap !== 'Petugas SO') {
            targetOfficer = normalizeKorlapName(matchedStore.korlap);
          } else {
            targetOfficer = 'I GEDE PASEK SANTIKA';
          }
        } else {
          targetOfficer = normalizeKorlapName(targetOfficer);
        }

        if (sch.region !== accurateRegion || sch.officerInCharge !== targetOfficer) {
          changed = true;
          return {
            ...sch,
            region: accurateRegion,
            officerInCharge: targetOfficer
          };
        }
      }
      return sch;
    });

    return changed ? updatedSchedules : currentSchedules;
  };

  // Helper to sync stores' korlap/officer with active schedule assignments
  const syncStoresWithSchedules = (currentStores: Store[], currentSchedules: SOSchedule[]): Store[] => {
    const scheduleOfficerMap = new Map<string, string>();
    currentSchedules.forEach(sch => {
      if (sch.officerInCharge && sch.officerInCharge !== 'Petugas SO') {
        const canonical = normalizeKorlapName(sch.officerInCharge);
        scheduleOfficerMap.set(sch.storeId, canonical);
        if (sch.storeCode) scheduleOfficerMap.set(sch.storeCode, canonical);
      }
    });

    let storeChanged = false;
    const updatedStores = currentStores.map(st => {
      const assignedOfficer = scheduleOfficerMap.get(st.id) || scheduleOfficerMap.get(st.code);
      const effectiveOfficer = normalizeKorlapName(assignedOfficer || st.korlap || 'I GEDE PASEK SANTIKA');
      if (st.korlap !== effectiveOfficer) {
        storeChanged = true;
        return {
          ...st,
          korlap: effectiveOfficer,
          managerName: effectiveOfficer
        };
      }
      return st;
    });

    return storeChanged ? updatedStores : currentStores;
  };

  // Initialize data and subscribe to Firestore & Cloudinary across devices
  useEffect(() => {
    const loadedStoresRaw = getStoredStores();
    const syncedStores = loadedStoresRaw.map(s => autoSyncStoreRegionAndKabupaten(s));
    
    const loadedSchedulesRaw = getStoredSchedules();
    const syncedSchedules = syncScheduleRegionsWithStores(loadedSchedulesRaw, syncedStores);
    const fullySyncedStores = syncStoresWithSchedules(syncedStores, syncedSchedules);
    const loadedResults = getStoredResults();
    const preservedApprovedStores = reconcileStoresWithExistingApprovals(fullySyncedStores, fullySyncedStores, syncedSchedules, loadedResults);

    const loadedTeams = getStoredTeams();
    const loadedPersonnel = getStoredPersonnel();
    const loadedOnCallPersonnel = getStoredOnCallPersonnel();
    const loadedEquipment = getStoredEquipment();
    const loadedRepairLogs = getStoredRepairLogs();
    const loadedDatasets = getStoredMasterTokoDatasets();
    const syncedDatasets = normalizeSingleActiveDataset(loadedDatasets.map(ds => ({
      ...ds,
      stores: (ds.stores || []).map(s => autoSyncStoreRegionAndKabupaten(s))
    })));
    if (syncedDatasets.length !== loadedDatasets.length) {
      saveMasterTokoDatasets(syncedDatasets, true);
    }

    setStores(preservedApprovedStores);
    setSchedules(syncedSchedules);
    setResults(loadedResults);
    setTeams(loadedTeams);
    setPersonnel(loadedPersonnel);
    setOnCallRecords(loadedOnCallPersonnel);
    setEquipment(loadedEquipment);
    setRepairLogs(loadedRepairLogs);
    setDatasets(syncedDatasets);

    const sanitizeEquipmentList = (list: any[]): SOEquipment[] => {
      if (!Array.isArray(list)) return [];
      const clean = list.filter(e => e && !isStoreEquipment(e) && !isCorruptedEquipmentRecord(e));
      const { deduplicated } = deduplicateEntityList('equipment', clean);
      return deduplicated;
    };

    // Helper to apply multi-device Cloudinary synced data
    const handleApplyCloudinarySynced = (synced: any) => {
      if (!synced) return;
      if (synced.stores && Array.isArray(synced.stores)) {
        const syncedStores = synced.stores.map((s: Store) => autoSyncStoreRegionAndKabupaten(s));
        setStores(syncedStores);
        setSchedules(prev => syncScheduleRegionsWithStores(prev, syncedStores));
      }
      if (synced.equipment && Array.isArray(synced.equipment)) setEquipment(sanitizeEquipmentList(synced.equipment));
      if (synced.personnel && Array.isArray(synced.personnel)) setPersonnel(synced.personnel);
      if (synced.onCallPersonnel && Array.isArray(synced.onCallPersonnel)) setOnCallRecords(synced.onCallPersonnel);
      if (synced.schedules && Array.isArray(synced.schedules)) {
        setSchedules(prev => syncScheduleRegionsWithStores(synced.schedules, storesRef.current));
      }
      if (synced.results && Array.isArray(synced.results)) setResults(synced.results);
      if (synced.teams && Array.isArray(synced.teams)) setTeams(synced.teams);
      if (synced.repairLogs && Array.isArray(synced.repairLogs)) setRepairLogs(synced.repairLogs);
      if (synced.datasets && Array.isArray(synced.datasets)) {
        setDatasets(normalizeSingleActiveDataset(synced.datasets));
      }
    };

    // Smart Hybrid background sync: Prioritize Firestore Database as Authoritative Truth
    const runFullCloudSync = async () => {
      // 1. First sync Cloudinary settings from Firestore so any device receives cloud credentials
      await syncCloudinaryConfigFromFirestore().catch(() => {});

      // 2. Sync from Firestore first (authoritative database across all devices)
      try {
        const fsSynced = await syncAllDataFromFirestore();
        if (fsSynced && Object.keys(fsSynced).length > 0) {
          handleApplyCloudinarySynced(fsSynced);
        }
      } catch (err) {
        console.warn('Firestore initial sync notice:', err);
      }

      // 3. Reconcile any pending Excel backup records in Firestore
      reconcilePendingExcelBackups().catch(() => {});

      // 4. Sync Google Spreadsheet configuration and trigger auto-sync only when needed
      syncSpreadsheetConfigFromFirestore()
        .then(gsheetConfig => {
          if (gsheetConfig?.autoSyncOnLoad && gsheetConfig.url && gsheetConfig.isActive !== false) {
            const lastSyncTime = gsheetConfig.lastSyncedAt ? new Date(gsheetConfig.lastSyncedAt).getTime() : 0;
            const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
            const storesEmpty = !storesRef.current || storesRef.current.length === 0;

            if (storesEmpty || lastSyncTime < fifteenMinutesAgo) {
              syncMasterStoresFromSpreadsheet(gsheetConfig.url, {
                preferredSheetName: gsheetConfig.sheetName || 'MASTER TOKO BALI'
              }).catch(err => console.warn('Background auto spreadsheet sync notice:', err));
            }
          }
        })
        .catch(() => {});

      // 5. Secondary fallback sync from Cloudinary CDN
      syncAllDataFromCloudinary()
        .then(cdnSynced => {
          if (cdnSynced && Object.keys(cdnSynced).length > 0) {
            handleApplyCloudinarySynced(cdnSynced);
          }
        })
        .catch(err => console.warn('Cloudinary background sync notice:', err));
    };

    // Run on initial load
    runFullCloudSync();

    // Enable real-time Firestore listeners across all portals
    const unsubFirestore = subscribeFirestoreData({
      onStores: (s) => {
        if (s && Array.isArray(s)) {
          const syncedStores = s.map(st => autoSyncStoreRegionAndKabupaten(st));
          setStores(syncedStores);
          setSchedules(prev => syncScheduleRegionsWithStores(prev, syncedStores));
        }
      },
      onDatasets: (ds) => {
        if (ds && Array.isArray(ds) && ds.length > 0) {
          setDatasets(ds);
        }
      },
      onSchedules: (sch) => {
        if (sch && Array.isArray(sch)) {
          setSchedules(syncScheduleRegionsWithStores(sch, storesRef.current));
        }
      },
      onResults: (res) => {
        if (res && Array.isArray(res) && res.length > 0) setResults(res);
      },
      onTeams: (tm) => {
        if (tm && Array.isArray(tm) && tm.length > 0) setTeams(tm);
      },
      onPersonnel: (p) => {
        if (p && Array.isArray(p) && p.length > 0) setPersonnel(p);
      },
      onEquipment: (eq) => {
        if (eq && Array.isArray(eq) && eq.length > 0) setEquipment(sanitizeEquipmentList(eq));
      },
      onRepairLogs: (rl) => {
        if (rl && Array.isArray(rl) && rl.length > 0) setRepairLogs(rl);
      }
    });

    // Periodic cloud reconciliation every 120s (2 minutes) to prevent background network congestion
    const syncInterval = setInterval(() => {
      runFullCloudSync();
    }, 120000);

    let lastFocusSync = 0;
    const handleWindowFocus = () => {
      const now = Date.now();
      // Throttle window focus sync to at most once every 60 seconds
      if (now - lastFocusSync > 60000) {
        lastFocusSync = now;
        runFullCloudSync();
      }
    };
    window.addEventListener('focus', handleWindowFocus);

    const handleDataUpdated = (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.storageKey || !detail.data) return;
      const key = detail.storageKey;
      const data = detail.data;
      if (key === STORAGE_KEYS.STORES) {
        const synced = (data as Store[]).map(s => autoSyncStoreRegionAndKabupaten(s));
        setStores(synced);
        setSchedules(prev => syncScheduleRegionsWithStores(prev, synced));
      } else if (key === STORAGE_KEYS.SCHEDULES) {
        setSchedules(syncScheduleRegionsWithStores(data as SOSchedule[], storesRef.current));
      } else if (key === STORAGE_KEYS.RESULTS) {
        setResults(data as SOResult[]);
      } else if (key === STORAGE_KEYS.TEAMS) {
        setTeams(data as SOTeam[]);
      } else if (key === STORAGE_KEYS.PERSONNEL) {
        setPersonnel(data as AuditorPersonnel[]);
      } else if (key === STORAGE_KEYS.EQUIPMENT) {
        setEquipment(sanitizeEquipmentList(data as SOEquipment[]));
      } else if (key === STORAGE_KEYS.REPAIR_LOGS) {
        setRepairLogs(data as EquipmentRepairLog[]);
      } else if (key === STORAGE_KEYS.ONCALL_PERSONNEL) {
        setOnCallRecords(data as OnCallPersonnelRecord[]);
      } else if (key === STORAGE_KEYS.MASTER_TOKO_DATASETS) {
        if (Array.isArray(data)) {
          const nonDeleted = data.filter(d => d && d.id && !isMasterDatasetDeleted(d));
          const { deduplicated } = deduplicateEntityList('master_toko_datasets', nonDeleted);
          const syncedDatasets = deduplicated.map(ds => ({
            ...ds,
            stores: (ds.stores || []).map(s => autoSyncStoreRegionAndKabupaten(s))
          }));
          setDatasets(normalizeSingleActiveDataset(syncedDatasets));
        }
      }
    };
    window.addEventListener('spv_data_updated', handleDataUpdated);

    return () => {
      unsubFirestore();
      clearInterval(syncInterval);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('spv_data_updated', handleDataUpdated);
    };
  }, []);

  // Filter schedules and results by selectedMonth, selectedYear, and selectedDate
  const filteredSchedules = schedules.filter(s => {
    if (!s.scheduledDate) return true;
    if (selectedDate !== 'ALL') {
      return s.scheduledDate === selectedDate;
    }
    const parts = s.scheduledDate.split('-');
    if (parts.length < 2) return true;
    const sYear = parts[0];
    const sMonth = parts[1];
    const matchMonth = selectedMonth === 'ALL' || sMonth === selectedMonth;
    const matchYear = selectedYear === 'ALL' || sYear === selectedYear;
    return matchMonth && matchYear;
  });

  const parseResultDate = (dateStr?: string) => {
    if (!dateStr) return { year: '', month: '', fullDate: '' };
    const clean = String(dateStr).trim().split('T')[0];
    const parts = clean.split(/[-/]/);
    if (parts.length >= 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        return {
          year: parts[0],
          month: parts[1].padStart(2, '0'),
          fullDate: `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
        };
      } else if (parts[2].length === 4) {
        // DD-MM-YYYY
        return {
          year: parts[2],
          month: parts[1].padStart(2, '0'),
          fullDate: `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
        };
      }
    }
    return { year: '', month: '', fullDate: clean };
  };

  const filteredResults = results.filter(r => {
    if (!r.soDate) return true;
    const { year, month, fullDate } = parseResultDate(r.soDate);
    if (selectedDate !== 'ALL') {
      return fullDate === selectedDate || r.soDate === selectedDate || r.soDate.includes(selectedDate);
    }
    const matchMonth = selectedMonth === 'ALL' || month === selectedMonth || r.soDate.includes(`-${selectedMonth}-`) || r.soDate.includes(`/${selectedMonth}/`);
    const matchYear = selectedYear === 'ALL' || year === selectedYear || r.soDate.includes(selectedYear);
    return matchMonth && matchYear;
  });

  // State for Target Toko Wajib SO criteria (Default: Type M & Q3 for September)
  const [targetSoTypes, setTargetSoTypes] = useState<string[]>(() => {
    const saved = localStorage.getItem('spv_target_so_types');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return ['M', 'Q3'];
  });

  const handleSetTargetSoTypes = (types: string[]) => {
    setTargetSoTypes(types);
    localStorage.setItem('spv_target_so_types', JSON.stringify(types));
  };

  // Summary calculated dynamically based on filtered period and target SO types, strictly isolated by active month & year
  const summary = getDashboardSummary(stores, filteredSchedules, filteredResults, targetSoTypes, filteredResults, selectedMonth, selectedYear);

  const purgeStaleSchedules = (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    ids.forEach(id => {
      recordDeletedId(STORAGE_KEYS.SCHEDULES, id);
      deleteScheduleFromFirestore(id).catch(() => {});
    });
  };

  // Handlers for Schedules
  const handleTwoWaySync = () => {
    const isValValid = (v?: any): boolean => {
      if (v === null || v === undefined) return false;
      const s = String(v).trim().toLowerCase();
      return s !== '' && s !== '-' && s !== '0' && s !== 'belum so' && s !== 'null' && s !== 'undefined';
    };

    let baseStores: Store[] = [...stores];
    const activeDs = datasets.find(d => d.isActiveForScheduling) || (datasets.length > 0 ? datasets[0] : null);
    
    if (activeDs && activeDs.stores && activeDs.stores.length > 0) {
      const mergedMap = new Map<string, Store>();

      // 1. Seed with active dataset stores (Master Source of Truth)
      activeDs.stores.forEach(s => {
        const key = (s.code || s.id || '').trim().toUpperCase();
        if (key) mergedMap.set(key, { ...s });
      });

      // 2. Merge with existing stores to retain runtime metadata & approval statuses
      stores.forEach(st => {
        const key = (st.code || st.id || '').trim().toUpperCase();
        if (!key) return;
        const fromDs = mergedMap.get(key);
        if (fromDs) {
          // Master dataset has priority for schedule dates and assigned korlap
          const validMasterSep = isValValid(fromDs.soSeptember) ? fromDs.soSeptember : (isValValid(st.soSeptember) ? st.soSeptember : fromDs.soSeptember);
          const validKorlap = (fromDs.korlap && fromDs.korlap !== 'Petugas SO') ? fromDs.korlap : (st.korlap || fromDs.korlap);

          mergedMap.set(key, {
            ...st,
            ...fromDs,
            soSeptember: validMasterSep,
            korlap: normalizeKorlapName(validKorlap) || validKorlap,
            managerName: normalizeKorlapName(validKorlap) || validKorlap,
            soAktiva: fromDs.soAktiva || st.soAktiva,
            saldoToko: fromDs.saldoToko || st.saldoToko,
            zona: fromDs.zona || st.zona,
            statusApproveSO: st.statusApproveSO || fromDs.statusApproveSO
          });
        } else {
          mergedMap.set(key, { ...st });
        }
      });

      baseStores = Array.from(mergedMap.values());
    }

    // Auto detect target month/year
    const detected = detectSmartMonthAndYear(datasets, baseStores);
    const targetMonth = (selectedMonth && selectedMonth !== 'ALL') ? selectedMonth : (detected.month || '09');
    const targetYear = (selectedYear && selectedYear !== 'ALL') ? selectedYear : (detected.year || '2026');

    const result = twoWaySyncStoresAndSchedules(baseStores, schedules, targetMonth, targetYear);
    const updatedStores = result.updatedStores;
    let updatedSchedules = result.updatedSchedules;

    // Critical Safety Guard: Never overwrite non-empty schedules with empty array!
    if (schedules.length > 0 && updatedSchedules.length === 0) {
      console.warn('[2-Way Sync] Warning: Resulting schedules were empty, retaining original schedules enriched.');
      updatedSchedules = schedules.map(sch => {
        const matchingStore = updatedStores.find(st => st.code === sch.storeCode || st.id === sch.storeId);
        return enrichScheduleWithMasterStore(sch, matchingStore);
      });
    }

    // If active dataset has extractedSchedules (from sheet JADWAL), merge missing ones and rich team/personil info
    if (activeDs?.extractedSchedules && activeDs.extractedSchedules.length > 0) {
      const schedMap = new Map<string, SOSchedule>();
      updatedSchedules.forEach(s => {
        const key = `${s.storeCode || s.storeId}-${s.scheduledDate}`;
        schedMap.set(key, s);
      });

      activeDs.extractedSchedules.forEach(ext => {
        const key = `${ext.storeCode || ext.storeId}-${ext.scheduledDate}`;
        if (!schedMap.has(key)) {
          schedMap.set(key, ext);
        } else {
          const cur = schedMap.get(key)!;
          schedMap.set(key, {
            ...cur,
            teamName: ext.teamName || cur.teamName,
            teamCategory: ext.teamCategory || cur.teamCategory,
            teamId: ext.teamId || cur.teamId,
            personilLeader: ext.personilLeader || cur.personilLeader,
            officerInCharge: ext.officerInCharge || cur.officerInCharge,
            groupName: ext.groupName || cur.groupName,
            dayName: ext.dayName || cur.dayName,
            stockRp: Number(ext.stockRp) > 0 ? Number(ext.stockRp) : cur.stockRp,
            kasToko: Number(ext.kasToko) > 0 ? Number(ext.kasToko) : cur.kasToko
          });
        }
      });

      updatedSchedules = Array.from(schedMap.values());
    }

    if (result.staleScheduleIdsToDelete && result.staleScheduleIdsToDelete.length > 0) {
      const activeIds = new Set(updatedSchedules.map(s => s.id));
      const realStaleIds = result.staleScheduleIdsToDelete.filter(id => !activeIds.has(id));
      if (realStaleIds.length > 0) {
        purgeStaleSchedules(realStaleIds);
      }
    }

    setStores(updatedStores);
    setSchedules(updatedSchedules);
    saveStores(updatedStores);
    saveSchedules(updatedSchedules, true);
  };

  const handleCreateSchedule = (newSched: Omit<SOSchedule, 'id' | 'createdAt'>) => {
    const created: SOSchedule = {
      ...newSched,
      id: `SCHED-${Date.now()}`,
      createdAt: new Date().toISOString().slice(0, 10)
    };
    
    // Enrich with Store Master data
    const targetStore = stores.find(st => st.id === created.storeId || st.code === created.storeCode);
    const enrichedSched = enrichScheduleWithMasterStore(created, targetStore);

    const updatedSchedules = [enrichedSched, ...schedules];
    setSchedules(updatedSchedules);
    saveSchedules(updatedSchedules);

    // Sync back to Master Toko Bali (SO September)
    if (targetStore) {
      const updatedStores = stores.map(st => {
        if (st.id === targetStore.id || st.code === targetStore.code) {
          const smartDate = formatSmartSODate(enrichedSched.scheduledDate);
          return {
            ...st,
            soSeptember: smartDate,
            tglSoApproved: enrichedSched.scheduledDate
          };
        }
        return st;
      });
      setStores(updatedStores);
      saveStores(updatedStores);
    }
  };

  const handleBatchCreateSchedules = (newSchedules: SOSchedule[]) => {
    const enrichedList = newSchedules.map(sched => {
      const targetStore = stores.find(st => st.id === sched.storeId || st.code === sched.storeCode);
      return enrichScheduleWithMasterStore(sched, targetStore);
    });

    const updated = [...enrichedList, ...schedules];
    setSchedules(updated);
    saveSchedules(updated);

    // Sync back to Master Toko Bali (SO September)
    const newStoreMap = new Map(newSchedules.map(s => [s.storeCode, s.scheduledDate]));
    const updatedStores = stores.map(st => {
      if (newStoreMap.has(st.code)) {
        const schedDate = newStoreMap.get(st.code)!;
        const smartDate = formatSmartSODate(schedDate);
        return {
          ...st,
          soSeptember: smartDate,
          tglSoApproved: schedDate
        };
      }
      return st;
    });
    setStores(updatedStores);
    saveStores(updatedStores);
  };

  const handleUpdateScheduleStatus = (scheduleId: string, status: SOSchedule['status']) => {
    const updated = schedules.map(s => s.id === scheduleId ? { ...s, status } : s);
    setSchedules(updated);
    saveSchedules(updated);
  };

  const handleUpdateSchedule = (updatedSchedule: SOSchedule) => {
    const updated = schedules.map(s => s.id === updatedSchedule.id ? updatedSchedule : s);
    setSchedules(updated);
    saveSchedules(updated);
  };

  const handleDeleteSchedule = (scheduleId: string) => {
    const targetSched = schedules.find(s => s.id === scheduleId);
    recordDeletedId(STORAGE_KEYS.SCHEDULES, scheduleId);
    trackDeletedId(STORAGE_KEYS.SCHEDULES, scheduleId);
    if (targetSched) {
      const canonicalId = getDeterministicScheduleId(targetSched);
      if (canonicalId) {
        recordDeletedId(STORAGE_KEYS.SCHEDULES, canonicalId);
        trackDeletedId(STORAGE_KEYS.SCHEDULES, canonicalId);
      }
    }
    deleteScheduleFromFirestore(scheduleId, targetSched).catch(() => {});
    const updated = schedules.filter(s => s.id !== scheduleId);
    setSchedules(updated);
    saveSchedules(updated, true);
  };

  const handleAssignPersonnelSave = (scheduleId: string, personnelIds: string[], personnelNames: string[]) => {
    const updated = schedules.map(s => {
      if (s.id === scheduleId) {
        return {
          ...s,
          assignedPersonnelIds: personnelIds,
          assignedPersonnelNames: personnelNames
        };
      }
      return s;
    });
    setSchedules(updated);
    saveSchedules(updated);
  };

  const handleGagalAtauPindahToko = (
    scheduleId: string,
    actionType: 'Gagal SO' | 'Pindah Toko',
    reason: string,
    replacementDetails?: { newStore: Store; newDate: string; newTime: string }
  ) => {
    const originalSched = schedules.find(s => s.id === scheduleId);
    if (!originalSched) return;

    let hasExistingDestSchedule = false;
    let replacementSched: SOSchedule | null = null;

    if (actionType === 'Pindah Toko' && replacementDetails) {
      hasExistingDestSchedule = schedules.some(
        s => (s.storeCode === replacementDetails.newStore.code || s.storeId === replacementDetails.newStore.id) && s.id !== scheduleId
      );

      if (!hasExistingDestSchedule) {
        replacementSched = {
          id: `SCHED-REPLACE-${Date.now()}`,
          storeId: replacementDetails.newStore.id,
          storeCode: replacementDetails.newStore.code,
          storeName: replacementDetails.newStore.name,
          region: replacementDetails.newStore.region || replacementDetails.newStore.kabupaten || originalSched.region,
          scheduledDate: replacementDetails.newDate,
          scheduledTime: replacementDetails.newTime,
          teamId: originalSched.teamId,
          teamName: originalSched.teamName,
          teamCategory: originalSched.teamCategory,
          spvInCharge: originalSched.spvInCharge,
          officerInCharge: originalSched.officerInCharge,
          groupName: originalSched.groupName,
          stockRp: replacementDetails.newStore.saldoToko || 0,
          kasToko: replacementDetails.newStore.kasToko || 0,
          typeSo: replacementDetails.newStore.typeSo || replacementDetails.newStore.qm || 'M',
          zona: replacementDetails.newStore.zona || (replacementDetails.newStore.isZonaHitam ? 'ZONA HITAM' : 'NON ZONA HITAM'),
          asInitial: replacementDetails.newStore.as || '',
          status: 'Terjadwal',
          spvApprovalStatus: 'Menunggu Approval SPV',
          targetSKUCount: replacementDetails.newStore.totalSKUCount || 1000,
          notes: `Jadwal Pengganti dari pindah toko ${originalSched.storeCode} (${originalSched.storeName}). Alasan: ${reason}`,
          createdAt: new Date().toISOString().slice(0, 10)
        };
      }
    }

    const updated = schedules.map(s => {
      // 1. Original schedule that failed or moved
      if (s.id === scheduleId) {
        return {
          ...s,
          status: actionType,
          spvApprovalStatus: 'Menunggu Approval SPV' as const,
          failureOrMoveType: actionType,
          failureOrMoveReason: reason,
          replacementStoreCode: replacementDetails?.newStore.code,
          replacementStoreName: replacementDetails?.newStore.name,
          notes: actionType === 'Gagal SO' 
            ? `Laporan Gagal SO: ${reason}` 
            : `Pindah Toko ke ${replacementDetails?.newStore.code} (${replacementDetails?.newStore.name}). Alasan: ${reason}`
        };
      }

      // 2. If destination store already had a schedule in the list, synchronize it
      if (
        actionType === 'Pindah Toko' && 
        replacementDetails && 
        (s.storeCode === replacementDetails.newStore.code || s.storeId === replacementDetails.newStore.id)
      ) {
        return {
          ...s,
          scheduledDate: replacementDetails.newDate,
          scheduledTime: replacementDetails.newTime,
          officerInCharge: originalSched.officerInCharge || s.officerInCharge,
          groupName: originalSched.groupName || s.groupName,
          notes: `Jadwal Pengganti dari pindah toko ${originalSched.storeCode} (${originalSched.storeName}). Alasan: ${reason}`
        };
      }

      return s;
    });

    const finalSchedules = replacementSched ? [replacementSched, ...updated] : updated;
    setSchedules(finalSchedules);
    saveSchedules(finalSchedules);

    // Synchronize Master Stores (Master Toko Bali)
    const updatedStores = stores.map(st => {
      // 1. If this is the original store that failed / moved:
      // Active month date becomes BLANK, status is Belum SO, and Keterangan is populated
      if (st.code === originalSched.storeCode || st.id === originalSched.storeId) {
        const copy = { ...st };
        copy.soSeptember = ''; // Blank scheduled date for active month
        copy.tglSoApproved = undefined;
        copy.statusApproveSO = 'Belum SO';
        if (actionType === 'Gagal SO') {
          copy.keterangan = `Gagal SO: ${reason || 'Kondisi Toko Belum Siap'}`;
        } else {
          copy.keterangan = `Pindah Toko ke [${replacementDetails?.newStore.code}] ${replacementDetails?.newStore.name} - Alasan: ${reason || 'Perubahan Jadwal'}`;
        }
        copy.frekuensiTidakSO = calculateStoreFrekuensiTidakSO(copy, '09');
        return copy;
      }

      // 2. If this is the destination / replacement store:
      // Synchronize date into active month column, whether it was blank or previously scheduled
      if (actionType === 'Pindah Toko' && replacementDetails && (st.code === replacementDetails.newStore.code || st.id === replacementDetails.newStore.id)) {
        const copy = { ...st };
        const smartDate = formatSmartSODate(replacementDetails.newDate);
        copy.soSeptember = smartDate;
        copy.tglSoApproved = replacementDetails.newDate;
        copy.keterangan = `Jadwal Pengganti dari [${originalSched.storeCode}] ${originalSched.storeName} - Alasan: ${reason}`;
        if (originalSched.officerInCharge && originalSched.officerInCharge !== 'Petugas SO') {
          copy.korlap = originalSched.officerInCharge.split(' (')[0];
        }
        copy.frekuensiTidakSO = calculateStoreFrekuensiTidakSO(copy, '09');
        return copy;
      }

      return st;
    });

    setStores(updatedStores);
    saveStores(updatedStores);
  };

  const handleConfirmScheduleFinished = (scheduleId: string) => {
    const updated = schedules.map(s => {
      if (s.id === scheduleId) {
        return { ...s, status: 'Selesai' as const, spvApprovalStatus: 'Menunggu Approval SPV' as const };
      }
      return s;
    });
    setSchedules(updated);
    saveSchedules(updated);
  };

  const handleApproveSchedule = (scheduleId: string) => {
    const targetSched = schedules.find(s => s.id === scheduleId);
    const updated = schedules.map(s => {
      if (s.id === scheduleId) {
        return {
          ...s,
          spvApprovalStatus: 'Disetujui' as const
        };
      }
      return s;
    });
    setSchedules(updated);
    saveSchedules(updated);

    if (targetSched) {
      // 1. If schedule was Gagal SO or Pindah Toko:
      // Approval marks the report as approved by SPV, but does NOT mark failed/moved store as "Sudah Approve SO"
      if (targetSched.status === 'Gagal SO' || targetSched.status === 'Pindah Toko') {
        // Nothing to auto-fill as completed date for failed store
      } else {
        // 2. Normal / Selesai schedule: update matching store master with Approved SO date & auto-fill active month column
        const approvedDateStr = targetSched.scheduledDate;
        const updatedStores = stores.map(st => {
          if (
            st.code === targetSched.storeCode || 
            st.id === targetSched.storeId || 
            (st.name && targetSched.storeName && st.name.toLowerCase() === targetSched.storeName.toLowerCase())
          ) {
            return autoSyncStoreWithApprovedSchedule(st, approvedDateStr);
          }
          return st;
        });
        setStores(updatedStores);
        saveStores(updatedStores);
      }

      // 3. Update results if any exist
      const updatedResults = results.map(r => {
        if (r.scheduleId === scheduleId || r.storeCode === targetSched.storeCode) {
          return { ...r, approvalStatus: 'Disetujui' as const, approvedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) };
        }
        return r;
      });
      setResults(updatedResults);
      saveResults(updatedResults);
    }
  };

  const handleRejectSchedule = (scheduleId: string, reason?: string) => {
    const updated = schedules.map(s => {
      if (s.id === scheduleId) {
        if (s.status === 'Pindah Toko' || s.status === 'Gagal SO') {
          return {
            ...s,
            status: 'Terjadwal' as const,
            spvApprovalStatus: 'Ditolak' as const,
            notes: `${s.notes || ''} [Ditolak SPV: Mohon lakukan SO sesuai jadwal]`
          };
        } else {
          return {
            ...s,
            status: 'Proses SO' as const,
            spvApprovalStatus: 'Perlu Audit Ulang' as const,
            notes: `${s.notes || ''} [Audit Ulang SPV: ${reason || 'Mohon cek ulang fisik & rekapan'}]`
          };
        }
      }
      return s;
    });
    setSchedules(updated);
    saveSchedules(updated);
  };

  // Handlers for Results
  const handleCreateResult = (newResult: Omit<SOResult, 'id' | 'submittedAt'>) => {
    const created: SOResult = {
      ...newResult,
      id: `RESULT-${Date.now()}`,
      approvalStatus: newResult.approvalStatus || 'Menunggu Approval SPV',
      submittedAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };
    const updatedResults = [created, ...results];
    setResults(updatedResults);
    saveResults(updatedResults);

    // Update corresponding schedule status to 'Selesai' and spvApprovalStatus to 'Menunggu Approval SPV'
    const updatedSchedules = schedules.map(s => 
      (s.id === newResult.scheduleId || s.storeCode === newResult.storeCode)
        ? { ...s, status: 'Selesai' as const, spvApprovalStatus: 'Menunggu Approval SPV' as const }
        : s
    );
    setSchedules(updatedSchedules);
    saveSchedules(updatedSchedules);

    // Update store's last SODate, Accuracy Rate & set statusApproveSO to 'Belum Terapprove'
    const updatedStores = stores.map(st => 
      (st.id === newResult.storeId || st.code === newResult.storeCode) ? {
        ...st,
        statusApproveSO: 'Belum Terapprove' as const,
        lastSODate: newResult.soDate,
        lastAccuracyRate: newResult.accuracyRatePercentage
      } : st
    );
    setStores(updatedStores);
    saveStores(updatedStores);
  };

  const handleApproveResult = (resultId: string) => {
    const targetResult = results.find(r => r.id === resultId);
    const approvedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const updatedResults = results.map(r => r.id === resultId ? {
      ...r,
      approvalStatus: 'Disetujui' as const,
      approvedAt,
      spvApprover: 'Gean Pratama (SPV SO)'
    } : r);
    setResults(updatedResults);
    saveResults(updatedResults);

    if (targetResult) {
      // 1. Sync matching schedule
      const updatedSchedules = schedules.map(s => {
        if (s.id === targetResult.scheduleId || s.storeCode === targetResult.storeCode) {
          return {
            ...s,
            status: 'Selesai' as const,
            spvApprovalStatus: 'Disetujui' as const
          };
        }
        return s;
      });
      setSchedules(updatedSchedules);
      saveSchedules(updatedSchedules);

      // 2. Sync matching store
      const updatedStores = stores.map(st => {
        if (st.id === targetResult.storeId || st.code === targetResult.storeCode) {
          return {
            ...st,
            statusApproveSO: 'Sudah Approve' as const,
            tglSoApproved: targetResult.soDate || approvedAt.slice(0, 10),
            spvApprover: 'Gean Pratama (SPV SO)',
            lastSODate: targetResult.soDate || approvedAt.slice(0, 10),
            lastAccuracyRate: targetResult.accuracyRatePercentage
          };
        }
        return st;
      });
      setStores(updatedStores);
      saveStores(updatedStores);
    }
  };

  const handleRequestRecount = (resultId: string) => {
    const targetResult = results.find(r => r.id === resultId);
    const updatedResults = results.map(r => r.id === resultId ? {
      ...r,
      approvalStatus: 'Perlu Audit Ulang' as const
    } : r);
    setResults(updatedResults);
    saveResults(updatedResults);

    if (targetResult) {
      const updatedSchedules = schedules.map(s => {
        if (s.id === targetResult.scheduleId || s.storeCode === targetResult.storeCode) {
          return {
            ...s,
            status: 'Proses SO' as const,
            spvApprovalStatus: 'Menunggu Approval SPV' as const
          };
        }
        return s;
      });
      setSchedules(updatedSchedules);
      saveSchedules(updatedSchedules);

      const updatedStores = stores.map(st => {
        if (st.id === targetResult.storeId || st.code === targetResult.storeCode) {
          return {
            ...st,
            statusApproveSO: 'Belum Terapprove' as const
          };
        }
        return st;
      });
      setStores(updatedStores);
      saveStores(updatedStores);
    }
  };

  // Handlers for Stores
  const handleSaveStore = (store: Store) => {
    const exists = stores.some(s => s.id === store.id);
    let updated: Store[];
    if (exists) {
      updated = stores.map(s => s.id === store.id ? store : s);
    } else {
      updated = [store, ...stores];
    }
    setStores(updated);
    saveStores(updated);
  };

  const handleImportBulkStores = (newStores: Store[], mode: 'replace' | 'merge' = 'replace') => {
    // Index existing genuine approved results to ensure SPV approvals are preserved
    const approvedResultsMap = new Map<string, SOResult>();
    results.forEach(r => {
      if (r.approvalStatus === 'Disetujui') {
        if (r.storeCode) approvedResultsMap.set(r.storeCode.trim().toUpperCase(), r);
        if (r.storeId) approvedResultsMap.set(r.storeId, r);
      }
    });

    let baseStores: Store[];
    if (mode === 'replace') {
      clearAllDeletedIds(STORAGE_KEYS.STORES);
      baseStores = newStores;
    } else {
      const existingMap = new Map<string, Store>(stores.map(s => [s.code?.trim().toUpperCase() || s.id, s]));
      newStores.forEach(s => {
        existingMap.set(s.code?.trim().toUpperCase() || s.id, s);
      });
      baseStores = Array.from(existingMap.values());
    }

    // Preserve approved status ONLY if:
    // a) Incoming store explicitly says 'Sudah Approve', OR
    // b) There is a genuine approved audit result in the system
    const updated = baseStores.map(store => {
      const key = store.code?.trim().toUpperCase() || store.id;
      const approvedResult = approvedResultsMap.get(key);

      const hasGenuineApproval = store.statusApproveSO === 'Sudah Approve' || !!approvedResult;

      return {
        ...store,
        statusApproveSO: hasGenuineApproval ? ('Sudah Approve' as const) : (store.statusApproveSO || 'Belum SO'),
        tglSoApproved: hasGenuineApproval ? (store.tglSoApproved || approvedResult?.soDate || approvedResult?.approvedAt) : undefined,
        spvApprover: hasGenuineApproval ? (store.spvApprover || approvedResult?.spvApprover || 'Gean Pratama (SPV SO)') : undefined,
        lastSODate: store.lastSODate || approvedResult?.soDate,
        lastAccuracyRate: store.lastAccuracyRate !== undefined ? store.lastAccuracyRate : approvedResult?.accuracyRatePercentage
      };
    });

    const synced = updated.map(s => autoSyncStoreRegionAndKabupaten(s));
    setStores(synced);
    saveStores(synced, mode === 'replace');

    // Smart month detection from imported stores
    const detected = detectSmartMonthAndYear(datasets, synced);
    setSelectedMonth(detected.month);
    setSelectedYear(detected.year);

    // Smart auto-synchronize schedules from Master Store SO dates
    const { updatedSchedules, staleScheduleIdsToDelete } = syncSchedulesFromMasterStores(
      synced, 
      schedules, 
      detected.month, 
      detected.year,
      { isReplaceMode: mode === 'replace', results }
    );
    purgeStaleSchedules(staleScheduleIdsToDelete);
    setSchedules(updatedSchedules);
    saveSchedules(updatedSchedules, mode === 'replace');
  };

  const handleBulkUpdateStores = (updatedStores: Store[]) => {
    const synced = updatedStores.map(s => autoSyncStoreRegionAndKabupaten(s));
    setStores(synced);
    saveStores(synced);

    const updatedSchedules = syncScheduleRegionsWithStores(schedules, synced);
    if (updatedSchedules !== schedules) {
      setSchedules(updatedSchedules);
      saveSchedules(updatedSchedules);
    }
  };

  const handleDeleteStore = (storeId: string) => {
    const targetStore = stores.find(s => s.id === storeId);
    recordDeletedId(STORAGE_KEYS.STORES, storeId);
    deleteStoreFromFirestore(storeId).catch(() => {});
    const updatedStores = stores.filter(s => s.id !== storeId);
    setStores(updatedStores);
    saveStores(updatedStores);

    // Also remove unapproved schedule for this deleted store
    const storeCodeUpper = targetStore?.code?.trim().toUpperCase();
    const updatedSchedules = schedules.filter(s => {
      const isTarget = s.storeId === storeId || (storeCodeUpper && s.storeCode?.trim().toUpperCase() === storeCodeUpper);
      if (!isTarget) return true;
      return s.spvApprovalStatus === 'Disetujui' || results.some(r => r.approvalStatus === 'Disetujui' && (r.storeId === storeId || (storeCodeUpper && r.storeCode?.trim().toUpperCase() === storeCodeUpper)));
    });
    if (updatedSchedules.length !== schedules.length) {
      setSchedules(updatedSchedules);
      saveSchedules(updatedSchedules, true);
    }
  };

  const handleResetMasterStores = async (options?: { preserveSchedules?: boolean }) => {
    // 1. Wipe master stores, datasets and schedules cleanly like total reset,
    // while STRICTLY preserving personnel, equipment/WDCP, repair logs, uniforms, and on-call records!
    await resetMasterAndSchedulesCleanly({
      resetStores: true,
      resetSchedules: options?.preserveSchedules ? false : true
    });
    setStores([]);
    setDatasets([]);
    if (!options?.preserveSchedules) {
      setSchedules([]);
    }
  };

  const handleResetSchedulesOnly = async () => {
    await resetSchedulesOnlyCleanly();
    setSchedules([]);
  };

  // Handlers for Personnel
  const handleAddPersonnel = (newP: Omit<AuditorPersonnel, 'id'>) => {
    const nowIso = new Date().toISOString();
    const created: AuditorPersonnel = {
      ...newP,
      id: `PERS-${Date.now()}`,
      createdAt: (newP as any).createdAt || nowIso,
      updatedAt: nowIso
    } as AuditorPersonnel;
    const updated = [created, ...personnel];
    setPersonnel(updated);
    savePersonnel(updated);
  };

  const handleBatchImportPersonnel = (importedPersonnel: AuditorPersonnel[], mode: 'replace' | 'merge' = 'replace') => {
    const nowIso = new Date().toISOString();
    const stamped = importedPersonnel.map(p => ({
      ...p,
      createdAt: (p as any).createdAt || nowIso,
      updatedAt: nowIso
    }));
    let updated: AuditorPersonnel[];
    if (mode === 'replace') {
      clearAllDeletedIds(STORAGE_KEYS.PERSONNEL);
      updated = stamped;
    } else {
      const existingMap = new Map<string, AuditorPersonnel>(personnel.map(p => [p.nik || p.id, p]));
      stamped.forEach(p => {
        existingMap.set(p.nik || p.id, p);
      });
      updated = Array.from(existingMap.values());
    }
    setPersonnel(updated);
    savePersonnel(updated, mode === 'replace');
  };

  const handleUpdatePersonnel = (updatedP: AuditorPersonnel) => {
    const nowIso = new Date().toISOString();
    const stamped: AuditorPersonnel = {
      ...updatedP,
      updatedAt: nowIso
    };
    const updated = personnel.map(p => p.id === stamped.id ? stamped : p);
    setPersonnel(updated);
    savePersonnel(updated);
  };

  const handleDeletePersonnel = (id: string) => {
    recordDeletedId(STORAGE_KEYS.PERSONNEL, id);
    deletePersonnelFromFirestore(id).catch(() => {});
    const updated = personnel.filter(p => p.id !== id);
    setPersonnel(updated);
    savePersonnel(updated);
  };

  // Handlers for Equipment
  const handleAddEquipment = (newE: Omit<SOEquipment, 'id'>) => {
    const nowIso = new Date().toISOString();
    const created: SOEquipment = {
      ...newE,
      id: `EQ-${Date.now()}`,
      createdAt: (newE as any).createdAt || nowIso,
      updatedAt: nowIso
    } as SOEquipment;
    const updated = [created, ...equipment];
    setEquipment(updated);
    saveEquipment(updated);
  };

  const handleUpdateEquipment = (updatedE: SOEquipment) => {
    const nowIso = new Date().toISOString();
    const stamped: SOEquipment = {
      ...updatedE,
      updatedAt: nowIso
    };
    const updated = equipment.map(e => e.id === stamped.id ? stamped : e);
    setEquipment(updated);
    saveEquipment(updated);
  };

  const handleDeleteEquipment = (id: string) => {
    recordDeletedId(STORAGE_KEYS.EQUIPMENT, id);
    deleteEquipmentFromFirestore(id).catch(() => {});
    const updated = equipment.filter(e => e.id !== id);
    setEquipment(updated);
    saveEquipment(updated);
  };

  // Handlers for Repair Logs
  const handleAddRepairLog = (newLog: Omit<EquipmentRepairLog, 'id'>) => {
    const nowIso = new Date().toISOString();
    const created: EquipmentRepairLog = {
      ...newLog,
      id: `REP-${Date.now()}`,
      createdAt: (newLog as any).createdAt || nowIso,
      updatedAt: nowIso
    } as EquipmentRepairLog;
    const updated = [created, ...repairLogs];
    setRepairLogs(updated);
    saveRepairLogs(updated);
  };

  const handleUpdateRepairLog = (updatedLog: EquipmentRepairLog) => {
    const nowIso = new Date().toISOString();
    const stamped: EquipmentRepairLog = {
      ...updatedLog,
      updatedAt: nowIso
    } as EquipmentRepairLog;
    const updated = repairLogs.map(r => r.id === stamped.id ? stamped : r);
    setRepairLogs(updated);
    saveRepairLogs(updated);
  };

  const handleDeleteRepairLog = (id: string) => {
    recordDeletedId(STORAGE_KEYS.REPAIR_LOGS, id);
    deleteRepairLogFromFirestore(id).catch(() => {});
    const updated = repairLogs.filter(r => r.id !== id);
    setRepairLogs(updated);
    saveRepairLogs(updated);
  };

  // Export Stores CSV Handler
  const handleExportStores = () => {
    const data = stores.map(s => {
      const approvalStatus = getStoreSOApprovalStatus(s, schedules, results);
      return {
        'KD TOKO': s.code,
        'NAMA TOKO': s.name,
        'KOORDINAT': s.koordinat || (s.latitude && s.longitude ? `${s.latitude}, ${s.longitude}` : ''),
        'SALDO TOKO': typeof s.saldoToko === 'number' ? s.saldoToko : s.saldoToko || 0,
        'AM': s.am || '',
        'AS': s.as || '',
        'WILAYAH': s.region || s.kabupaten || s.city || 'BALI',
        'KABUPATEN': s.kabupaten || s.city || '',
        'KECAMATAN': s.kecamatan || s.district || '',
        'COVERAGE': s.coverage || 'DC',
        'TYPE SO': s.typeSo || s.qm || 'M',
        'SO MEI 26': formatSmartSODate(s.tglSoMei) || '',
        'SO JUNI 26': formatSmartSODate(s.tglSoJuni) || '',
        'SO JULI 26': formatSmartSODate(s.tglSoJuli) || '',
        'SO AGUSTUS 26': formatSmartSODate(s.soAgustus) || '',
        'SO SEPTEMBER 26': formatSmartSODate(s.soSeptember) || '',
        'STATUS APPROVE SO': approvalStatus,
        'TGL SO APPROVED (SPV)': formatSmartSODate(s.tglSoApproved) || '',
        'FREKUENSI TIDAK SO': s.frekuensiTidakSO !== undefined ? s.frekuensiTidakSO : calculateStoreFrekuensiTidakSO(s, '09'),
        'KETERANGAN': s.keterangan || '',
        'ZONA': s.zona || (s.isZonaHitam ? 'ZONA HITAM' : 'NON ZONA HITAM'),
        'SO AKTIVA': s.soAktiva || 'Tidak',
        'KORLAP': s.korlap || s.managerName || '',
        'KLASIFIKASI KRITERIA': s.smartClassification || 'Toko Ritel Standard'
      };
    });
    exportToCSV('Master_Toko_Bali_Approved.csv', data);
  };

  // Reset / Clear Data
  const handleResetData = async (options?: { forceWipeCloudinary?: boolean }) => {
    const data = await clearAllData(options);
    setStores([]);
    setSchedules([]);
    setResults([]);
    setTeams([]);
    setPersonnel([]);
    setEquipment([]);
    setRepairLogs([]);
    setOnCallRecords([]);
    setDatasets([]);

    const now = new Date();
    setSelectedMonth(String(now.getMonth() + 1).padStart(2, '0'));
    setSelectedYear(String(now.getFullYear()));
    setSelectedDate('ALL');
  };

  const handleRestoreData = (data: { stores: Store[]; schedules: SOSchedule[]; results: SOResult[]; teams: SOTeam[] }) => {
    setStores(data.stores);
    setSchedules(data.schedules);
    setResults(data.results);
    setTeams(data.teams);
    saveStores(data.stores);
    saveSchedules(data.schedules);
    saveResults(data.results);
  };

  const handleUploadDataset = (newDataset: MasterTokoDataset) => {
    untrackDeletedMasterDataset(newDataset);
    let updated = [newDataset, ...datasets];
    if (newDataset.isActiveForScheduling || datasets.length === 0) {
      updated = updated.map(d => ({ ...d, isActiveForScheduling: d.id === newDataset.id }));
    }
    const { deduplicated } = deduplicateEntityList('master_toko_datasets', updated);
    const normalized = normalizeSingleActiveDataset(deduplicated);
    setDatasets(normalized);
    saveMasterTokoDatasets(normalized, true);
    saveMasterDatasetToFirestore(newDataset).catch(() => {});

    const activeDs = normalized.find(d => d.isActiveForScheduling) || (newDataset.isActiveForScheduling ? newDataset : null);
    if (activeDs && activeDs.stores.length > 0) {
      clearAllDeletedIds(STORAGE_KEYS.STORES);
      const syncedWithGeo = activeDs.stores.map(s => autoSyncStoreRegionAndKabupaten(s));
      // Reconcile and preserve SPV approval status for stores already approved in schedules or audit results
      const synced = reconcileStoresWithExistingApprovals(syncedWithGeo, stores, schedules, results);
      setStores(synced);
      saveStores(synced, true);

      // Smart month detection from active dataset
      const detected = detectSmartMonthAndYear([activeDs], synced);
      setSelectedMonth(detected.month);
      setSelectedYear(detected.year);

      // Smart auto-synchronize schedules from Master Store SO dates with replace mode
      let { updatedSchedules, staleScheduleIdsToDelete } = syncSchedulesFromMasterStores(
        synced, 
        schedules, 
        detected.month, 
        detected.year, 
        { isReplaceMode: true, results }
      );

      if (activeDs.extractedSchedules && activeDs.extractedSchedules.length > 0) {
        const schedMap = new Map<string, SOSchedule>();
        updatedSchedules.forEach(s => schedMap.set(`${s.storeCode || s.storeId}-${s.scheduledDate}`, s));
        activeDs.extractedSchedules.forEach(ext => {
          const key = `${ext.storeCode || ext.storeId}-${ext.scheduledDate}`;
          if (!schedMap.has(key)) {
            schedMap.set(key, ext);
          } else {
            const cur = schedMap.get(key)!;
            schedMap.set(key, {
              ...cur,
              teamName: ext.teamName || cur.teamName,
              teamCategory: ext.teamCategory || cur.teamCategory,
              teamId: ext.teamId || cur.teamId,
              personilLeader: ext.personilLeader || cur.personilLeader,
              officerInCharge: ext.officerInCharge || cur.officerInCharge,
              groupName: ext.groupName || cur.groupName,
              dayName: ext.dayName || cur.dayName,
              stockRp: Number(ext.stockRp) > 0 ? Number(ext.stockRp) : cur.stockRp,
              kasToko: Number(ext.kasToko) > 0 ? Number(ext.kasToko) : cur.kasToko
            });
          }
        });
        updatedSchedules = Array.from(schedMap.values());
      }

      purgeStaleSchedules(staleScheduleIdsToDelete);
      setSchedules(updatedSchedules);
      saveSchedules(updatedSchedules, true);
    }
  };

  const handleActivateDatasetForScheduling = (datasetId: string) => {
    const target = datasets.find(d => d.id === datasetId);
    if (!target) return;

    const updated = datasets.map(d => ({
      ...d,
      isActiveForScheduling: d.id === datasetId
    }));
    const normalized = normalizeSingleActiveDataset(updated);
    setDatasets(normalized);
    saveMasterTokoDatasets(normalized, true);

    if (target.stores.length > 0) {
      clearAllDeletedIds(STORAGE_KEYS.STORES);
      const syncedWithGeo = target.stores.map(s => autoSyncStoreRegionAndKabupaten(s));
      // Reconcile and preserve SPV approval status for stores already approved in schedules or audit results
      const synced = reconcileStoresWithExistingApprovals(syncedWithGeo, stores, schedules, results);
      setStores(synced);
      saveStores(synced, true);

      // Smart month detection from activated dataset
      const detected = detectSmartMonthAndYear([target], synced);
      setSelectedMonth(detected.month);
      setSelectedYear(detected.year);

      // Smart auto-synchronize schedules from Master Store SO dates with replace mode
      let { updatedSchedules, staleScheduleIdsToDelete } = syncSchedulesFromMasterStores(
        synced, 
        schedules, 
        detected.month, 
        detected.year, 
        { isReplaceMode: true, results }
      );

      if (target.extractedSchedules && target.extractedSchedules.length > 0) {
        const schedMap = new Map<string, SOSchedule>();
        updatedSchedules.forEach(s => schedMap.set(`${s.storeCode || s.storeId}-${s.scheduledDate}`, s));
        target.extractedSchedules.forEach(ext => {
          const key = `${ext.storeCode || ext.storeId}-${ext.scheduledDate}`;
          if (!schedMap.has(key)) {
            schedMap.set(key, ext);
          } else {
            const cur = schedMap.get(key)!;
            schedMap.set(key, {
              ...cur,
              teamName: ext.teamName || cur.teamName,
              teamCategory: ext.teamCategory || cur.teamCategory,
              teamId: ext.teamId || cur.teamId,
              personilLeader: ext.personilLeader || cur.personilLeader,
              officerInCharge: ext.officerInCharge || cur.officerInCharge,
              groupName: ext.groupName || cur.groupName,
              dayName: ext.dayName || cur.dayName,
              stockRp: Number(ext.stockRp) > 0 ? Number(ext.stockRp) : cur.stockRp,
              kasToko: Number(ext.kasToko) > 0 ? Number(ext.kasToko) : cur.kasToko
            });
          }
        });
        updatedSchedules = Array.from(schedMap.values());
      }

      purgeStaleSchedules(staleScheduleIdsToDelete);
      setSchedules(updatedSchedules);
      saveSchedules(updatedSchedules, true);
    }
  };

  const handleDeleteDataset = (datasetId: string, passedDataset?: MasterTokoDataset) => {
    const targetToDelete = passedDataset || datasets.find(d => d.id === datasetId);
    if (targetToDelete) {
      trackDeletedMasterDataset(targetToDelete);
    }
    recordDeletedId(STORAGE_KEYS.MASTER_TOKO_DATASETS, datasetId);
    trackDeletedId(STORAGE_KEYS.MASTER_TOKO_DATASETS, datasetId);
    deleteMasterDatasetFromFirestore(datasetId).catch(() => {});

    const updated = datasets.filter(d => {
      if (d.id === datasetId) return false;
      if (isMasterDatasetDeleted(d)) return false;
      return true;
    });

    const normalized = normalizeSingleActiveDataset(updated);
    setDatasets(normalized);
    saveMasterTokoDatasets(normalized, true);

    // If active dataset was deleted, update stores to new active dataset or cleanly reset
    if (targetToDelete?.isActiveForScheduling) {
      const newActive = normalized.find(d => d.isActiveForScheduling);
      if (newActive && newActive.stores && newActive.stores.length > 0) {
        clearAllDeletedIds(STORAGE_KEYS.STORES);
        const syncedWithGeo = newActive.stores.map(s => autoSyncStoreRegionAndKabupaten(s));
        const synced = reconcileStoresWithExistingApprovals(syncedWithGeo, [], schedules, results);
        setStores(synced);
        saveStores(synced, true);

        const detected = detectSmartMonthAndYear([newActive], synced);
        setSelectedMonth(detected.month);
        setSelectedYear(detected.year);

        const { updatedSchedules, staleScheduleIdsToDelete } = syncSchedulesFromMasterStores(
          synced, 
          schedules, 
          detected.month, 
          detected.year, 
          { isReplaceMode: true, results }
        );
        purgeStaleSchedules(staleScheduleIdsToDelete);
        setSchedules(updatedSchedules);
        saveSchedules(updatedSchedules, true);
      } else {
        // No active dataset remaining: cleanly empty stores and unapproved schedules
        setStores([]);
        saveStores([], true);
        clearAllDeletedIds(STORAGE_KEYS.STORES);

        const approvedOnlySchedules = schedules.filter(s => 
          s.spvApprovalStatus === 'Disetujui' || 
          results.some(r => r.approvalStatus === 'Disetujui' && (r.storeCode === s.storeCode || r.storeId === s.storeId))
        );
        setSchedules(approvedOnlySchedules);
        saveSchedules(approvedOnlySchedules, true);
      }
    }
  };

  const handleExportDataset = (dataset: MasterTokoDataset) => {
    const formattedData = dataset.stores.map(s => {
      const approvalStatus = getStoreSOApprovalStatus(s, schedules, results);
      return {
        'KD TOKO': s.code,
        'NAMA TOKO': s.name,
        'KOORDINAT': s.koordinat || (s.latitude && s.longitude ? `${s.latitude}, ${s.longitude}` : ''),
        'SALDO TOKO': typeof s.saldoToko === 'number' ? s.saldoToko : s.saldoToko || 0,
        'AM': s.am || '',
        'AS': s.as || '',
        'WILAYAH': s.region || s.kabupaten || s.city || 'BALI',
        'KABUPATEN': s.kabupaten || s.city || '',
        'KECAMATAN': s.kecamatan || s.district || '',
        'COVERAGE': s.coverage || 'DC',
        'TYPE SO': s.typeSo || s.qm || 'M',
        'SO MEI 26': formatSmartSODate(s.tglSoMei) || '',
        'SO JUNI 26': formatSmartSODate(s.tglSoJuni) || '',
        'SO JULI 26': formatSmartSODate(s.tglSoJuli) || '',
        'SO AGUSTUS 26': formatSmartSODate(s.soAgustus) || '',
        'SO SEPTEMBER 26': formatSmartSODate(s.soSeptember) || '',
        'STATUS APPROVE SO': approvalStatus,
        'TGL SO APPROVED (SPV)': formatSmartSODate(s.tglSoApproved) || '',
        'FREKUENSI TIDAK SO': s.frekuensiTidakSO !== undefined ? s.frekuensiTidakSO : calculateStoreFrekuensiTidakSO(s, '09'),
        'KETERANGAN': s.keterangan || '',
        'ZONA': s.zona || (s.isZonaHitam ? 'ZONA HITAM' : 'NON ZONA HITAM'),
        'SO AKTIVA': s.soAktiva || 'Tidak',
        'KORLAP': s.korlap || s.managerName || ''
      };
    });
    exportToCSV(formattedData, `${dataset.title.replace(/\s+/g, '_')}_EXPORT.csv`);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 font-sans text-slate-800 flex flex-col antialiased selection:bg-indigo-500 selection:text-white w-full max-w-full overflow-x-hidden">
      
      {/* Top Navbar */}
      <Navbar
        stores={stores}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onResetData={handleResetData}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        pendingApprovalCount={summary.pendingApprovalCount}
        currentRole={currentRole}
        onRoleChangeRequest={handleRequestRoleChange}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        activeDatasetTitle={datasets.find(d => d.isActiveForScheduling)?.title || (datasets[0]?.title ?? '')}
      />

      {/* Main Container Layout (Full Fluid Width) */}
      <div className="flex-1 flex flex-col lg:flex-row w-full max-w-[1920px] mx-auto overflow-x-hidden">
        
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingApprovalCount={summary.pendingApprovalCount}
          storesCount={stores.length}
          scheduledCount={schedules.filter(s => s.status === 'Terjadwal' || s.status === 'Proses SO').length}
          datasetsCount={datasets.length}
          currentRole={currentRole}
          onRoleChangeRequest={handleRequestRoleChange}
          onOpenNewScheduleModal={() => setIsCreateScheduleModalOpen(true)}
          onOpenNewResultModal={() => handleOpenInputResultModal()}
          onResetData={handleResetData}
          onExportMasterCSV={handleExportStores}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        {/* Content View Area */}
        <main className="flex-1 p-3.5 sm:p-6 pb-24 lg:pb-6 space-y-6 overflow-x-hidden">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              
              {/* 1. Summary Cards (Target Toko, Toko Ter-SO, % Ach, Zona Hitam) - Paling Atas untuk Akses Cepat Mobile */}
              <SummaryCards
                summary={summary}
                onNavigateTab={(tab) => setActiveTab(tab)}
                targetSoTypes={targetSoTypes}
                onChangeTargetTypes={handleSetTargetSoTypes}
              />

              {/* 2. General Schedule Metrics Widget (Terjadwal, Pindah, Gagal SO with Filters & Popups) */}
              <GeneralScheduleMetricsWidget
                schedules={schedules}
                stores={stores}
                personnel={personnel}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
              />

              {/* Daily SO Progress Tracker Widget */}
              <DailyProgressTrackerWidget
                schedules={schedules}
                results={results}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
              />

              {/* Recharts Analytics Section */}
              <ChartsSection
                schedules={filteredSchedules}
                results={filteredResults}
              />

              {/* Two Column Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Upcoming Schedules */}
                <UpcomingScheduleWidget
                  schedules={filteredSchedules}
                  onNavigateSchedules={() => setActiveTab('schedules')}
                  onUpdateStatus={handleUpdateScheduleStatus}
                />

                {/* High Variance / Pending Approval Alert */}
                <HighVarianceAlertWidget
                  results={filteredResults}
                  onNavigateResults={() => setActiveTab('results')}
                  onApproveResult={handleApproveResult}
                  onRequestRecount={handleRequestRecount}
                  onSelectResultDetail={(res) => setSelectedResultDetail(res)}
                />

              </div>

            </div>
          )}

          {/* TAB 2: PENJADWALAN SO */}
          {activeTab === 'schedules' && (
            <ScheduleManager
              schedules={schedules}
              stores={stores}
              teams={teams}
              personnel={personnel}
              results={results}
              currentRole={currentRole}
              onOpenCreateModal={() => setIsCreateScheduleModalOpen(true)}
              onOpenAutoGenerator={() => setIsAutoGeneratorModalOpen(true)}
              onOpenKorlapImageModal={() => setIsKorlapImageModalOpen(true)}
              onOpenInputModal={(schedOrId) => handleOpenInputResultModal(schedOrId)}
              onUpdateStatus={handleUpdateScheduleStatus}
              onDeleteSchedule={handleDeleteSchedule}
              onAssignPersonnel={(sched) => setAssignPersonnelSchedule(sched)}
              onOpenGagalPindahModal={(sched) => setGagalPindahSchedule(sched)}
              onConfirmScheduleFinished={handleConfirmScheduleFinished}
              onApproveSchedule={handleApproveSchedule}
              onRejectSchedule={handleRejectSchedule}
              onTwoWaySync={handleTwoWaySync}
              onResetSchedules={() => handleResetSchedulesOnly()}
              onResetMasterAndSchedules={() => handleResetMasterStores({ preserveSchedules: false })}
            />
          )}

          {/* TAB MAP: PETA & KLUSTER BALI */}
          {activeTab === 'map' && (
            <BaliClusterMap
              stores={stores}
              schedules={schedules}
              personnel={personnel}
              onUpdateSchedule={handleUpdateSchedule}
            />
          )}

          {/* TAB 3: REKAPAN HASIL SO */}
          {activeTab === 'results' && (
            <ResultsManager
              results={results}
              onOpenInputModal={() => handleOpenInputResultModal()}
              onSelectResultDetail={(res) => setSelectedResultDetail(res)}
              onApproveResult={handleApproveResult}
              onRequestRecount={handleRequestRecount}
            />
          )}

          {/* TAB: DATA MASTER TOKO (FILE MULTI-INDIKATOR) */}
          {activeTab === 'master_toko_files' && (
            <MasterTokoManager
              datasets={datasets}
              activeStoresCount={stores.length}
              onUploadDataset={handleUploadDataset}
              onActivateDatasetForScheduling={handleActivateDatasetForScheduling}
              onDeleteDataset={handleDeleteDataset}
              onExportDataset={handleExportDataset}
            />
          )}

          {/* TAB 4: MASTER TOKO (700+) */}
          {activeTab === 'stores' && (
            <StoreDirectory
              stores={stores}
              schedules={schedules}
              results={results}
              onOpenAddModal={() => {
                setEditingStore(null);
                setIsAddStoreModalOpen(true);
              }}
              onOpenImportModal={() => setIsImportStoresModalOpen(true)}
              onSelectStore={(st) => setSelectedStoreDetail(st)}
              onEditStore={(st) => {
                setEditingStore(st);
                setIsAddStoreModalOpen(true);
              }}
              onDeleteStore={handleDeleteStore}
              onBulkUpdateStores={handleBulkUpdateStores}
              onResetMasterStores={handleResetMasterStores}
            />
          )}

          {/* TAB 4.5: CEKLIST SO TOKO ZONA (PORTAL SPV) */}
          {activeTab === 'checklist_toko_zona' && (
            <ZoneStoreChecklist
              stores={stores}
              schedules={schedules}
              results={results}
              personnel={personnel}
              onOpenInputResultModal={(sch) => {
                handleOpenInputResultModal(sch);
              }}
              onSelectStore={(st) => setSelectedStoreDetail(st)}
            />
          )}

          {/* TAB 4.6: OPSI PINDAH TOKO & REKOMENDASI SPV */}
          {activeTab === 'opsi_pindah_toko' && (
            <StoreRelocationAssistant
              stores={stores}
              schedules={schedules}
              personnel={personnel}
              onApplyRelocation={(scheduleId, actionType, reason, replacementDetails) => {
                handleGagalAtauPindahToko(scheduleId, actionType, reason, replacementDetails);
              }}
            />
          )}

          {/* TAB 5: TIM SO & AUDITOR */}
          {activeTab === 'teams' && (
            <TeamManager
              teams={teams}
              personnel={personnel}
              onAddPersonnel={handleAddPersonnel}
              onUpdatePersonnel={handleUpdatePersonnel}
              onDeletePersonnel={handleDeletePersonnel}
              onBatchImportPersonnel={handleBatchImportPersonnel}
              currentRole={currentRole}
            />
          )}

          {/* TAB 5.5: LIST PERSONIL ON-CALL */}
          {activeTab === 'oncall_personnel' && (
            <OnCallPersonnelManager
              personnelList={personnel}
              onCallRecords={onCallRecords}
              onUpdateOnCallRecords={(newRecords) => {
                setOnCallRecords(newRecords);
                saveOnCallPersonnel(newRecords, true);
              }}
              onSaveRecords={async (newRecords) => {
                setOnCallRecords(newRecords);
                await saveOnCallPersonnel(newRecords, true);
              }}
              currentRole={currentRole}
            />
          )}

          {/* TAB: PENARIKAN REKAP HASIL SO (ADMIN) */}
          {activeTab === 'admin_rekap_so' && (
            <AdminSORecapExtractor
              results={results}
              schedules={schedules}
              stores={stores}
              personnel={personnel}
              currentRole={currentRole}
              onViewDetailResult={(res) => setSelectedResultDetail(res)}
            />
          )}

          {/* TAB 6: TRACKING PERALATAN SO */}
          {activeTab === 'equipment' && (
            <EquipmentManager
              equipmentList={equipment}
              repairLogs={repairLogs}
              onAddEquipment={handleAddEquipment}
              onUpdateEquipment={handleUpdateEquipment}
              onDeleteEquipment={handleDeleteEquipment}
              onBatchUpdateEquipment={(newList, isReplaceMode) => {
                setEquipment(newList);
                saveEquipment(newList, isReplaceMode);
              }}
              onAddRepairLog={handleAddRepairLog}
              onUpdateRepairLog={handleUpdateRepairLog}
              onDeleteRepairLog={handleDeleteRepairLog}
            />
          )}

          {/* TAB 6.5: REKAPAN SAKIT & CUTI SDM */}
          {activeTab === 'leave_recap' && (
            <LeaveRecapManager
              personnel={personnel}
              onUpdatePersonnel={setPersonnel}
            />
          )}

          {/* TAB 6.8: PORTAL PENTING PERUSAHAAN */}
          {activeTab === 'company_portals' && (
            <CompanyPortals
              currentRole={currentRole}
              onNavigateToSettings={() => setActiveTab('settings')}
            />
          )}

          {/* TAB 6.9: TRACKING SERAGAM SDM */}
          {activeTab === 'uniform_tracking' && (
            <UniformTracker
              personnelList={personnel}
            />
          )}

          {/* TAB 7: LAPORAN & ANALYTICS */}
          {activeTab === 'reports' && (
            <ReportsAnalytics
              stores={stores}
              schedules={schedules}
              results={results}
              summary={summary}
              personnel={personnel}
            />
          )}

          {/* TAB 7: PENGATURAN & UTILITIES */}
          {activeTab === 'settings' && (
            <SettingsManager
              stores={stores}
              schedules={schedules}
              results={results}
              teams={teams}
              currentRole={currentRole}
              onResetData={handleResetData}
              onRestoreData={handleRestoreData}
            />
          )}

        </main>

      </div>

      {/* Mobile & Landscape Floating Interactive Quick Action Button */}
      {!isMobileMenuOpen && (
        <aside 
          aria-label="Floating Slide Bar Menu Toggle"
          className="fixed bottom-14 sm:bottom-16 left-3 sm:left-4 z-35 lg:hidden animate-in fade-in zoom-in duration-300 pointer-events-auto"
        >
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 hover:from-indigo-900 hover:to-slate-900 text-white rounded-full shadow-2xl shadow-indigo-950/60 border border-indigo-500/40 active:scale-90 hover:scale-105 transition-all duration-200 group backdrop-blur-md ring-2 ring-indigo-400/20"
            title="Buka Slide Bar Menu Navigasi"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-inner group-hover:rotate-12 transition-transform">
              <Menu className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-xs font-black tracking-wide text-indigo-100 pr-1 flex items-center gap-1.5">
              <span>Menu Slide Bar</span>
              {summary.pendingApprovalCount > 0 ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              ) : (
                <Sparkles className="w-3 h-3 text-indigo-400 group-hover:animate-spin" />
              )}
            </span>
          </button>
        </aside>
      )}

      {/* Mobile & Tablet Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 w-full max-w-full bg-slate-900 border-t border-slate-800 px-1 py-1.5 z-30 shadow-2xl grid grid-cols-5 gap-0.5 items-center select-none overflow-hidden">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold transition truncate ${
            activeTab === 'dashboard' ? 'text-indigo-400 bg-slate-800' : 'text-slate-400 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 mb-0.5" />
          <span className="truncate w-full text-center">Dashboard</span>
        </button>

        <button
          onClick={() => setActiveTab('schedules')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold transition truncate ${
            activeTab === 'schedules' ? 'text-indigo-400 bg-slate-800' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4 mb-0.5" />
          <span className="truncate w-full text-center">Jadwal</span>
        </button>

        <button
          onClick={() => setActiveTab('results')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold transition relative truncate ${
            activeTab === 'results' ? 'text-emerald-400 bg-slate-800' : 'text-slate-400 hover:text-white'
          }`}
        >
          <ClipboardCheck className="w-4 h-4 mb-0.5" />
          <span className="truncate w-full text-center">Hasil</span>
          {summary.pendingApprovalCount > 0 && (
            <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('stores')}
          className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold transition truncate ${
            activeTab === 'stores' ? 'text-indigo-400 bg-slate-800' : 'text-slate-400 hover:text-white'
          }`}
        >
          <StoreIcon className="w-4 h-4 mb-0.5" />
          <span className="truncate w-full text-center">Toko</span>
        </button>

        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[10px] font-bold text-slate-300 hover:text-white active:scale-95 transition truncate"
        >
          <Menu className="w-4 h-4 mb-0.5 text-indigo-400" />
          <span className="truncate w-full text-center">Slide Bar</span>
        </button>
      </nav>

      {/* ALL MODALS */}
      <CreateScheduleModal
        isOpen={isCreateScheduleModalOpen}
        onClose={() => setIsCreateScheduleModalOpen(false)}
        stores={stores}
        teams={teams}
        existingSchedules={schedules}
        personnel={personnel}
        onCreateSchedule={handleCreateSchedule}
        onBatchCreateSchedules={handleBatchCreateSchedules}
      />

      <AutoGeneratorModal
        isOpen={isAutoGeneratorModalOpen}
        onClose={() => setIsAutoGeneratorModalOpen(false)}
        stores={stores}
        teams={teams}
        personnel={personnel}
        existingSchedules={schedules}
        onBatchCreateSchedules={handleBatchCreateSchedules}
      />

      <InputResultModal
        isOpen={isInputResultModalOpen}
        onClose={() => {
          setIsInputResultModalOpen(false);
          setInputResultScheduleId(null);
        }}
        schedules={schedules}
        initialScheduleId={inputResultScheduleId}
        onCreateResult={handleCreateResult}
      />

      <ResultDetailModal
        result={selectedResultDetail}
        onClose={() => setSelectedResultDetail(null)}
        onApproveResult={handleApproveResult}
        onRequestRecount={handleRequestRecount}
      />

      <AddEditStoreModal
        isOpen={isAddStoreModalOpen}
        onClose={() => {
          setIsAddStoreModalOpen(false);
          setEditingStore(null);
        }}
        editingStore={editingStore}
        onSaveStore={handleSaveStore}
      />

      <StoreDetailModal
        store={selectedStoreDetail}
        schedules={schedules}
        results={results}
        onClose={() => setSelectedStoreDetail(null)}
      />

      <ImportStoresModal
        isOpen={isImportStoresModalOpen}
        onClose={() => setIsImportStoresModalOpen(false)}
        onImportBulkStores={handleImportBulkStores}
        onResetMasterStores={handleResetMasterStores}
        currentStoresCount={stores.length}
      />

      <KorlapScheduleImageModal
        isOpen={isKorlapImageModalOpen}
        onClose={() => setIsKorlapImageModalOpen(false)}
        stores={stores}
        teams={teams}
        personnel={personnel}
        onAddMultipleSchedules={handleBatchCreateSchedules}
      />

      <AssignPersonnelModal
        isOpen={!!assignPersonnelSchedule}
        onClose={() => setAssignPersonnelSchedule(null)}
        schedule={assignPersonnelSchedule}
        personnel={personnel}
        onSaveAssignment={handleAssignPersonnelSave}
      />

      <GagalAtauPindahTokoModal
        isOpen={!!gagalPindahSchedule}
        onClose={() => setGagalPindahSchedule(null)}
        schedule={gagalPindahSchedule}
        stores={stores}
        onSubmitAction={handleGagalAtauPindahToko}
      />

      <RoleAuthModal
        isOpen={isRoleAuthModalOpen}
        targetRole={targetRoleToAuth}
        currentRole={currentRole}
        onClose={() => setIsRoleAuthModalOpen(false)}
        onSuccess={handleRoleAuthSuccess}
      />

      <InitialRoleAuthModal
        isOpen={isInitialRoleModalOpen}
        onSuccess={handleInitialRoleSuccess}
      />

    </div>
  );
}
