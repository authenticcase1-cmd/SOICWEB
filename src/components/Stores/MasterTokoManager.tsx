import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Plus, 
  Upload, 
  Download, 
  Trash2, 
  CheckCircle2, 
  Search, 
  Filter, 
  Sparkles, 
  Eye, 
  Layers, 
  Calendar, 
  Tag, 
  Database, 
  AlertCircle,
  X,
  Store as StoreIcon,
  RefreshCw,
  SlidersHorizontal,
  Info,
  PowerOff
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Store, MasterTokoDataset } from '../../types/stockOpname';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { ToastNotification } from '../Common/ToastNotification';
import { parseSmartWorkbook, SheetParseResult } from '../../utils/excelParser';
import { isStoreZonaHitam, isStoreSOAktiva } from '../../utils/storeSyncUtils';
import { trackDeletedMasterDataset, normalizeSingleActiveDataset, getStoredStores } from '../../services/storageService';
import { SpreadsheetSyncModal } from './SpreadsheetSyncModal';
import { 
  getLocalSpreadsheetConfig, 
  syncMasterStoresFromSpreadsheet, 
  deactivateSpreadsheetSync,
  GoogleSpreadsheetConfig, 
  SpreadsheetSyncResult 
} from '../../services/googleSpreadsheetService';

interface MasterTokoManagerProps {
  datasets: MasterTokoDataset[];
  activeStoresCount: number;
  onUploadDataset: (dataset: MasterTokoDataset) => void;
  onActivateDatasetForScheduling: (datasetId: string) => void;
  onDeleteDataset: (datasetId: string, dataset?: MasterTokoDataset) => void;
  onExportDataset: (dataset: MasterTokoDataset) => void;
}

export const MasterTokoManager: React.FC<MasterTokoManagerProps> = ({
  datasets,
  activeStoresCount,
  onUploadDataset,
  onActivateDatasetForScheduling,
  onDeleteDataset,
  onExportDataset,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState('ALL');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [previewDataset, setPreviewDataset] = useState<MasterTokoDataset | null>(null);
  const [datasetToDelete, setDatasetToDelete] = useState<MasterTokoDataset | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null);

  // Modal upload form state
  const [fileTitle, setFileTitle] = useState('');
  const [periodQuarter, setPeriodQuarter] = useState('Kuartal III 2026');
  const [notes, setNotes] = useState('');
  const [setAsActive, setSetAsActive] = useState(true);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedSheetResults, setParsedSheetResults] = useState<SheetParseResult[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [parsedStores, setParsedStores] = useState<Store[]>([]);
  const [detectedIndicators, setDetectedIndicators] = useState<string[]>([]);
  const [rawColumns, setRawColumns] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // Preview modal filter state
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewTypeSoFilter, setPreviewTypeSoFilter] = useState('ALL');

  // Google Spreadsheet Sync states
  const [isSpreadsheetModalOpen, setIsSpreadsheetModalOpen] = useState(false);
  const [spreadsheetConfig, setSpreadsheetConfig] = useState<GoogleSpreadsheetConfig>(() => getLocalSpreadsheetConfig());
  const [isQuickSyncing, setIsQuickSyncing] = useState(false);
  const [isDeactivatingSpreadsheet, setIsDeactivatingSpreadsheet] = useState(false);

  // Keep spreadsheet config in sync with background or modal updates
  React.useEffect(() => {
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
    if (!window.confirm('Apakah Anda yakin ingin menonaktifkan sinkronisasi Google Spreadsheet? Aplikasi tidak akan lagi menarik data otomatis dari spreadsheet ini.')) {
      return;
    }

    setIsDeactivatingSpreadsheet(true);
    try {
      const updated = await deactivateSpreadsheetSync();
      setSpreadsheetConfig(updated);
      setToastMessage({
        type: 'success',
        title: 'Sinkronisasi Dinonaktifkan',
        message: 'Koneksi Google Spreadsheet telah dinonaktifkan. Data toko & jadwal yang ada tetap tersimpan.'
      });
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Gagal Menonaktifkan',
        message: err?.message || 'Terjadi kesalahan saat menonaktifkan sinkronisasi.'
      });
    } finally {
      setIsDeactivatingSpreadsheet(false);
    }
  };

  const handleQuickSyncSpreadsheet = async () => {
    if (!spreadsheetConfig.url) {
      setIsSpreadsheetModalOpen(true);
      return;
    }

    setIsQuickSyncing(true);
    try {
      const res = await syncMasterStoresFromSpreadsheet(spreadsheetConfig.url, {
        preferredSheetName: spreadsheetConfig.sheetName || 'MASTER TOKO BALI'
      });

      if (res.success) {
        setSpreadsheetConfig(getLocalSpreadsheetConfig());
        setToastMessage({
          type: 'success',
          title: 'Sinkron Spreadsheet Berhasil',
          message: `Berhasil menarik ${res.storesCount} toko dan ${res.schedulesCount} jadwal SO dari sheet '${res.sheetName}'!`
        });
      } else {
        setToastMessage({
          type: 'error',
          title: 'Gagal Sinkron Spreadsheet',
          message: res.error || res.message || 'Terjadi kesalahan saat menyinkronkan data.'
        });
      }
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Error Sinkron',
        message: err?.message || 'Gagal menghubungi Google Spreadsheet.'
      });
    } finally {
      setIsQuickSyncing(false);
    }
  };

  const handleSelectSheet = (sheetName: string) => {
    setSelectedSheetName(sheetName);
    const target = parsedSheetResults.find(s => s.sheetName === sheetName);
    if (target) {
      setParsedStores(target.stores);
      setDetectedIndicators(target.indicators);
      setRawColumns(target.rawHeaders);
      if (target.stores.length === 0) {
        setParseError(`Sheet "${sheetName}" tidak berisi baris toko yang valid.`);
      } else {
        setParseError(null);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setIsParsing(true);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });

        const result = parseSmartWorkbook(wb, 'MASTER TOKO BALI');
        setParsedSheetResults(result.allSheets);

        if (!result.activeSheet || result.activeSheet.stores.length === 0) {
          setParseError('Tidak ditemukan baris data toko yang valid pada file ini setelah pemindaian seluruh Sheet.');
          setParsedStores([]);
          setDetectedIndicators([]);
          setRawColumns([]);
          setIsParsing(false);
          return;
        }

        setSelectedSheetName(result.activeSheet.sheetName);
        setParsedStores(result.activeSheet.stores);
        setDetectedIndicators(result.activeSheet.indicators);
        setRawColumns(result.activeSheet.rawHeaders);

        if (!fileTitle) {
          setFileTitle(file.name.replace(/\.[^/.]+$/, ''));
        }
        setIsParsing(false);
      } catch (err: any) {
        setParseError(`Gagal membaca file Excel/CSV: ${err.message || 'Format tidak didukung'}`);
        setIsParsing(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleSaveUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFile || parsedStores.length === 0) {
      setParseError('Silakan pilih file Excel/CSV terlebih dahulu.');
      return;
    }

    const currentSheetResult = parsedSheetResults.find(s => s.sheetName === selectedSheetName);
    const extractedSchedules = currentSheetResult?.extractedSchedules || 
      parsedSheetResults.find(s => s.extractedSchedules && s.extractedSchedules.length > 0)?.extractedSchedules;

    const newDataset: MasterTokoDataset = {
      id: `DATASET-${Date.now()}`,
      title: fileTitle || uploadedFile.name,
      filename: uploadedFile.name,
      uploadDate: new Date().toISOString(),
      uploadedBy: 'Supervisor SPV',
      storesCount: parsedStores.length,
      periodOrQuarter: periodQuarter,
      indicatorList: detectedIndicators,
      isActiveForScheduling: setAsActive,
      notes: notes,
      stores: parsedStores,
      rawColumns: rawColumns,
      extractedSchedules: extractedSchedules
    };

    onUploadDataset(newDataset);
    setIsUploadModalOpen(false);
    
    // Reset form
    setUploadedFile(null);
    setParsedStores([]);
    setFileTitle('');
    setNotes('');

    setToastMessage({
      type: 'success',
      title: 'Upload File Master Toko Berhasil',
      message: `File "${newDataset.title}" berisi ${newDataset.storesCount} data toko berhasil disimpan.`
    });
  };

  // Normalize datasets so there is never duplicate Google Sheet datasets or multiple active badges
  const displayDatasets = React.useMemo(() => {
    const norm = normalizeSingleActiveDataset(datasets);
    if (norm.length > 0) {
      return norm.map(ds => {
        if (ds.id === 'gsheet_master_dataset_bali' && (!ds.storesCount || ds.storesCount === 0) && activeStoresCount > 0) {
          return { ...ds, storesCount: activeStoresCount };
        }
        return ds;
      });
    }

    // If datasets is empty, check if spreadsheet is configured or active stores exist
    // Synthesize the canonical dataset so the UI never appears blank ("hilang semua")
    const isSpreadsheetActive = spreadsheetConfig.isActive || Boolean(spreadsheetConfig.url);
    if (isSpreadsheetActive || activeStoresCount > 0) {
      return [{
        id: 'gsheet_master_dataset_bali',
        title: `Google Spreadsheet (${spreadsheetConfig.sheetName || 'MASTER TOKO BALI'})`,
        filename: `Google Sheet [${(spreadsheetConfig.spreadsheetId || 'MASTER').slice(0, 8)}...]`,
        uploadDate: spreadsheetConfig.lastSyncedAt || new Date().toISOString(),
        storesCount: activeStoresCount > 0 ? activeStoresCount : (spreadsheetConfig.lastSyncCount || 700),
        isActiveForScheduling: true,
        periodOrQuarter: 'September 2026',
        indicatorList: ['Type SO', 'KORLAP/OFFICER SO', 'NKL'],
        notes: `Tersambung langsung dengan Google Spreadsheet (${spreadsheetConfig.sheetName || 'MASTER TOKO BALI'}).`,
        stores: []
      }];
    }
    return [];
  }, [datasets, activeStoresCount, spreadsheetConfig]);

  // Filtering dataset list
  const filteredDatasets = displayDatasets.filter(ds => {
    const matchesSearch = 
      ds.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ds.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ds.periodOrQuarter && ds.periodOrQuarter.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesPeriod = selectedPeriodFilter === 'ALL' || ds.periodOrQuarter === selectedPeriodFilter;

    return matchesSearch && matchesPeriod;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Header Section */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white border border-indigo-900/50 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-purple-500/5 to-transparent pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 rounded-full border border-indigo-400/30 text-indigo-300 text-xs font-extrabold tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Portal Supervisor — Multi-Master File Storage</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>Data Master Toko & File Indikator SO</span>
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Upload dan kelola beberapa file Excel/CSV Master Toko (misal Evaluasi Type SO, NKL, Kuartal III 2026). Pilih dataset mana yang ingin diaktifkan sebagai acuan utama Penjadwalan Stock Opname.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => setIsSpreadsheetModalOpen(true)}
              className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-2xl text-xs sm:text-sm shadow-lg shadow-emerald-950/50 transition-all flex items-center gap-2 active:scale-95 border border-emerald-400/40 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>Sinkron Google Spreadsheet</span>
            </button>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-2xl text-xs sm:text-sm shadow-lg shadow-indigo-900/40 transition-all flex items-center gap-2 active:scale-95 border border-indigo-400/30 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Upload File Master Toko Baru</span>
            </button>
          </div>
        </div>

        {/* Google Spreadsheet Quick Status Banner */}
        {spreadsheetConfig.url && spreadsheetConfig.isActive !== false && (
          <div className="mt-4 p-3.5 bg-emerald-950/70 border border-emerald-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs relative z-10 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-400/30">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-white text-xs">
                    Terhubung ke Google Spreadsheet
                  </p>
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-400/30">
                    Sheet: {spreadsheetConfig.sheetName || 'MASTER TOKO BALI'}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-200/80 mt-0.5">
                  {spreadsheetConfig.lastSyncedAt 
                    ? `Terakhir disinkron: ${new Date(spreadsheetConfig.lastSyncedAt).toLocaleString('id-ID')} • ${spreadsheetConfig.lastSyncCount || 0} Toko • ${spreadsheetConfig.lastSyncSchedulesCount || 0} Jadwal SO`
                    : 'Siap ditarik secara real-time kapan pun ada perubahan jadwal'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleQuickSyncSpreadsheet}
                disabled={isQuickSyncing || isDeactivatingSpreadsheet}
                className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isQuickSyncing ? 'animate-spin' : ''}`} />
                <span>{isQuickSyncing ? 'Menyinkronkan...' : 'Tarik Update Sekarang'}</span>
              </button>
              <button
                onClick={() => setIsSpreadsheetModalOpen(true)}
                disabled={isQuickSyncing || isDeactivatingSpreadsheet}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Pengaturan
              </button>
              <button
                onClick={handleDeactivateSpreadsheet}
                disabled={isQuickSyncing || isDeactivatingSpreadsheet}
                className="px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 hover:border-rose-400/50 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                title="Nonaktifkan sinkronisasi Google Spreadsheet"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>{isDeactivatingSpreadsheet ? 'Menonaktifkan...' : 'Nonaktifkan Sinkron'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Key Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-indigo-900/60">
          <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-indigo-800/40">
            <div className="text-[10px] text-indigo-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>Total File Master</span>
            </div>
            <p className="text-xl font-black text-white mt-1">{displayDatasets.length} Dataset</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Disimpan di Storage</p>
          </div>

          <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-emerald-800/40">
            <div className="text-[10px] text-emerald-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Toko Aktif System</span>
            </div>
            <p className="text-xl font-black text-emerald-300 mt-1">{activeStoresCount} Toko</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Siap untuk Penjadwalan</p>
          </div>

          <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-purple-800/40">
            <div className="text-[10px] text-purple-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-purple-400" />
              <span>Indikator Terdeteksi</span>
            </div>
            <p className="text-xl font-black text-purple-300 mt-1">
              {Array.from(new Set(displayDatasets.flatMap(d => d.indicatorList))).length || 4} Jenis
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Type SO, NKL, Toko Fresh</p>
          </div>

          <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-amber-800/40">
            <div className="text-[10px] text-amber-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Periode Acuan</span>
            </div>
            <p className="text-xl font-black text-amber-300 mt-1">
              {displayDatasets.find(d => d.isActiveForScheduling)?.periodOrQuarter || 'Kuartal III 2026'}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Master Aktif Penjadwalan</p>
          </div>
        </div>
      </div>

      {/* Filter & Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari file master toko atau indikator..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" />
          <select
            value={selectedPeriodFilter}
            onChange={(e) => setSelectedPeriodFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">Semua Periode / Kuartal</option>
            <option value="Kuartal I 2026">Kuartal I 2026</option>
            <option value="Kuartal II 2026">Kuartal II 2026</option>
            <option value="Kuartal III 2026">Kuartal III 2026</option>
            <option value="Kuartal IV 2026">Kuartal IV 2026</option>
          </select>
        </div>
      </div>

      {/* Dataset Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredDatasets.map((ds) => (
          <div 
            key={ds.id}
            className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between overflow-hidden relative ${
              ds.isActiveForScheduling 
                ? 'border-emerald-500 ring-2 ring-emerald-500/20' 
                : 'border-slate-200/80 hover:border-slate-300'
            }`}
          >
            {/* Active Master Badge */}
            {ds.isActiveForScheduling && (
              <div className="bg-emerald-600 text-white text-[10px] font-black px-3 py-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  ACUAN UTAMA PENJADWALAN SO
                </span>
                <span className="uppercase text-[9px] font-bold bg-emerald-700 px-1.5 py-0.5 rounded">
                  AKTIF
                </span>
              </div>
            )}

            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                    ds.isActiveForScheduling 
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' 
                      : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                  }`}>
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div className="leading-tight">
                    <h3 className="font-extrabold text-slate-900 text-sm line-clamp-1" title={ds.title}>
                      {ds.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5 line-clamp-1">
                      {ds.filename}
                    </p>
                  </div>
                </div>
              </div>

              {/* Meta details */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Total Data Toko:</span>
                  <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 text-xs">
                    {ds.storesCount} Toko
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Periode / Acuan:</span>
                  <span className="font-bold text-indigo-700">
                    {ds.periodOrQuarter || 'Kuartal III 2026'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Tanggal Upload:</span>
                  <span className="font-medium text-slate-700">
                    {new Date(ds.uploadDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Detected Indicators Chips */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Indikator Kolom Terdeteksi:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {ds.indicatorList.map((ind, idx) => (
                    <span 
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/60 text-[10px] font-bold rounded-md"
                    >
                      <Tag className="w-2.5 h-2.5" />
                      {ind}
                    </span>
                  ))}
                </div>
              </div>

              {ds.notes && (
                <p className="text-[11px] text-slate-500 italic bg-amber-50/60 p-2 rounded-lg border border-amber-200/50">
                  "{ds.notes}"
                </p>
              )}
            </div>

            {/* Card Action Buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPreviewDataset(ds)}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs border border-slate-200 transition flex items-center gap-1 active:scale-95 cursor-pointer"
                  title="Lihat Pratinjau Toko & Indikator"
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Pratinjau</span>
                </button>

                <button
                  onClick={() => onExportDataset(ds)}
                  className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-lg text-xs border border-slate-200 transition active:scale-95 cursor-pointer"
                  title="Unduh Excel File Master Ini"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                </button>

                <button
                  onClick={() => setDatasetToDelete(ds)}
                  className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 rounded-lg text-xs border border-slate-200 transition active:scale-95 cursor-pointer"
                  title="Hapus File Dataset Ini"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {!ds.isActiveForScheduling ? (
                <button
                  onClick={() => {
                    onActivateDatasetForScheduling(ds.id);
                    setToastMessage({
                      type: 'success',
                      title: 'Master Toko Penjadwalan Diaktifkan',
                      message: `Dataset "${ds.title}" kini diaktifkan sebagai acuan utama Penjadwalan SO.`
                    });
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg text-xs transition shadow-sm active:scale-95 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Aktifkan Acuan</span>
                </button>
              ) : (
                <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md border border-emerald-300">
                  Master Aktif
                </span>
              )}
            </div>

          </div>
        ))}
      </div>

      {filteredDatasets.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <h3 className="font-extrabold text-slate-800 text-base">Belum Ada File Master Toko</h3>
          <p className="text-slate-500 text-xs max-w-md mx-auto">
            Silakan klik tombol <span className="font-bold text-indigo-600">"+ Upload File Master Toko Baru"</span> di atas untuk mengunggah file acuan toko (seperti Evaluasi Type SO, NKL, dsb) untuk penjadwalan SO.
          </p>
        </div>
      )}

      {/* UPLOAD MODAL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold border border-indigo-400/40">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">Upload File Master Toko Baru</h3>
                  <p className="text-[10px] text-indigo-300">Dukungan parser otomatis header bertingkat & indikator SO</p>
                </div>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUpload} className="p-6 space-y-4 text-xs">
              
              {/* File Dropzone */}
              <div className="space-y-1.5">
                <label className="font-extrabold text-slate-800 block">
                  Pilih File Excel / CSV Master Toko: <span className="text-rose-500">*</span>
                </label>
                <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/40 p-6 rounded-2xl text-center cursor-pointer transition relative">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="space-y-2 pointer-events-none">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mx-auto">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    {uploadedFile ? (
                      <div>
                        <p className="font-bold text-slate-900 text-xs">{uploadedFile.name}</p>
                        <p className="text-[10px] text-emerald-600 font-extrabold mt-0.5">
                          ✓ {parsedStores.length} data toko terdeteksi dari file
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-bold text-indigo-900 text-xs">Klik atau Tarik File Excel ke Sini</p>
                        <p className="text-[10px] text-slate-500">Mendukung format XLSX, XLS, atau CSV</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {isParsing && (
                <div className="p-3 bg-indigo-50 text-indigo-800 rounded-xl flex items-center gap-2 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Menganalisis kolom & indikator file Excel...</span>
                </div>
              )}

              {parseError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {parsedSheetResults.length > 1 && (
                <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-extrabold text-indigo-900 text-xs flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                      Pilih Lembar Kerja (Sheet Excel):
                    </label>
                    <span className="text-[10px] bg-indigo-200/80 text-indigo-900 px-2 py-0.5 rounded-full font-black">
                      {parsedSheetResults.length} Sheet Terdeteksi
                    </span>
                  </div>
                  <select
                    value={selectedSheetName}
                    onChange={(e) => handleSelectSheet(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-xl font-extrabold text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-xs"
                  >
                    {parsedSheetResults.map((s, idx) => (
                      <option key={idx} value={s.sheetName}>
                        Sheet: "{s.sheetName}" — ({s.stores.length} data toko terdeteksi)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {parsedStores.length > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl space-y-1">
                  <p className="font-extrabold flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Header & Indikator Berhasil Terdeteksi ({parsedStores.length} Toko)
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {detectedIndicators.map((ind, i) => (
                      <span key={i} className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded">
                        {ind}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Title & Quarter */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-extrabold text-slate-700">Judul Dataset Master:</label>
                  <input
                    type="text"
                    value={fileTitle}
                    onChange={(e) => setFileTitle(e.target.value)}
                    placeholder="Contoh: Evaluasi Type SO Kuartal III 2026"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-extrabold text-slate-700">Periode / Kuartal:</label>
                  <select
                    value={periodQuarter}
                    onChange={(e) => setPeriodQuarter(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="Kuartal I 2026">Kuartal I 2026</option>
                    <option value="Kuartal II 2026">Kuartal II 2026</option>
                    <option value="Kuartal III 2026">Kuartal III 2026</option>
                    <option value="Kuartal IV 2026">Kuartal IV 2026</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="font-extrabold text-slate-700">Catatan Indikator Khusus (Opsional):</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Memuat data perubahan grade toko dari Q2 ke Q3 dan rasio % NKL dry"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Checkbox option */}
              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="setAsActive"
                  checked={setAsActive}
                  onChange={(e) => setSetAsActive(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="setAsActive" className="font-bold text-slate-800 cursor-pointer">
                  Langsung terapkan sebagai Master Toko Aktif untuk Penjadwalan SO
                </label>
              </div>

              {/* Action buttons */}
              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!uploadedFile || parsedStores.length === 0}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl transition shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Simpan File Dataset</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* PREVIEW DATASET MODAL */}
      {previewDataset && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-3xl max-w-5xl w-full h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in duration-200">
            
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base flex items-center gap-2">
                    <span>Pratinjau Master File: {previewDataset.title}</span>
                    <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded border border-indigo-400/30 font-mono">
                      {previewDataset.storesCount} Toko
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">{previewDataset.filename}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewDataset(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter toolbar inside preview */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  placeholder="Cari toko berdasarkan kode, nama, atau kabupaten..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-bold">Terdeteksi Indikator:</span>
                <div className="flex flex-wrap gap-1">
                  {previewDataset.indicatorList.map((ind, i) => (
                    <span key={i} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-extrabold text-[10px] rounded">
                      {ind}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Scrollable Store Table */}
            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase border-b border-slate-200">
                    <th className="p-3">No</th>
                    <th className="p-3">Kode Toko</th>
                    <th className="p-3">Nama Toko</th>
                    <th className="p-3">Kabupaten</th>
                    <th className="p-3">Type SO</th>
                    <th className="p-3">Zona Toko</th>
                    <th className="p-3">SO Aktiva</th>
                    <th className="p-3">Korlap</th>
                    <th className="p-3 text-right">Saldo Toko</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(() => {
                    const candidateStores = (previewDataset.stores && previewDataset.stores.length > 0)
                      ? previewDataset.stores
                      : getStoredStores();
                    return candidateStores
                      .filter(s => 
                        s.code.toLowerCase().includes(previewSearch.toLowerCase()) ||
                        s.name.toLowerCase().includes(previewSearch.toLowerCase()) ||
                        (s.city || '').toLowerCase().includes(previewSearch.toLowerCase()) ||
                        (s.kabupaten || '').toLowerCase().includes(previewSearch.toLowerCase())
                      )
                      .slice(0, 150)
                      .map((st, idx) => {
                        const isHitam = isStoreZonaHitam(st);
                        const isAktiva = isStoreSOAktiva(st);

                        const formattedSaldo = typeof st.saldoToko === 'number' 
                          ? `Rp ${st.saldoToko.toLocaleString('id-ID')}` 
                          : (st.saldoToko ? `Rp ${st.saldoToko}` : '-');

                        return (
                          <tr key={st.id || idx} className={`hover:bg-slate-50/80 transition ${isHitam ? 'bg-rose-50/30' : ''}`}>
                            <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-3 font-mono font-bold text-amber-900">{st.code}</td>
                            <td className="p-3 font-extrabold text-slate-900">{st.name}</td>
                            <td className="p-3 text-slate-700 font-semibold">{st.kabupaten || st.city || '-'}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-900 font-black rounded border border-amber-200 text-[10px]">
                                {st.typeSo || st.qm || 'M'}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] border ${
                                isHitam 
                                  ? 'bg-rose-100 border-rose-300 text-rose-800' 
                                  : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                              }`}>
                                {isHitam ? 'ZONA HITAM' : 'NON ZONA HITAM'}
                              </span>
                            </td>
                            <td className="p-3">
                              {isAktiva ? (
                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300">
                                  SO AKTIVA
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                  NON SO AKTIVA
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-slate-700 font-semibold">{st.korlap || '-'}</td>
                            <td className="p-3 font-mono font-bold text-slate-900 text-right">{formattedSaldo}</td>
                          </tr>
                        );
                      });
                  })()}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <p className="text-xs text-slate-500 font-medium">
                Menampilkan data toko acuan terurai dari file master.
              </p>
              <button
                onClick={() => setPreviewDataset(null)}
                className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition"
              >
                Tutup Pratinjau
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmDeleteModal
        isOpen={!!datasetToDelete}
        onClose={() => setDatasetToDelete(null)}
        onConfirm={() => {
          if (datasetToDelete) {
            trackDeletedMasterDataset(datasetToDelete);
            onDeleteDataset(datasetToDelete.id, datasetToDelete);
            setToastMessage({
              type: 'success',
              title: 'Dataset Dihapus',
              message: `File Master "${datasetToDelete.title}" telah dihapus secara permanen dari sistem.`
            });
            setDatasetToDelete(null);
          }
        }}
        title="Hapus File Master Toko"
        subtitle="Apakah Anda yakin ingin menghapus file dataset master toko ini?"
        itemName={datasetToDelete ? datasetToDelete.title : undefined}
        itemDetails={datasetToDelete ? [
          { label: 'Nama File', value: datasetToDelete.filename },
          { label: 'Jumlah Toko', value: `${datasetToDelete.storesCount} Toko` },
          { label: 'Periode', value: datasetToDelete.periodOrQuarter || '-' }
        ] : []}
        confirmText="Ya, Hapus File Master"
      />

      {/* GOOGLE SPREADSHEET SYNC MODAL */}
      <SpreadsheetSyncModal
        isOpen={isSpreadsheetModalOpen}
        onClose={() => setIsSpreadsheetModalOpen(false)}
        onSyncComplete={(res) => {
          setSpreadsheetConfig(getLocalSpreadsheetConfig());
          setToastMessage({
            type: 'success',
            title: 'Sinkronisasi Spreadsheet Selesai',
            message: `Data ${res.storesCount} toko dan ${res.schedulesCount} jadwal SO dari Google Spreadsheet berhasil diperbarui!`
          });
        }}
        existingStores={parsedStores}
      />

      {/* TOAST FEEDBACK */}
      {toastMessage && (
        <ToastNotification
          type={toastMessage.type}
          title={toastMessage.title}
          message={toastMessage.message}
          onClose={() => setToastMessage(null)}
        />
      )}

    </div>
  );
};
