import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ExternalLink, 
  Link2, 
  Info, 
  ShieldCheck, 
  Sparkles, 
  Calendar, 
  Database,
  ArrowRight,
  PowerOff,
  Unlink,
  Trash2
} from 'lucide-react';
import { 
  extractSpreadsheetInfo, 
  getLocalSpreadsheetConfig, 
  saveSpreadsheetConfig, 
  deactivateSpreadsheetSync,
  syncMasterStoresFromSpreadsheet,
  SpreadsheetSyncResult 
} from '../../services/googleSpreadsheetService';
import { cleanAllDatabaseDuplicates } from '../../services/storageService';
import { Store, SOSchedule } from '../../types/stockOpname';

interface SpreadsheetSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: (result: SpreadsheetSyncResult) => void;
  existingStores?: Store[];
  existingSchedules?: SOSchedule[];
}

export const SpreadsheetSyncModal: React.FC<SpreadsheetSyncModalProps> = ({
  isOpen,
  onClose,
  onSyncComplete,
  existingStores = [],
  existingSchedules = [],
}) => {
  const [url, setUrl] = useState('');
  const [sheetName, setSheetName] = useState('MASTER TOKO BALI');
  const [targetMonth, setTargetMonth] = useState('09');
  const [targetYear, setTargetYear] = useState('2026');
  const [autoSyncOnLoad, setAutoSyncOnLoad] = useState(false);
  const [isCurrentlyActive, setIsCurrentlyActive] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [syncStep, setSyncStep] = useState<string>('');
  const [lastResult, setLastResult] = useState<SpreadsheetSyncResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isCleaningResidue, setIsCleaningResidue] = useState(false);
  const [residueNotice, setResidueNotice] = useState<string | null>(null);

  // Load existing config on open
  useEffect(() => {
    if (isOpen) {
      const config = getLocalSpreadsheetConfig();
      if (config.url) setUrl(config.url);
      if (config.sheetName) setSheetName(config.sheetName);
      setAutoSyncOnLoad(Boolean(config.autoSyncOnLoad));
      setIsCurrentlyActive(Boolean(config.url && config.isActive !== false));
      // Auto-sanitize legacy undefined Firestore validation message if it exists
      const cleanErr = config.lastError && !config.lastError.includes('Unsupported field value: undefined') && !config.lastError.includes('setDoc()')
        ? config.lastError
        : null;
      setErrorMessage(cleanErr);
      setLastResult(null);
      setSuccessNotice(null);
      setSyncStep('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const urlInfo = extractSpreadsheetInfo(url);

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        setErrorMessage(null);
      }
    } catch {
      // Fallback
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Apakah Anda yakin ingin menonaktifkan sinkronisasi Google Spreadsheet? Anda dapat mengaktifkannya kembali kapan saja.')) {
      return;
    }

    setIsDeactivating(true);
    setErrorMessage(null);
    setLastResult(null);

    try {
      await deactivateSpreadsheetSync();
      setUrl('');
      setIsCurrentlyActive(false);
      setAutoSyncOnLoad(false);
      setSuccessNotice('Sinkronisasi Google Spreadsheet telah berhasil dinonaktifkan. Data toko & jadwal yang sudah tersimpan tetap aman.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal menonaktifkan sinkronisasi.');
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleCleanResidue = async () => {
    setIsCleaningResidue(true);
    setResidueNotice(null);
    setErrorMessage(null);
    try {
      const report = await cleanAllDatabaseDuplicates();
      setResidueNotice(`Pembersihan tuntas: Berhasil menghapus ${report.purgedCount} dokumen residu & duplikat dari Firestore dan cache.`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal membersihkan residu database.');
    } finally {
      setIsCleaningResidue(false);
    }
  };

  const handleSaveAndSync = async () => {
    if (!urlInfo.valid) {
      setErrorMessage('Harap masukkan Link atau ID Google Spreadsheet yang valid.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessNotice(null);
    setLastResult(null);
    setSyncStep('Menghubungkan ke Google Spreadsheet...');

    try {
      // Save config preference first
      await saveSpreadsheetConfig({
        url: url.trim(),
        spreadsheetId: urlInfo.spreadsheetId,
        sheetName: sheetName.trim() || 'MASTER TOKO BALI',
        autoSyncOnLoad,
        isActive: true
      });
      setIsCurrentlyActive(true);

      setSyncStep(`Membaca susunan sheet '${sheetName}' & mengekstrak data toko...`);

      const result = await syncMasterStoresFromSpreadsheet(url.trim(), {
        targetMonth,
        targetYear,
        preferredSheetName: sheetName.trim() || 'MASTER TOKO BALI',
        existingStores,
        existingSchedules
      });

      if (result.success) {
        setSyncStep('Menyimpan ke Cloud Firestore & menyinkronkan semua device...');
        setLastResult(result);
        setIsCurrentlyActive(true);
        if (onSyncComplete) {
          onSyncComplete(result);
        }
      } else {
        setErrorMessage(result.error || result.message || 'Sinkronisasi gagal.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan sistem saat sinkronisasi.');
    } finally {
      setIsLoading(false);
      setSyncStep('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-start justify-between bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-t-3xl relative overflow-hidden">
          <div className="relative z-10 flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shrink-0 shadow-inner">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">Sinkron Google Spreadsheet</h2>
                {isCurrentlyActive ? (
                  <span className="bg-emerald-500/30 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Aktif
                  </span>
                ) : (
                  <span className="bg-slate-700/60 text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-600 flex items-center gap-1">
                    <PowerOff className="w-3 h-3 text-slate-400" />
                    Nonaktif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                Tautkan Google Spreadsheet Master Toko Bali agar jadwal & status toko langsung ter-update otomatis di semua perangkat.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer relative z-10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-slate-700">
          {/* Deactivation / Generic Success Alert */}
          {successNotice && (
            <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl flex items-start gap-3 animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-extrabold text-teal-900">
                  Pengaturan Diperbarui
                </p>
                <p className="text-teal-800 leading-relaxed">
                  {successNotice}
                </p>
              </div>
            </div>
          )}

          {/* Status / Success Alert */}
          {lastResult && lastResult.success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-extrabold text-emerald-900">
                  Sinkronisasi Berhasil!
                </p>
                <p className="text-emerald-800">
                  Telah diekstrak <span className="font-bold">{lastResult.storesCount} Toko</span> dan <span className="font-bold">{lastResult.schedulesCount} Jadwal SO</span> dari sheet <span className="font-bold underline">{lastResult.sheetName}</span>.
                </p>
                <p className="text-[11px] text-emerald-700">
                  Metode: {lastResult.sourceMethod} &bull; Data sudah tersimpan di Cloud Firestore dan langsung aktif untuk semua device.
                </p>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start justify-between gap-3 animate-fadeIn">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-extrabold text-rose-900">
                    Kendala Sinkronisasi
                  </p>
                  <p className="text-rose-800 whitespace-pre-line leading-relaxed">
                    {errorMessage}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-400 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-100 transition cursor-pointer"
                title="Tutup pesan kendala"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* URL Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-900 flex items-center gap-1.5 uppercase tracking-wider">
                <Link2 className="w-4 h-4 text-emerald-600" />
                Link Google Spreadsheet Master Toko:
              </label>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
              >
                Tempel dari Clipboard
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs.../edit#gid=0"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
              {urlInfo.valid && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  ID Terdeteksi
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              Bisa berupa link URL lengkap, link share, atau Sheet ID.
            </p>
          </div>

          {/* Sheet Name & Target Period Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-teal-600" />
                Nama Sheet Acuan Utama:
              </label>
              <input
                type="text"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="MASTER TOKO BALI"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
              <div className="flex flex-wrap gap-1.5 mt-1">
                {['MASTER TOKO BALI', 'ALL TOKO', 'JADWAL'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSheetName(s)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition cursor-pointer ${
                      sheetName.toUpperCase() === s.toUpperCase()
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                Periode Bulan SO:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="09">September (09)</option>
                  <option value="10">Oktober (10)</option>
                  <option value="11">November (11)</option>
                  <option value="12">Desember (12)</option>
                </select>
                <input
                  type="text"
                  value={targetYear}
                  onChange={(e) => setTargetYear(e.target.value)}
                  placeholder="2026"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Kolom tanggal jadwal SO akan diekstrak untuk periode ini.
              </p>
            </div>
          </div>

          {/* Auto-Sync Toggle */}
          <div className="p-3.5 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  Auto-Sync Otomatis saat Aplikasi Dibuka
                </p>
                <p className="text-[11px] text-slate-500">
                  Pemeriksaan berkala agar pembaruan di Google Sheets langsung tersinkron ke semua user.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input 
                type="checkbox" 
                checked={autoSyncOnLoad}
                onChange={(e) => setAutoSyncOnLoad(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Database & Cache Residue Cleaning Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  Bersihkan Residu Cache & Duplikat Firestore
                </p>
                <p className="text-[11px] text-slate-500">
                  Hapus dokumen jadwal hantu/residu lama jika tanggal spreadsheet baru saja diedit.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCleanResidue}
              disabled={isCleaningResidue || isLoading}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
            >
              {isCleaningResidue ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Membersihkan...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Bersihkan Residu</span>
                </>
              )}
            </button>
          </div>

          {residueNotice && (
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-2xl flex items-center gap-2 text-xs text-teal-900 font-medium animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
              <span>{residueNotice}</span>
            </div>
          )}

          {/* Sharing Permissions Guide Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Petunjuk Akses Google Sheets:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 leading-relaxed pl-1">
              <li>Buka spreadsheet Master Toko Anda di browser.</li>
              <li>Klik tombol hijau <strong className="text-slate-800">"Bagikan" (Share)</strong> di sudut kanan atas Google Sheets.</li>
              <li>Pada opsi <em>Akses umum</em>, pilih <strong className="text-slate-800">"Siapa saja yang memiliki link"</strong> dengan peran <strong className="text-slate-800">"Pelihat" (Viewer)</strong>.</li>
              <li>Klik <strong className="text-slate-800">"Salin link"</strong> lalu tempelkan ke kolom URL di atas.</li>
            </ol>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-4 border-t border-slate-100 bg-slate-50/70 rounded-b-3xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-medium">
            {syncStep ? (
              <span className="flex items-center gap-2 text-emerald-700 font-semibold animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {syncStep}
              </span>
            ) : (
              <span>Susunan sheet membaca <strong>{sheetName}</strong></span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {isCurrentlyActive && (
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={isLoading || isDeactivating}
                className="flex-1 sm:flex-initial px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Putuskan sambungan dan nonaktifkan sinkronisasi otomatis"
              >
                <PowerOff className="w-3.5 h-3.5 text-rose-600" />
                <span>{isDeactivating ? 'Menonaktifkan...' : 'Nonaktifkan Sinkron'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading || isDeactivating}
              className="flex-1 sm:flex-initial px-4 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSaveAndSync}
              disabled={isLoading || isDeactivating || !url.trim()}
              className={`flex-1 sm:flex-initial px-6 py-2.5 text-white text-xs font-black rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer ${
                isLoading || isDeactivating || !url.trim()
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-emerald-700/30'
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menyinkronkan...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Tarik & Sinkronkan Sekarang</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
