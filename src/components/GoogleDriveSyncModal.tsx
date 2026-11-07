import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  googleLogout,
  scanDriveFolderFiles,
  findAutocinemaFolder,
  syncFavOnlyFromDrive,
  syncInitialDataOnlyFromDrive,
  syncFromGoogleDrive,
  fetchAndApplyDriveUrl,
  uploadJsonFileDirect,
  uploadRawJsonDirect,
  SyncResult,
  DriveFolderInfo,
  DriveFileInfo,
  DEFAULT_GDRIVE_FAV_URL,
  DEFAULT_GDRIVE_DATA_URL,
} from '../services/googleDriveService';
import {
  Cloud,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Folder,
  FileJson,
  Tv,
  Film,
  Star,
  LogOut,
  X,
  ShieldCheck,
  Lock,
  KeyRound,
  Layers,
  ArrowRightLeft,
  Link as LinkIcon,
  Upload,
  FileText,
  Info,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

interface GoogleDriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplySyncData: (result: SyncResult) => void;
}

type SyncTab = 'drive_url' | 'upload_file' | 'google_auth' | 'paste_json';

export const GoogleDriveSyncModal: React.FC<GoogleDriveSyncModalProps> = ({
  isOpen,
  onClose,
  onApplySyncData,
}) => {
  // Password protection state (Passcode starts with 5)
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Active sync tab
  const [activeTab, setActiveTab] = useState<SyncTab>('drive_url');

  // Direct Drive URLs (preloaded from registered settings or defaults)
  const [favUrlInput, setFavUrlInput] = useState(
    () => localStorage.getItem('autocinema_gdrive_fav_url') || localStorage.getItem('autocinema_gdrive_url') || DEFAULT_GDRIVE_FAV_URL
  );
  const [dataUrlInput, setDataUrlInput] = useState(
    () => localStorage.getItem('autocinema_gdrive_data_url') || DEFAULT_GDRIVE_DATA_URL
  );
  const [isFetchingFav, setIsFetchingFav] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isFetchingBoth, setIsFetchingBoth] = useState(false);
  const [linkSavedNotice, setLinkSavedNotice] = useState<string | null>(null);

  // File Upload state
  const [uploadSlot, setUploadSlot] = useState<'auto' | 'fav.json' | 'initialData.json' | 'initialData2.json'>('auto');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Raw JSON Paste state
  const [rawJsonInput, setRawJsonInput] = useState('');
  const [pasteSlot, setPasteSlot] = useState<'fav.json' | 'initialData.json' | 'initialData2.json'>('fav.json');
  const [isApplyingPaste, setIsApplyingPaste] = useState(false);

  // User & Drive state (Google Auth tab)
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isPopupBlocked, setIsPopupBlocked] = useState(false);

  // Sync operations in progress
  const [syncingSection, setSyncingSection] = useState<'none' | 'fav' | 'initial' | 'all'>('none');
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Drive scan info (OAuth tab)
  const [folderInfo, setFolderInfo] = useState<DriveFolderInfo | null>(null);
  const [allFiles, setAllFiles] = useState<DriveFileInfo[]>([]);
  const [favFiles, setFavFiles] = useState<DriveFileInfo[]>([]);
  const [initialDataFiles, setInitialDataFiles] = useState<DriveFileInfo[]>([]);

  // Selected files for sync (OAuth tab)
  const [selectedFavFileId, setSelectedFavFileId] = useState<string>('');
  const [selectedInitialDataFileId, setSelectedInitialDataFileId] = useState<string>('');
  const [targetSlot, setTargetSlot] = useState<'initialData.json' | 'initialData2.json'>('initialData.json');

  // Stats from sync operations
  const [favSyncStats, setFavSyncStats] = useState<{ favoritesCount: number; playlistCount: number } | null>(null);
  const [initialSyncStats, setInitialSyncStats] = useState<{ moviesCount: number; foldersCount: number } | null>(null);

  // Listen for auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        if (accessToken) {
          setToken(accessToken);
        }
      },
      () => {
        setUser(null);
        setToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // When modal opens, refresh saved URLs from localStorage or apply defaults
  useEffect(() => {
    if (isOpen) {
      const savedFav =
        localStorage.getItem('autocinema_gdrive_fav_url') ||
        localStorage.getItem('autocinema_gdrive_url') ||
        DEFAULT_GDRIVE_FAV_URL;
      const savedData =
        localStorage.getItem('autocinema_gdrive_data_url') ||
        DEFAULT_GDRIVE_DATA_URL;

      setFavUrlInput(savedFav);
      setDataUrlInput(savedData);

      if (!localStorage.getItem('autocinema_gdrive_fav_url')) {
        localStorage.setItem('autocinema_gdrive_fav_url', DEFAULT_GDRIVE_FAV_URL);
        localStorage.setItem('autocinema_gdrive_url', DEFAULT_GDRIVE_FAV_URL);
      }
      if (!localStorage.getItem('autocinema_gdrive_data_url')) {
        localStorage.setItem('autocinema_gdrive_data_url', DEFAULT_GDRIVE_DATA_URL);
      }
    }
  }, [isOpen]);

  // When token is available and modal is open and unlocked, scan Drive folder
  useEffect(() => {
    if (isOpen && isUnlocked && token && activeTab === 'google_auth') {
      scanFolder(token);
    }
  }, [isOpen, isUnlocked, token, activeTab]);

  const handlePasswordSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (passwordInput.trim() === '5555') {
      setIsUnlocked(true);
      setPasswordError(null);
    } else {
      setPasswordError('رمز المرور غير صحيح! (تنويه: الرمز يبدأ بالرقم 5 ومكوّن من 4 أرقام متطابقة).');
    }
  };

  const handleLogin = async () => {
    setIsAuthLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsPopupBlocked(false);
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setToken(res.accessToken);
      await scanFolder(res.accessToken);
    } catch (err: any) {
      console.error('Login error:', err);
      const msg = err?.message || '';
      if (msg.includes('popup-blocked')) {
        setIsPopupBlocked(true);
      }
      setErrorMsg(msg || 'تعذر تسجيل الدخول بحساب Google. تأكد من السماح بالنوافذ المنبثقة.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSwitchAccount = async () => {
    await googleLogout();
    setUser(null);
    setToken(null);
    setFolderInfo(null);
    setAllFiles([]);
    setFavFiles([]);
    setInitialDataFiles([]);
    setSuccessMsg(null);
    setErrorMsg(null);
    setIsPopupBlocked(false);
    await handleLogin();
  };

  const handleLogout = async () => {
    await googleLogout();
    setUser(null);
    setToken(null);
    setFolderInfo(null);
    setAllFiles([]);
    setFavFiles([]);
    setInitialDataFiles([]);
    setSuccessMsg(null);
    setErrorMsg(null);
    setIsPopupBlocked(false);
  };

  const scanFolder = async (authToken: string) => {
    setIsScanning(true);
    setErrorMsg(null);
    try {
      const folder = await findAutocinemaFolder(authToken);
      setFolderInfo(folder);

      const folderId = folder ? folder.id : null;
      const scan = await scanDriveFolderFiles(folderId, authToken);

      setAllFiles(scan.allFiles || []);
      setFavFiles(scan.favFiles || []);
      setInitialDataFiles(scan.initialDataFiles || []);

      if (scan.favFile) {
        setSelectedFavFileId(scan.favFile.id);
      } else if (scan.favFiles.length > 0) {
        setSelectedFavFileId(scan.favFiles[0].id);
      }

      if (scan.initialDataFile) {
        setSelectedInitialDataFileId(scan.initialDataFile.id);
      } else if (scan.initialDataFiles.length > 0) {
        setSelectedInitialDataFileId(scan.initialDataFiles[0].id);
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      setErrorMsg(err?.message || 'حدث خطأ أثناء فحص ملفات Google Drive.');
    } finally {
      setIsScanning(false);
    }
  };

  // Save Link 1 (fav.json)
  const handleSaveFavLink = () => {
    if (!favUrlInput.trim()) {
      setErrorMsg('يرجى لصق رابط Google Drive لملف fav.json أولاً لحفظه.');
      return;
    }
    localStorage.setItem('autocinema_gdrive_fav_url', favUrlInput.trim());
    localStorage.setItem('autocinema_gdrive_url', favUrlInput.trim());
    setLinkSavedNotice('✓ تم حفظ رابط ملف FAV.JSON بنجاح! سيتم اعتماده للزر الأول (تحديث Fav) بالصفحة الرئيسية.');
    setTimeout(() => setLinkSavedNotice(null), 5000);
  };

  // Save Link 2 (initialData.json or Folder)
  const handleSaveDataLink = () => {
    if (!dataUrlInput.trim()) {
      setErrorMsg('يرجى لصق رابط Google Drive لملف initialdata.json أو المجلد أولاً لحفظه.');
      return;
    }
    localStorage.setItem('autocinema_gdrive_data_url', dataUrlInput.trim());
    setLinkSavedNotice('✓ تم حفظ رابط ملف INITIALDATA.JSON / المجلد بنجاح! سيتم اعتماده للزر الثاني (تحديث البيانات) بالصفحة الرئيسية.');
    setTimeout(() => setLinkSavedNotice(null), 5000);
  };

  // Save both links
  const handleSaveBothLinks = () => {
    let savedCount = 0;
    if (favUrlInput.trim()) {
      localStorage.setItem('autocinema_gdrive_fav_url', favUrlInput.trim());
      localStorage.setItem('autocinema_gdrive_url', favUrlInput.trim());
      savedCount++;
    }
    if (dataUrlInput.trim()) {
      localStorage.setItem('autocinema_gdrive_data_url', dataUrlInput.trim());
      savedCount++;
    }
    if (savedCount === 0) {
      setErrorMsg('يرجى إدخال رابط واحد على الأقل لحفظه.');
      return;
    }
    setLinkSavedNotice('✓ تم حفظ روابط Google Drive بنجاح! يمكنك الآن التحديث المباشر بنقرة واحدة من أزرار الصفحة الرئيسية.');
    setTimeout(() => setLinkSavedNotice(null), 5000);
  };

  // 1. Direct Fetch for FAV.JSON (Favorites & Playlist)
  const handleFetchFavUrl = async () => {
    if (!favUrlInput.trim()) {
      setErrorMsg('يرجى لصق رابط ملف fav.json من Google Drive.');
      return;
    }

    localStorage.setItem('autocinema_gdrive_fav_url', favUrlInput.trim());
    localStorage.setItem('autocinema_gdrive_url', favUrlInput.trim());

    setIsFetchingFav(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setProgressMsg('جاري جلب ملف fav.json وتحديث المفضلة وقائمة العرض...');

    try {
      const res = await fetchAndApplyDriveUrl(favUrlInput.trim(), 'fav.json', (msg) => {
        setProgressMsg(msg);
      });

      if (!res.success) {
        setErrorMsg(res.error || 'تعذر جلب ملف fav.json من Google Drive.');
      } else {
        const stats = res.stats;
        setFavSyncStats({
          favoritesCount: stats?.favoritesCount || 0,
          playlistCount: stats?.playlistCount || 0,
        });
        setSuccessMsg(
          `✓ تم بنجاح جلب وتحديث المفضلة (${stats?.favoritesCount || 0}) وقائمة شاشة العرض (${stats?.playlistCount || 0} عنصر)!`
        );
        onApplySyncData({
          success: true,
          folderName: 'Google Drive Fav Link',
          favData: res.data,
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل جلب وتطبيق ملف fav.json.');
    } finally {
      setIsFetchingFav(false);
      setProgressMsg('');
    }
  };

  // 2. Direct Fetch for INITIALDATA.JSON or Folder
  const handleFetchDataUrl = async () => {
    if (!dataUrlInput.trim()) {
      setErrorMsg('يرجى لصق رابط ملف initialdata.json أو رابط المجلد من Google Drive.');
      return;
    }

    localStorage.setItem('autocinema_gdrive_data_url', dataUrlInput.trim());

    setIsFetchingData(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setProgressMsg('جاري جلب ملف initialdata.json أو فحص المجلد من Google Drive...');

    try {
      const res = await fetchAndApplyDriveUrl(dataUrlInput.trim(), 'initialData.json', (msg) => {
        setProgressMsg(msg);
      });

      if (!res.success) {
        setErrorMsg(res.error || 'تعذر جلب ملف initialData أو المجلد من Google Drive.');
      } else {
        const stats = res.stats;
        setInitialSyncStats({
          moviesCount: stats?.moviesCount || 0,
          foldersCount: stats?.foldersCount || 0,
        });
        setSuccessMsg(
          `✓ تم بنجاح تحديث بيانات المستودعات (${stats?.foldersCount || 0}) والأفلام (${stats?.moviesCount || 0} فيلم)!`
        );
        onApplySyncData({
          success: true,
          folderName: 'Google Drive Data Link',
          initialData: res.initialData || res.data,
          favData: res.favData,
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل جلب وتطبيق ملف initialData أو المجلد.');
    } finally {
      setIsFetchingData(false);
      setProgressMsg('');
    }
  };

  // 3. Direct Fetch for BOTH links sequentially
  const handleFetchBothUrls = async () => {
    if (!favUrlInput.trim() && !dataUrlInput.trim()) {
      setErrorMsg('يرجى إدخال رابط واحد على الأقل (fav أو initialdata) للمتابعة.');
      return;
    }

    handleSaveBothLinks();
    setIsFetchingBoth(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    let favDone = false;
    let dataDone = false;

    try {
      if (favUrlInput.trim()) {
        setProgressMsg('1/2: جاري جلب وتحديث ملف fav.json (المفضلة وقائمة العرض)...');
        const resFav = await fetchAndApplyDriveUrl(favUrlInput.trim(), 'fav.json', (msg) => setProgressMsg(msg));
        if (resFav.success) {
          favDone = true;
          onApplySyncData({ success: true, folderName: 'Drive Fav', favData: resFav.data });
        }
      }

      if (dataUrlInput.trim()) {
        setProgressMsg('2/2: جاري جلب وتحديث ملف initialData.json أو المجلد (الأفلام والمستودعات)...');
        const resData = await fetchAndApplyDriveUrl(dataUrlInput.trim(), 'initialData.json', (msg) => setProgressMsg(msg));
        if (resData.success) {
          dataDone = true;
          onApplySyncData({ success: true, folderName: 'Drive Data', initialData: resData.initialData || resData.data, favData: resData.favData });
        }
      }

      setSuccessMsg(
        `✓ اكتمل التحديث الشامل بنجاح! ${favDone ? '(تم تحديث المفضلة)' : ''} ${dataDone ? '(تم تحديث الأفلام والمستودعات)' : ''}`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء التحديث الشامل.');
    } finally {
      setIsFetchingBoth(false);
      setProgressMsg('');
    }
  };

  // 2. Direct File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setProgressMsg(`جاري معالجة الملف ${file.name}...`);

    try {
      const fileNameLower = file.name.toLowerCase();
      let determinedSlot: 'fav.json' | 'initialData.json' | 'initialData2.json' = 'initialData.json';

      if (uploadSlot !== 'auto') {
        determinedSlot = uploadSlot;
      } else if (fileNameLower.includes('fav')) {
        determinedSlot = 'fav.json';
      } else if (fileNameLower.includes('initialdata2')) {
        determinedSlot = 'initialData2.json';
      } else {
        determinedSlot = 'initialData.json';
      }

      const res = await uploadJsonFileDirect(file, determinedSlot, (msg) => {
        setProgressMsg(msg);
      });

      if (!res.success) {
        setErrorMsg(res.error || 'فشل رفع الملف.');
      } else {
        const stats = res.stats;
        setSuccessMsg(
          `تم بنجاح رفع وتحديث بيانات (${determinedSlot}) من الملف "${file.name}"!`
        );

        if (determinedSlot === 'fav.json') {
          setFavSyncStats({
            favoritesCount: stats?.favoritesCount || 0,
            playlistCount: stats?.playlistCount || 0,
          });
          onApplySyncData({
            success: true,
            folderName: 'Local Upload',
            favData: res.data,
          });
        } else {
          setInitialSyncStats({
            moviesCount: stats?.moviesCount || 0,
            foldersCount: stats?.foldersCount || 0,
          });
          onApplySyncData({
            success: true,
            folderName: 'Local Upload',
            initialData: res.data,
          });
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء رفع وتطبيق الملف.');
    } finally {
      setIsUploading(false);
      setProgressMsg('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 3. Raw JSON Paste Handler
  const handleApplyPasteJson = async () => {
    if (!rawJsonInput.trim()) {
      setErrorMsg('يرجى لصق نص كود JSON أولاً.');
      return;
    }

    setIsApplyingPaste(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setProgressMsg('جاري التحقق من كود JSON وتطبيقه...');

    try {
      let parsed: any;
      try {
        parsed = JSON.parse(rawJsonInput.trim());
      } catch (pe: any) {
        throw new Error(`كود JSON غير سليم: ${pe?.message}`);
      }

      const res = await uploadRawJsonDirect(parsed, pasteSlot, (msg) => {
        setProgressMsg(msg);
      });

      if (!res.success) {
        setErrorMsg(res.error || 'فشل تطبيق البيانات.');
      } else {
        const stats = res.stats;
        setSuccessMsg(`تم بنجاح تطبيق الكود وتحديث (${pasteSlot})!`);

        if (pasteSlot === 'fav.json') {
          setFavSyncStats({
            favoritesCount: stats?.favoritesCount || 0,
            playlistCount: stats?.playlistCount || 0,
          });
          onApplySyncData({
            success: true,
            folderName: 'Pasted JSON',
            favData: res.data,
          });
        } else {
          setInitialSyncStats({
            moviesCount: stats?.moviesCount || 0,
            foldersCount: stats?.foldersCount || 0,
          });
          onApplySyncData({
            success: true,
            folderName: 'Pasted JSON',
            initialData: res.data,
          });
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء تطبيق كود JSON.');
    } finally {
      setIsApplyingPaste(false);
      setProgressMsg('');
    }
  };

  // OAuth: Section 1 Sync Fav
  const handleSyncFav = async () => {
    if (!token) {
      await handleLogin();
      return;
    }
    if (!selectedFavFileId) {
      setErrorMsg('يرجى اختيار ملف المفضلة (fav.json) من القائمة المنسدلة.');
      return;
    }

    setSyncingSection('fav');
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await syncFavOnlyFromDrive(selectedFavFileId, token, (msg) => {
        setProgressMsg(msg);
      });

      if (!res.success) {
        setErrorMsg(res.error || 'فشل تحديث ملف المفضلة وشاشة العرض.');
      } else {
        setFavSyncStats(res.stats || null);
        setSuccessMsg(
          `تم بنجاح تحديث المفضلة (${res.stats?.favoritesCount || 0}) وقائمة شاشة العرض (${res.stats?.playlistCount || 0} فيديو) من Google Drive!`
        );
        onApplySyncData({
          success: true,
          folderName: folderInfo?.name || 'Google Drive',
          favData: res.favData,
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء مزامنة المفضلة.');
    } finally {
      setSyncingSection('none');
    }
  };

  // OAuth: Section 2 Sync InitialData
  const handleSyncInitialData = async () => {
    if (!token) {
      await handleLogin();
      return;
    }
    if (!selectedInitialDataFileId) {
      setErrorMsg('يرجى اختيار ملف المستودعات والأفلام (initialData.json) من القائمة.');
      return;
    }

    setSyncingSection('initial');
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await syncInitialDataOnlyFromDrive(
        selectedInitialDataFileId,
        token,
        targetSlot,
        (msg) => {
          setProgressMsg(msg);
        }
      );

      if (!res.success) {
        setErrorMsg(res.error || 'فشل تحديث ملف المستودعات والأفلام.');
      } else {
        setInitialSyncStats(res.stats || null);
        setSuccessMsg(
          `تم بنجاح تحديث بيانات المستودعات (${res.stats?.foldersCount || 0} مستودع) والأفلام (${res.stats?.moviesCount || 0} فيلم) وحفظها في ${targetSlot}!`
        );
        onApplySyncData({
          success: true,
          folderName: folderInfo?.name || 'Google Drive',
          initialData: res.initialData,
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء مزامنة بيانات الأفلام.');
    } finally {
      setSyncingSection('none');
    }
  };

  // OAuth: Full 1-Click Sync
  const handleSyncAll = async () => {
    if (!token) {
      await handleLogin();
      return;
    }

    setSyncingSection('all');
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const result = await syncFromGoogleDrive(token, (msg) => {
        setProgressMsg(msg);
      });

      if (!result.success) {
        setErrorMsg(result.error || 'فشلت عملية المزامنة الشاملة.');
      } else {
        if (result.stats) {
          setFavSyncStats({
            favoritesCount: result.stats.favoritesCount,
            playlistCount: result.stats.playlistCount,
          });
          setInitialSyncStats({
            moviesCount: result.stats.moviesCount,
            foldersCount: result.stats.foldersCount,
          });
        }
        setSuccessMsg(
          `تمت المزامنة الشاملة بنجاح! تم تحديث الأفلام (${result.stats?.moviesCount || 0}) والمستودعات والمفضلة وشاشة العرض (${result.stats?.playlistCount || 0} عنصر).`
        );
        onApplySyncData(result);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء المزامنة الشاملة.');
    } finally {
      setSyncingSection('none');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 dir-rtl text-right"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-slate-900 border-2 border-indigo-500/40 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900 border-b border-indigo-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-amber-500 via-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30">
              <Cloud className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-white">
                  تحديث واستيراد البيانات من Google Drive
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black">
                  منطقة محمية (تنويه: الرمز يبدأ بالرقم 5)
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                تحديث ملف fav.json (المفضلة وقائمة شاشة العرض) وملف initialdata.json (المستودعات والكتالوج)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar">
          {/* STEP 1: PASSWORD GATE (Masked: hint starts with 5) */}
          {!isUnlocked ? (
            <div className="p-6 sm:p-8 rounded-2xl bg-slate-950/90 border border-amber-500/30 flex flex-col items-center justify-center text-center space-y-4 my-auto">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
                <KeyRound className="w-8 h-8 animate-pulse" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h4 className="text-base sm:text-lg font-black text-white">
                  يرجى إدخال رمز الأمان للمتابعة
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  للاتصال بـ Google Drive وتحديث ملفات النظام، أدخل رمز الأمان المعتمد للتطبيق{' '}
                  <span className="font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                    تنويه: يبدأ بالرقم 5 (مكوّن من 4 أرقام متطابقة)
                  </span>
                </p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="w-full max-w-xs space-y-3 pt-2">
                <div className="relative">
                  <input
                    type="password"
                    maxLength={10}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError(null);
                    }}
                    placeholder="رمز المرور (تنويه: يبدأ بـ 5...)"
                    autoFocus
                    className="w-full px-4 py-2.5 text-center text-lg font-mono tracking-widest bg-slate-900 text-white rounded-xl border border-slate-700 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 pointer-events-none" />
                </div>

                {passwordError && (
                  <p className="text-xs text-rose-400 font-bold animate-in fade-in">
                    {passwordError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
                >
                  تأكيد الدخول
                </button>
              </form>
            </div>
          ) : (
            <>
              {/* Navigation Tabs between Methods */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('drive_url')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'drive_url'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>رابط Drive مباشر</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('upload_file')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'upload_file'
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/20 font-black'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>رفع ملف من الجهاز</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('google_auth')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'google_auth'
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-md shadow-purple-600/20 font-black'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>تسجيل دخول Google</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('paste_json')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'paste_json'
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-md shadow-emerald-600/20 font-black'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>لصق كود JSON</span>
                </button>
              </div>

              {/* TAB 1: GOOGLE DRIVE DIRECT URLS (TWO SECTIONS: FAV & DATA/FOLDER) */}
              {activeTab === 'drive_url' && (
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-950/20 border-2 border-amber-500/40 space-y-4 shadow-xl animate-in fade-in">
                  <div className="flex items-start justify-between gap-3 border-b border-amber-500/30 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        <LinkIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm sm:text-base font-black text-amber-200">
                          روابط Google Drive المسجلة للتحديث المباشر
                        </h4>
                        <p className="text-xs text-amber-300/80">
                          خانتان مستقلتان: خانة لملف المفضلة (FAV) وخانة ثانية لملف الأفلام والبيانات (INITIALDATA) أو المجلد الشامل
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px] font-black whitespace-nowrap">
                      موصى به ✔
                    </span>
                  </div>

                  {/* Notification banner */}
                  {linkSavedNotice && (
                    <p className="text-xs text-emerald-400 font-bold bg-emerald-950/80 p-2.5 rounded-xl border border-emerald-500/40 animate-in fade-in flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{linkSavedNotice}</span>
                    </p>
                  )}

                  <div className="space-y-4">
                    {/* FIELD 1: FAV.JSON */}
                    <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-2.5 shadow-md">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                          <label className="text-xs sm:text-sm font-black text-amber-300">
                            الخانة الأولى: رابط ملف FAV.JSON (المفضلة وقائمة شاشة العرض)
                          </label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setFavUrlInput(DEFAULT_GDRIVE_FAV_URL);
                              localStorage.setItem('autocinema_gdrive_fav_url', DEFAULT_GDRIVE_FAV_URL);
                              localStorage.setItem('autocinema_gdrive_url', DEFAULT_GDRIVE_FAV_URL);
                              setLinkSavedNotice('✓ تم تعيين وحفظ الرابط الافتراضي لملف FAV.JSON بنجاح!');
                              setTimeout(() => setLinkSavedNotice(null), 5000);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold transition-all cursor-pointer"
                            title="استعادة الرابط الافتراضي المعتمد"
                          >
                            🔄 استعادة الافتراضي
                          </button>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/30 font-mono">
                            يعمل به زر [تحديث Fav] بالرئيسية
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="url"
                          value={favUrlInput}
                          onChange={(e) => setFavUrlInput(e.target.value)}
                          placeholder={DEFAULT_GDRIVE_FAV_URL}
                          className="flex-1 px-3.5 py-2 text-xs sm:text-sm bg-slate-950 text-white rounded-xl border border-amber-500/40 focus:outline-none focus:border-amber-400 font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleSaveFavLink}
                          disabled={!favUrlInput.trim()}
                          title="حفظ هذا الرابط ليعمل به زر تحديث Fav بالصفحة الرئيسية"
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95 disabled:opacity-50"
                        >
                          💾 حفظ للزر الأول
                        </button>
                        <button
                          type="button"
                          onClick={handleFetchFavUrl}
                          disabled={isFetchingFav || !favUrlInput.trim()}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 text-xs font-black transition-all cursor-pointer whitespace-nowrap active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {isFetchingFav ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 fill-slate-950" />}
                          <span>{isFetchingFav ? 'جاري التحديث...' : 'تحديث Fav الآن'}</span>
                        </button>
                      </div>

                      {favUrlInput.trim() && localStorage.getItem('autocinema_gdrive_fav_url') === favUrlInput.trim() && (
                        <p className="text-[11px] text-emerald-400 font-bold flex items-center gap-1.5 pr-1">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>هذا الرابط مسجل كمعتمد للزر الأول (تحديث Fav) بالصفحة الرئيسية.</span>
                        </p>
                      )}
                    </div>

                    {/* FIELD 2: INITIALDATA.JSON OR FOLDER */}
                    <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-2.5 shadow-md">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></span>
                          <label className="text-xs sm:text-sm font-black text-indigo-300">
                            الخانة الثانية: رابط INITIALDATA.JSON أو مجلد البيانات الكامل
                          </label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setDataUrlInput(DEFAULT_GDRIVE_DATA_URL);
                              localStorage.setItem('autocinema_gdrive_data_url', DEFAULT_GDRIVE_DATA_URL);
                              setLinkSavedNotice('✓ تم تعيين وحفظ الرابط الافتراضي لـ INITIALDATA.JSON بنجاح!');
                              setTimeout(() => setLinkSavedNotice(null), 5000);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 font-bold transition-all cursor-pointer"
                            title="استعادة الرابط الافتراضي المعتمد"
                          >
                            🔄 استعادة الافتراضي
                          </button>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/30 font-mono">
                            يعمل به زر [تحديث البيانات] بالرئيسية
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="url"
                          value={dataUrlInput}
                          onChange={(e) => setDataUrlInput(e.target.value)}
                          placeholder={DEFAULT_GDRIVE_DATA_URL}
                          className="flex-1 px-3.5 py-2 text-xs sm:text-sm bg-slate-950 text-white rounded-xl border border-indigo-500/40 focus:outline-none focus:border-indigo-400 font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleSaveDataLink}
                          disabled={!dataUrlInput.trim()}
                          title="حفظ هذا الرابط ليعمل به زر تحديث كل البيانات بالصفحة الرئيسية"
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/40 text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95 disabled:opacity-50"
                        >
                          💾 حفظ للزر الثاني
                        </button>
                        <button
                          type="button"
                          onClick={handleFetchDataUrl}
                          disabled={isFetchingData || !dataUrlInput.trim()}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 text-white text-xs font-black transition-all cursor-pointer whitespace-nowrap active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {isFetchingData ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Folder className="w-3.5 h-3.5 text-white" />}
                          <span>{isFetchingData ? 'جاري التحديث...' : 'تحديث البيانات الآن'}</span>
                        </button>
                      </div>

                      {dataUrlInput.trim() && localStorage.getItem('autocinema_gdrive_data_url') === dataUrlInput.trim() && (
                        <p className="text-[11px] text-emerald-400 font-bold flex items-center gap-1.5 pr-1">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>هذا الرابط مسجل كمعتمد للزر الثاني (تحديث كل البيانات) بالصفحة الرئيسية.</span>
                        </p>
                      )}
                    </div>

                    {/* BULK ACTIONS BAR */}
                    <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={handleSaveBothLinks}
                        disabled={!favUrlInput.trim() && !dataUrlInput.trim()}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-black transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        💾 حفظ الخانتين معاً للصفحة الرئيسية
                      </button>

                      <button
                        type="button"
                        onClick={handleFetchBothUrls}
                        disabled={isFetchingBoth || (!favUrlInput.trim() && !dataUrlInput.trim())}
                        className="w-full sm:flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-indigo-600 to-purple-600 hover:from-amber-400 text-white font-black text-xs sm:text-sm shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isFetchingBoth ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-amber-300" />
                        )}
                        <span>{isFetchingBoth ? 'جاري التحديث الشامل من الرابطين...' : '⚡ تحديث شامل فوري من الرابطين معاً'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Helpful Quick Guide */}
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-amber-500/30 text-xs text-slate-300 space-y-1.5 leading-relaxed">
                    <p className="font-bold text-amber-300 flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span>كيفية الحصول على الروابط من Google Drive:</span>
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-300 pr-1 text-[11px]">
                      <li>افتح <span className="font-bold text-white">Google Drive</span> من أي متصفح.</li>
                      <li>انقر بالزر الأيمن على ملف <span className="font-mono text-amber-300">fav.json</span> أو <span className="font-mono text-indigo-300">initialdata.json</span> (أو مجلد <span className="font-mono text-purple-300">AUTOCINEMA-PUPLIC</span>) واختر <span className="font-bold text-white">مشاركة (Share)</span>.</li>
                      <li>في الوصول العام، حدد <span className="text-emerald-300 font-bold">أي شخص لديه الرابط (Anyone with the link)</span>.</li>
                      <li>انسخ الرابط والصقه في الخانة المناسبة واضغط حفظ واعتماد.</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* TAB 2: LOCAL FILE UPLOAD (Offline / Local File Drag & Drop) */}
              {activeTab === 'upload_file' && (
                <div className="p-4 sm:p-5 rounded-2xl bg-indigo-950/20 border-2 border-indigo-500/40 space-y-4 shadow-xl animate-in fade-in">
                  <div className="flex items-start justify-between gap-3 border-b border-indigo-500/30 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm sm:text-base font-black text-indigo-200">
                          رفع ملف JSON مباشرة من جهازك
                        </h4>
                        <p className="text-xs text-indigo-300/80">
                          اختر ملف fav.json أو initialdata.json المحفوظ على جهازك لتحديث التطبيق فوراً
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Target Slot Choice */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">
                      مكان الحفظ المطلوب في التطبيق:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <label className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center gap-1.5 ${
                        uploadSlot === 'auto'
                          ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}>
                        <input
                          type="radio"
                          name="uploadSlot"
                          checked={uploadSlot === 'auto'}
                          onChange={() => setUploadSlot('auto')}
                          className="accent-indigo-500"
                        />
                        <span>كشف تلقائي من الاسم</span>
                      </label>

                      <label className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center gap-1.5 ${
                        uploadSlot === 'fav.json'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}>
                        <input
                          type="radio"
                          name="uploadSlot"
                          checked={uploadSlot === 'fav.json'}
                          onChange={() => setUploadSlot('fav.json')}
                          className="accent-amber-500"
                        />
                        <span>fav.json (المفضلة)</span>
                      </label>

                      <label className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center gap-1.5 ${
                        uploadSlot === 'initialData.json'
                          ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}>
                        <input
                          type="radio"
                          name="uploadSlot"
                          checked={uploadSlot === 'initialData.json'}
                          onChange={() => setUploadSlot('initialData.json')}
                          className="accent-indigo-500"
                        />
                        <span>initialData.json (الرئيسي)</span>
                      </label>

                      <label className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center gap-1.5 ${
                        uploadSlot === 'initialData2.json'
                          ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}>
                        <input
                          type="radio"
                          name="uploadSlot"
                          checked={uploadSlot === 'initialData2.json'}
                          onChange={() => setUploadSlot('initialData2.json')}
                          className="accent-indigo-500"
                        />
                        <span>initialData2.json</span>
                      </label>
                    </div>
                  </div>

                  {/* Dropzone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-8 rounded-2xl border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 bg-slate-950/70 hover:bg-slate-950/90 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3 group-hover:scale-110 transition-transform">
                      <FileJson className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-bold text-white mb-1">
                      اضغط هنا لاختيار ملف JSON من جهازك (أو اسحبه وأفلته هنا)
                    </p>
                    <p className="text-xs text-slate-400">
                      يدعم ملفات fav.json (المفضلة وقائمة شاشة العرض) و initialdata.json (الأفلام والمستودعات)
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 3: GOOGLE OAUTH SIGN-IN (With anti-popup blocked & diagnostic guidance) */}
              {activeTab === 'google_auth' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Account Connection Bar */}
                  {!user ? (
                    <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col items-center justify-center text-center space-y-4">
                      <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-inner">
                        <ShieldCheck className="w-8 h-8" />
                      </div>
                      <div className="space-y-1.5 max-w-md">
                        <h4 className="text-sm sm:text-base font-black text-white">
                          تسجيل الدخول بحساب Google
                        </h4>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          يمكنك تسجيل الدخول بحساب Google المالك لمجلد AUTOCINEMA-PUPLIC للمزامنة التلقائية.
                        </p>
                      </div>

                      {/* Google Sign-in Button */}
                      <button
                        type="button"
                        onClick={handleLogin}
                        disabled={isAuthLoading}
                        className="flex items-center gap-3 px-6 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-sm shadow-lg hover:shadow-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 48 48">
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                        </svg>
                        <span>
                          {isAuthLoading ? 'جاري الاتصال واختيار الحساب...' : 'تسجيل الدخول بحساب Google'}
                        </span>
                      </button>

                      {/* Popup Blocked Warning & Direct Action */}
                      {isPopupBlocked && (
                        <div className="p-3.5 rounded-xl bg-amber-950/80 border border-amber-500/50 text-right space-y-2 max-w-md animate-in fade-in">
                          <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <span>المتصفح حظر النافذة المنبثقة لتسجيل الدخول:</span>
                          </p>
                          <p className="text-[11px] text-slate-300">
                            لحماية خصوصيتك، قام متصفحك بحجب النافذة. انقر على أيقونة النوافذ المنبثقة في شريط العنوان واختر <strong className="text-white">السماح دائماً (Always Allow Pop-ups)</strong> ثم انقر أدناه:
                          </p>
                          <button
                            type="button"
                            onClick={handleLogin}
                            className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
                          >
                            إعادة فتح نافذة الدخول الآن
                          </button>
                        </div>
                      )}

                      {/* Google Access Blocked Guidance Banner */}
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-purple-500/30 text-right text-xs space-y-1.5 max-w-md">
                        <p className="font-bold text-purple-300 flex items-center gap-1.5">
                          <Info className="w-4 h-4 text-purple-400 flex-shrink-0" />
                          <span>تنويه إذا ظهرت رسالة Access blocked من Google:</span>
                        </p>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          إذا ظهر لك في شاشة Google رسالة <span className="font-mono text-amber-300">(has not completed the Google verification process)</span>، فهذا يعني أن حسابك لم يُسجَّل كمستخدم تجريبي (Test User) في مشروع Google Cloud. يمكنك بكل سهولة استخدام تبويب <strong className="text-amber-300">"رابط Drive مباشر"</strong> أو تبويب <strong className="text-indigo-300">"رفع ملف من الجهاز"</strong> بالأعلى للاستيراد فوراً بدون تسجيل دخول.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Logged in User Bar */}
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {user.photoURL ? (
                            <img
                              src={user.photoURL}
                              alt={user.displayName || 'Google User'}
                              className="w-9 h-9 rounded-full border border-purple-400"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-purple-600 text-white font-black flex items-center justify-center text-sm">
                              {(user.displayName || user.email || 'G')[0].toUpperCase()}
                            </div>
                          )}
                          <div className="text-xs">
                            <p className="font-bold text-white flex items-center gap-1.5">
                              <span>{user.displayName || 'مستخدم Google'}</span>
                              <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px]">
                                متصل ✔
                              </span>
                            </p>
                            <p className="text-slate-400 font-mono text-[11px]">{user.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSwitchAccount}
                            disabled={syncingSection !== 'none'}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900 text-indigo-200 border border-indigo-500/40 text-xs font-bold transition-all cursor-pointer"
                            title="الدخول بحساب Google آخر"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>تبديل الحساب</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => token && scanFolder(token)}
                            disabled={isScanning || syncingSection !== 'none'}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                            title="إعادة فحص المجلد والملفات"
                          >
                            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={handleLogout}
                            disabled={syncingSection !== 'none'}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/30 text-xs font-bold transition-all cursor-pointer"
                            title="تسجيل الخروج"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>خروج</span>
                          </button>
                        </div>
                      </div>

                      {/* Folder Status Banner */}
                      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-amber-400" />
                          <span className="font-bold text-slate-200">
                            مجلد Google Drive:
                          </span>
                          <span className="font-mono text-amber-300 font-black">
                            {folderInfo?.name || 'AUTOCINEMA-PUPLIC'}
                          </span>
                        </div>
                        {isScanning ? (
                          <span className="text-indigo-400 font-bold flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            جاري فحص الملفات...
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            تم العثور على {allFiles.length} ملف
                          </span>
                        )}
                      </div>

                      {/* Fav File Section */}
                      <div className="p-4 rounded-2xl bg-amber-950/20 border-2 border-amber-500/40 space-y-3 shadow-lg">
                        <div className="flex items-center justify-between border-b border-amber-500/30 pb-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <Star className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-amber-200">
                                تحديث المفضلة وقائمة شاشة العرض (fav.json)
                              </h4>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-300">
                            حدد ملف المفضلة من المجلد:
                          </label>
                          <select
                            value={selectedFavFileId}
                            onChange={(e) => setSelectedFavFileId(e.target.value)}
                            className="w-full px-3.5 py-2 text-xs bg-slate-900 text-amber-200 rounded-xl border border-amber-500/30 focus:outline-none focus:border-amber-400 font-mono cursor-pointer"
                          >
                            {favFiles.length === 0 ? (
                              <option value="">لم يتم العثور على ملفات fav في المجلد</option>
                            ) : (
                              favFiles.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name} {f.size ? `(${Math.round(parseInt(f.size) / 1024)} KB)` : ''}
                                </option>
                              ))
                            )}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={handleSyncFav}
                          disabled={syncingSection !== 'none' || !selectedFavFileId}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          {syncingSection === 'fav' ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                          ) : (
                            <Star className="w-4 h-4 fill-slate-950" />
                          )}
                          <span>تحديث المفضلة وقائمة شاشة العرض من هذا الملف</span>
                        </button>
                      </div>

                      {/* InitialData Section */}
                      <div className="p-4 rounded-2xl bg-indigo-950/20 border-2 border-indigo-500/40 space-y-3 shadow-lg">
                        <div className="flex items-center justify-between border-b border-indigo-500/30 pb-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              <Layers className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-indigo-200">
                                تحديث بيانات المستودعات والأفلام (initialdata)
                              </h4>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-300">
                            حدد ملف المستودعات من المجلد:
                          </label>
                          <select
                            value={selectedInitialDataFileId}
                            onChange={(e) => setSelectedInitialDataFileId(e.target.value)}
                            className="w-full px-3.5 py-2 text-xs bg-slate-900 text-indigo-200 rounded-xl border border-indigo-500/30 focus:outline-none focus:border-indigo-400 font-mono cursor-pointer"
                          >
                            {initialDataFiles.length === 0 ? (
                              <option value="">لم يتم العثور على ملفات initialdata في المجلد</option>
                            ) : (
                              initialDataFiles.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name} {f.size ? `(${Math.round(parseInt(f.size) / 1024)} KB)` : ''}
                                </option>
                              ))
                            )}
                          </select>
                        </div>

                        {/* Target Slot Choice */}
                        <div className="flex items-center gap-4 text-xs pt-1">
                          <span className="text-slate-400 font-bold">مكان الحفظ:</span>
                          <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                            <input
                              type="radio"
                              name="targetSlot"
                              checked={targetSlot === 'initialData.json'}
                              onChange={() => setTargetSlot('initialData.json')}
                              className="accent-indigo-500"
                            />
                            <span className="font-mono text-emerald-300 font-bold">initialData.json (الرئيسي)</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                            <input
                              type="radio"
                              name="targetSlot"
                              checked={targetSlot === 'initialData2.json'}
                              onChange={() => setTargetSlot('initialData2.json')}
                              className="accent-indigo-500"
                            />
                            <span className="font-mono text-indigo-300 font-bold">initialData2.json</span>
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={handleSyncInitialData}
                          disabled={syncingSection !== 'none' || !selectedInitialDataFileId}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 text-white font-black text-xs sm:text-sm shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          {syncingSection === 'initial' ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          ) : (
                            <Film className="w-4 h-4" />
                          )}
                          <span>تحديث بيانات المستودعات والأفلام من هذا الملف</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: RAW JSON PASTE */}
              {activeTab === 'paste_json' && (
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-950/20 border-2 border-emerald-500/40 space-y-4 shadow-xl animate-in fade-in">
                  <div className="flex items-start justify-between gap-3 border-b border-emerald-500/30 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm sm:text-base font-black text-emerald-200">
                          لصق كود JSON مباشرة وتطبيقه
                        </h4>
                        <p className="text-xs text-emerald-300/80">
                          يمكنك نسخ محتوى ملف fav.json أو initialdata.json ولصقه هنا فورياً
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Target Slot Choice */}
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-slate-400 font-bold">مكان الحفظ:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                      <input
                        type="radio"
                        name="pasteSlot"
                        checked={pasteSlot === 'fav.json'}
                        onChange={() => setPasteSlot('fav.json')}
                        className="accent-emerald-500"
                      />
                      <span className="font-mono text-amber-300 font-bold">fav.json (المفضلة وشاشة العرض)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-200">
                      <input
                        type="radio"
                        name="pasteSlot"
                        checked={pasteSlot === 'initialData.json'}
                        onChange={() => setPasteSlot('initialData.json')}
                        className="accent-emerald-500"
                      />
                      <span className="font-mono text-indigo-300 font-bold">initialData.json (الأفلام والمستودعات)</span>
                    </label>
                  </div>

                  <textarea
                    rows={8}
                    value={rawJsonInput}
                    onChange={(e) => setRawJsonInput(e.target.value)}
                    placeholder='الصق كود JSON هنا... مثال: {"cinemaPlaylist": [...], "allFavorites": {...}}'
                    className="w-full p-3 bg-slate-900 text-slate-200 rounded-xl border border-emerald-500/30 focus:outline-none focus:border-emerald-400 font-mono text-xs"
                  />

                  <button
                    type="button"
                    onClick={handleApplyPasteJson}
                    disabled={isApplyingPaste || !rawJsonInput.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-black text-xs sm:text-sm shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {isApplyingPaste ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    <span>تطبيق كود JSON وتحديث النظام</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Sync Progress Banner */}
          {(syncingSection !== 'none' || isFetchingFav || isFetchingData || isFetchingBoth || isUploading || isApplyingPaste) && (
            <div className="p-4 rounded-xl bg-indigo-950/70 border border-indigo-500/50 flex flex-col items-center justify-center text-center space-y-2 animate-in fade-in">
              <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
              <p className="text-sm font-black text-white">{progressMsg || 'جاري التحديث...'}</p>
              <p className="text-xs text-indigo-300">
                يتم جلب الملف وحفظه وتطبيق التحديثات فورياً في التطبيق
              </p>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-950/80 border border-red-500/60 flex items-start gap-3 text-red-200 text-xs sm:text-sm animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-black text-red-300">تنبيه أثناء العملية:</p>
                <p className="leading-relaxed">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {successMsg && (
            <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-500/60 space-y-3 text-emerald-100 animate-in fade-in">
              <div className="flex items-center gap-2 text-emerald-300 font-black text-sm">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                {initialSyncStats && (
                  <>
                    <div className="p-2 rounded-lg bg-emerald-900/40 border border-emerald-500/30 text-center">
                      <Film className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                      <p className="text-[10px] text-slate-300">الأفلام المستحدثة</p>
                      <p className="text-sm font-black text-white font-mono">
                        {initialSyncStats.moviesCount.toLocaleString('ar-EG')}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-900/40 border border-emerald-500/30 text-center">
                      <Folder className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                      <p className="text-[10px] text-slate-300">المستودعات</p>
                      <p className="text-sm font-black text-white font-mono">
                        {initialSyncStats.foldersCount}
                      </p>
                    </div>
                  </>
                )}
                {favSyncStats && (
                  <>
                    <div className="p-2 rounded-lg bg-emerald-900/40 border border-emerald-500/30 text-center">
                      <Star className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                      <p className="text-[10px] text-slate-300">المفضلة المحدثة</p>
                      <p className="text-sm font-black text-white font-mono">
                        {favSyncStats.favoritesCount.toLocaleString('ar-EG')}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-900/40 border border-emerald-500/30 text-center">
                      <Tv className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
                      <p className="text-[10px] text-slate-300">شاشة العرض (Playlist)</p>
                      <p className="text-sm font-black text-white font-mono">
                        {favSyncStats.playlistCount}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
          >
            إغلاق
          </button>

          {isUnlocked && user && activeTab === 'google_auth' && (
            <button
              type="button"
              onClick={handleSyncAll}
              disabled={syncingSection !== 'none'}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-indigo-600 to-purple-600 hover:from-amber-400 text-white font-black text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {syncingSection === 'all' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              <span>
                {syncingSection === 'all'
                  ? 'جاري التحديث الشامل...'
                  : 'مزامنة وتحديث الملفين معاً (الشامل)'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
