import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App instance
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

export const DEFAULT_GDRIVE_FAV_URL =
  'https://drive.google.com/file/d/1c6MKsXFDz9RO_xLye5tKgnSuFZxgjzXe/view?usp=sharing';

export const DEFAULT_GDRIVE_DATA_URL =
  'https://drive.google.com/file/d/1I1uperMWQGDX5b430KIAORtUwHcqu7U-/view?usp=drive_link';

export const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
// Allow user to select or switch to any Google account
provider.setCustomParameters({
  prompt: 'select_account',
});

// In-memory token storage (DO NOT store in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export interface DriveFolderInfo {
  id: string;
  name: string;
}

export interface DriveFileInfo {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
}

export interface DriveScanResult {
  folder: DriveFolderInfo | null;
  allFiles: DriveFileInfo[];
  initialDataFiles: DriveFileInfo[];
  favFiles: DriveFileInfo[];
  initialDataFile?: DriveFileInfo;
  favFile?: DriveFileInfo;
  initialData2File?: DriveFileInfo;
}

export interface SyncResult {
  success: boolean;
  folderName: string;
  folderId?: string;
  filesFound?: {
    initialDataFile?: DriveFileInfo;
    favFile?: DriveFileInfo;
    initialData2File?: DriveFileInfo;
  };
  initialData?: any;
  favData?: any;
  stats?: {
    moviesCount: number;
    foldersCount: number;
    favoritesCount: number;
    playlistCount: number;
  };
  error?: string;
}

/**
 * Initialize Firebase Auth listener.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) {
        onAuthSuccess(user, cachedAccessToken);
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) {
        onAuthFailure();
      }
    }
  });
};

/**
 * Sign in with Google using popup and obtain Drive access token.
 * Prompts user with 'select_account' so they can choose or sign into ANY Google account.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('لم نتمكن من الحصول على تصريح الوصول من حساب Google.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google sign in error:', error);
    if (error?.code === 'auth/popup-blocked' || (error?.message && error.message.includes('popup-blocked'))) {
      throw new Error('تم حظر النافذة المنبثقة من قبل المتصفح (auth/popup-blocked). يرجى السماح بالنوافذ المنبثقة لموقع التطبيق، أو استخدام خيار "الرابط المباشر" أو "رفع الملف" بدون الحاجة لتسجيل الدخول.');
    }
    if (error?.code === 'auth/popup-closed-by-user') {
      throw new Error('تم إغلاق نافذة تسجيل الدخول قبل اكتمال العملية.');
    }
    if (error?.message && (error.message.includes('verification') || error.message.includes('Access blocked'))) {
      throw new Error('حساب Google هذا محظور من قبل Google (Access blocked: has not completed verification) لأنه غير مضاف كمستخدم تجريبي Test User. يرجى استخدام طريقة "الرابط المباشر" أو "رفع الملف" لتحديث البيانات فوراً دون الحاجة لتسجيل الدخول.');
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Get current cached access token.
 */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * Log out user and clear in-memory token.
 */
export const googleLogout = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
};

/**
 * Find folder named 'AUTOCINEMA-PUPLIC' (or variations) in user's Google Drive.
 */
export const findAutocinemaFolder = async (
  token: string
): Promise<DriveFolderInfo | null> => {
  try {
    // 1. First exact match search
    const query = encodeURIComponent(
      "mimeType = 'application/vnd.google-apps.folder' and trashed = false and " +
      "(name = 'AUTOCINEMA-PUPLIC' or name = 'autocinema-puplic' or name = 'AUTOCINEMA-PUBLIC' or name = 'autocinema-public')"
    );

    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=10`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `خطأ استعلام Google Drive (${res.status})`);
    }

    const data = await res.json();
    if (data.files && data.files.length > 0) {
      const exact = data.files.find((f: any) => f.name === 'AUTOCINEMA-PUPLIC') || data.files[0];
      return { id: exact.id, name: exact.name };
    }

    // 2. Fallback fuzzy search: list recent folders and check by regex
    const allFoldersQuery = encodeURIComponent(
      "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    );
    const fuzzyRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${allFoldersQuery}&fields=files(id,name)&pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (fuzzyRes.ok) {
      const fuzzyData = await fuzzyRes.json();
      const matched = (fuzzyData.files || []).find((f: any) =>
        /autocinema.*pu?blic/i.test(f.name)
      );
      if (matched) {
        return { id: matched.id, name: matched.name };
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding folder on Google Drive:', error);
    throw error;
  }
};

/**
 * Comprehensive file scan: returns all files, classified into fav files and initialdata files.
 */
export const scanDriveFolderFiles = async (
  folderId: string | null,
  token: string
): Promise<DriveScanResult> => {
  try {
    let query: string;
    if (folderId) {
      query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    } else {
      query = encodeURIComponent("trashed = false and (name contains '.json' or name contains 'data' or name contains 'fav')");
    }

    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,size,modifiedTime)&pageSize=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`خطأ قراءة ملفات Google Drive (${res.status})`);
    }

    const data = await res.json();
    const files: DriveFileInfo[] = data.files || [];

    const initialDataFiles: DriveFileInfo[] = [];
    const favFiles: DriveFileInfo[] = [];

    let initialDataFile: DriveFileInfo | undefined;
    let initialData2File: DriveFileInfo | undefined;
    let favFile: DriveFileInfo | undefined;

    for (const f of files) {
      const lower = f.name.toLowerCase().trim();
      const isInitial = lower.includes('initial') || lower.includes('data');
      const isFav = lower.includes('fav');

      if (isInitial) {
        initialDataFiles.push(f);
      }
      if (isFav) {
        favFiles.push(f);
      }

      if (lower === 'initialdata.json' || lower === 'initialdata') {
        initialDataFile = f;
      } else if (lower === 'initialdata2.json' || lower === 'initialdata2') {
        initialData2File = f;
      } else if (lower === 'fav.json' || lower === 'fav') {
        favFile = f;
      }
    }

    if (!initialDataFile && initialDataFiles.length > 0) {
      initialDataFile = initialDataFiles[0];
    }
    if (!favFile && favFiles.length > 0) {
      favFile = favFiles[0];
    }

    return {
      folder: folderId ? { id: folderId, name: 'AUTOCINEMA-PUPLIC' } : null,
      allFiles: files,
      initialDataFiles,
      favFiles,
      initialDataFile,
      favFile,
      initialData2File,
    };
  } catch (error) {
    console.error('Error scanning drive files:', error);
    throw error;
  }
};

/**
 * Backward-compatible findDriveFiles helper.
 */
export const findDriveFiles = async (
  folderId: string | null,
  token: string
): Promise<{
  initialDataFile?: DriveFileInfo;
  favFile?: DriveFileInfo;
  initialData2File?: DriveFileInfo;
  allFiles?: DriveFileInfo[];
  initialDataFiles?: DriveFileInfo[];
  favFiles?: DriveFileInfo[];
}> => {
  const result = await scanDriveFolderFiles(folderId, token);
  return {
    initialDataFile: result.initialDataFile,
    favFile: result.favFile,
    initialData2File: result.initialData2File,
    allFiles: result.allFiles,
    initialDataFiles: result.initialDataFiles,
    favFiles: result.favFiles,
  };
};

/**
 * Download a file content as parsed JSON.
 */
export const downloadDriveFile = async (fileId: string, token: string): Promise<any> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`فشل تحميل الملف من Google Drive (${res.status})`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e: any) {
    throw new Error(`الملف ليس بتنسيق JSON سليم: ${e?.message}`);
  }
};

/**
 * Sync ONLY the Fav file (updating favorites and Cinema Screen playlist).
 */
export const syncFavOnlyFromDrive = async (
  fileId: string,
  token: string,
  onProgress?: (message: string) => void
): Promise<{
  success: boolean;
  favData?: any;
  stats?: { favoritesCount: number; playlistCount: number };
  error?: string;
}> => {
  try {
    onProgress?.('جاري تنزيل ملف المفضلة وشاشة العرض المختار من Google Drive...');
    const favData = await downloadDriveFile(fileId, token);

    // Ensure cinemaPlaylist array is valid
    if (!Array.isArray(favData.cinemaPlaylist)) {
      favData.cinemaPlaylist = [];
    }
    if (!favData.cinemaScreenSettings) {
      favData.cinemaScreenSettings = {
        itemCount: favData.cinemaPlaylist.length,
        exportedAt: new Date().toISOString(),
      };
    }

    onProgress?.('جاري حفظ ملف fav.json في مجلد public وتحديث التطبيق...');
    const res = await fetch('/api/update-fav-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(favData),
    });

    if (!res.ok) {
      throw new Error('فشل حفظ ملف fav.json على الخادم.');
    }

    const favoritesCount =
      favData?.allFavorites?.totalFavoritesCount ||
      (Array.isArray(favData?.allFavorites?.movieIds)
        ? favData.allFavorites.movieIds.length
        : 0);
    const playlistCount = Array.isArray(favData?.cinemaPlaylist)
      ? favData.cinemaPlaylist.length
      : 0;

    onProgress?.('تم تحديث المفضلة وقائمة شاشة العرض بنجاح!');

    return {
      success: true,
      favData,
      stats: {
        favoritesCount,
        playlistCount,
      },
    };
  } catch (error: any) {
    console.error('syncFavOnlyFromDrive error:', error);
    return {
      success: false,
      error: error?.message || 'حدث خطأ أثناء مزامنة وتحديث ملف المفضلة.',
    };
  }
};

/**
 * Sync ONLY the InitialData file (updating repositories and movies).
 */
export const syncInitialDataOnlyFromDrive = async (
  fileId: string,
  token: string,
  targetSlot: 'initialData.json' | 'initialData2.json' = 'initialData.json',
  onProgress?: (message: string) => void
): Promise<{
  success: boolean;
  initialData?: any;
  stats?: { moviesCount: number; foldersCount: number };
  error?: string;
}> => {
  try {
    onProgress?.(`جاري تنزيل ملف المستودعات والأفلام من Google Drive...`);
    const initialData = await downloadDriveFile(fileId, token);

    onProgress?.(`جاري حفظ البيانات في ${targetSlot} وتحديث أقسام التطبيق...`);
    const res = await fetch('/api/update-initial-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...initialData,
        consolidateBase: targetSlot === 'initialData.json',
      }),
    });

    if (!res.ok) {
      throw new Error(`فشل حفظ البيانات في ${targetSlot} على الخادم.`);
    }

    const moviesCount = Array.isArray(initialData?.movies) ? initialData.movies.length : 0;
    const foldersCount = Array.isArray(initialData?.folders) ? initialData.folders.length : 0;

    onProgress?.('تم تحديث بيانات المستودعات والأفلام بنجاح!');

    return {
      success: true,
      initialData,
      stats: {
        moviesCount,
        foldersCount,
      },
    };
  } catch (error: any) {
    console.error('syncInitialDataOnlyFromDrive error:', error);
    return {
      success: false,
      error: error?.message || 'حدث خطأ أثناء مزامنة وتحديث ملف المستودعات والأفلام.',
    };
  }
};

/**
 * Complete synchronization workflow (both initialData and fav).
 */
export const syncFromGoogleDrive = async (
  token: string,
  onProgress?: (message: string) => void
): Promise<SyncResult> => {
  try {
    onProgress?.('جاري البحث عن مجلد (AUTOCINEMA-PUPLIC) في حساب Google Drive...');
    const folder = await findAutocinemaFolder(token);

    if (!folder) {
      return {
        success: false,
        folderName: 'AUTOCINEMA-PUPLIC',
        filesFound: {},
        error:
          'لم يتم العثور على مجلد باسم "AUTOCINEMA-PUPLIC" على حساب Google Drive. تأكد من إنشاء المجلد ووضع الملفات بداخله.',
      };
    }

    onProgress?.(`تم العثور على المجلد "${folder.name}". جاري فحص الملفات...`);
    const scan = await scanDriveFolderFiles(folder.id, token);

    if (!scan.initialDataFile && !scan.favFile) {
      return {
        success: false,
        folderName: folder.name,
        folderId: folder.id,
        filesFound: scan,
        error: `تم العثور على مجلد "${folder.name}"، لكنه لا يحتوي على أي من ملفي initialdata.json أو fav.json.`,
      };
    }

    let initialData: any = null;
    let favData: any = null;

    if (scan.initialDataFile) {
      const res = await syncInitialDataOnlyFromDrive(scan.initialDataFile.id, token, 'initialData.json', onProgress);
      if (res.success) {
        initialData = res.initialData;
      }
    }

    if (scan.favFile) {
      const res = await syncFavOnlyFromDrive(scan.favFile.id, token, onProgress);
      if (res.success) {
        favData = res.favData;
      }
    }

    const moviesCount = Array.isArray(initialData?.movies) ? initialData.movies.length : 0;
    const foldersCount = Array.isArray(initialData?.folders) ? initialData.folders.length : 0;
    const favoritesCount =
      favData?.allFavorites?.totalFavoritesCount ||
      (Array.isArray(favData?.allFavorites?.movieIds) ? favData.allFavorites.movieIds.length : 0);
    const playlistCount = Array.isArray(favData?.cinemaPlaylist) ? favData.cinemaPlaylist.length : 0;

    onProgress?.('تمت المزامنة وتحديث كافة البيانات بنجاح!');

    return {
      success: true,
      folderName: folder.name,
      folderId: folder.id,
      filesFound: {
        initialDataFile: scan.initialDataFile,
        favFile: scan.favFile,
        initialData2File: scan.initialData2File,
      },
      initialData,
      favData,
      stats: {
        moviesCount,
        foldersCount,
        favoritesCount,
        playlistCount,
      },
    };
  } catch (error: any) {
    console.error('Sync from Google Drive error:', error);
    return {
      success: false,
      folderName: 'AUTOCINEMA-PUPLIC',
      filesFound: {},
      error: error?.message || 'حدث خطأ أثناء الاتصال بمجلد Google Drive والمزامنة.',
    };
  }
};

export function extractDriveFileId(input: string): string | null {
  if (!input) return null;
  const str = input.trim();
  if (/^[a-zA-Z0-9_-]{20,60}$/.test(str)) return str;
  const matchFile = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile) return matchFile[1];
  const matchId = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId) return matchId[1];
  const matchOpen = str.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
  if (matchOpen) return matchOpen[1];
  const matchFolder = str.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (matchFolder) return matchFolder[1];
  return null;
}

/**
 * Fetch and apply Google Drive file via public Link / ID (No login required).
 */
export const fetchAndApplyDriveUrl = async (
  url: string,
  targetSlot?: 'fav.json' | 'initialData.json' | 'initialData2.json',
  onProgress?: (message: string) => void
): Promise<{
  success: boolean;
  detectedType?: 'fav' | 'initial' | 'both';
  savedToSlot?: string;
  data?: any;
  initialData?: any;
  favData?: any;
  stats?: {
    moviesCount: number;
    foldersCount: number;
    favoritesCount: number;
    playlistCount: number;
  };
  error?: string;
}> => {
  try {
    onProgress?.('جاري الاتصال بـ Google Drive وجلب الملف...');
    
    // Method 1: Server proxy with 16-second timeout
    let serverRes: any = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 16000);
      const res = await fetch('/api/fetch-drive-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, targetSlot }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        if (json && json.success) {
          serverRes = json;
        }
      }
    } catch (serverErr) {
      console.warn('Server fetch-drive-url attempt warning, trying direct client link:', serverErr);
    }

    if (serverRes && serverRes.success) {
      onProgress?.('تم جلب البيانات وتحديث النظام بنجاح!');
      return serverRes;
    }

    // Method 2: Direct browser fetch to Google Drive usercontent CDN (CORS-enabled)
    const fileId = extractDriveFileId(url);
    if (fileId) {
      onProgress?.('جاري محاولة الاتصال المباشر بـ Google Drive عبر المتصفح...');
      try {
        const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
        const directRes = await fetch(directUrl);
        if (directRes.ok) {
          const directText = await directRes.text();
          if (directText && !directText.includes('accounts.google.com') && !directText.includes('ServiceLogin')) {
            const parsed = JSON.parse(directText);
            let detectedType: 'fav' | 'initial' = 'initial';
            if (parsed.cinemaPlaylist || (parsed.allFavorites && parsed.allFavorites.sections)) {
              detectedType = 'fav';
            } else if (parsed.movies || parsed.folders) {
              detectedType = 'initial';
            }
            const slot = targetSlot || (detectedType === 'fav' ? 'fav.json' : 'initialData.json');

            // Persist to server in background
            if (slot === 'fav.json') {
              fetch('/api/update-fav-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsed),
              }).catch(() => {});
            } else {
              fetch('/api/update-initial-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...parsed, consolidateBase: slot === 'initialData.json' }),
              }).catch(() => {});
            }

            const stats = {
              moviesCount: Array.isArray(parsed?.movies) ? parsed.movies.length : 0,
              foldersCount: Array.isArray(parsed?.folders) ? parsed.folders.length : 0,
              favoritesCount: parsed?.allFavorites?.totalFavoritesCount || (Array.isArray(parsed?.allFavorites?.movieIds) ? parsed.allFavorites.movieIds.length : 0),
              playlistCount: Array.isArray(parsed?.cinemaPlaylist) ? parsed.cinemaPlaylist.length : 0,
            };

            onProgress?.('تم جلب البيانات وتحديث النظام بنجاح!');
            return {
              success: true,
              detectedType,
              savedToSlot: slot,
              data: parsed,
              initialData: detectedType === 'initial' ? parsed : undefined,
              favData: detectedType === 'fav' ? parsed : undefined,
              stats,
            };
          }
        }
      } catch (directErr) {
        console.warn('Direct browser Google Drive download warning:', directErr);
      }
    }

    // Method 3: Fallback to local files if offline or network temporarily down
    if (targetSlot === 'fav.json' || !targetSlot) {
      try {
        const localFavRes = await fetch('/fav.json');
        if (localFavRes.ok) {
          const localFav = await localFavRes.json();
          onProgress?.('تم استخدام النسخة المخزنة مسبقاً من fav.json.');
          return {
            success: true,
            detectedType: 'fav',
            savedToSlot: 'fav.json',
            data: localFav,
            favData: localFav,
            stats: {
              moviesCount: 0,
              foldersCount: 0,
              favoritesCount: localFav?.allFavorites?.totalFavoritesCount || (Array.isArray(localFav?.allFavorites?.movieIds) ? localFav.allFavorites.movieIds.length : 0),
              playlistCount: Array.isArray(localFav?.cinemaPlaylist) ? localFav.cinemaPlaylist.length : 0,
            },
          };
        }
      } catch (_) {}
    }

    return {
      success: false,
      error: 'تعذر الاتصال بـ Google Drive في الوقت الحالي. تم الحفاظ على البيانات الحالية.',
    };
  } catch (error: any) {
    console.warn('fetchAndApplyDriveUrl graceful warning:', error);
    return {
      success: false,
      error: error?.message || 'حدث خطأ أثناء جلب الملف من Google Drive.',
    };
  }
};

/**
 * Upload and apply a local JSON file directly to the system.
 */
export const uploadJsonFileDirect = async (
  file: File,
  targetSlot: 'fav.json' | 'initialData.json' | 'initialData2.json' = 'initialData.json',
  onProgress?: (message: string) => void
): Promise<{
  success: boolean;
  data?: any;
  stats?: {
    moviesCount: number;
    foldersCount: number;
    favoritesCount: number;
    playlistCount: number;
  };
  error?: string;
}> => {
  try {
    onProgress?.(`جاري قراءة الملف ${file.name}...`);
    const text = await file.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (e: any) {
      throw new Error(`الملف ${file.name} ليس بتنسيق JSON سليم: ${e?.message}`);
    }

    return await uploadRawJsonDirect(data, targetSlot, onProgress);
  } catch (error: any) {
    console.error('uploadJsonFileDirect error:', error);
    return {
      success: false,
      error: error?.message || 'حدث خطأ أثناء رفع وتطبيق الملف.',
    };
  }
};

/**
 * Direct upload/apply parsed JSON object to the specified slot.
 */
export const uploadRawJsonDirect = async (
  data: any,
  targetSlot: 'fav.json' | 'initialData.json' | 'initialData2.json' = 'initialData.json',
  onProgress?: (message: string) => void
): Promise<{
  success: boolean;
  data?: any;
  stats?: {
    moviesCount: number;
    foldersCount: number;
    favoritesCount: number;
    playlistCount: number;
  };
  error?: string;
}> => {
  try {
    onProgress?.(`جاري حفظ البيانات في ${targetSlot}...`);

    let endpoint = '/api/update-initial-data';
    let bodyPayload: any = data;

    if (targetSlot === 'fav.json') {
      endpoint = '/api/update-fav-data';
      if (!Array.isArray(bodyPayload.cinemaPlaylist)) {
        bodyPayload.cinemaPlaylist = [];
      }
    } else {
      bodyPayload = {
        ...data,
        consolidateBase: targetSlot === 'initialData.json',
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      throw new Error(`فشل حفظ البيانات على الخادم (${res.status})`);
    }

    const moviesCount = Array.isArray(data?.movies) ? data.movies.length : 0;
    const foldersCount = Array.isArray(data?.folders) ? data.folders.length : 0;
    const favoritesCount =
      data?.allFavorites?.totalFavoritesCount ||
      (Array.isArray(data?.allFavorites?.movieIds) ? data.allFavorites.movieIds.length : 0);
    const playlistCount = Array.isArray(data?.cinemaPlaylist) ? data.cinemaPlaylist.length : 0;

    onProgress?.('تم تحديث البيانات بنجاح في النظام!');

    return {
      success: true,
      data,
      stats: {
        moviesCount,
        foldersCount,
        favoritesCount,
        playlistCount,
      },
    };
  } catch (error: any) {
    console.error('uploadRawJsonDirect error:', error);
    return {
      success: false,
      error: error?.message || 'فشل حفظ وتطبيق البيانات.',
    };
  }
};
