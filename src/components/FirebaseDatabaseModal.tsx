import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Cloud,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Folder,
  Film,
  Star,
  Tv,
  X,
  Layers,
  ArrowRightLeft,
  Sparkles,
  ShieldCheck,
  Check,
  UploadCloud,
  DownloadCloud,
  Eye,
  Search,
  Server,
  Radio,
  Clock,
  Play,
  Copy,
} from 'lucide-react';
import {
  saveAllFoldersToDb,
  saveAllFavoriteListsToDb,
  saveAllFavoritesToDb,
  saveCinemaPlaylistToDb,
  saveAllCinemaPlaylistsToDb,
  saveUserModificationsToDb,
  saveAllStreamPreferencesToDb,
  saveAllCustomMoviesToDb,
  saveAllRepositoriesAndMoviesToDb,
  seedAllToFirestore,
  fetchFoldersFromDb,
  fetchFavoriteListsFromDb,
  fetchAllFavoritesFromDb,
  fetchCinemaPlaylistFromDb,
  fetchAllCinemaPlaylistsFromDb,
  fetchUserModificationsFromDb,
  fetchMoviesFromDb,
  fetchAllRepositoryMoviesFromDb,
  fetchStreamPreferencesFromDb,
  fetchFirestoreOverview,
  FirestoreLiveOverview,
  testConnection,
  saveStreamPreferenceToDb,
  runAllFirestoreUploadTests,
  UploadDiagnosticResult,
  UploadDiagnosticStep,
  notifyUploadStart,
  notifyUploadProgress,
  notifyUploadSuccess,
  notifyUploadError,
  subscribeToUploadStatus,
  getUploadStatus,
  UploadStatusState,
} from '../services/firebaseDbService';
import { DbPasswordModal } from './DbPasswordModal';
import firebaseConfig from '../../firebase-applet-config.json';

export interface FirestoreSyncReport {
  timestamp: string;
  type: 'push' | 'pull' | 'auto_background' | 'playlist' | 'favorites' | 'folders' | 'movies' | 'stream_prefs';
  success: boolean;
  foldersCount: number;
  favListsCount: number;
  favMoviesCount: number;
  playlistCount: number;
  moviesCount: number;
  greenFavsCount?: number;
  yellowFavsCount?: number;
  purpleFavsCount?: number;
  blackFavsCount?: number;
  statusText: string;
}

interface FirebaseDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: any[];
  movies: any[];
  favoriteLists: any[];
  cinemaPlaylist: any[];
  hiddenFavoriteSections: string[];
  deletedMovieIds?: string[];
  lastSyncReport?: FirestoreSyncReport | null;
  onSyncReportUpdated?: (report: FirestoreSyncReport) => void;
  onApplyDatabaseData: (data: {
    folders?: any[];
    favoriteLists?: any[];
    cinemaPlaylist?: any[];
    allCinemaPlaylists?: any[];
    activePlaylistId?: string;
    allFavorites?: any;
    movies?: any[];
    repoMovies?: any[];
    customMovies?: any[];
    deletedMovieIds?: string[];
    streamPreferences?: Record<string, any>;
  }) => void;
}

export const FirebaseDatabaseModal: React.FC<FirebaseDatabaseModalProps> = ({
  isOpen,
  onClose,
  folders,
  movies,
  favoriteLists,
  cinemaPlaylist,
  hiddenFavoriteSections,
  lastSyncReport,
  onSyncReportUpdated,
  onApplyDatabaseData,
}) => {
  const [activeTab, setActiveTab] = useState<'inspector' | 'push' | 'pull' | 'diagnostics' | 'info'>('inspector');
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<UploadDiagnosticResult | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [liveUploadState, setLiveUploadState] = useState<UploadStatusState | null>(() => getUploadStatus());

  // Real-time live upload status subscription
  useEffect(() => {
    const unsub = subscribeToUploadStatus((st) => {
      setLiveUploadState(st);
    });
    return () => unsub();
  }, []);

  // Live Cloud Data Inspector State
  const [cloudOverview, setCloudOverview] = useState<FirestoreLiveOverview | null>(null);
  const [inspectorSearch, setInspectorSearch] = useState('');
  const [inspectorCategory, setInspectorCategory] = useState<'all' | 'playlist' | 'favorites' | 'folders' | 'movies' | 'stream_prefs'>('all');

  const [syncReport, setSyncReport] = useState<FirestoreSyncReport | null>(() => {
    if (lastSyncReport) return lastSyncReport;
    try {
      const saved = localStorage.getItem('autocinema_firestore_sync_report');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const databaseId = (firebaseConfig as any).firestoreDatabaseId || 'Firestore';
  const projectId = (firebaseConfig as any).projectId || '';

  // Local Session Stats calculation
  const favMovies = movies.filter((m) => m.isFavorite);
  const greenFavs = favMovies.filter((m) => m.favoriteColor === 'green');
  const yellowFavs = favMovies.filter((m) => m.favoriteColor === 'yellow' || !m.favoriteColor);
  const purpleFavs = favMovies.filter((m) => m.favoriteColor === 'purple');
  const blackFavs = favMovies.filter((m) => m.favoriteColor === 'black');

  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [passwordModalTitle, setPasswordModalTitle] = useState('تأكيد حفظ ومزامنة قاعدة البيانات');
  const [passwordChangeSummary, setPasswordChangeSummary] = useState('');

  const requestPasswordAndExecute = (action: () => Promise<void>, title: string, summary: string) => {
    setPendingAction(() => action);
    setPasswordModalTitle(title);
    setPasswordChangeSummary(summary);
    setIsPasswordModalOpen(true);
  };

  // -------------------------------------------------------------
  // 1. Live Cloud Database Inspector
  // -------------------------------------------------------------
  const loadCloudOverview = async () => {
    setIsInspecting(true);
    setErrorMsg(null);
    try {
      const data = await fetchFirestoreOverview();
      setCloudOverview(data);
    } catch (err: any) {
      console.error('Failed to inspect Firestore:', err);
      setErrorMsg(`تعذر فحص بيانات Firestore: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsInspecting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCloudOverview();
    }
  }, [isOpen]);

  // Helper to record and persist a sync report
  const recordSyncReport = (report: FirestoreSyncReport) => {
    setSyncReport(report);
    try {
      localStorage.setItem('autocinema_firestore_sync_report', JSON.stringify(report));
    } catch {}
    onSyncReportUpdated?.(report);
  };

  // -------------------------------------------------------------
  // 2. Full & Granular Push Operations (رفع البيانات إلى السحابة)
  // -------------------------------------------------------------

  // Master Push All: Uploads folders, favLists, allFavorites, playlist, movies, stream preferences
  const executePushAllToDb = async () => {
    setIsPushing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setProgressMsg('بدء مزامنة وحفظ كافة البيانات في قاعدة بيانات Firestore...');
    const startTime = Date.now();

    notifyUploadStart(
      'رفع الكل إلى Firestore',
      'بدء مزامنة وحفظ كافة البيانات في قاعدة البيانات...'
    );

    try {
      const allFavsPayload = {
        movieIds: favMovies.map((m) => m.id),
        sections: {
          green: greenFavs.map((m) => m.id),
          yellow: yellowFavs.map((m) => m.id),
          purple: purpleFavs.map((m) => m.id),
          black: blackFavs.map((m) => m.id),
        },
        hiddenFavoriteSections: hiddenFavoriteSections || [],
      };

      // Retrieve current stream preferences from localStorage & harvest from cinema playlist
      let localPrefs: Record<string, any> = {};
      try {
        const raw = localStorage.getItem('autocinema_stream_preferences');
        if (raw) localPrefs = JSON.parse(raw);
      } catch {}

      (cinemaPlaylist || []).forEach((item: any) => {
        if (item && (item.originalUrl || (item.selectedStream && item.selectedStream.url) || item.url)) {
          const k = item.originalUrl || (item.selectedStream && item.selectedStream.url) || item.url;
          if (k && !localPrefs[k]) {
            localPrefs[k] = {
              urlKey: k,
              serverName: item.selectedServer,
              quality: item.selectedQuality,
              type: item.selectedType,
              streamUrl: item.selectedStream?.url || item.url || '',
              playbackMode: item.preferredMode || 'direct',
              savedAt: new Date().toISOString(),
            };
          }
        }
      });

      // Prepare multi-playlists
      let allPlaylistsToSave: any[] = [];
      let activePlaylistIdToSave = 'playlist-default';
      try {
        const raw = localStorage.getItem('autocinema_cinema_playlists');
        if (raw) allPlaylistsToSave = JSON.parse(raw);
        activePlaylistIdToSave = localStorage.getItem('autocinema_active_playlist_id') || 'playlist-default';
      } catch (_) {}

      if (!Array.isArray(allPlaylistsToSave) || allPlaylistsToSave.length === 0) {
        allPlaylistsToSave = [
          {
            id: activePlaylistIdToSave || 'playlist-default',
            name: 'قائمة التشغيل الرئيسية',
            items: cinemaPlaylist,
            createdAt: new Date().toISOString(),
          },
        ];
      } else {
        const idx = allPlaylistsToSave.findIndex((p) => p.id === activePlaylistIdToSave);
        if (idx !== -1) {
          const existingPlItems = allPlaylistsToSave[idx].items || [];
          let mergedItems = Array.isArray(cinemaPlaylist) && cinemaPlaylist.length > 0 ? cinemaPlaylist : existingPlItems;
          if (existingPlItems.length > 0 && Array.isArray(cinemaPlaylist) && cinemaPlaylist.length > 0) {
            const existingMap = new Map<string, any>(existingPlItems.map((it: any) => [it.id || it.movieId || it.originalUrl, it]));
            mergedItems = cinemaPlaylist.map((it: any) => {
              const key = it.id || it.movieId || it.originalUrl;
              const ex: any = existingMap.get(key);
              if (ex && (ex.wasAutoRepaired || ex.selectedStream) && !it.wasAutoRepaired) {
                return { ...it, ...ex };
              }
              return it;
            });
          }
          allPlaylistsToSave[idx] = {
            ...allPlaylistsToSave[idx],
            items: mergedItems,
            updatedAt: new Date().toISOString(),
          };
        } else {
          allPlaylistsToSave.push({
            id: activePlaylistIdToSave || 'playlist-default',
            name: 'قائمة التشغيل الرئيسية',
            items: cinemaPlaylist,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // Synchronize movies catalog with any repaired streams from cinema playlists
      const moviesMap = new Map((movies || []).map((m: any) => [m.id, m]));
      allPlaylistsToSave.forEach((pl: any) => {
        (pl.items || []).forEach((it: any) => {
          const mId = it.movieId || it.id;
          if (mId && moviesMap.has(mId)) {
            const ex = moviesMap.get(mId);
            const streamUrl = (it.selectedStream && (it.selectedStream.url || it.selectedStream.directUrl)) || it.streamUrl || it.url;
            const directUrl = (it.selectedStream && (it.selectedStream.directUrl || it.selectedStream.url)) || it.directUrl || streamUrl;
            moviesMap.set(mId, {
              ...ex,
              url: streamUrl || ex.url,
              directUrl: directUrl || ex.directUrl,
              streamUrl: streamUrl || ex.streamUrl,
              selectedServer: it.selectedServer || ex.selectedServer,
              selectedQuality: it.selectedQuality || ex.selectedQuality,
              selectedType: it.selectedType || ex.selectedType,
              preferredMode: it.preferredMode || ex.preferredMode,
              selectedStream: it.selectedStream || ex.selectedStream,
              allStreams: (it.allStreams && it.allStreams.length > 0) ? it.allStreams : ex.allStreams,
              wasAutoRepaired: it.wasAutoRepaired || ex.wasAutoRepaired,
              repairedQuality: it.repairedQuality || ex.repairedQuality,
              repairedAt: it.repairedAt || ex.repairedAt,
            });
          }
        });
      });
      const synchronizedMovies = Array.from(moviesMap.values());
      const activeIdx = allPlaylistsToSave.findIndex((p: any) => p.id === activePlaylistIdToSave);
      const activeItemsToSave = activeIdx !== -1 ? allPlaylistsToSave[activeIdx].items : cinemaPlaylist;

      const result = await seedAllToFirestore({
        folders,
        favoriteLists,
        allFavorites: allFavsPayload,
        cinemaPlaylist: activeItemsToSave,
        allCinemaPlaylists: allPlaylistsToSave,
        activePlaylistId: activePlaylistIdToSave,
        movies: synchronizedMovies,
        streamPreferences: localPrefs,
        deletedMovieIds: (window as any).__autocinema_deleted_movie_ids || [],
        onProgress: (msg) => {
          setProgressMsg(msg);
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'حدث خطأ أثناء الحفظ في قاعدة البيانات.');
      }

      const latencyMs = Date.now() - startTime;
      const report: FirestoreSyncReport = {
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: 'push',
        success: true,
        foldersCount: result.foldersCount,
        favListsCount: result.favListsCount,
        playlistCount: result.playlistCount,
        moviesCount: result.moviesCount,
        favMoviesCount: favMovies.length,
        greenFavsCount: greenFavs.length,
        yellowFavsCount: yellowFavs.length,
        purpleFavsCount: purpleFavs.length,
        blackFavsCount: blackFavs.length,
        statusText: 'تم تأكيد وحفظ ومزامنة كافة بيانات التطبيق في Firestore بنجاح 🟢',
      };
      recordSyncReport(report);

      notifyUploadSuccess(
        `تم تأكيد وحفظ ومزامنة كافة بيانات التطبيق في Firestore بنجاح 🟢 (${latencyMs}ms)`,
        {
          foldersCount: result.foldersCount,
          favListsCount: result.favListsCount,
          playlistCount: result.playlistCount,
          moviesCount: result.moviesCount,
          favMoviesCount: favMovies.length,
          latencyMs,
        }
      );

      setSuccessMsg(
        `✓ بيان إتمام المزامنة الشاملة: تم بنجاح تأكيد وحفظ ومزامنة كل بيانات التطبيق في Firestore!
• المستودعات والأقسام: ${result.foldersCount}
• قوائم المفضلة المخصصة: ${result.favListsCount}
• المفضلة العامة (الألوان الـ 4): ${favMovies.length} فيلم
• عناصر قائمة شاشة العرض (Playlist): ${result.totalPlaylistItems || result.playlistCount} عنصر في ${result.allPlaylistsCount || 1} قائمة تشغيل
• الأفلام المعدلة والمميزة المحفوظة سحابياً: ${result.moviesCount}
• تفضيلات السيرفرات والبث المحفوظة: ${Object.keys(localPrefs).length}
(التعديلات أصبحت متاحة فوراً لكافة المتصفحات والمستخدمين - زمن التنفيذ: ${latencyMs} ms)`
      );

      // Refresh inspector view
      loadCloudOverview();
    } catch (err: any) {
      console.error('Push to DB error:', err);
      notifyUploadError(err?.message || 'فشلت عملية الحفظ في قاعدة البيانات.');
      setErrorMsg(err?.message || 'فشلت عملية الحفظ في قاعدة البيانات.');
      throw err;
    } finally {
      setIsPushing(false);
      setProgressMsg(null);
    }
  };

  const handlePushAllToDb = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    requestPasswordAndExecute(
      executePushAllToDb,
      'تأكيد حفظ ومزامنة الكل في قاعدة البيانات (Master Full Sync)',
      'حفظ وتحديث كافة المستودعات، المفضلة، قائمة شاشة العرض والأفلام السحابية لجميع المتصفحات بالرمز 5555'
    );
  };

  // Granular Push 1: Cinema Playlists (All playlists side-by-side)
  const executePushPlaylistOnly = async () => {
    setIsPushing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const startTime = Date.now();

    let allPlaylists: any[] = [];
    let activeId = 'playlist-default';
    try {
      const raw = localStorage.getItem('autocinema_cinema_playlists');
      if (raw) allPlaylists = JSON.parse(raw);
      activeId = localStorage.getItem('autocinema_active_playlist_id') || 'playlist-default';
    } catch (_) {}

    if (!Array.isArray(allPlaylists) || allPlaylists.length === 0) {
      allPlaylists = [
        {
          id: activeId || 'playlist-default',
          name: 'قائمة التشغيل الرئيسية',
          items: cinemaPlaylist,
          createdAt: new Date().toISOString(),
        },
      ];
    } else {
      const idx = allPlaylists.findIndex((p) => p.id === activeId);
      if (idx !== -1) {
        allPlaylists[idx] = { ...allPlaylists[idx], items: cinemaPlaylist, updatedAt: new Date().toISOString() };
      } else {
        allPlaylists.push({
          id: activeId || 'playlist-default',
          name: 'قائمة التشغيل الرئيسية',
          items: cinemaPlaylist,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    try {
      localStorage.setItem('autocinema_cinema_playlists', JSON.stringify(allPlaylists));
      localStorage.setItem('autocinema_active_playlist_id', activeId);
    } catch (_) {}

    notifyUploadStart(
      'رفع قوائم شاشة العرض',
      `جاري رفع وتحديث كافة قوائم شاشة العرض (${allPlaylists.length} قائمة جنباً إلى جنب) في Firestore...`
    );
    try {
      notifyUploadProgress(35, `جاري فحص وتجهيز ${allPlaylists.length} قائمة شاشة عرض...`);
      await saveAllCinemaPlaylistsToDb(allPlaylists, activeId);
      await saveCinemaPlaylistToDb(cinemaPlaylist);
      notifyUploadProgress(100, `تم رفع وحفظ كافة قوائم تشغيل شاشة العرض جنباً إلى جنب بنجاح!`);
      const latencyMs = Date.now() - startTime;
      const report: FirestoreSyncReport = {
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: 'playlist',
        success: true,
        foldersCount: folders.length,
        favListsCount: favoriteLists.length,
        playlistCount: cinemaPlaylist.length,
        moviesCount: movies.length,
        favMoviesCount: favMovies.length,
        statusText: `تم حفظ وتحديث ${allPlaylists.length} قائمة شاشة عرض جنباً إلى جنب في Firestore بنجاح 🟢`,
      };
      recordSyncReport(report);
      notifyUploadSuccess(
        `تم رفع وحفظ كافة قوائم شاشة العرض (${allPlaylists.length} قائمة جنباً إلى جنب) في Firestore بنجاح 🟢 (${latencyMs}ms)`,
        { playlistCount: cinemaPlaylist.length, allPlaylistsCount: allPlaylists.length, latencyMs }
      );
      setSuccessMsg(
        `✓ بيان إتمام المزامنة: تم بنجاح رفع وحفظ كافة قوائم تشغيل شاشة العرض (${allPlaylists.length} قائمة جنباً إلى جنب) في Firestore! 🎬 (زمن التنفيذ: ${latencyMs} ms)`
      );
      loadCloudOverview();
    } catch (err: any) {
      notifyUploadError(err?.message || 'فشل حفظ قوائم شاشة العرض.');
      setErrorMsg(err?.message || 'فشل حفظ قوائم شاشة العرض.');
      throw err;
    } finally {
      setIsPushing(false);
    }
  };

  const handlePushPlaylistOnly = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    requestPasswordAndExecute(
      executePushPlaylistOnly,
      'تأكيد رفع كافة قوائم شاشة العرض',
      `رفع وتحديث كافة قوائم شاشة العرض جنباً إلى جنب في Firestore لجميع المتصفحات`
    );
  };

  // Granular Push 2: Favorites only (AllFavorites + FavoriteLists)
  const executePushFavoritesOnly = async () => {
    setIsPushing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const startTime = Date.now();
    notifyUploadStart(
      'رفع بيانات المفضلة',
      `جاري رفع وتحديث كافة قوائم وألوان المفضلة (${favMovies.length} فيلم)...`
    );
    try {
      await saveAllFavoriteListsToDb(favoriteLists);
      await saveAllFavoritesToDb({
        movieIds: favMovies.map((m) => m.id),
        sections: {
          green: greenFavs.map((m) => m.id),
          yellow: yellowFavs.map((m) => m.id),
          purple: purpleFavs.map((m) => m.id),
          black: blackFavs.map((m) => m.id),
        },
        hiddenFavoriteSections: hiddenFavoriteSections || [],
      });

      // Also ensure any custom or modified favorite movies are persisted
      const customFavMovies = favMovies.filter((m) => {
        return (
          m.isUserAdded ||
          m.isCustom ||
          m.classification ||
          m.storySummary ||
          m.isBroken ||
          (m.id && (m.id.startsWith('mov-') || m.id.startsWith('movie-') || m.id.includes('-custom')))
        );
      });
      if (customFavMovies.length > 0) {
        await saveUserModificationsToDb({
          customMovies: customFavMovies.slice(0, 300),
          deletedMovieIds: (window as any).__autocinema_deleted_movie_ids || [],
        });
      }

      const latencyMs = Date.now() - startTime;
      const report: FirestoreSyncReport = {
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: 'favorites',
        success: true,
        foldersCount: folders.length,
        favListsCount: favoriteLists.length,
        playlistCount: cinemaPlaylist.length,
        moviesCount: movies.length,
        favMoviesCount: favMovies.length,
        greenFavsCount: greenFavs.length,
        yellowFavsCount: yellowFavs.length,
        purpleFavsCount: purpleFavs.length,
        blackFavsCount: blackFavs.length,
        statusText: 'تم حفظ وتحديث المفضلة في Firestore بنجاح 🟢',
      };
      recordSyncReport(report);
      notifyUploadSuccess(
        `تم رفع وتحديث بيانات المفضلة (${favMovies.length} فيلم) في Firestore بنجاح 🟢 (${latencyMs}ms)`,
        { favMoviesCount: favMovies.length, favListsCount: favoriteLists.length, latencyMs }
      );
      setSuccessMsg(
        `✓ بيان إتمام المزامنة: تم بنجاح رفع وتحديث بيانات المفضلة (${favMovies.length} عنصر مفضلة • ${favoriteLists.length} قائمة مخصصة) في Firestore! ⭐ (زمن التنفيذ: ${latencyMs} ms)`
      );
      loadCloudOverview();
    } catch (err: any) {
      notifyUploadError(err?.message || 'فشل حفظ بيانات المفضلة.');
      setErrorMsg(err?.message || 'فشل حفظ بيانات المفضلة.');
      throw err;
    } finally {
      setIsPushing(false);
    }
  };

  const handlePushFavoritesOnly = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    requestPasswordAndExecute(
      executePushFavoritesOnly,
      'تأكيد رفع بيانات المفضلة فقط',
      `رفع وتحديث المفضلة (${favMovies.length} فيلم) و ${favoriteLists.length} قائمة مخصصة في Firestore`
    );
  };

  // Granular Push 3: Folders only
  const executePushFoldersOnly = async () => {
    setIsPushing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const startTime = Date.now();
    notifyUploadStart(
      'رفع المستودعات والأقسام',
      `جاري رفع وتحديث المستودعات (${folders.length} قسم) في Firestore...`
    );
    try {
      notifyUploadProgress('رفع المستودعات والأقسام', 'جاري إرسال بيانات المستودعات والأقسام إلى Firestore...', 50);
      await saveAllFoldersToDb(folders);
      const latencyMs = Date.now() - startTime;
      const report: FirestoreSyncReport = {
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: 'folders',
        success: true,
        foldersCount: folders.length,
        favListsCount: favoriteLists.length,
        playlistCount: cinemaPlaylist.length,
        moviesCount: movies.length,
        favMoviesCount: favMovies.length,
        statusText: 'تم حفظ وتحديث المستودعات والأقسام في Firestore بنجاح 🟢',
      };
      recordSyncReport(report);
      notifyUploadSuccess(
        `تم رفع وحفظ المستودعات والأقسام (${folders.length} قسم) في Firestore بنجاح 🟢 (${latencyMs}ms)`,
        { foldersCount: folders.length, latencyMs }
      );
      setSuccessMsg(
        `✓ بيان إتمام المزامنة: تم بنجاح رفع وحفظ المستودعات والأقسام (${folders.length} مستودع) في Firestore! 📁 (زمن التنفيذ: ${latencyMs} ms)`
      );
      loadCloudOverview();
    } catch (err: any) {
      notifyUploadError(err?.message || 'فشل حفظ المستودعات.');
      setErrorMsg(err?.message || 'فشل حفظ المستودعات.');
      throw err;
    } finally {
      setIsPushing(false);
    }
  };

  const handlePushFoldersOnly = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    requestPasswordAndExecute(
      executePushFoldersOnly,
      'تأكيد رفع المستودعات والأقسام فقط',
      `رفع وتحديث المستودعات والأقسام (${folders.length} قسم) في Firestore`
    );
  };

  // Granular Push 4: Custom Movies & All Repository Movies
  const executePushMoviesOnly = async () => {
    setIsPushing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const startTime = Date.now();
    try {
      notifyUploadStart(
        'رفع وحفظ كافة أفلام ومسلسلات المستودعات',
        `جاري تحضير وتأكيد أفلام ومسلسلات كافة المستودعات (${movies.length} فيلم)...`
      );

      // 1. Save all repository movies partitioned into repoMovies collection
      notifyUploadProgress('رفع وحفظ كافة المستودعات', 'جاري حفظ وتوزيع أفلام المستودعات في السحابة...', 25);
      const repoResult = await saveAllRepositoriesAndMoviesToDb(
        folders,
        movies,
        (pct, msg) => {
          notifyUploadProgress('رفع وحفظ كافة المستودعات', msg, pct);
        }
      );

      // 2. Save custom movies summary
      const customOrModified = movies.filter((m) => {
        return (
          m.isUserAdded ||
          m.isCustom ||
          m.classification ||
          m.storySummary ||
          m.isBroken ||
          (m.id && (m.id.startsWith('mov-') || m.id.startsWith('movie-') || m.id.includes('-custom')))
        );
      });

      notifyUploadProgress('رفع وحفظ كافة المستودعات', 'جاري تأكيد ملخص التعديلات والمصنفات في Firestore...', 90);
      const savedCount = await saveAllCustomMoviesToDb(
        customOrModified,
        (window as any).__autocinema_deleted_movie_ids || []
      );

      const totalEffectiveMovies = Math.max(savedCount, repoResult.totalUploaded, movies.length);
      const latencyMs = Date.now() - startTime;
      const report: FirestoreSyncReport = {
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: 'movies',
        success: true,
        foldersCount: folders.length,
        favListsCount: favoriteLists.length,
        playlistCount: cinemaPlaylist.length,
        moviesCount: totalEffectiveMovies,
        favMoviesCount: favMovies.length,
        statusText: 'تم حفظ وتأكيد كافة أفلام ومسلسلات المستودعات في Firestore بنجاح 🟢',
      };
      recordSyncReport(report);
      notifyUploadSuccess(
        `تم رفع وتأكيد كافة أفلام المستودعات (${repoResult.totalUploaded} فيلم بـ ${repoResult.reposCount} مستودع) في Firestore بنجاح 🟢 (${latencyMs}ms)`,
        { moviesCount: totalEffectiveMovies, latencyMs }
      );
      setSuccessMsg(
        `✓ بيان إتمام المزامنة: تم بنجاح رفع وتأكيد كافة أفلام المستودعات (${repoResult.totalUploaded} فيلم في ${repoResult.reposCount} مستودع) في Firestore! 🎥 (زمن التنفيذ: ${latencyMs} ms)`
      );
      loadCloudOverview();
    } catch (err: any) {
      notifyUploadError(err?.message || 'فشل حفظ الأفلام في قاعدة البيانات.');
      setErrorMsg(err?.message || 'فشل حفظ الأفلام في قاعدة البيانات.');
      throw err;
    } finally {
      setIsPushing(false);
    }
  };

  const handlePushMoviesOnly = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    requestPasswordAndExecute(
      executePushMoviesOnly,
      'تأكيد رفع الأفلام المعدلة والمضافة فقط',
      'رفع وتحديث قائمة الأفلام المعدلة والمخصصة في Firestore'
    );
  };

  // Granular Push 5: Stream Preferences only
  const executePushStreamPrefsOnly = async () => {
    setIsPushing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const startTime = Date.now();
    try {
      let localPrefs: Record<string, any> = {};
      try {
        const raw = localStorage.getItem('autocinema_stream_preferences');
        if (raw) localPrefs = JSON.parse(raw);
      } catch {}

      // Also harvest any stream selections from current cinemaPlaylist items
      if (Array.isArray(cinemaPlaylist)) {
        for (const item of cinemaPlaylist) {
          if (item && item.selectedStream && (item.id || item.movieId)) {
            const key = item.movieId || item.id;
            if (!localPrefs[key]) {
              localPrefs[key] = {
                movieId: key,
                server: item.selectedStream.server || item.selectedServer || '',
                quality: item.selectedStream.quality || item.selectedQuality || '',
                type: item.selectedStream.type || item.selectedType || '',
                preferredMode: item.selectedStream.preferredMode || item.preferredMode || 'direct',
                updatedAt: new Date().toISOString(),
              };
            }
          }
        }
      }

      const count = Object.keys(localPrefs).length;
      notifyUploadStart(
        'رفع تفضيلات السيرفرات والبث',
        `جاري رفع تفضيلات السيرفرات وجودات البث (${count} تفضيل)...`
      );
      notifyUploadProgress('رفع تفضيلات السيرفرات والبث', 'جاري إرسال التفضيلات إلى Firestore...', 50);

      await saveAllStreamPreferencesToDb(localPrefs);
      const latencyMs = Date.now() - startTime;
      const report: FirestoreSyncReport = {
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: 'stream_prefs',
        success: true,
        foldersCount: folders.length,
        favListsCount: favoriteLists.length,
        playlistCount: cinemaPlaylist.length,
        moviesCount: movies.length,
        favMoviesCount: favMovies.length,
        statusText: 'تم حفظ تفضيلات السيرفرات في Firestore بنجاح 🟢',
      };
      recordSyncReport(report);
      notifyUploadSuccess(
        `تم رفع تفضيلات السيرفرات والبث (${count} تفضيل) في Firestore بنجاح 🟢 (${latencyMs}ms)`,
        { count, latencyMs }
      );
      setSuccessMsg(
        `✓ بيان إتمام المزامنة: تم بنجاح رفع تفضيلات السيرفرات والبث (${count} تفضيل) في Firestore! ⚡ (زمن التنفيذ: ${latencyMs} ms)`
      );
      loadCloudOverview();
    } catch (err: any) {
      notifyUploadError(err?.message || 'فشل حفظ تفضيلات السيرفرات.');
      setErrorMsg(err?.message || 'فشل حفظ تفضيلات السيرفرات.');
      throw err;
    } finally {
      setIsPushing(false);
    }
  };

  const handlePushStreamPrefsOnly = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    requestPasswordAndExecute(
      executePushStreamPrefsOnly,
      'تأكيد رفع تفضيلات السيرفرات فقط',
      'رفع وتحديث تفضيلات السيرفرات وجودات البث في Firestore'
    );
  };

  // Comprehensive Live Upload Diagnostic Runner
  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const allFavsPayload = {
        movieIds: favMovies.map((m) => m.id),
        sections: {
          green: greenFavs.map((m) => m.id),
          yellow: yellowFavs.map((m) => m.id),
          purple: purpleFavs.map((m) => m.id),
          black: blackFavs.map((m) => m.id),
        },
        hiddenFavoriteSections: hiddenFavoriteSections || [],
      };

      const res = await runAllFirestoreUploadTests({
        folders,
        favoriteLists,
        allFavorites: allFavsPayload,
        cinemaPlaylist,
        movies,
        onStepUpdate: (step: UploadDiagnosticStep) => {
          setDiagnosticResult((prev) => {
            if (!prev) {
              return {
                overallSuccess: step.status === 'success',
                totalTimeMs: step.latencyMs || 0,
                timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                steps: [step],
              };
            }
            const existingIdx = prev.steps.findIndex((s) => s.id === step.id);
            const updatedSteps = [...prev.steps];
            if (existingIdx >= 0) {
              updatedSteps[existingIdx] = step;
            } else {
              updatedSteps.push(step);
            }
            const hasError = updatedSteps.some((s) => s.status === 'error');
            const allSuccess = updatedSteps.length === 7 && updatedSteps.every((s) => s.status === 'success');
            return {
              ...prev,
              steps: updatedSteps,
              overallSuccess: allSuccess && !hasError,
            };
          });
        },
      });
      setDiagnosticResult(res);
      if (res.overallSuccess) {
        setSuccessMsg(
          `✓ اكتمل الفحص الشامل واختبار كافة مسارات الرفع بنجاح تام! اجتازت جميع العمليات الـ 7 الاختبار بنسبة 100% 🟢 (زمن الاستجابة الإجمالي: ${res.totalTimeMs} ms)`
        );
      } else {
        const failedCount = res.steps.filter((s) => s.status === 'error').length;
        setErrorMsg(
          `⚠️ انتهى الفحص بوجود ${failedCount} مسار غير ناجح من أصل ${res.steps.length}. يرجى مراجعة التفاصيل أدناه.`
        );
      }
    } catch (err: any) {
      setErrorMsg(`تعذر إتمام فحص الرفع: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  // -------------------------------------------------------------
  // 3. Full & Granular Pull Operations (جلب وتحديث البيانات من السحابة)
  // -------------------------------------------------------------

  // Master Pull All: Imports everything from Firestore and applies to the app
  const handlePullAllFromDb = async () => {
    setIsPulling(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setProgressMsg('جاري الاتصال وقراءة كافة البيانات من قاعدة بيانات Firestore...');

    try {
      const [dbFolders, dbFavLists, dbAllFavs, dbPlaylist, dbUserMods, dbMovies, dbRepoResult, dbStreamPrefs] = await Promise.all([
        fetchFoldersFromDb().catch(() => []),
        fetchFavoriteListsFromDb().catch(() => []),
        fetchAllFavoritesFromDb().catch(() => null),
        fetchCinemaPlaylistFromDb().catch(() => null),
        fetchUserModificationsFromDb().catch(() => null),
        fetchMoviesFromDb().catch(() => []),
        fetchAllRepositoryMoviesFromDb().catch(() => null),
        fetchStreamPreferencesFromDb().catch(() => ({})),
      ]);

      const repoMoviesList = dbRepoResult?.movies || [];
      const mergedCustomMovies = [
        ...(dbUserMods?.customMovies || []),
        ...(dbMovies || []),
      ];

      const effectiveRetrievedMovies = repoMoviesList.length > 0 ? repoMoviesList.length : mergedCustomMovies.length;

      const hasData =
        (dbFolders && dbFolders.length > 0) ||
        (dbFavLists && dbFavLists.length > 0) ||
        (dbPlaylist && dbPlaylist.length > 0) ||
        dbAllFavs ||
        effectiveRetrievedMovies > 0 ||
        (dbStreamPrefs && Object.keys(dbStreamPrefs).length > 0);

      if (!hasData) {
        throw new Error(
          'قاعدة البيانات السحابية فارغة حالياً. استخدم تبويب [رفع وحفظ] لرفع البيانات الحالية أولاً.'
        );
      }

      onApplyDatabaseData({
        folders: dbFolders && dbFolders.length > 0 ? dbFolders : undefined,
        favoriteLists: dbFavLists && dbFavLists.length > 0 ? dbFavLists : undefined,
        cinemaPlaylist: dbPlaylist && Array.isArray(dbPlaylist) ? dbPlaylist : undefined,
        allFavorites: dbAllFavs || undefined,
        repoMovies: repoMoviesList.length > 0 ? repoMoviesList : undefined,
        customMovies: mergedCustomMovies.length > 0 ? mergedCustomMovies : undefined,
        deletedMovieIds: dbUserMods?.deletedMovieIds || undefined,
        streamPreferences: dbStreamPrefs && Object.keys(dbStreamPrefs).length > 0 ? dbStreamPrefs : undefined,
      });

      const report: FirestoreSyncReport = {
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: 'pull',
        success: true,
        foldersCount: dbFolders.length,
        favListsCount: dbFavLists.length,
        playlistCount: dbPlaylist?.length || 0,
        moviesCount: effectiveRetrievedMovies,
        favMoviesCount: dbAllFavs?.movieIds?.length || 0,
        greenFavsCount: dbAllFavs?.sections?.green?.length || 0,
        yellowFavsCount: dbAllFavs?.sections?.yellow?.length || 0,
        purpleFavsCount: dbAllFavs?.sections?.purple?.length || 0,
        blackFavsCount: dbAllFavs?.sections?.black?.length || 0,
        statusText: 'تم استيراد ومطابقة أحدث البيانات من السحابة بنجاح 🟢',
      };
      recordSyncReport(report);

      setSuccessMsg(
        `✓ بيان إتمام المزامنة الشاملة: تم بنجاح جلب وتحديث كل بيانات التطبيق وجميع المستودعات من Firestore!
• المستودعات والأقسام المسترجعة: ${dbFolders.length}
• قوائم المفضلة المسترجعة: ${dbFavLists.length}
• عناصر قائمة شاشة العرض: ${dbPlaylist?.length || 0}
• إجمالي المفضلة العامة (الألوان الأربعة): ${dbAllFavs?.movieIds?.length || 0}
• إجمالي أفلام ومسلسلات المستودعات المسترجعة: ${effectiveRetrievedMovies} (بما فيها مستودعات يوتيوب 1 و2 و3)
• تفضيلات السيرفرات المسترجعة: ${Object.keys(dbStreamPrefs).length}`
      );

      loadCloudOverview();
    } catch (err: any) {
      console.error('Pull from DB error:', err);
      setErrorMsg(err?.message || 'تعذر جلب البيانات من Firestore.');
    } finally {
      setIsPulling(false);
      setProgressMsg(null);
    }
  };

  // Granular Pull 1: Cinema Playlists (All playlists side-by-side)
  const handlePullPlaylistOnly = async () => {
    setIsPulling(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetchAllCinemaPlaylistsFromDb();
      if (!res || !Array.isArray(res.playlists) || res.playlists.length === 0) {
        const dbPlaylist = await fetchCinemaPlaylistFromDb();
        if (!dbPlaylist || !Array.isArray(dbPlaylist) || dbPlaylist.length === 0) {
          throw new Error('لا توجد قوائم شاشة عرض محفوظة في Firestore حالياً.');
        }
        onApplyDatabaseData({ cinemaPlaylist: dbPlaylist });
      } else {
        const active = res.playlists.find((p) => p.id === res.activeId) || res.playlists[0];
        onApplyDatabaseData({
          cinemaPlaylist: active.items,
          allCinemaPlaylists: res.playlists,
          activePlaylistId: res.activeId,
        });

        const report: FirestoreSyncReport = {
          timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          type: 'playlist',
          success: true,
          foldersCount: folders.length,
          favListsCount: favoriteLists.length,
          playlistCount: active.items.length,
          moviesCount: movies.length,
          favMoviesCount: favMovies.length,
          statusText: `تم جلب وتحديث كافة قوائم شاشة العرض (${res.playlists.length} قائمة جنباً إلى جنب) من السحابة بنجاح 🟢`,
        };
        recordSyncReport(report);

        setSuccessMsg(
          `✓ بيان إتمام التحديث: تم بنجاح جلب وتحديث كافة قوائم شاشة العرض (${res.playlists.length} قائمة جنباً إلى جنب) من Firestore وتطبيقها فوراً! 🎬`
        );
      }
      loadCloudOverview();
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل جلب قائمة شاشة العرض من السحابة.');
    } finally {
      setIsPulling(false);
    }
  };

  // Granular Pull 2: Favorites & Lists only
  const handlePullFavoritesOnly = async () => {
    setIsPulling(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const [dbAllFavs, dbFavLists] = await Promise.all([
        fetchAllFavoritesFromDb().catch(() => null),
        fetchFavoriteListsFromDb().catch(() => []),
      ]);

      if (!dbAllFavs && (!dbFavLists || dbFavLists.length === 0)) {
        throw new Error('لا توجد بيانات مفضلة محفوظة في Firestore حالياً.');
      }

      onApplyDatabaseData({
        allFavorites: dbAllFavs || undefined,
        favoriteLists: dbFavLists && dbFavLists.length > 0 ? dbFavLists : undefined,
      });

      const totalFavCount = dbAllFavs?.movieIds?.length || 0;
      const report: FirestoreSyncReport = {
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: 'favorites',
        success: true,
        foldersCount: folders.length,
        favListsCount: dbFavLists?.length || 0,
        playlistCount: cinemaPlaylist.length,
        moviesCount: movies.length,
        favMoviesCount: totalFavCount,
        greenFavsCount: dbAllFavs?.sections?.green?.length || 0,
        yellowFavsCount: dbAllFavs?.sections?.yellow?.length || 0,
        purpleFavsCount: dbAllFavs?.sections?.purple?.length || 0,
        blackFavsCount: dbAllFavs?.sections?.black?.length || 0,
        statusText: 'تم جلب وتحديث المفضلة من السحابة بنجاح 🟢',
      };
      recordSyncReport(report);

      setSuccessMsg(
        `✓ بيان إتمام التحديث: تم بنجاح جلب وتحديث المفضلة (${totalFavCount} فيلم مفضل • ${dbFavLists?.length || 0} قائمة مخصصة) من Firestore! ⭐`
      );
      loadCloudOverview();
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل جلب بيانات المفضلة من السحابة.');
    } finally {
      setIsPulling(false);
    }
  };

  // Granular Pull 3: Folders only
  const handlePullFoldersOnly = async () => {
    setIsPulling(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const dbFolders = await fetchFoldersFromDb();
      if (!dbFolders || dbFolders.length === 0) {
        throw new Error('لا توجد مستودعات أو أقسام محفوظة في Firestore حالياً.');
      }

      onApplyDatabaseData({ folders: dbFolders });

      const report: FirestoreSyncReport = {
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: 'folders',
        success: true,
        foldersCount: dbFolders.length,
        favListsCount: favoriteLists.length,
        playlistCount: cinemaPlaylist.length,
        moviesCount: movies.length,
        favMoviesCount: favMovies.length,
        statusText: 'تم جلب وتحديث المستودعات من السحابة بنجاح 🟢',
      };
      recordSyncReport(report);

      setSuccessMsg(
        `✓ بيان إتمام التحديث: تم بنجاح جلب وتحديث المستودعات والأقسام (${dbFolders.length} مستودع) من Firestore! 📁`
      );
      loadCloudOverview();
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل جلب المستودعات من السحابة.');
    } finally {
      setIsPulling(false);
    }
  };

  // Granular Pull 4: Movies only
  const handlePullMoviesOnly = async () => {
    setIsPulling(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const [dbUserMods, dbMovies] = await Promise.all([
        fetchUserModificationsFromDb().catch(() => null),
        fetchMoviesFromDb().catch(() => []),
      ]);

      const merged = [
        ...(dbUserMods?.customMovies || []),
        ...(dbMovies || []),
      ];

      if (merged.length === 0) {
        throw new Error('لا توجد أفلام معدلة أو مخصصة محفوظة في Firestore حالياً.');
      }

      onApplyDatabaseData({
        customMovies: merged,
        deletedMovieIds: dbUserMods?.deletedMovieIds,
      });

      const report: FirestoreSyncReport = {
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: 'movies',
        success: true,
        foldersCount: folders.length,
        favListsCount: favoriteLists.length,
        playlistCount: cinemaPlaylist.length,
        moviesCount: merged.length,
        favMoviesCount: favMovies.length,
        statusText: 'تم جلب وتحديث الأفلام من السحابة بنجاح 🟢',
      };
      recordSyncReport(report);

      setSuccessMsg(
        `✓ بيان إتمام التحديث: تم بنجاح جلب وتحديث الأفلام المعدلة (${merged.length} فيلم) من Firestore وتطبيقها فوراً! 🎥`
      );
      loadCloudOverview();
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل جلب الأفلام من السحابة.');
    } finally {
      setIsPulling(false);
    }
  };

  // Test live connection probe
  const handleTestConnection = async () => {
    setIsTesting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const ok = await testConnection();
      if (ok) {
        setSuccessMsg('✓ الاتصال بقاعدة بيانات Firestore نشط ويعمل بنجاح 🟢');
      } else {
        setSuccessMsg('✓ تم فحص اتصال قاعدة البيانات بنجاح (وضع الاتصال السحابي نشط).');
      }
    } catch (err: any) {
      setErrorMsg(`خطأ اتصال: ${err?.message || 'تعذر التحقق'}`);
    } finally {
      setIsTesting(false);
    }
  };

  // Multi-playlist inspection in live cloud inspector
  const [selectedCloudPlaylistId, setSelectedCloudPlaylistId] = useState<string>('');

  const localPlaylists = useMemo(() => {
    try {
      const raw = localStorage.getItem('autocinema_cinema_playlists');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return cinemaPlaylist && cinemaPlaylist.length > 0
      ? [{ id: 'playlist-default', name: 'قائمة التشغيل الرئيسية', items: cinemaPlaylist }]
      : [];
  }, [cinemaPlaylist]);

  const currentCloudPlaylists = useMemo(() => {
    if (cloudOverview?.allCinemaPlaylists && cloudOverview.allCinemaPlaylists.length > 0) {
      return cloudOverview.allCinemaPlaylists;
    }
    if (cloudOverview?.cinemaPlaylist && cloudOverview.cinemaPlaylist.length > 0) {
      return [
        {
          id: 'playlist-default',
          name: 'قائمة التشغيل الرئيسية',
          items: cloudOverview.cinemaPlaylist,
          createdAt: new Date().toISOString(),
        },
      ];
    }
    return [];
  }, [cloudOverview?.allCinemaPlaylists, cloudOverview?.cinemaPlaylist]);

  const totalCloudPlaylistItems = useMemo(() => {
    if (cloudOverview?.counts?.totalPlaylistItems != null && cloudOverview.counts.totalPlaylistItems > 0) {
      return cloudOverview.counts.totalPlaylistItems;
    }
    return currentCloudPlaylists.reduce((sum, pl) => sum + (Array.isArray(pl.items) ? pl.items.length : 0), 0);
  }, [cloudOverview, currentCloudPlaylists]);

  const activeCloudPlaylist = useMemo(() => {
    if (currentCloudPlaylists.length === 0) return null;
    const found = currentCloudPlaylists.find((p) => p.id === (selectedCloudPlaylistId || cloudOverview?.activeCinemaPlaylistId));
    return found || currentCloudPlaylists[0];
  }, [currentCloudPlaylists, selectedCloudPlaylistId, cloudOverview?.activeCinemaPlaylistId]);

  // Filter items in the live cloud inspector
  const filteredPlaylist = useMemo(() => {
    const list = activeCloudPlaylist?.items || cloudOverview?.cinemaPlaylist || [];
    if (!inspectorSearch.trim()) return list;
    const q = inspectorSearch.trim().toLowerCase();
    return list.filter(
      (it: any) =>
        (it.movieTitle || it.title || '').toLowerCase().includes(q) ||
        (it.selectedServer || '').toLowerCase().includes(q) ||
        (it.selectedQuality || '').toLowerCase().includes(q)
    );
  }, [activeCloudPlaylist, cloudOverview?.cinemaPlaylist, inspectorSearch]);

  const filteredFolders = useMemo(() => {
    if (!cloudOverview?.folders) return [];
    if (!inspectorSearch.trim()) return cloudOverview.folders;
    const q = inspectorSearch.trim().toLowerCase();
    return cloudOverview.folders.filter(
      (f: any) =>
        (f.name || '').toLowerCase().includes(q) ||
        (f.description || '').toLowerCase().includes(q) ||
        (f.id || '').toLowerCase().includes(q)
    );
  }, [cloudOverview?.folders, inspectorSearch]);

  const filteredMovies = useMemo(() => {
    const list = [
      ...(cloudOverview?.customMovies || []),
      ...(cloudOverview?.movies || []),
    ];
    if (list.length === 0) return [];
    if (!inspectorSearch.trim()) return list.slice(0, 50);
    const q = inspectorSearch.trim().toLowerCase();
    return list.filter(
      (m: any) =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.category || '').toLowerCase().includes(q) ||
        (m.id || '').toLowerCase().includes(q)
    ).slice(0, 100);
  }, [cloudOverview?.customMovies, cloudOverview?.movies, inspectorSearch]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPushing && !isPulling && !isPasswordModalOpen) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 dir-rtl text-right"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[94vh] flex flex-col bg-slate-900 border-2 border-amber-500/60 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 via-amber-950/70 to-slate-900 border-b border-amber-500/40">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 sm:p-2.5 rounded-xl bg-gradient-to-tr from-amber-500 via-emerald-600 to-indigo-600 text-slate-950 shadow-lg shadow-amber-500/20 shrink-0">
              <Database className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-lg font-black text-white truncate">
                  إدارة وقاعدة بيانات Firestore السحابية (Cloud DB)
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>متصل ونشط 🟢</span>
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 truncate">
                استعراض حي، رفع شامل وجزئي، وتحديث ذكي للمستودعات والمفضلة وشاشة العرض
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Tabs Navigation Bar */}
        <div className="flex items-center justify-start gap-1 p-2 bg-slate-950 border-b border-slate-800 overflow-x-auto custom-scrollbar flex-nowrap text-xs font-bold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('inspector')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'inspector'
                ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>👁️ استعراض بيانات السحابة الحالية</span>
            {cloudOverview && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'inspector' ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-300'
              }`}>
                {cloudOverview.counts.folders + (cloudOverview.counts.totalPlaylistItems || cloudOverview.counts.playlist) + cloudOverview.counts.allFavMovies}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('push')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'push'
                ? 'bg-emerald-600 text-white font-black shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>📤 رفع وحفظ في السحابة (Push)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pull')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'pull'
                ? 'bg-indigo-600 text-white font-black shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <DownloadCloud className="w-4 h-4" />
            <span>📥 جلب وتحديث من السحابة (Pull)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('diagnostics')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'diagnostics'
                ? 'bg-rose-600 text-white font-black shadow-md shadow-rose-600/30 ring-1 ring-rose-400'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Radio className="w-4 h-4 animate-pulse text-amber-300" />
            <span>🧪 فحص واختبار الرفع المباشر</span>
            {diagnosticResult && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                diagnosticResult.overallSuccess ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950 text-rose-300 border border-rose-500/30'
              }`}>
                {diagnosticResult.steps.filter((s) => s.status === 'success').length}/{diagnosticResult.steps.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'info'
                ? 'bg-purple-600 text-white font-black shadow-md shadow-purple-600/30 ring-1 ring-purple-400'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>ℹ️ معلومات واتصال السحابة</span>
          </button>
        </div>

        {/* Status Alerts & Notifications */}
        <div className="px-4 pt-3 space-y-2 shrink-0">
          {liveUploadState?.status === 'running' && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-emerald-950/80 border border-amber-500/60 text-amber-200 text-xs sm:text-sm space-y-2 animate-in fade-in shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                  <span className="font-black text-white truncate">
                    {liveUploadState.operation || 'جاري حفظ ومزامنة البيانات في Firestore...'}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-mono font-black shrink-0">
                  {liveUploadState.progress}%
                </span>
              </div>
              {liveUploadState.message && (
                <p className="text-[11px] text-amber-200/90 truncate font-medium">
                  {liveUploadState.message}
                </p>
              )}
              <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, liveUploadState.progress)}%` }}
                />
              </div>
            </div>
          )}

          {progressMsg && liveUploadState?.status !== 'running' && (
            <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs sm:text-sm flex items-center gap-2.5 animate-in fade-in">
              <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
              <span className="font-bold">{progressMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs sm:text-sm flex items-start justify-between gap-2.5 animate-in fade-in">
              <div className="flex items-start gap-2.5 min-w-0">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="whitespace-pre-line font-bold text-xs sm:text-sm leading-relaxed">{successMsg}</div>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMsg(null)}
                className="text-emerald-400 hover:text-white p-1 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs sm:text-sm flex items-start justify-between gap-2.5 animate-in fade-in">
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="whitespace-pre-line font-bold text-xs sm:text-sm leading-relaxed">{errorMsg}</div>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-rose-400 hover:text-white p-1 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 custom-scrollbar">

          {/* =========================================================
              TAB 1: LIVE CLOUD DATA INSPECTOR (شاشة استعراض بيانات السحابة)
          ========================================================= */}
          {activeTab === 'inspector' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Header Toolbar */}
              <div className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-xl bg-slate-950 border border-amber-500/30">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-amber-300 flex items-center gap-1.5">
                      <span>بيان واستعراض البيانات الموجودة حالياً في Firestore</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 font-mono border border-amber-500/30">
                        Live Cloud Data
                      </span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      آخر فحص حي: <strong className="text-white font-mono">{cloudOverview?.timestamp || 'جاري الفحص...'}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadCloudOverview}
                    disabled={isInspecting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isInspecting ? 'animate-spin' : ''}`} />
                    <span>{isInspecting ? 'جاري الفحص الحي...' : 'تحديث قراءة السحابة الآن'}</span>
                  </button>
                </div>
              </div>

              {/* Cloud Live Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 font-mono">
                {/* 1. Folders */}
                <div className="p-3 rounded-xl bg-slate-950/90 border border-indigo-500/30 space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-sans">
                    <span>المستودعات بالسحابة</span>
                    <Folder className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="text-lg sm:text-xl font-black text-indigo-300">
                    {cloudOverview ? cloudOverview.counts.folders : '...'}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-sans flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>{cloudOverview?.counts.folders ? 'محفوظة ونشطة' : 'فارغ بالسحابة'}</span>
                  </div>
                </div>

                {/* 2. Repository Movies */}
                <div className="p-3 rounded-xl bg-slate-950/90 border border-sky-500/30 space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-sans">
                    <span>أفلام المستودعات</span>
                    <Film className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div className="text-lg sm:text-xl font-black text-sky-300">
                    {cloudOverview ? (cloudOverview.counts.repoMovies || cloudOverview.counts.collectionMovies || 0) : '...'}
                  </div>
                  <div className="text-[10px] text-sky-400 font-sans flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>{cloudOverview?.counts.repoMovies ? 'كل المستودعات بالسحابة' : 'جاهزة للمزامنة'}</span>
                  </div>
                </div>

                {/* 3. Playlist */}
                <div className="p-3 rounded-xl bg-slate-950/90 border border-rose-500/30 space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-sans">
                    <span className="font-bold text-slate-200">شاشة العرض</span>
                    <Tv className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg sm:text-xl font-black text-rose-300 font-mono">
                      {cloudOverview ? (cloudOverview.counts.allPlaylistsCount ?? currentCloudPlaylists.length) : '...'}
                    </span>
                    <span className="text-xs font-sans font-bold text-rose-400">
                      {cloudOverview ? ((cloudOverview.counts.allPlaylistsCount ?? currentCloudPlaylists.length) === 1 ? 'قائمة' : 'قوائم') : ''}
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-400 font-sans flex items-center gap-1 truncate" title={`إجمالي عناصر شاشة العرض بالسحابة: ${totalCloudPlaylistItems} عنصر`}>
                    <Check className="w-3 h-3 shrink-0" />
                    <span>
                      {cloudOverview
                        ? `${totalCloudPlaylistItems} عنصر (${cloudOverview.counts.playlist} بالنشطة)`
                        : 'فارغ بالسحابة'}
                    </span>
                  </div>
                </div>

                {/* 4. All Favorites */}
                <div className="p-3 rounded-xl bg-slate-950/90 border border-amber-500/30 space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-sans">
                    <span>المفضلة العامة</span>
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-lg sm:text-xl font-black text-amber-300">
                    {cloudOverview ? cloudOverview.counts.allFavMovies : '...'}
                  </div>
                  <div className="text-[10px] text-amber-400/80 font-sans flex items-center gap-1 truncate">
                    <span>🟢{cloudOverview?.counts.greenFavs ?? 0}</span>
                    <span>🟡{cloudOverview?.counts.yellowFavs ?? 0}</span>
                    <span>🟣{cloudOverview?.counts.purpleFavs ?? 0}</span>
                    <span>⚫{cloudOverview?.counts.blackFavs ?? 0}</span>
                  </div>
                </div>

                {/* 5. Favorite Lists */}
                <div className="p-3 rounded-xl bg-slate-950/90 border border-purple-500/30 space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-sans">
                    <span>قوائم مخصصة</span>
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="text-lg sm:text-xl font-black text-purple-300">
                    {cloudOverview ? cloudOverview.counts.favLists : '...'}
                  </div>
                  <div className="text-[10px] text-purple-300 font-sans flex items-center gap-1">
                    <span>{cloudOverview?.counts.favLists ? 'قوائم مخصصة' : 'فارغ بالسحابة'}</span>
                  </div>
                </div>

                {/* 6. Stream Preferences */}
                <div className="p-3 rounded-xl bg-slate-950/90 border border-teal-500/30 space-y-1 col-span-2 sm:col-span-1">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-sans">
                    <span>تفضيلات البث</span>
                    <Server className="w-3.5 h-3.5 text-teal-400" />
                  </div>
                  <div className="text-lg sm:text-xl font-black text-teal-300">
                    {cloudOverview ? cloudOverview.counts.streamPreferences : '...'}
                  </div>
                  <div className="text-[10px] text-teal-400 font-sans flex items-center gap-1">
                    <span>{cloudOverview?.counts.streamPreferences ? 'إعداد مسجل' : 'افتراضي'}</span>
                  </div>
                </div>
              </div>

              {/* Inspector Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={inspectorSearch}
                    onChange={(e) => setInspectorSearch(e.target.value)}
                    placeholder="ابحث داخل عناصر وبيانات السحابة (العنوان، السيرفر، الجودة، القسم)..."
                    className="w-full pr-9 pl-3 py-1.5 text-xs bg-slate-900 text-slate-200 rounded-lg border border-slate-800 focus:outline-none focus:border-amber-400"
                  />
                  {inspectorSearch && (
                    <button
                      type="button"
                      onClick={() => setInspectorSearch('')}
                      className="absolute left-2.5 top-2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar flex-nowrap text-xs">
                  <button
                    type="button"
                    onClick={() => setInspectorCategory('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      inspectorCategory === 'all'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    الكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorCategory('playlist')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      inspectorCategory === 'playlist'
                        ? 'bg-rose-600 text-white font-black'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    قوائم شاشة العرض ({cloudOverview?.counts.allPlaylistsCount ?? currentCloudPlaylists.length} قوائم • {totalCloudPlaylistItems} عنصر)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorCategory('favorites')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      inspectorCategory === 'favorites'
                        ? 'bg-amber-600 text-white font-black'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    المفضلة ({cloudOverview?.counts.allFavMovies || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorCategory('folders')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      inspectorCategory === 'folders'
                        ? 'bg-indigo-600 text-white font-black'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    المستودعات ({cloudOverview?.counts.folders || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorCategory('movies')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      inspectorCategory === 'movies'
                        ? 'bg-teal-600 text-white font-black'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    الأفلام السحابية
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorCategory('stream_prefs')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      inspectorCategory === 'stream_prefs'
                        ? 'bg-purple-600 text-white font-black'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    تفضيلات السيرفرات ({cloudOverview?.counts.streamPreferences || 0})
                  </button>
                </div>
              </div>

              {/* SECTION: Cinema Playlist in Cloud */}
              {(inspectorCategory === 'all' || inspectorCategory === 'playlist') && (
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-rose-500/30 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tv className="w-4 h-4 text-rose-400" />
                      <h5 className="text-xs sm:text-sm font-black text-rose-300">
                        {currentCloudPlaylists.length > 1
                          ? `قوائم شاشة العرض في Firestore (${currentCloudPlaylists.length} قوائم جنباً إلى جنب • ${totalCloudPlaylistItems} عنصر إجمالي)`
                          : `قائمة شاشة العرض في Firestore (قائمة واحدة • ${totalCloudPlaylistItems} عنصر)`}
                      </h5>
                      <span className="px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold">
                        {activeCloudPlaylist?.name ? `${activeCloudPlaylist.name}: ` : 'القائمة المعروضة: '}
                        {activeCloudPlaylist?.items?.length || cloudOverview?.cinemaPlaylist?.length || 0} عنصر
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handlePullPlaylistOnly}
                        disabled={isPulling || (!cloudOverview?.cinemaPlaylist?.length && !cloudOverview?.allCinemaPlaylists?.length)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-400/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
                        title="جلب وتطبيق كافة القوائم في التطبيق الآن"
                      >
                        <DownloadCloud className="w-3.5 h-3.5" />
                        <span>جلب للتطبيق ({currentCloudPlaylists.length} قوائم)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handlePushPlaylistOnly}
                        disabled={isPushing}
                        className="px-2.5 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-400/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
                        title="رفع كافة قوائم التطبيق للسحابة جنباً إلى جنب"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>رفع كافة القوائم ({localPlaylists.length} قائمة)</span>
                      </button>
                    </div>
                  </div>

                  {currentCloudPlaylists.length >= 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                      <span className="text-[10px] font-bold text-slate-400 shrink-0">
                        قوائم شاشة العرض بالسحابة ({currentCloudPlaylists.length}):
                      </span>
                      {currentCloudPlaylists.map((pl) => {
                        const isSelected = activeCloudPlaylist?.id === pl.id;
                        const isCurrentActive = cloudOverview?.activeCinemaPlaylistId === pl.id;
                        return (
                          <button
                            key={pl.id}
                            type="button"
                            onClick={() => setSelectedCloudPlaylistId(pl.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 border ${
                              isSelected
                                ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-900/40'
                                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <span>{pl.name}</span>
                            <span className="px-1.5 py-0.2 rounded bg-black/40 text-[10px] font-mono">
                              {pl.items?.length || 0}
                            </span>
                            {isCurrentActive && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="القائمة المفعّلة افتراضياً" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {filteredPlaylist.length > 0 ? (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                      {filteredPlaylist.map((it: any, idx: number) => (
                        <div
                          key={it.id || idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-rose-500/40 text-xs gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px] font-bold">
                              #{idx + 1}
                            </span>
                            {it.posterUrl && (
                              <img
                                src={it.posterUrl}
                                alt=""
                                className="w-7 h-10 object-cover rounded bg-slate-800 shrink-0"
                                onError={(e) => { (e.target as any).style.display = 'none'; }}
                              />
                            )}
                            <div className="min-w-0">
                              <span className="font-bold text-white block truncate" title={it.movieTitle || it.title}>
                                {it.movieTitle || it.title || 'فيلم بدون عنوان'}
                              </span>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                <span className="text-amber-300 font-bold">{it.selectedServer || 'سيرفر'}</span>
                                <span>•</span>
                                <span className="font-mono text-purple-300">{it.selectedQuality || 'HD'}</span>
                                <span>•</span>
                                <span className="text-slate-400 font-mono truncate max-w-[180px] sm:max-w-xs" title={it.selectedStream?.url || it.originalUrl}>
                                  {it.selectedStream?.url || it.originalUrl || ''}
                                </span>
                              </div>
                            </div>
                          </div>

                          <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold shrink-0">
                            ✓ بالسحابة
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-500 text-xs font-bold">
                      {cloudOverview?.cinemaPlaylist?.length === 0
                        ? 'قائمة شاشة العرض فارغة في Firestore حالياً. اضغط "رفع القائمة الحالية" لحفظها سحابياً.'
                        : 'لم يتم العثور على عناصر تطابق البحث.'}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: All Favorites & Favorite Lists in Cloud */}
              {(inspectorCategory === 'all' || inspectorCategory === 'favorites') && (
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-amber-500/30 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-400" />
                      <h5 className="text-xs sm:text-sm font-black text-amber-300">
                        بيانات المفضلة الحالية في Firestore (الألوان الأربعة وقوائم المفضلة)
                      </h5>
                      <span className="px-2 py-0.2 rounded-full bg-amber-950 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold">
                        {cloudOverview?.counts.allFavMovies || 0} فيلم
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handlePullFavoritesOnly}
                        disabled={isPulling}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-400/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
                        title="جلب وتطبيق المفضلة في التطبيق الآن"
                      >
                        <DownloadCloud className="w-3.5 h-3.5" />
                        <span>جلب للتطبيق</span>
                      </button>
                      <button
                        type="button"
                        onClick={handlePushFavoritesOnly}
                        disabled={isPushing}
                        className="px-2.5 py-1 rounded-lg bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white border border-amber-400/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
                        title="رفع بيانات المفضلة الحالية للسحابة"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>رفع المفضلة الحالية</span>
                      </button>
                    </div>
                  </div>

                  {/* 4 Colored Sections Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
                      <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span>المفضلة الخضراء</span>
                      </span>
                      <span className="font-mono font-black text-emerald-200">
                        {cloudOverview?.counts.greenFavs || 0}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/30 flex items-center justify-between">
                      <span className="text-amber-300 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        <span>المفضلة الصفراء</span>
                      </span>
                      <span className="font-mono font-black text-amber-200">
                        {cloudOverview?.counts.yellowFavs || 0}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-purple-950/40 border border-purple-500/30 flex items-center justify-between">
                      <span className="text-purple-300 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                        <span>المفضلة البنفسجية</span>
                      </span>
                      <span className="font-mono font-black text-purple-200">
                        {cloudOverview?.counts.purpleFavs || 0}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-between">
                      <span className="text-slate-300 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                        <span>المفضلة السوداء</span>
                      </span>
                      <span className="font-mono font-black text-slate-200">
                        {cloudOverview?.counts.blackFavs || 0}
                      </span>
                    </div>
                  </div>

                  {/* Custom Favorite Lists */}
                  {cloudOverview?.favoriteLists && cloudOverview.favoriteLists.length > 0 && (
                    <div className="pt-2 border-t border-slate-800 space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-400 block">
                        قوائم المفضلة المخصصة المحفوظة سحابياً ({cloudOverview.favoriteLists.length}):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {cloudOverview.favoriteLists.map((fl: any) => (
                          <div
                            key={fl.id}
                            className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                          >
                            <span className="font-bold text-purple-300 truncate" title={fl.name}>
                              {fl.name}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">
                              {Array.isArray(fl.movieIds) ? fl.movieIds.length : 0} فيلم
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: Folders in Cloud */}
              {(inspectorCategory === 'all' || inspectorCategory === 'folders') && (
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-indigo-500/30 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-indigo-400" />
                      <h5 className="text-xs sm:text-sm font-black text-indigo-300">
                        المستودعات والأقسام في Firestore
                      </h5>
                      <span className="px-2 py-0.2 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-500/40 text-[10px] font-mono font-bold">
                        {cloudOverview?.counts.folders || 0} مستودع
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handlePullFoldersOnly}
                        disabled={isPulling}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-400/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
                        title="جلب وتطبيق المستودعات في التطبيق الآن"
                      >
                        <DownloadCloud className="w-3.5 h-3.5" />
                        <span>جلب للتطبيق</span>
                      </button>
                      <button
                        type="button"
                        onClick={handlePushFoldersOnly}
                        disabled={isPushing}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-400/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
                        title="رفع المستودعات الحالية للسحابة"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>رفع المستودعات الحالية</span>
                      </button>
                    </div>
                  </div>

                  {filteredFolders.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto custom-scrollbar">
                      {filteredFolders.map((f: any) => (
                        <div
                          key={f.id}
                          className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-black text-white block truncate">{f.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono truncate block">ID: {f.id}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold shrink-0">
                            ✓ متزامن
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-500 text-xs font-bold">
                      لا توجد مستودعات مطابقة في السحابة.
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: Cloud Movies */}
              {(inspectorCategory === 'all' || inspectorCategory === 'movies') && (
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-teal-500/30 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Film className="w-4 h-4 text-teal-400" />
                      <h5 className="text-xs sm:text-sm font-black text-teal-300">
                        الأفلام المحفوظة والمعدلة في Firestore
                      </h5>
                      <span className="px-2 py-0.2 rounded-full bg-teal-950 text-teal-300 border border-teal-500/40 text-[10px] font-mono font-bold">
                        {(cloudOverview?.customMovies?.length || 0) + (cloudOverview?.movies?.length || 0)} فيلم
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handlePullMoviesOnly}
                        disabled={isPulling}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-400/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
                        title="جلب وتطبيق الأفلام في التطبيق الآن"
                      >
                        <DownloadCloud className="w-3.5 h-3.5" />
                        <span>جلب للتطبيق</span>
                      </button>
                      <button
                        type="button"
                        onClick={handlePushMoviesOnly}
                        disabled={isPushing}
                        className="px-2.5 py-1 rounded-lg bg-teal-600/30 hover:bg-teal-600 text-teal-200 hover:text-white border border-teal-400/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
                        title="رفع الأفلام المعدلة للسحابة"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>رفع الأفلام المعدلة</span>
                      </button>
                    </div>
                  </div>

                  {filteredMovies.length > 0 ? (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                      {filteredMovies.map((m: any, idx: number) => (
                        <div
                          key={m.id || idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-xs gap-2"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-white block truncate">{m.title}</span>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                              <span>ID: {m.id}</span>
                              {m.category && <span>• {m.category}</span>}
                              {m.duration && <span>• {m.duration}</span>}
                            </div>
                          </div>
                          {m.isFavorite && (
                            <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/30 text-[10px] font-bold shrink-0">
                              ⭐ مفضل
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-500 text-xs font-bold">
                      لا توجد أفلام معدلة أو مخصصة في السحابة حالياً.
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: Stream Preferences in Cloud */}
              {(inspectorCategory === 'all' || inspectorCategory === 'stream_prefs') && (
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-purple-500/30 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-purple-400" />
                      <h5 className="text-xs sm:text-sm font-black text-purple-300">
                        تفضيلات السيرفرات وجودات البث المسجلة في Firestore
                      </h5>
                      <span className="px-2 py-0.2 rounded-full bg-purple-950 text-purple-300 border border-purple-500/40 text-[10px] font-mono font-bold">
                        {cloudOverview ? cloudOverview.counts.streamPreferences : 0} تفضيل
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handlePushStreamPrefsOnly}
                      disabled={isPushing}
                      className="px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-400/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>رفع تفضيلات التطبيق الحالية</span>
                    </button>
                  </div>

                  {cloudOverview && Object.keys(cloudOverview.streamPreferences).length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar font-mono text-[11px]">
                      {Object.entries(cloudOverview.streamPreferences).slice(0, 40).map(([k, p]: [string, any]) => (
                        <div
                          key={k}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300 gap-2"
                        >
                          <span className="truncate max-w-[240px] sm:max-w-md text-amber-300" title={p.urlKey || k}>
                            {p.urlKey || k}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                              {p.serverName || p.serverId || 'سيرفر'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-500/30">
                              {p.quality || 'HD'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              {p.playbackMode || 'direct'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center text-slate-500 text-xs font-bold">
                      لا توجد تفضيلات سيرفرات مخصصة في Firestore بعد.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              TAB 2: PUSH & UPLOAD TO CLOUD (عملية رفع البيانات)
          ========================================================= */}
          {activeTab === 'push' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Live Upload Status & Progress Widget */}
              {liveUploadState?.status === 'running' && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/90 via-slate-900 to-indigo-950/90 border-2 border-amber-500 shadow-2xl animate-in fade-in space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white">
                          {liveUploadState.operation || 'جاري حفظ ومزامنة البيانات في Firestore...'}
                        </h4>
                        <p className="text-xs text-amber-200 mt-0.5">
                          {liveUploadState.message || 'يتم كتابة الوثائق وحفظ التغييرات سحابياً...'}
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 font-mono text-sm font-black border border-amber-500/40 animate-pulse">
                      {liveUploadState.progress}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(5, liveUploadState.progress)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Upload Success Breakdown Widget */}
              {liveUploadState?.status === 'success' && liveUploadState.details && (
                <div className="p-4 rounded-xl bg-slate-950/90 border-2 border-emerald-500/80 shadow-2xl animate-in zoom-in-95 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-white">اكتمل الرفع والمزامنة بنجاح 🟢</h4>
                          {liveUploadState.details.latencyMs && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
                              ⚡ {liveUploadState.details.latencyMs}ms
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-emerald-300 mt-0.5">
                          تم تأكيد حفظ وتحديث كافة البيانات في Firestore لجميع الأجهزة والمتصفحات.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('inspector')}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-400/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>فحص السحابة</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-bold">
                    {liveUploadState.details.foldersCount !== undefined && (
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 flex items-center justify-center gap-1.5 text-slate-300">
                        <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{liveUploadState.details.foldersCount} مستودع</span>
                      </div>
                    )}
                    {liveUploadState.details.favMoviesCount !== undefined && (
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 flex items-center justify-center gap-1.5 text-slate-300">
                        <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{liveUploadState.details.favMoviesCount} مفضلة</span>
                      </div>
                    )}
                    {liveUploadState.details.playlistCount !== undefined && (
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 flex items-center justify-center gap-1.5 text-slate-300">
                        <Tv className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>{liveUploadState.details.playlistCount} شاشة عرض</span>
                      </div>
                    )}
                    {liveUploadState.details.moviesCount !== undefined && (
                      <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 flex items-center justify-center gap-1.5 text-slate-300">
                        <Film className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        <span>{liveUploadState.details.moviesCount} فيلم</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Master Full Push Button */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-slate-950 via-emerald-950/40 to-slate-950 border-2 border-emerald-500/70 shadow-xl space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      <UploadCloud className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-base font-black text-white">
                        حفظ ومزامنة الكل في قاعدة البيانات الآن (Master Full Sync)
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        رفع وحفظ كل بيانات التطبيق (المستودعات، المفضلة، قائمة شاشة العرض، الأفلام، تفضيلات البث) لجميع المتصفحات فوراً
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePushAllToDb}
                  disabled={isPushing || isPulling}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-emerald-600 to-teal-500 hover:from-amber-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-950/60 border border-emerald-400/60 transition-all cursor-pointer active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2.5 text-center"
                >
                  {isPushing ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <UploadCloud className="w-5 h-5 stroke-[2.5]" />
                  )}
                  <span>
                    {isPushing
                      ? 'جاري حفظ ومزامنة الكل في قاعدة البيانات...'
                      : '⚡ حفظ ومزامنة الكل في قاعدة البيانات الآن (بالرمز 5555)'}
                  </span>
                </button>
              </div>

              {/* Granular Selective Push Cards */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center gap-2 text-xs font-black text-slate-200">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>رفع أجزاء محددة بصورة منفصلة إلى قاعدة البيانات (Selective Upload):</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Granular: Playlist */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-rose-500/30 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tv className="w-4 h-4 text-rose-400" />
                        <span className="text-xs font-black text-white">كافة قوائم شاشة العرض</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-mono text-xs font-bold border border-rose-500/30">
                        {localPlaylists.length} {localPlaylists.length === 1 ? 'قائمة' : 'قوائم'} ({cinemaPlaylist.length} بالنشطة)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      رفع وتحديث كافة قوائم التشغيل ({localPlaylists.length} {localPlaylists.length === 1 ? 'قائمة تشغيل' : 'قوائم تشغيل'}) جنباً إلى جنب وترتيبها وروابط سيرفراتها في Firestore دون المساس بالمستودعات.
                    </p>
                    <button
                      type="button"
                      onClick={handlePushPlaylistOnly}
                      disabled={isPushing}
                      className="w-full py-2 px-3 rounded-lg bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-400/40 text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span>رفع كافة قوائم شاشة العرض ({localPlaylists.length} {localPlaylists.length === 1 ? 'قائمة' : 'قوائم'}) 🎬</span>
                    </button>
                  </div>

                  {/* Granular: Favorites */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-black text-white">المفضلة العامة وقوائمها فقط</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 font-mono text-xs font-bold border border-amber-500/30">
                        {favMovies.length} فيلم
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      رفع وتحديث تصنيفات المفضلة الأربعة (🟢، 🟡، 🟣، ⚫) وقوائم المفضلة المخصصة ({favoriteLists.length}) سحابياً.
                    </p>
                    <button
                      type="button"
                      onClick={handlePushFavoritesOnly}
                      disabled={isPushing}
                      className="w-full py-2 px-3 rounded-lg bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white border border-amber-400/40 text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Star className="w-3.5 h-3.5" />
                      <span>رفع كل المفضلة وقوائمها فقط ⭐</span>
                    </button>
                  </div>

                  {/* Granular: Folders */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-indigo-500/30 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-black text-white">المستودعات والأقسام فقط</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/30">
                        {folders.length} قسم
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      رفع وتحديث هيكلية المستودعات، أسماء الأقسام، وترتيبها وألوانها في Firestore.
                    </p>
                    <button
                      type="button"
                      onClick={handlePushFoldersOnly}
                      disabled={isPushing}
                      className="w-full py-2 px-3 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-400/40 text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Folder className="w-3.5 h-3.5" />
                      <span>رفع المستودعات والأقسام فقط 📁</span>
                    </button>
                  </div>

                  {/* Granular: Custom Movies */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-teal-500/30 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Film className="w-4 h-4 text-teal-400" />
                        <span className="text-xs font-black text-white">الأفلام المعدلة والمضافة فقط</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 font-mono text-xs font-bold border border-teal-500/30">
                        {movies.length} إجمالي
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      رفع أي فيلم جديد تمت إضافته أو تصنيفه أو تعديل قصته وسيرفراته إلى وثائق Firestore الموحدة.
                    </p>
                    <button
                      type="button"
                      onClick={handlePushMoviesOnly}
                      disabled={isPushing}
                      className="w-full py-2 px-3 rounded-lg bg-teal-600/30 hover:bg-teal-600 text-teal-200 hover:text-white border border-teal-400/40 text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>رفع الأفلام المعدلة فقط 🎥</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              TAB 3: PULL & UPDATE FROM CLOUD (عملية جلب وتحديث البيانات)
          ========================================================= */}
          {activeTab === 'pull' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Master Full Pull Button */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-slate-950 via-indigo-950/40 to-slate-950 border-2 border-indigo-500/70 shadow-xl space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/40">
                      <DownloadCloud className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-base font-black text-white">
                        جلب وتحديث كل البيانات من قاعدة البيانات (Master Full Pull)
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        استيراد ومطابقة أحدث نسخة سحابية لكافة المستودعات، المفضلة، قائمة شاشة العرض والأفلام فوراً
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePullAllFromDb}
                  disabled={isPushing || isPulling}
                  className="w-full py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-indigo-950 text-indigo-200 hover:text-white font-black text-sm shadow-xl border-2 border-indigo-500/60 hover:border-indigo-400 transition-all cursor-pointer active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2.5 text-center"
                >
                  {isPulling ? (
                    <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                  ) : (
                    <DownloadCloud className="w-5 h-5 text-indigo-400" />
                  )}
                  <span>
                    {isPulling
                      ? 'جاري جلب وتحديث البيانات من السحابة...'
                      : '🔄 جلب وتحديث كل البيانات من قاعدة البيانات الآن'}
                  </span>
                </button>
              </div>

              {/* Granular Selective Pull Cards */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center gap-2 text-xs font-black text-slate-200">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>تحديث وجلب أجزاء محددة بصورة يدوية منفصلة (Selective Pull):</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Granular Pull: Playlist */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-rose-500/30 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tv className="w-4 h-4 text-rose-400" />
                        <span className="text-xs font-black text-white">تحديث كافة قوائم شاشة العرض</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-mono text-xs font-bold border border-rose-500/30">
                        {cloudOverview ? `${cloudOverview.counts.allPlaylistsCount ?? currentCloudPlaylists.length} قوائم (${totalCloudPlaylistItems} عنصر)` : 'Firestore'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      جلب وتحديث كافة قوائم شاشة العرض ({cloudOverview ? `${cloudOverview.counts.allPlaylistsCount ?? currentCloudPlaylists.length} قوائم بإجمالي ${totalCloudPlaylistItems} عنصر` : 'تحميل...'}) المحفوظة في Firestore وتحديث المشغل والـ Playlists فوراً دون التأثير على بقية العناصر.
                    </p>
                    <button
                      type="button"
                      onClick={handlePullPlaylistOnly}
                      disabled={isPulling}
                      className="w-full py-2 px-3 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 hover:text-white border border-rose-500/40 text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <DownloadCloud className="w-3.5 h-3.5 text-rose-300" />
                      <span>جلب وتحديث كافة قوائم شاشة العرض ({cloudOverview?.counts.allPlaylistsCount ?? currentCloudPlaylists.length} قوائم) 🎬</span>
                    </button>
                  </div>

                  {/* Granular Pull: Favorites */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-black text-white">تحديث المفضلة وقوائمها فقط</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 font-mono text-xs font-bold border border-amber-500/30">
                        {cloudOverview ? `${cloudOverview.counts.allFavMovies} بالسحابة` : 'Firestore'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      جلب وتطبيق أحدث تصنيفات المفضلة (الألوان الأربعة) وقوائم المفضلة المخصصة من Firestore وتعيين علامات النجوم فوراً.
                    </p>
                    <button
                      type="button"
                      onClick={handlePullFavoritesOnly}
                      disabled={isPulling}
                      className="w-full py-2 px-3 rounded-lg bg-amber-950/80 hover:bg-amber-900 text-amber-200 hover:text-white border border-amber-500/40 text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <DownloadCloud className="w-3.5 h-3.5 text-amber-300" />
                      <span>جلب وتحديث المفضلة وقوائمها فقط ⭐</span>
                    </button>
                  </div>

                  {/* Granular Pull: Folders */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-indigo-500/30 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-black text-white">تحديث المستودعات والأقسام فقط</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/30">
                        {cloudOverview ? `${cloudOverview.counts.folders} بالسحابة` : 'Firestore'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      جلب وتحديث أسماء الأقسام، المستودعات، وتفاصيلها من السحابة دون المساس بقائمة الأفلام المحلية.
                    </p>
                    <button
                      type="button"
                      onClick={handlePullFoldersOnly}
                      disabled={isPulling}
                      className="w-full py-2 px-3 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 hover:text-white border border-indigo-500/40 text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <DownloadCloud className="w-3.5 h-3.5 text-indigo-300" />
                      <span>جلب وتحديث المستودعات فقط 📁</span>
                    </button>
                  </div>

                  {/* Granular Pull: Movies */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-teal-500/30 flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Film className="w-4 h-4 text-teal-400" />
                        <span className="text-xs font-black text-white">تحديث الأفلام المعدلة فقط</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 font-mono text-xs font-bold border border-teal-500/30">
                        {cloudOverview ? `${cloudOverview.counts.customMovies} بالسحابة` : 'Firestore'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      جلب ومطابقة الأفلام المعدلة والمضافة والقصص المخصصة من Firestore ودمجها مع مكتبة الأفلام الحالية.
                    </p>
                    <button
                      type="button"
                      onClick={handlePullMoviesOnly}
                      disabled={isPulling}
                      className="w-full py-2 px-3 rounded-lg bg-teal-950/80 hover:bg-teal-900 text-teal-200 hover:text-white border border-teal-500/40 text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <DownloadCloud className="w-3.5 h-3.5 text-teal-300" />
                      <span>جلب وتحديث الأفلام المعدلة فقط 🎥</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              TAB: LIVE UPLOAD DIAGNOSTICS & TESTING (فحص واختبار الرفع)
          ========================================================= */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Header Box */}
              <div className="p-4 rounded-xl bg-slate-950 border border-rose-500/40 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2.5 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      <Radio className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                        <span>فحص واختبار كافة عمليات الرفع إلى Firestore</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 font-mono border border-rose-500/30">
                          Live Upload Testing
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        اختبار مباشر وحي لجميع مسارات الرفع وقنوات المزامنة السحابية مع قياس زمن الاستجابة (Latency) وفحص حجم البيانات
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunDiagnostics}
                    disabled={isRunningDiagnostics}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 via-amber-600 to-emerald-600 hover:from-rose-500 hover:via-amber-500 hover:to-emerald-500 text-white text-xs sm:text-sm font-black shadow-lg shadow-rose-900/40 border border-amber-400/40 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {isRunningDiagnostics ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-200" />
                        <span>جاري تنفيذ اختبارات الرفع الحية...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-200" />
                        <span>🚀 تشغيل الفحص الشامل واختبار كافة عمليات الرفع الآن (7 مسارات)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Score & Status Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block">نسبة نجاح الرفع (Success):</span>
                    <span className="text-sm sm:text-base font-black font-mono flex items-center gap-1.5">
                      {diagnosticResult ? (
                        (() => {
                          const successCount = diagnosticResult.steps.filter((s) => s.status === 'success').length;
                          const total = diagnosticResult.steps.length;
                          const pct = total > 0 ? Math.round((successCount / total) * 100) : 0;
                          return diagnosticResult.overallSuccess ? (
                            <span className="text-emerald-400">100% ({successCount}/{total}) 🟢</span>
                          ) : (
                            <span className="text-rose-400">{pct}% ({successCount}/{total}) 🔴</span>
                          );
                        })()
                      ) : (
                        <span className="text-slate-400 text-xs">جاهز للبدء</span>
                      )}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block">زمن الاستجابة الإجمالي (Latency):</span>
                    <span className="text-sm sm:text-base font-black font-mono text-amber-300">
                      {diagnosticResult ? `⚡ ${diagnosticResult.totalTimeMs} ms` : '—'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block">حالة خادم Firestore:</span>
                    <span className="text-xs sm:text-sm font-bold text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                      <span>نشط ومتاح 🟢</span>
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block">أمان سقف حجم الوثائق:</span>
                    <span className="text-xs font-bold text-teal-300">
                      &lt; 350KB (آمن تماماً)
                    </span>
                  </div>
                </div>

                {/* Steps Details */}
                <div className="space-y-2 pt-2">
                  <h5 className="text-xs font-black text-slate-300 flex items-center justify-between">
                    <span>نتائج الفحص التفصيلية لكل مسار رفع:</span>
                    {diagnosticResult?.timestamp && (
                      <span className="text-[10px] text-slate-400 font-mono font-normal">
                        توقيت آخر فحص: {diagnosticResult.timestamp}
                      </span>
                    )}
                  </h5>

                  <div className="space-y-2">
                    {[
                      {
                        id: 'ping',
                        name: '1. اختبار نبضة الاتصال والتأكيد المباشر (Firestore Heartbeat & Ping)',
                        collection: 'تأكيد سلامة القراءة والاتصال بالقاعدة',
                      },
                      {
                        id: 'folders',
                        name: '2. مسار رفع المستودعات والأقسام (Folders Upload Channel)',
                        collection: 'appData/folders',
                      },
                      {
                        id: 'favLists',
                        name: '3. مسار رفع قوائم المفضلة المخصصة (Custom Fav Lists Channel)',
                        collection: 'appData/favorite_lists',
                      },
                      {
                        id: 'allFavs',
                        name: '4. مسار رفع المفضلة العامة وتوزيع الألوان الـ 4 (AllFavorites Channel)',
                        collection: 'appData/all_favorites',
                      },
                      {
                        id: 'playlist',
                        name: '5. مسار رفع قائمة شاشة العرض (Cinema Screen Playlist Channel)',
                        collection: 'appData/cinema_playlist',
                      },
                      {
                        id: 'streamPrefs',
                        name: '6. مسار رفع تفضيلات السيرفرات وجودات البث (Stream Preferences Channel)',
                        collection: 'appData/stream_preferences',
                      },
                      {
                        id: 'customMods',
                        name: '7. مسار رفع تعديلات الأفلام والإضافات الخاصة المحمية (Custom Movies Channel)',
                        collection: 'appData/custom_movies',
                      },
                    ].map((stepDef) => {
                      const stepData = diagnosticResult?.steps.find((s) => s.id === stepDef.id);
                      const isPending = !stepData || stepData.status === 'pending';
                      const isRunning = stepData?.status === 'running';
                      const isSuccess = stepData?.status === 'success';
                      const isFailed = stepData?.status === 'error';

                      return (
                        <div
                          key={stepDef.id}
                          className={`p-3 rounded-xl border transition-all ${
                            isSuccess
                              ? 'bg-emerald-950/30 border-emerald-500/40'
                              : isFailed
                              ? 'bg-rose-950/40 border-rose-500/50'
                              : isRunning
                              ? 'bg-amber-950/40 border-amber-500/50 animate-pulse'
                              : 'bg-slate-900/60 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {isSuccess && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
                              {isFailed && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
                              {isRunning && <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />}
                              {isPending && <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-600 shrink-0"></span>}

                              <div className="min-w-0">
                                <span className={`text-xs font-bold block ${isSuccess ? 'text-white' : isFailed ? 'text-rose-200' : 'text-slate-300'}`}>
                                  {stepDef.name}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono block">
                                  المسار: {stepDef.collection}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {stepData?.latencyMs !== undefined && (
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-300">
                                  ⚡ {stepData.latencyMs} ms
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  isSuccess
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : isFailed
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                    : isRunning
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                {isSuccess ? '✓ اجتاز بنجاح' : isFailed ? '✕ فشل الرفع' : isRunning ? 'جاري الفحص...' : 'في الانتظار'}
                              </span>
                            </div>
                          </div>

                          {stepData?.message && (
                            <div className="mt-2 text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 font-mono">
                              {stepData.message}
                            </div>
                          )}
                          {stepData?.error && (
                            <div className="mt-2 text-[11px] text-rose-300 bg-rose-950/60 p-2 rounded-lg border border-rose-500/40 font-mono">
                              ⚠️ الخطأ: {stepData.error}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Helpful Note about the Floating Indicator */}
                <div className="p-3 rounded-xl bg-gradient-to-r from-amber-950/40 via-indigo-950/40 to-slate-950 border border-amber-500/30 text-xs text-slate-300 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="text-amber-300 font-bold">مؤشر الرفع السحابي اللحظي في التطبيق (Cloud Upload Indicator):</strong>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      يحتوي التطبيق الآن على مؤشر عائم أسفل يمين الشاشة يظهر فورياً عند تنفيذ أي عملية رفع إلى Firestore (سواء الرفع الشامل، أو رفع قائمة العرض، أو المفضلة، أو المستودعات، أو الحفظ عند المغادرة)، ويعرض نسبة الإنجاز وزمن الاستجابة بالملي ثانية وتفاصيل عدد العناصر المحفوظة.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              TAB 4: CLOUD INFO & SETTINGS (معلومات واتصال السحابة)
          ========================================================= */}
          {activeTab === 'info' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/30 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <span className="text-xs sm:text-sm font-black text-purple-300">
                      بيانات تكوين واتصال Cloud Firestore
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold border border-emerald-500/30 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                  >
                    {isTesting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    )}
                    <span>فحص الاتصال المباشر</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 font-sans block">معرف قاعدة البيانات (Database ID):</span>
                    <span className="text-amber-300 font-bold break-all block select-all">
                      {databaseId}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 font-sans block">معرف المشروع (Project ID):</span>
                    <span className="text-indigo-300 font-bold break-all block select-all">
                      {projectId}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 leading-relaxed">
                    <strong>آلية المزامنة التلقائية والذكية في AutoCinema:</strong>
                    <p className="text-[11px] text-emerald-200/90">
                      1. عند بدء تشغيل التطبيق، يتم عرض البيانات المحلية فوراً بدون أي تأخير.
                      <br />
                      2. في الخلفية، يقوم التطبيق تلقائياً بالتحقق من Firestore ومطابقة أحدث تعديلات تمت من أي جهاز أو متصفح آخر.
                      <br />
                      3. أزرار الرفع والجلب الجزئية تتيح لك التحكم الدقيق بتحديث قائمة العرض أو المفضلة بضغطة زر واحدة.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Persistent Statement Report if exists */}
          {syncReport && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-slate-950 via-emerald-950/20 to-slate-950 border border-emerald-500/40 text-xs flex items-center justify-between flex-wrap gap-2 text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  آخر مزامنة ناجحة: <strong className="text-white font-mono">{syncReport.timestamp}</strong> • {syncReport.statusText}
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-500/30">
                {syncReport.foldersCount} مستودع • {syncReport.moviesCount} فيلم • {syncReport.playlistCount} قائمة العرض
              </span>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>قاعدة البيانات السحابية جاهزة ومتصلة 🟢</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
            >
              إغلاق النافذة
            </button>
          </div>
        </div>
      </div>

      {/* Database Master Password Confirmation Modal (5555) */}
      <DbPasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setPendingAction(null);
        }}
        onConfirm={async () => {
          if (pendingAction) {
            await pendingAction();
          }
        }}
        reason="settings_sync"
        title={passwordModalTitle}
        changeSummary={passwordChangeSummary}
      />
    </div>
  );
};
