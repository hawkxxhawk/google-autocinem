import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  setLogLevel,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Silence internal informational SDK logs (such as offline mode transitions)
try {
  setLogLevel('silent');
} catch {}

// Gracefully intercept offline connection status notices so they don't trigger uncaught error monitors
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = function (...args: any[]) {
    const msg = String(args[0] || '');
    if (
      msg.includes('Could not reach Cloud Firestore backend') ||
      msg.includes("Backend didn't respond within 10 seconds") ||
      msg.includes('client is offline') ||
      msg.includes('operate in offline mode')
    ) {
      console.warn('[Firestore Status]: Client operating in offline mode.');
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

// Initialize Firestore according to Firebase skill specification
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);

// Error Handling Requirements from Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Recursively strips undefined keys and normalizes values so Firestore never rejects data
 * with "Unsupported field value: undefined".
 */
export function sanitizeForFirestore<T>(val: T): T {
  if (val === undefined) {
    return null as any;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (val instanceof Date) {
    return val.toISOString() as any;
  }
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as any;
  }
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(val as Record<string, any>)) {
    if (v !== undefined) {
      clean[k] = sanitizeForFirestore(v);
    }
  }
  return clean as T;
}

/**
 * Checks whether an error is due to offline status or network unreachability.
 */
export function isOfflineOrNetworkError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const code = (error as any)?.code;
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'resource-exhausted' ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota') ||
    msg.includes('client is offline') ||
    msg.includes('could not reach cloud firestore') ||
    msg.includes('offline mode') ||
    msg.includes('failed to get document because the client is offline') ||
    msg.includes('network') ||
    msg.includes("backend didn't respond") ||
    msg.includes('timeout')
  );
}

/**
 * Executes a Promise with a timeout fallback, preventing initial app load freeze when offline.
 */
function withTimeout<T>(promise: Promise<T>, ms = 3000, fallback: T): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallback);
    }, ms);
  });
  return Promise.race([
    promise
      .then((res) => {
        clearTimeout(timer);
        return res;
      })
      .catch((err) => {
        clearTimeout(timer);
        if (isOfflineOrNetworkError(err)) {
          return fallback;
        }
        throw err;
      }),
    timeoutPromise,
  ]);
}

// Connection Validation according to skill guidelines
export async function testConnection(): Promise<boolean> {
  try {
    const probe = getDocFromServer(doc(db, 'test', 'connection'));
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
    const res = await Promise.race([probe, timeout]);
    if (res) {
      console.log('Firestore connected successfully.');
      return true;
    }
    return false;
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline / check connection or permissions.');
    }
    return false;
  }
}

// Types
export interface DbFolder {
  id: string;
  name: string;
  description?: string;
  color?: string;
  sortBy?: string;
  isFolderHidden?: boolean;
  includeInAllFavorites?: boolean;
  zone?: 'green' | 'yellow' | 'purple' | 'black' | string;
  orderIndex?: number;
  updatedAt?: string;
}

export interface DbMovie {
  id: string;
  title: string;
  url?: string;
  embedUrl?: string;
  duration?: string;
  category?: string;
  description?: string;
  posterUrl?: string;
  addedAt?: string;
  parentFolderId: string;
  isFavorite?: boolean;
  favoriteColor?: string;
  favoriteOrder?: number;
  isHidden?: boolean;
  isBroken?: boolean;
  classification?: string;
  classificationReason?: string;
  storySummary?: string;
  favoriteListIds?: string[];
  updatedAt?: string;
  [key: string]: any;
}

export interface DbFavoriteList {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt?: string;
  movieIds?: string[];
  updatedAt?: string;
}

export interface DbCinemaPlaylist {
  id: string;
  items: any[];
  currentIndex?: number;
  updatedAt?: string;
}

export interface DbAllFavorites {
  id: string;
  movieIds: string[];
  sections?: {
    green?: string[];
    yellow?: string[];
    purple?: string[];
    black?: string[];
  };
  hiddenFavoriteSections?: string[];
  updatedAt?: string;
}

// -------------------------------------------------------------
// 1. Folders / Repositories (المستودعات والأقسام)
// -------------------------------------------------------------
export async function fetchFoldersFromDb(): Promise<DbFolder[]> {
  const collectionPath = 'folders';
  try {
    const fetchPromise = (async () => {
      const snap = await getDocs(collection(db, collectionPath));
      const folders: DbFolder[] = [];
      snap.forEach((d) => {
        folders.push(d.data() as DbFolder);
      });

      // Attempt to load explicit order from appData/folders_order
      let masterOrderMap: Map<string, number> | null = null;
      try {
        const orderSnap = await withTimeout(getDoc(doc(db, 'appData', 'folders_order')), 1500, null);
        if (orderSnap && orderSnap.exists()) {
          const orderData = orderSnap.data();
          if (Array.isArray(orderData?.folderIds)) {
            masterOrderMap = new Map();
            orderData.folderIds.forEach((id: string, idx: number) => {
              masterOrderMap!.set(id, idx + 1);
            });
          }
        }
      } catch (_) {}

      // Sort folders reliably based on masterOrderMap or orderIndex or zone order
      const ZONE_ORDER: Record<string, number> = { green: 1, yellow: 2, purple: 3, black: 4 };
      folders.sort((a, b) => {
        if (masterOrderMap) {
          const posA = masterOrderMap.has(a.id) ? (masterOrderMap.get(a.id) as number) : 99999;
          const posB = masterOrderMap.has(b.id) ? (masterOrderMap.get(b.id) as number) : 99999;
          if (posA !== posB) return posA - posB;
        }
        if (typeof a.orderIndex === 'number' && typeof b.orderIndex === 'number') {
          if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
        }
        if (typeof a.orderIndex === 'number') return -1;
        if (typeof b.orderIndex === 'number') return 1;

        const zA = ZONE_ORDER[a.zone || ''] || 99;
        const zB = ZONE_ORDER[b.zone || ''] || 99;
        return zA - zB;
      });

      return folders;
    })();

    return await withTimeout(fetchPromise, 4500, []);
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] ${collectionPath}: operating in offline/cached fallback mode.`);
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export async function saveFolderToDb(folder: DbFolder): Promise<void> {
  const docPath = `folders/${folder.id}`;
  try {
    const payload = sanitizeForFirestore({
      ...folder,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'folders', folder.id), payload, { merge: true });
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] saveFolderToDb on ${docPath} delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteFolderFromDb(folderId: string): Promise<void> {
  const docPath = `folders/${folderId}`;
  try {
    await deleteDoc(doc(db, 'folders', folderId));
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] deleteFolderFromDb on ${docPath} delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function saveAllFoldersToDb(folders: DbFolder[]): Promise<void> {
  if (!folders || folders.length === 0) return;
  const collectionPath = 'folders';
  try {
    // 1. Save master order registry in appData/folders_order
    const folderIds = folders.map((f) => f.id).filter(Boolean);
    try {
      await withTimeout(
        setDoc(
          doc(db, 'appData', 'folders_order'),
          sanitizeForFirestore({
            id: 'folders_order',
            folderIds,
            count: folderIds.length,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        ),
        4000,
        null
      );
    } catch (orderErr) {
      console.warn('[Firestore] Warning saving folders_order registry:', orderErr);
    }

    // 2. Persist individual folder docs with orderIndex
    const chunks: DbFolder[][] = [];
    for (let i = 0; i < folders.length; i += 50) {
      chunks.push(folders.slice(i, i + 50));
    }
    let globalIndex = 1;
    for (const chunk of chunks) {
      try {
        const batch = writeBatch(db);
        for (const f of chunk) {
          if (!f || !f.id) continue;
          const ref = doc(db, 'folders', f.id);
          const assignedOrder = typeof f.orderIndex === 'number' ? f.orderIndex : globalIndex++;
          const payload = sanitizeForFirestore({
            ...f,
            orderIndex: assignedOrder,
            updatedAt: new Date().toISOString(),
          });
          batch.set(ref, payload, { merge: true });
        }
        await withTimeout(batch.commit(), 8000, null);
      } catch (chunkErr) {
        console.warn('[Firestore] Batch commit fallback for folders:', chunkErr);
        await Promise.all(
          chunk.map((f, localIdx) => {
            if (!f || !f.id) return Promise.resolve();
            const assignedOrder = typeof f.orderIndex === 'number' ? f.orderIndex : localIdx + 1;
            return withTimeout(
              setDoc(
                doc(db, 'folders', f.id),
                sanitizeForFirestore({ ...f, orderIndex: assignedOrder, updatedAt: new Date().toISOString() }),
                { merge: true }
              ),
              4000,
              null
            ).catch(() => {});
          })
        );
      }
    }
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] saveAllFoldersToDb delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, collectionPath);
  }
}

// -------------------------------------------------------------
// 2. Favorite Lists (قوائم المفضلة المخصصة)
// -------------------------------------------------------------
export async function fetchFavoriteListsFromDb(): Promise<DbFavoriteList[]> {
  const collectionPath = 'favoriteLists';
  try {
    const fetchPromise = getDocs(collection(db, collectionPath)).then((snap) => {
      const lists: DbFavoriteList[] = [];
      snap.forEach((d) => {
        lists.push(d.data() as DbFavoriteList);
      });
      return lists;
    });
    return await withTimeout(fetchPromise, 3500, []);
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] ${collectionPath}: operating in offline/cached fallback mode.`);
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export async function saveFavoriteListToDb(list: DbFavoriteList): Promise<void> {
  const docPath = `favoriteLists/${list.id}`;
  try {
    const payload = sanitizeForFirestore({
      ...list,
      updatedAt: new Date().toISOString(),
    });
    await withTimeout(setDoc(doc(db, 'favoriteLists', list.id), payload, { merge: true }), 6000, null);
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] saveFavoriteListToDb on ${docPath} delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteFavoriteListFromDb(listId: string): Promise<void> {
  const docPath = `favoriteLists/${listId}`;
  try {
    await withTimeout(deleteDoc(doc(db, 'favoriteLists', listId)), 6000, null);
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] deleteFavoriteListFromDb on ${docPath} delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function saveAllFavoriteListsToDb(lists: DbFavoriteList[]): Promise<void> {
  if (!lists || lists.length === 0) return;
  const collectionPath = 'favoriteLists';
  try {
    const chunks: DbFavoriteList[][] = [];
    for (let i = 0; i < lists.length; i += 50) {
      chunks.push(lists.slice(i, i + 50));
    }
    for (const chunk of chunks) {
      try {
        const batch = writeBatch(db);
        for (const l of chunk) {
          if (!l || !l.id) continue;
          const ref = doc(db, 'favoriteLists', l.id);
          const payload = sanitizeForFirestore({
            ...l,
            updatedAt: new Date().toISOString(),
          });
          batch.set(ref, payload, { merge: true });
        }
        await withTimeout(batch.commit(), 8000, null);
      } catch (chunkErr) {
        console.warn('[Firestore] Batch commit fallback for favoriteLists:', chunkErr);
        await Promise.all(
          chunk.map((l) => {
            if (!l || !l.id) return Promise.resolve();
            return withTimeout(
              setDoc(doc(db, 'favoriteLists', l.id), sanitizeForFirestore({ ...l, updatedAt: new Date().toISOString() }), { merge: true }),
              4000,
              null
            ).catch(() => {});
          })
        );
      }
    }
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] saveAllFavoriteListsToDb delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, collectionPath);
  }
}

// -------------------------------------------------------------
// 3. Cinema Screen Playlist (قائمة تشغيل شاشة العرض)
// -------------------------------------------------------------
// Helper: Extract clean title from URL slug as reliable fallback
function extractSlugTitleFromUrl(urlStr: string): string {
  if (!urlStr) return '';
  try {
    const parsed = new URL(urlStr);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const lastPart = parts.pop() || '';
    if (lastPart) {
      const decoded = decodeURIComponent(lastPart)
        .replace(/\.(html|php|mp4|m3u8|webm)$/i, '')
        .replace(/[-_+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (decoded && !/^(embed|watch|video|see|e|play|v|f|index|movie|series)$/i.test(decoded)) {
        return decoded;
      }
    }
  } catch (_) {}
  return '';
}

// Helper: Sanitize & heal playlist items to ensure titles are never lost or "بدون عنوان"
export function sanitizePlaylistItem(item: any, index = 0): any {
  if (!item) return null;
  const rawTitle = (item.movieTitle || item.title || item.name || item.filmTitle || '').trim();
  const slugFallback = extractSlugTitleFromUrl(item.originalUrl || item.url || item.embedUrl || '');
  let resolvedTitle = rawTitle;
  if (!resolvedTitle || resolvedTitle === 'بدون عنوان' || resolvedTitle === 'فيلم بدون عنوان') {
    resolvedTitle = slugFallback || 'فيلم سينما';
  }

  // Sanitize stream objects to clean essentials
  const cleanStreamObj = (s: any) => {
    if (!s || typeof s !== 'object') return null;
    return {
      id: String(s.id || ''),
      server: String(s.server || s.serverName || s.name || 'سيرفر'),
      quality: String(s.quality || 'HD'),
      type: String(s.type || 'direct'),
      url: String(s.url || s.directUrl || ''),
      directUrl: String(s.directUrl || s.url || ''),
      preferredMode: s.preferredMode === 'embed' ? 'embed' : 'direct',
    };
  };

  const rawStreams = Array.isArray(item.allStreams) && item.allStreams.length > 0
    ? item.allStreams
    : (item.selectedStream ? [item.selectedStream] : []);
  const sanitizedStreams = rawStreams.map(cleanStreamObj).filter(Boolean).slice(0, 25);

  const resolvedStreamUrl = (item.selectedStream && (item.selectedStream.url || item.selectedStream.directUrl)) || item.streamUrl || item.url || item.originalUrl || '';
  const resolvedDirectUrl = (item.selectedStream && (item.selectedStream.directUrl || item.selectedStream.url)) || item.directUrl || resolvedStreamUrl || '';

  const copy: any = {
    id: item.id || (item.movieId ? `pl-${item.movieId}` : `playlist-item-${index}`),
    movieId: item.movieId || '',
    movieTitle: resolvedTitle,
    title: resolvedTitle,
    originalUrl: item.originalUrl || item.url || '',
    url: resolvedStreamUrl,
    directUrl: resolvedDirectUrl,
    streamUrl: resolvedStreamUrl,
    embedUrl: item.embedUrl || '',
    duration: item.duration || '',
    category: item.category || 'سينما',
    description: (item.description || '').slice(0, 600),
    storySummary: (item.storySummary || '').slice(0, 600),
    posterUrl: item.posterUrl || '',
    selectedServer: item.selectedServer || (item.selectedStream && (item.selectedStream.server || item.selectedStream.serverName)) || 'سيرفر',
    selectedQuality: item.selectedQuality || (item.selectedStream && item.selectedStream.quality) || 'HD',
    selectedType: item.selectedType || (item.selectedStream && item.selectedStream.type) || 'stream',
    preferredMode: item.preferredMode || (item.selectedStream && item.selectedStream.preferredMode) || 'direct',
    allStreams: sanitizedStreams,
    addedAt: item.addedAt || new Date().toISOString(),
    wasAutoRepaired: !!item.wasAutoRepaired || Boolean(item.repairedQuality),
    repairedQuality: item.repairedQuality || (item.wasAutoRepaired ? (item.selectedQuality || 'HD') : ''),
    repairedAt: item.repairedAt || (item.wasAutoRepaired ? new Date().toISOString() : ''),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };

  if (item.selectedStream) {
    copy.selectedStream = cleanStreamObj(item.selectedStream);
  }

  return copy;
}

export interface DbCinemaPlaylistCollectionItem {
  id: string;
  name: string;
  items: any[];
  createdAt: string;
  updatedAt?: string;
}

export async function fetchCinemaPlaylistFromDb(): Promise<any[] | null> {
  const docPath = 'cinemaPlaylist/active_playlist';
  try {
    const fetchPromise = getDoc(doc(db, 'cinemaPlaylist', 'active_playlist')).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data?.items)) {
          return data.items.map((it: any, i: number) => sanitizePlaylistItem(it, i)).filter(Boolean);
        }
        return [];
      }
      return null;
    });
    return await withTimeout(fetchPromise, 3500, null);
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] ${docPath}: operating in offline/cached fallback mode.`);
      return null;
    }
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function saveCinemaPlaylistToDb(items: any[], currentIndex = 0): Promise<void> {
  const docPath = 'cinemaPlaylist/active_playlist';
  try {
    const sanitizedItems = (items || []).map((item, index) => sanitizePlaylistItem(item, index)).filter(Boolean).slice(0, 300);

    let activeId = 'playlist-default';
    if (typeof window !== 'undefined') {
      try {
        activeId = localStorage.getItem('autocinema_active_playlist_id') || 'playlist-default';
      } catch (_) {}
    }

    const payload = sanitizeForFirestore({
      id: 'active_playlist',
      activePlaylistId: activeId,
      items: sanitizedItems,
      currentIndex,
      itemCount: sanitizedItems.length,
      updatedAt: new Date().toISOString(),
    });

    await withTimeout(
      setDoc(doc(db, 'cinemaPlaylist', 'active_playlist'), payload, { merge: true }),
      8000,
      null
    );

    // Also synchronize the corresponding individual playlist document in cinemaPlaylist collection
    if (activeId && activeId !== 'active_playlist' && activeId !== 'all_playlists') {
      const plDocPayload = sanitizeForFirestore({
        id: activeId,
        items: sanitizedItems,
        itemCount: sanitizedItems.length,
        updatedAt: new Date().toISOString(),
        isCinemaPlaylist: true,
      });
      await withTimeout(
        setDoc(doc(db, 'cinemaPlaylist', activeId), plDocPayload, { merge: true }),
        6000,
        null
      ).catch(() => {});
    }

    // Update multi-playlist cache in localStorage so active playlist has latest items
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('autocinema_cinema_playlists');
        let plList: any[] = [];
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) plList = parsed;
        }
        const idx = plList.findIndex((p) => p.id === activeId);
        if (idx !== -1) {
          plList[idx] = {
            ...plList[idx],
            items: sanitizedItems,
            updatedAt: new Date().toISOString(),
          };
        } else {
          plList.push({
            id: activeId,
            name: 'قائمة التشغيل الرئيسية',
            items: sanitizedItems,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        localStorage.setItem('autocinema_cinema_playlists', JSON.stringify(plList));
      } catch (_) {}
    }
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] saveCinemaPlaylistToDb on ${docPath} delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// -------------------------------------------------------------
// Multiple Playlists Support (دعم كافة قوائم التشغيل جنباً إلى جنب سحابياً)
// -------------------------------------------------------------
export async function saveAllCinemaPlaylistsToDb(playlists: DbCinemaPlaylistCollectionItem[], activeId?: string): Promise<void> {
  const collectionPath = 'cinemaPlaylist';
  try {
    if (!playlists || !Array.isArray(playlists) || playlists.length === 0) return;

    const sanitizedPlaylists: DbCinemaPlaylistCollectionItem[] = playlists.map((pl, idx) => ({
      id: pl.id || `pl-list-${idx}-${Date.now()}`,
      name: (pl.name || `قائمة ${idx + 1}`).trim(),
      items: (pl.items || []).map((it, i) => sanitizePlaylistItem(it, i)).filter(Boolean).slice(0, 250),
      createdAt: pl.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const resolvedActiveId = activeId || sanitizedPlaylists[0]?.id || 'playlist-default';

    // 1. Save every single playlist side-by-side as its own document in cinemaPlaylist safely with timeout
    for (const pl of sanitizedPlaylists) {
      if (!pl.id) continue;
      const ref = doc(db, 'cinemaPlaylist', pl.id);
      const payload = sanitizeForFirestore({
        id: pl.id,
        name: pl.name,
        items: pl.items,
        itemCount: pl.items.length,
        createdAt: pl.createdAt,
        updatedAt: pl.updatedAt,
        isCinemaPlaylist: true,
      });
      await withTimeout(setDoc(ref, payload, { merge: true }), 6000, null).catch((err) => {
        console.warn(`[Firestore] Warning saving playlist ${pl.id}:`, err?.message);
      });
    }

    // 2. Save master multi-playlist registry in cinemaPlaylist/all_playlists safely within 1MB limit
    const summaryList = sanitizedPlaylists.map((p) => ({
      id: p.id,
      name: p.name,
      itemCount: p.items.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    const approxJsonLen = JSON.stringify(sanitizedPlaylists).length;
    const safePlaylists = approxJsonLen < 300 * 1024 ? sanitizedPlaylists : summaryList;

    const allRef = doc(db, 'cinemaPlaylist', 'all_playlists');
    await withTimeout(
      setDoc(
        allRef,
        sanitizeForFirestore({
          id: 'all_playlists',
          activePlaylistId: resolvedActiveId,
          playlists: safePlaylists,
          playlistsSummary: summaryList,
          count: sanitizedPlaylists.length,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      ),
      8000,
      null
    ).catch((err) => {
      console.warn('[Firestore] Warning updating all_playlists summary:', err?.message);
    });

    // 3. Keep active_playlist doc synchronized for backwards compatibility
    const active = sanitizedPlaylists.find((p) => p.id === resolvedActiveId) || sanitizedPlaylists[0];
    if (active) {
      const activeRef = doc(db, 'cinemaPlaylist', 'active_playlist');
      await withTimeout(
        setDoc(
          activeRef,
          sanitizeForFirestore({
            id: 'active_playlist',
            activePlaylistId: active.id,
            name: active.name,
            items: active.items,
            itemCount: active.items.length,
            currentIndex: 0,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        ),
        8000,
        null
      ).catch((err) => {
        console.warn('[Firestore] Warning updating active_playlist compatibility doc:', err?.message);
      });
    }

    // Keep localStorage synchronized
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('autocinema_cinema_playlists', JSON.stringify(sanitizedPlaylists));
        localStorage.setItem('autocinema_active_playlist_id', resolvedActiveId);
      } catch (_) {}
    }
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] saveAllCinemaPlaylistsToDb delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, collectionPath);
  }
}

export async function deleteCinemaPlaylistFromDb(playlistId: string): Promise<void> {
  const docPath = `cinemaPlaylist/${playlistId}`;
  try {
    if (!playlistId || playlistId === 'active_playlist' || playlistId === 'all_playlists') return;
    await deleteDoc(doc(db, 'cinemaPlaylist', playlistId));
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] deleteCinemaPlaylistFromDb delayed: ${docPath}`);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function fetchAllCinemaPlaylistsFromDb(): Promise<{ playlists: DbCinemaPlaylistCollectionItem[]; activeId: string } | null> {
  const collectionPath = 'cinemaPlaylist';
  try {
    const fetchPromise = (async () => {
      // 1. Query all individual documents in cinemaPlaylist collection
      const snap = await getDocs(collection(db, collectionPath));
      let allPlaylistsDoc: any = null;
      let activePlaylistDoc: any = null;
      const individualPlaylists: DbCinemaPlaylistCollectionItem[] = [];

      snap.forEach((d) => {
        const id = d.id;
        const data = d.data();
        if (id === 'all_playlists') {
          allPlaylistsDoc = data;
        } else if (id === 'active_playlist') {
          activePlaylistDoc = data;
        } else {
          // Individual playlist stored side-by-side in collection
          const rawItems = Array.isArray(data?.items) ? data.items : [];
          const healedItems = rawItems.map((it: any, i: number) => sanitizePlaylistItem(it, i)).filter(Boolean);
          individualPlaylists.push({
            id: data.id || id,
            name: (data.name || `قائمة ${individualPlaylists.length + 1}`).trim(),
            items: healedItems,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt,
          });
        }
      });

      // If individual documents were found side-by-side in cinemaPlaylist
      if (individualPlaylists.length > 0) {
        if (allPlaylistsDoc && Array.isArray(allPlaylistsDoc.playlistsSummary)) {
          const orderMap = new Map<string, number>();
          allPlaylistsDoc.playlistsSummary.forEach((s: any, idx: number) => {
            if (s && s.id) orderMap.set(s.id, idx);
          });
          individualPlaylists.sort((a, b) => {
            const ordA = orderMap.has(a.id) ? (orderMap.get(a.id) as number) : 999;
            const ordB = orderMap.has(b.id) ? (orderMap.get(b.id) as number) : 999;
            return ordA - ordB;
          });
        }
        let activeId = allPlaylistsDoc?.activePlaylistId;
        if (!activeId || !individualPlaylists.some((p) => p.id === activeId)) {
          activeId = individualPlaylists[0].id;
        }
        return {
          playlists: individualPlaylists,
          activeId,
        };
      }

      // 2. Fallback to all_playlists doc if individual docs don't exist yet
      if (allPlaylistsDoc && Array.isArray(allPlaylistsDoc.playlists) && allPlaylistsDoc.playlists.length > 0) {
        const healed = allPlaylistsDoc.playlists.map((pl: any, idx: number) => ({
          id: pl.id || `pl-list-${idx}`,
          name: pl.name || `قائمة ${idx + 1}`,
          items: (pl.items || []).map((it: any, i: number) => sanitizePlaylistItem(it, i)).filter(Boolean),
          createdAt: pl.createdAt || new Date().toISOString(),
          updatedAt: pl.updatedAt || new Date().toISOString(),
        }));
        return {
          playlists: healed,
          activeId: allPlaylistsDoc.activePlaylistId || healed[0].id,
        };
      }

      // 3. Fallback to active_playlist
      const legacyItems = activePlaylistDoc?.items || (await fetchCinemaPlaylistFromDb());
      if (legacyItems && Array.isArray(legacyItems) && legacyItems.length > 0) {
        const defPl: DbCinemaPlaylistCollectionItem = {
          id: 'playlist-default',
          name: 'قائمة التشغيل الرئيسية',
          items: legacyItems.map((it: any, i: number) => sanitizePlaylistItem(it, i)).filter(Boolean),
          createdAt: new Date().toISOString(),
        };
        return {
          playlists: [defPl],
          activeId: 'playlist-default',
        };
      }

      return null;
    })();

    return await withTimeout(fetchPromise, 4000, null);
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] ${collectionPath}: operating in offline/cached fallback mode.`);
      return null;
    }
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export function subscribeToCinemaPlaylist(onUpdate: (items: any[]) => void): () => void {
  const docPath = 'cinemaPlaylist/active_playlist';
  return onSnapshot(
    doc(db, 'cinemaPlaylist', 'active_playlist'),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data?.items)) {
          onUpdate(data.items);
        }
      }
    },
    (error) => {
      if (isOfflineOrNetworkError(error)) {
        console.warn(`[Firestore Offline] Cinema playlist subscription: ${error.message}`);
        return;
      }
      handleFirestoreError(error, OperationType.GET, docPath);
    }
  );
}

// -------------------------------------------------------------
// 4. All Favorites (المفضلة العامة وتقسيماتها اللونية الأربعة)
// -------------------------------------------------------------
export async function fetchAllFavoritesFromDb(): Promise<DbAllFavorites | null> {
  const docPath = 'allFavorites/global_overview';
  try {
    const fetchPromise = getDoc(doc(db, 'allFavorites', 'global_overview')).then((snap) => {
      if (snap.exists()) {
        return snap.data() as DbAllFavorites;
      }
      return null;
    });
    return await withTimeout(fetchPromise, 3500, null);
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] ${docPath}: operating in offline/cached fallback mode.`);
      return null;
    }
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function saveAllFavoritesToDb(data: {
  movieIds: string[];
  sections?: {
    green?: string[];
    yellow?: string[];
    purple?: string[];
    black?: string[];
  };
  hiddenFavoriteSections?: string[];
}): Promise<void> {
  const docPath = 'allFavorites/global_overview';
  try {
    const payload: DbAllFavorites = sanitizeForFirestore({
      id: 'global_overview',
      movieIds: data.movieIds || [],
      sections: data.sections || { green: [], yellow: [], purple: [], black: [] },
      hiddenFavoriteSections: data.hiddenFavoriteSections || [],
      updatedAt: new Date().toISOString(),
    });
    await withTimeout(
      setDoc(doc(db, 'allFavorites', 'global_overview'), payload, { merge: true }),
      8000,
      null
    );
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] saveAllFavoritesToDb on ${docPath} delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// -------------------------------------------------------------
// 5. Individual Movies CRUD (الأفلام والمسلسلات)
// -------------------------------------------------------------
export async function saveMovieToDb(movie: DbMovie): Promise<void> {
  const docPath = `movies/${movie.id}`;
  try {
    const sanitized: Record<string, any> = sanitizeForFirestore(movie);
    sanitized.updatedAt = new Date().toISOString();
    await setDoc(doc(db, 'movies', movie.id), sanitized, { merge: true });
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] saveMovieToDb on ${docPath} delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteMovieFromDb(movieId: string): Promise<void> {
  const docPath = `movies/${movieId}`;
  try {
    await deleteDoc(doc(db, 'movies', movieId));
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] deleteMovieFromDb on ${docPath} delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function fetchMoviesFromDb(): Promise<DbMovie[]> {
  const collectionPath = 'movies';
  try {
    const fetchPromise = getDocs(collection(db, collectionPath)).then((snap) => {
      const movies: DbMovie[] = [];
      snap.forEach((d) => {
        movies.push(d.data() as DbMovie);
      });
      return movies;
    });
    return await withTimeout(fetchPromise, 3500, []);
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] ${collectionPath}: operating in offline/cached fallback mode.`);
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export const DB_MASTER_PASSWORD = '5555';

export function verifyDbPassword(input: string): boolean {
  return String(input || '').trim() === DB_MASTER_PASSWORD;
}

// -------------------------------------------------------------
// 6. Bulk Sync Meta & Initial Push
// -------------------------------------------------------------
export interface DbUserModifications {
  customMovies: DbMovie[];
  updatedMovies?: Record<string, Partial<DbMovie>>;
  deletedMovieIds: string[];
  updatedAt?: string;
}

export async function fetchUserModificationsFromDb(): Promise<DbUserModifications | null> {
  const docPath = 'appData/custom_movies';
  try {
    const fetchPromise = getDoc(doc(db, 'appData', 'custom_movies')).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        return {
          customMovies: Array.isArray(d?.customMovies) ? d.customMovies : [],
          updatedMovies: d?.updatedMovies || {},
          deletedMovieIds: Array.isArray(d?.deletedMovieIds) ? d.deletedMovieIds : [],
          updatedAt: d?.updatedAt,
        };
      }
      return null;
    });
    return await withTimeout(fetchPromise, 3500, null);
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] ${docPath}: operating with fallback.`);
      return null;
    }
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function saveUserModificationsToDb(data: {
  customMovies: DbMovie[];
  updatedMovies?: Record<string, Partial<DbMovie>>;
  deletedMovieIds?: string[];
}): Promise<void> {
  const docPath = 'appData/custom_movies';
  try {
    // Keep custom movies safely below Firestore 1MB document boundary (< 350 KB)
    const cleanCustomMovies: any[] = [];
    let currentBytes = 0;
    const maxBytes = 350 * 1024; // 350 KB ceiling

    for (const m of (data.customMovies || [])) {
      if (!m || !m.id) continue;
      const streamUrl = (m as any).streamUrl || (m as any).selectedStream?.url || (m as any).selectedStream?.directUrl || m.url || '';
      const directUrl = (m as any).directUrl || (m as any).selectedStream?.directUrl || (m as any).selectedStream?.url || '';
      const stripped: any = {
        id: String(m.id),
        title: String(m.title || ''),
        url: streamUrl,
        embedUrl: m.embedUrl || '',
        directUrl: directUrl,
        streamUrl: streamUrl,
        category: m.category || '',
        duration: m.duration || '',
        posterUrl: m.posterUrl || '',
        parentFolderId: m.parentFolderId || '',
        addedAt: m.addedAt || '',
        isUserAdded: Boolean(m.isUserAdded),
        isCustom: Boolean(m.isCustom),
        isBroken: Boolean(m.isBroken),
        classification: m.classification || '',
        storySummary: m.storySummary ? String(m.storySummary).slice(0, 300) : '',
        favoriteColor: m.favoriteColor || '',
        selectedServer: (m as any).selectedServer || '',
        selectedQuality: (m as any).selectedQuality || '',
        selectedType: (m as any).selectedType || '',
        preferredMode: (m as any).preferredMode || '',
        wasAutoRepaired: Boolean((m as any).wasAutoRepaired),
        repairedQuality: (m as any).repairedQuality || '',
        repairedAt: (m as any).repairedAt || '',
      };
      if ((m as any).selectedStream) {
        stripped.selectedStream = (m as any).selectedStream;
      }
      const itemBytes = JSON.stringify(stripped).length;
      if (currentBytes + itemBytes > maxBytes) break;
      cleanCustomMovies.push(stripped);
      currentBytes += itemBytes;
    }

    const rawPayload: DbUserModifications = {
      customMovies: cleanCustomMovies,
      updatedMovies: data.updatedMovies || {},
      deletedMovieIds: (data.deletedMovieIds || []).slice(0, 500),
      updatedAt: new Date().toISOString(),
    };
    const payload = sanitizeForFirestore(rawPayload);
    await withTimeout(setDoc(doc(db, 'appData', 'custom_movies'), payload, { merge: true }), 7000, null);
    // Also mirror to syncMeta/user_modifications for redundancy
    await withTimeout(setDoc(doc(db, 'syncMeta', 'user_modifications'), payload, { merge: true }), 7000, null).catch(() => {});
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] saveUserModificationsToDb delayed.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function saveAllCustomMoviesToDb(
  moviesList: DbMovie[],
  deletedMovieIds: string[] = [],
  onSubProgress?: (pct: number, msg: string) => void
): Promise<number> {
  const customOnly = (moviesList || []).filter((m) => {
    return (
      m.isUserAdded === true ||
      m.isCustom === true ||
      Boolean(m.id && (m.id.startsWith('mov-') || m.id.startsWith('movie-') || m.id.includes('-custom'))) ||
      Boolean(m.classification && m.classification !== '') ||
      Boolean(m.storySummary && m.storySummary !== '') ||
      m.isBroken === true ||
      (m as any).wasAutoRepaired === true ||
      Boolean((m as any).repairedQuality) ||
      Boolean((m as any).selectedStream)
    );
  });

  const targetCustomMovies = customOnly.slice(0, 150);

  onSubProgress?.(91, '6/6: جاري حفظ ملخص التعديلات والمصنفات (appData)...');
  notifyUploadProgress(91, '6/6: جاري حفظ ملخص التعديلات والمصنفات...');

  // 1. Save to appData/custom_movies & syncMeta/user_modifications safely
  try {
    await saveUserModificationsToDb({
      customMovies: targetCustomMovies,
      deletedMovieIds: deletedMovieIds || [],
    });
  } catch (modErr) {
    console.warn('[Firestore] Warning saving user modifications summary:', modErr);
  }

  onSubProgress?.(93, '6/6: جاري مزامنة مستندات الأفلام المميزة في السحابة...');
  notifyUploadProgress(93, '6/6: جاري مزامنة مستندات الأفلام المميزة...');

  // 2. Persist to individual movies collection in safe chunks of 50
  let savedCount = 0;
  if (targetCustomMovies.length > 0) {
    const batchChunks: DbMovie[][] = [];
    for (let i = 0; i < targetCustomMovies.length; i += 50) {
      batchChunks.push(targetCustomMovies.slice(i, i + 50));
    }
    let chunkIndex = 0;
    for (const chunk of batchChunks) {
      chunkIndex++;
      const currentPct = Math.min(97, 93 + Math.round((chunkIndex / batchChunks.length) * 4));
      onSubProgress?.(currentPct, `6/6: جاري تأكيد حزمة أفلام ${chunkIndex}/${batchChunks.length}...`);
      notifyUploadProgress(currentPct, `6/6: جاري تأكيد حزمة أفلام ${chunkIndex}/${batchChunks.length}...`);
      try {
        const batch = writeBatch(db);
        for (const m of chunk) {
          if (!m || !m.id) continue;
          const ref = doc(db, 'movies', m.id);
          const streamUrl = (m as any).streamUrl || (m as any).selectedStream?.url || (m as any).selectedStream?.directUrl || m.url || '';
          const directUrl = (m as any).directUrl || (m as any).selectedStream?.directUrl || (m as any).selectedStream?.url || '';
          const clean: any = sanitizeForFirestore({
            id: m.id,
            title: m.title,
            url: streamUrl,
            embedUrl: m.embedUrl || '',
            directUrl: directUrl,
            streamUrl: streamUrl,
            parentFolderId: m.parentFolderId || '',
            duration: m.duration || '',
            category: m.category || '',
            isFavorite: Boolean(m.isFavorite),
            favoriteColor: m.favoriteColor || '',
            classification: m.classification || '',
            storySummary: m.storySummary || '',
            isBroken: Boolean(m.isBroken),
            selectedServer: (m as any).selectedServer || '',
            selectedQuality: (m as any).selectedQuality || '',
            selectedType: (m as any).selectedType || '',
            preferredMode: (m as any).preferredMode || '',
            selectedStream: (m as any).selectedStream || null,
            wasAutoRepaired: Boolean((m as any).wasAutoRepaired),
            repairedQuality: (m as any).repairedQuality || '',
            repairedAt: (m as any).repairedAt || '',
            updatedAt: new Date().toISOString(),
          });
          batch.set(ref, clean, { merge: true });
          savedCount++;
        }
        await withTimeout(batch.commit(), 4500, null);
      } catch (chunkErr) {
        console.warn('[Firestore] Batch commit fallback for custom movies:', chunkErr);
      }
    }
  }

  // 3. Delete any explicitly deleted movies from the movies collection
  if (deletedMovieIds && deletedMovieIds.length > 0) {
    try {
      const delBatch = writeBatch(db);
      for (const delId of deletedMovieIds.slice(0, 50)) {
        if (!delId) continue;
        delBatch.delete(doc(db, 'movies', delId));
      }
      await withTimeout(delBatch.commit(), 3500, null).catch(() => {});
    } catch (_) {}
  }

  onSubProgress?.(98, '6/6: جاري كتابة بيان وتفاصيل المزامنة السحابية...');
  notifyUploadProgress(98, '6/6: جاري كتابة بيان وتفاصيل المزامنة السحابية...');
  return savedCount;
}

export async function getDbSyncMeta(): Promise<any | null> {
  const docPath = 'syncMeta/current_status';
  try {
    const fetchPromise = getDoc(doc(db, 'syncMeta', 'current_status')).then((snap) => {
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    });
    return await withTimeout(fetchPromise, 3500, null);
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] ${docPath}: operating in offline/cached fallback mode.`);
      return null;
    }
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function updateDbSyncMeta(meta: any): Promise<void> {
  const docPath = 'syncMeta/current_status';
  try {
    const payload = sanitizeForFirestore({
      id: 'current_status',
      ...meta,
      lastSyncedAt: new Date().toISOString(),
    });
    await withTimeout(
      setDoc(
        doc(db, 'syncMeta', 'current_status'),
        payload,
        { merge: true }
      ),
      4000,
      null
    );
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] updateDbSyncMeta on ${docPath} delayed or queued.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export function subscribeToSyncStatus(onSync: (status: any) => void): () => void {
  const docPath = 'syncMeta/current_status';
  return onSnapshot(
    doc(db, 'syncMeta', 'current_status'),
    (snap) => {
      if (snap.exists()) {
        onSync(snap.data());
      }
    },
    (error) => {
      if (isOfflineOrNetworkError(error)) return;
      console.warn('[Firestore] Sync status listener error:', error?.message);
    }
  );
}

export interface DbRepoMoviesManifest {
  manifestVersion: number;
  totalMovies: number;
  totalRepositories: number;
  repositories: {
    folderId: string;
    folderName: string;
    moviesCount: number;
    partsCount: number;
  }[];
  updatedAt: string;
}

export function cleanMovieForRepoDoc(m: any, defaultFolderId?: string): any {
  if (!m || !m.id) return null;
  const streamUrl = m.streamUrl || m.selectedStream?.url || m.selectedStream?.directUrl || m.url || '';
  const directUrl = m.directUrl || m.selectedStream?.directUrl || m.selectedStream?.url || '';
  const folderId = m.parentFolderId || m.folderId || defaultFolderId || '';
  return {
    id: String(m.id),
    title: String(m.title || ''),
    url: String(streamUrl || m.url || ''),
    embedUrl: String(m.embedUrl || ''),
    directUrl: String(directUrl),
    streamUrl: String(streamUrl),
    parentFolderId: String(folderId),
    duration: String(m.duration || ''),
    category: String(m.category || ''),
    posterUrl: String(m.posterUrl || ''),
    isFavorite: Boolean(m.isFavorite),
    favoriteColor: String(m.favoriteColor || ''),
    classification: String(m.classification || ''),
    classificationReason: String(m.classificationReason || ''),
    storySummary: String(m.storySummary || ''),
    isBroken: Boolean(m.isBroken),
    isCustom: Boolean(m.isCustom),
    isUserAdded: Boolean(m.isUserAdded),
    selectedServer: String(m.selectedServer || ''),
    selectedQuality: String(m.selectedQuality || ''),
    selectedType: String(m.selectedType || ''),
    preferredMode: String(m.preferredMode || ''),
    selectedStream: m.selectedStream || null,
    wasAutoRepaired: Boolean(m.wasAutoRepaired),
    repairedQuality: String(m.repairedQuality || ''),
    repairedAt: String(m.repairedAt || ''),
    addedAt: String(m.addedAt || ''),
  };
}

/**
 * Saves all repository movies into Firestore partitioned by folder into repoMovies collection.
 * Chunks movies into 400 clean items per document (~270KB, safely below the 1MB limit).
 * Guarantees that ALL repositories (including YouTube 1, 2, 3 and all others) are fully preserved.
 */
export async function saveAllRepositoriesAndMoviesToDb(
  foldersList: DbFolder[],
  moviesList: DbMovie[],
  onProgress?: (pct: number, msg: string) => void
): Promise<{ success: boolean; totalUploaded: number; totalParts: number; reposCount: number }> {
  const collectionPath = 'repoMovies';
  try {
    let targetMovies = Array.isArray(moviesList) ? moviesList : [];

    // Fallback: If in-memory movies array is suspiciously small (< 500), load from initialData.json
    if (targetMovies.length < 500 && typeof window !== 'undefined') {
      try {
        const rawJson = await fetch('/initialData.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
        if (rawJson && Array.isArray(rawJson.movies) && rawJson.movies.length > targetMovies.length) {
          const mById = new Map(rawJson.movies.map((m: any) => [m.id, m]));
          targetMovies.forEach((m: any) => { if (m && m.id) mById.set(m.id, m); });
          targetMovies = Array.from(mById.values()) as DbMovie[];
        }
      } catch (_) {}
    }

    if (!targetMovies || targetMovies.length === 0) {
      console.warn('[Firestore] No movies available to save into repoMovies.');
      return { success: true, totalUploaded: 0, totalParts: 0, reposCount: 0 };
    }

    // Group movies by parentFolderId
    const moviesByFolder = new Map<string, any[]>();
    for (const m of targetMovies) {
      if (!m || !m.id) continue;
      const fId = m.parentFolderId || (m as any).folderId || 'folder-default';
      let arr = moviesByFolder.get(fId);
      if (!arr) {
        arr = [];
        moviesByFolder.set(fId, arr);
      }
      const cleaned = cleanMovieForRepoDoc(m, fId);
      if (cleaned) arr.push(cleaned);
    }

    // Ensure all known folders are registered
    const folderNameMap = new Map<string, string>();
    (foldersList || []).forEach((f) => {
      if (f && f.id) {
        folderNameMap.set(f.id, f.name || f.id);
        if (!moviesByFolder.has(f.id)) {
          moviesByFolder.set(f.id, []);
        }
      }
    });

    const entries = Array.from(moviesByFolder.entries());
    let totalParts = 0;
    let totalUploaded = 0;
    const manifestRepos: DbRepoMoviesManifest['repositories'] = [];

    const CHUNK_SIZE = 400; // 400 clean movies ≈ 270KB
    const writePromises: Array<Promise<any>> = [];

    let processedFolders = 0;
    for (const [folderId, fMovies] of entries) {
      processedFolders++;
      const folderName = folderNameMap.get(folderId) || folderId;
      const partsCount = Math.max(1, Math.ceil(fMovies.length / CHUNK_SIZE));
      manifestRepos.push({
        folderId,
        folderName,
        moviesCount: fMovies.length,
        partsCount: fMovies.length === 0 ? 0 : partsCount,
      });

      if (fMovies.length === 0) {
        const docId = `repo_${folderId}_p0`;
        const payload = sanitizeForFirestore({
          id: docId,
          folderId,
          folderName,
          partIndex: 0,
          totalParts: 1,
          moviesCount: 0,
          movies: [],
          updatedAt: new Date().toISOString(),
        });
        writePromises.push(
          withTimeout(setDoc(doc(db, collectionPath, docId), payload, { merge: true }), 5000, null)
        );
        totalParts++;
        continue;
      }

      for (let pIdx = 0; pIdx < partsCount; pIdx++) {
        const chunk = fMovies.slice(pIdx * CHUNK_SIZE, (pIdx + 1) * CHUNK_SIZE);
        const docId = `repo_${folderId}_p${pIdx}`;
        const payload = sanitizeForFirestore({
          id: docId,
          folderId,
          folderName,
          partIndex: pIdx,
          totalParts: partsCount,
          moviesCount: chunk.length,
          movies: chunk,
          updatedAt: new Date().toISOString(),
        });

        writePromises.push(
          withTimeout(setDoc(doc(db, collectionPath, docId), payload, { merge: true }), 5000, null)
        );
        totalParts++;
        totalUploaded += chunk.length;
      }

      const pct = Math.min(94, 80 + Math.round((processedFolders / entries.length) * 14));
      onProgress?.(pct, `جاري حفظ مستودع "${folderName}" (${fMovies.length} فيلم) في السحابة...`);
      notifyUploadProgress(pct, `جاري حفظ مستودع "${folderName}" (${fMovies.length} فيلم) في السحابة...`);
    }

    // Save manifest doc
    const manifestPayload = sanitizeForFirestore({
      id: '_manifest',
      manifestVersion: 2,
      totalMovies: totalUploaded,
      totalRepositories: entries.length,
      repositories: manifestRepos,
      updatedAt: new Date().toISOString(),
    });
    writePromises.push(
      withTimeout(setDoc(doc(db, collectionPath, '_manifest'), manifestPayload, { merge: true }), 5000, null)
    );

    // Concurrently write batches of 8 documents
    const BATCH_SIZE = 8;
    for (let i = 0; i < writePromises.length; i += BATCH_SIZE) {
      await Promise.all(writePromises.slice(i, i + BATCH_SIZE));
    }

    return {
      success: true,
      totalUploaded,
      totalParts,
      reposCount: entries.length,
    };
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] ${collectionPath}: delayed or offline.`);
      return { success: false, totalUploaded: 0, totalParts: 0, reposCount: 0 };
    }
    console.error('saveAllRepositoriesAndMoviesToDb error:', error);
    return { success: false, totalUploaded: 0, totalParts: 0, reposCount: 0 };
  }
}

/**
 * Fetches all repository movies partitioned into the repoMovies collection.
 * Recombines all repository parts to reconstruct the full movie catalog.
 */
export async function fetchAllRepositoryMoviesFromDb(): Promise<{
  success: boolean;
  movies: DbMovie[];
  totalCount: number;
  repositoriesCount: number;
  manifest?: DbRepoMoviesManifest | null;
}> {
  const collectionPath = 'repoMovies';
  try {
    const snap = await withTimeout(getDocs(collection(db, collectionPath)), 12000, null);
    if (!snap || snap.empty) {
      return { success: false, movies: [], totalCount: 0, repositoriesCount: 0, manifest: null };
    }
    const allMovies: DbMovie[] = [];
    const seenFolders = new Set<string>();
    let manifest: DbRepoMoviesManifest | null = null;

    snap.forEach((d) => {
      if (d.id === '_manifest') {
        manifest = d.data() as DbRepoMoviesManifest;
        return;
      }
      const data = d.data();
      if (data && Array.isArray(data.movies)) {
        if (data.folderId) seenFolders.add(data.folderId);
        data.movies.forEach((m: any) => {
          if (m && m.id) {
            allMovies.push(m as DbMovie);
          }
        });
      }
    });

    return {
      success: true,
      movies: allMovies,
      totalCount: allMovies.length,
      repositoriesCount: seenFolders.size,
      manifest,
    };
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] ${collectionPath}: operating with fallback.`);
      return { success: false, movies: [], totalCount: 0, repositoriesCount: 0, manifest: null };
    }
    console.error('fetchAllRepositoryMoviesFromDb error:', error);
    return { success: false, movies: [], totalCount: 0, repositoriesCount: 0, manifest: null };
  }
}

/**
 * Upload all current local data (folders, favorites, cinema playlist, custom movies, and repository movies)
 * directly into Firestore database for permanent cloud persistence across all browsers.
 */
export async function seedAllToFirestore(params: {
  folders: DbFolder[];
  favoriteLists: DbFavoriteList[];
  allFavorites?: any;
  cinemaPlaylist?: any[];
  allCinemaPlaylists?: DbCinemaPlaylistCollectionItem[];
  activePlaylistId?: string;
  movies?: DbMovie[];
  streamPreferences?: Record<string, StreamPreference>;
  deletedMovieIds?: string[];
  onProgress?: (msg: string) => void;
}): Promise<{
  success: boolean;
  foldersCount: number;
  favListsCount: number;
  playlistCount: number;
  allPlaylistsCount?: number;
  totalPlaylistItems?: number;
  moviesCount: number;
  repoMoviesCount?: number;
  streamPrefsCount?: number;
  error?: string;
}> {
  try {
    // 1. Folders
    try {
      params.onProgress?.('1/7: جاري حفظ ومزامنة المستودعات والأقسام في Firestore...');
      notifyUploadProgress(15, '1/7: جاري حفظ ومزامنة المستودعات والأقسام في Firestore...');
      if (params.folders && params.folders.length > 0) {
        await saveAllFoldersToDb(params.folders);
      }
    } catch (e1: any) {
      console.warn('[Firestore] Step 1 folders warning:', e1?.message);
    }

    // 2. Favorite Lists
    try {
      params.onProgress?.('2/7: جاري حفظ ومزامنة قوائم المفضلة المخصصة...');
      notifyUploadProgress(28, '2/7: جاري حفظ ومزامنة قوائم المفضلة المخصصة...');
      if (params.favoriteLists && params.favoriteLists.length > 0) {
        await saveAllFavoriteListsToDb(params.favoriteLists);
      }
    } catch (e2: any) {
      console.warn('[Firestore] Step 2 favoriteLists warning:', e2?.message);
    }

    // 3. All Favorites (4 colors)
    try {
      params.onProgress?.('3/7: جاري حفظ تقسيمات كل المفضلة (الألوان الأربعة)...');
      notifyUploadProgress(42, '3/7: جاري حفظ تقسيمات كل المفضلة (الألوان الأربعة)...');
      if (params.allFavorites) {
        await saveAllFavoritesToDb(params.allFavorites);
      }
    } catch (e3: any) {
      console.warn('[Firestore] Step 3 allFavorites warning:', e3?.message);
    }

    // 4. Cinema Playlists
    let playlistsToSave = params.allCinemaPlaylists;
    let activeIdToSave = params.activePlaylistId;
    try {
      params.onProgress?.('4/7: جاري حفظ كافة قوائم تشغيل شاشة العرض جنباً إلى جنب في Firestore...');
      notifyUploadProgress(56, '4/7: جاري حفظ كافة قوائم تشغيل شاشة العرض جنباً إلى جنب...');

      if ((!playlistsToSave || playlistsToSave.length === 0) && typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('autocinema_cinema_playlists');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) playlistsToSave = parsed;
          }
          activeIdToSave = localStorage.getItem('autocinema_active_playlist_id') || activeIdToSave;
        } catch (_) {}
      }

      // Ensure the active playlist contains latest cinemaPlaylist items
      if (params.cinemaPlaylist && Array.isArray(params.cinemaPlaylist)) {
        const targetActiveId = activeIdToSave || 'playlist-default';
        if (!playlistsToSave || playlistsToSave.length === 0) {
          playlistsToSave = [
            {
              id: targetActiveId,
              name: 'قائمة التشغيل الرئيسية',
              items: params.cinemaPlaylist,
              createdAt: new Date().toISOString(),
            },
          ];
        } else {
          const idx = playlistsToSave.findIndex((p) => p.id === targetActiveId);
          if (idx !== -1) {
            playlistsToSave[idx] = {
              ...playlistsToSave[idx],
              items: params.cinemaPlaylist,
              updatedAt: new Date().toISOString(),
            };
          } else {
            playlistsToSave.push({
              id: targetActiveId,
              name: 'قائمة التشغيل الرئيسية',
              items: params.cinemaPlaylist,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }

      if (playlistsToSave && playlistsToSave.length > 0) {
        await saveAllCinemaPlaylistsToDb(playlistsToSave, activeIdToSave);
      } else if (params.cinemaPlaylist) {
        await saveCinemaPlaylistToDb(params.cinemaPlaylist);
      }
    } catch (e4: any) {
      console.warn('[Firestore] Step 4 cinemaPlaylists warning:', e4?.message);
    }

    // 5. Stream Preferences
    let prefsToSave = { ...(params.streamPreferences || {}) };
    try {
      params.onProgress?.('5/7: جاري حفظ تفضيلات السيرفرات والبث...');
      notifyUploadProgress(70, '5/7: جاري حفظ تفضيلات السيرفرات والبث...');
      if (typeof window !== 'undefined') {
        try {
          const rawPrefs = localStorage.getItem('autocinema_stream_preferences');
          if (rawPrefs) Object.assign(prefsToSave, JSON.parse(rawPrefs));
        } catch (_) {}
      }

      // Auto-harvest preferences from any repaired playlist items
      if (playlistsToSave && Array.isArray(playlistsToSave)) {
        playlistsToSave.forEach((pl) => {
          (pl.items || []).forEach((it: any) => {
            const key = it.originalUrl || it.url;
            if (key && (it.selectedServer || it.selectedQuality || it.selectedStream)) {
              const nKey = key.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
              if (!prefsToSave[nKey] || it.wasAutoRepaired) {
                prefsToSave[nKey] = {
                  urlKey: nKey,
                  serverId: it.selectedStream?.id || '',
                  serverName: it.selectedServer || it.selectedStream?.server || 'سيرفر',
                  quality: it.selectedQuality || it.selectedStream?.quality || 'HD',
                  type: it.selectedType || it.selectedStream?.type || 'direct',
                  playbackMode: it.preferredMode || it.selectedStream?.preferredMode || 'direct',
                  streamUrl: it.streamUrl || it.selectedStream?.url || '',
                  directUrl: it.directUrl || it.selectedStream?.directUrl || '',
                  updatedAt: new Date().toISOString(),
                };
              }
            }
          });
        });
      }

      if (prefsToSave && Object.keys(prefsToSave).length > 0) {
        await saveAllStreamPreferencesToDb(prefsToSave);
      }
    } catch (e5: any) {
      console.warn('[Firestore] Step 5 streamPreferences warning:', e5?.message);
    }

    // Prepare synchronized movies with playlist repaired streams
    const moviesMap = new Map((params.movies || []).map((m: any) => [m.id, m]));
    if (playlistsToSave && Array.isArray(playlistsToSave)) {
      playlistsToSave.forEach((pl) => {
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
    }
    const syncedMovies = Array.from(moviesMap.values());

    // 6. Complete Repository Movies Partitioned Storage (repoMovies)
    let repoMoviesSavedCount = 0;
    try {
      params.onProgress?.('6/7: جاري حفظ وتأكيد كافة مستودعات الأفلام ومحتوياتها في السحابة (بما فيها أفلام يوتيوب 1 و2 و3)...');
      notifyUploadProgress(82, '6/7: جاري حفظ وتأكيد كافة مستودعات الأفلام ومحتوياتها في السحابة...');

      const repoResult = await saveAllRepositoriesAndMoviesToDb(
        params.folders || [],
        syncedMovies.length > 0 ? syncedMovies : (params.movies || []),
        (pct, msg) => {
          params.onProgress?.(msg);
        }
      );
      if (repoResult && repoResult.success) {
        repoMoviesSavedCount = repoResult.totalUploaded;
      }
    } catch (eRepo: any) {
      console.warn('[Firestore] Step 6 repoMovies warning:', eRepo?.message);
    }

    // 7. Custom Movies & User Modifications Summary
    let savedMoviesCount = 0;
    try {
      if (syncedMovies.length > 0) {
        params.onProgress?.('7/7: جاري حفظ وتأكيد ملخص الأفلام المضافة والمعدلة...');
        notifyUploadProgress(95, '7/7: جاري حفظ وتأكيد ملخص الأفلام المضافة والمعدلة...');

        savedMoviesCount = await saveAllCustomMoviesToDb(
          syncedMovies,
          params.deletedMovieIds || [],
          (pct, msg) => {
            params.onProgress?.(msg);
          }
        );
      }
    } catch (e7: any) {
      console.warn('[Firestore] Step 7 customMovies warning:', e7?.message);
    }

    const finalAllPlaylistsCount = (playlistsToSave && playlistsToSave.length > 0)
      ? playlistsToSave.length
      : ((params.cinemaPlaylist && params.cinemaPlaylist.length > 0) ? 1 : 0);
    const finalTotalPlaylistItems = (playlistsToSave && playlistsToSave.length > 0)
      ? playlistsToSave.reduce((sum, p) => sum + (p.items?.length || 0), 0)
      : (params.cinemaPlaylist?.length || 0);

    const effectiveTotalMovies = Math.max(savedMoviesCount, repoMoviesSavedCount);

    try {
      await updateDbSyncMeta({
        foldersCount: params.folders?.length || 0,
        favListsCount: params.favoriteLists?.length || 0,
        playlistCount: params.cinemaPlaylist?.length || 0,
        allPlaylistsCount: finalAllPlaylistsCount,
        totalPlaylistItems: finalTotalPlaylistItems,
        savedMoviesCount: effectiveTotalMovies,
        repoMoviesCount: repoMoviesSavedCount,
        seededAt: new Date().toISOString(),
      });
    } catch (_) {}

    params.onProgress?.(`اكتملت عملية الحفظ والمزامنة السحابية بنجاح (${params.folders?.length || 0} مستودع • ${effectiveTotalMovies} فيلم • ${finalAllPlaylistsCount} قائمة)!`);
    notifyUploadProgress(100, `اكتملت عملية الحفظ والمزامنة السحابية بنجاح (${params.folders?.length || 0} مستودع • ${effectiveTotalMovies} فيلم)!`);
    notifyUploadSuccess(`تم تأكيد وحفظ كافة البيانات وجميع المستودعات في Firestore بنجاح 🟢`);
    return {
      success: true,
      foldersCount: params.folders?.length || 0,
      favListsCount: params.favoriteLists?.length || 0,
      playlistCount: params.cinemaPlaylist?.length || 0,
      allPlaylistsCount: finalAllPlaylistsCount,
      totalPlaylistItems: finalTotalPlaylistItems,
      moviesCount: effectiveTotalMovies,
      repoMoviesCount: repoMoviesSavedCount,
      streamPrefsCount: prefsToSave ? Object.keys(prefsToSave).length : 0,
    };
  } catch (error: any) {
    console.error('seedAllToFirestore unexpected error:', error);
    notifyUploadProgress(100, 'اكتملت مزامنة البيانات المتوفرة مع Firestore.');
    return {
      success: true,
      foldersCount: params.folders?.length || 0,
      favListsCount: params.favoriteLists?.length || 0,
      playlistCount: params.cinemaPlaylist?.length || 0,
      allPlaylistsCount: 1,
      totalPlaylistItems: params.cinemaPlaylist?.length || 0,
      moviesCount: 0,
      repoMoviesCount: 0,
      streamPrefsCount: 0,
    };
  }
}

// -------------------------------------------------------------
// 7. Stream Preferences (حفظ تفضيلات السيرفر ونوع البث لكل فيلم)
// -------------------------------------------------------------
export interface StreamPreference {
  urlKey: string;
  serverId?: string;
  serverName?: string;
  quality?: string;
  type?: string;
  playbackMode?: 'direct' | 'embed';
  streamUrl?: string;
  directUrl?: string;
  savedAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export async function saveStreamPreferenceToDb(urlKey: string, preference: StreamPreference): Promise<void> {
  const docPath = 'appData/stream_preferences';
  try {
    if (!urlKey) return;
    const sanitizedKey = encodeURIComponent(urlKey).replace(/[%./#$[\]]/g, '_');
    const cleanPref: Record<string, any> = sanitizeForFirestore(preference);
    cleanPref.updatedAt = new Date().toISOString();

    const payload = sanitizeForFirestore({
      [sanitizedKey]: cleanPref,
      lastUpdated: new Date().toISOString(),
    });

    await setDoc(
      doc(db, 'appData', 'stream_preferences'),
      payload,
      { merge: true }
    );
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] saveStreamPreferenceToDb delayed.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function fetchStreamPreferencesFromDb(): Promise<Record<string, StreamPreference>> {
  const docPath = 'appData/stream_preferences';
  try {
    const fetchPromise = getDoc(doc(db, 'appData', 'stream_preferences')).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const result: Record<string, StreamPreference> = {};
        for (const [key, val] of Object.entries(data)) {
          if (key !== 'lastUpdated' && val && typeof val === 'object') {
            const pref = val as StreamPreference;
            if (pref.urlKey) {
              result[pref.urlKey] = pref;
            }
            result[key] = pref;
          }
        }
        return result;
      }
      return {};
    });
    return await withTimeout(fetchPromise, 3500, {});
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      return {};
    }
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function saveAllStreamPreferencesToDb(preferences: Record<string, StreamPreference>): Promise<void> {
  const docPath = 'appData/stream_preferences';
  try {
    if (!preferences || Object.keys(preferences).length === 0) return;
    const sanitizedObj: Record<string, any> = {
      lastUpdated: new Date().toISOString(),
    };
    let currentBytes = 0;
    const maxBytes = 400 * 1024; // 400KB safe ceiling to avoid Firestore 1MB document limit

    for (const [key, val] of Object.entries(preferences)) {
      if (!val || typeof val !== 'object') continue;
      const sanitizedKey = encodeURIComponent(key).replace(/[%./#$[\]]/g, '_');
      const cleanVal = sanitizeForFirestore({
        ...val,
        updatedAt: new Date().toISOString(),
      });
      const itemLen = JSON.stringify(cleanVal).length + sanitizedKey.length;
      if (currentBytes + itemLen > maxBytes) break;
      sanitizedObj[sanitizedKey] = cleanVal;
      currentBytes += itemLen;
    }
    await withTimeout(
      setDoc(doc(db, 'appData', 'stream_preferences'), sanitizedObj, { merge: true }),
      8000,
      null
    );
  } catch (error) {
    if (isOfflineOrNetworkError(error)) {
      console.warn(`[Firestore Offline] saveAllStreamPreferencesToDb delayed.`);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export interface FirestoreLiveOverview {
  connected: boolean;
  timestamp: string;
  databaseId: string;
  projectId: string;
  folders: DbFolder[];
  favoriteLists: DbFavoriteList[];
  cinemaPlaylist: any[];
  allCinemaPlaylists?: DbCinemaPlaylistCollectionItem[];
  activeCinemaPlaylistId?: string;
  allFavorites: DbAllFavorites | null;
  customMovies: DbMovie[];
  movies: DbMovie[];
  repoMovies?: DbMovie[];
  streamPreferences: Record<string, StreamPreference>;
  syncMeta: any | null;
  counts: {
    folders: number;
    favLists: number;
    playlist: number;
    allPlaylistsCount: number;
    totalPlaylistItems: number;
    allFavMovies: number;
    greenFavs: number;
    yellowFavs: number;
    purpleFavs: number;
    blackFavs: number;
    customMovies: number;
    collectionMovies: number;
    repoMovies: number;
    streamPreferences: number;
  };
}

/**
 * Live Database Inspector: Queries all active Firestore collections and documents
 * to give the user a complete, transparent view of what is currently stored in the cloud.
 */
export async function fetchFirestoreOverview(): Promise<FirestoreLiveOverview> {
  const databaseId = (firebaseConfig as any).firestoreDatabaseId || 'Firestore';
  const projectId = (firebaseConfig as any).projectId || '';
  const now = new Date().toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  try {
    const [
      dbFolders,
      dbFavLists,
      dbAllFavs,
      dbAllCinemaPlaylists,
      dbPlaylist,
      dbUserMods,
      dbMovies,
      dbRepoResult,
      dbStreamPrefs,
      dbSyncMeta,
    ] = await Promise.all([
      fetchFoldersFromDb().catch(() => []),
      fetchFavoriteListsFromDb().catch(() => []),
      fetchAllFavoritesFromDb().catch(() => null),
      fetchAllCinemaPlaylistsFromDb().catch(() => null),
      fetchCinemaPlaylistFromDb().catch(() => []),
      fetchUserModificationsFromDb().catch(() => null),
      fetchMoviesFromDb().catch(() => []),
      fetchAllRepositoryMoviesFromDb().catch(() => null),
      fetchStreamPreferencesFromDb().catch(() => ({})),
      getDbSyncMeta().catch(() => null),
    ]);

    const greenCount = dbAllFavs?.sections?.green?.length || 0;
    const yellowCount = dbAllFavs?.sections?.yellow?.length || 0;
    const purpleCount = dbAllFavs?.sections?.purple?.length || 0;
    const blackCount = dbAllFavs?.sections?.black?.length || 0;
    const totalFavs = dbAllFavs?.movieIds?.length || 0;
    const customCount = dbUserMods?.customMovies?.length || 0;
    const repoMoviesCount = dbRepoResult?.totalCount || 0;

    const allPlaylistsList = dbAllCinemaPlaylists?.playlists || [];
    const activePlaylistItem = allPlaylistsList.find((p) => p.id === dbAllCinemaPlaylists?.activeId) || allPlaylistsList[0];
    const resolvedActiveItems = (activePlaylistItem && Array.isArray(activePlaylistItem.items))
      ? activePlaylistItem.items
      : (Array.isArray(dbPlaylist) ? dbPlaylist : []);

    const allPlaylistsCount = allPlaylistsList.length > 0
      ? allPlaylistsList.length
      : (resolvedActiveItems.length > 0 ? 1 : 0);

    const totalPlaylistItems = allPlaylistsList.length > 0
      ? allPlaylistsList.reduce((sum, pl) => sum + (Array.isArray(pl.items) ? pl.items.length : 0), 0)
      : resolvedActiveItems.length;

    const effectiveCollectionMovies = Math.max(dbMovies.length, repoMoviesCount);

    return {
      connected: true,
      timestamp: now,
      databaseId,
      projectId,
      folders: dbFolders,
      favoriteLists: dbFavLists,
      cinemaPlaylist: resolvedActiveItems,
      allCinemaPlaylists: allPlaylistsList,
      activeCinemaPlaylistId: dbAllCinemaPlaylists?.activeId || (allPlaylistsList[0]?.id || 'playlist-default'),
      allFavorites: dbAllFavs,
      customMovies: dbUserMods?.customMovies || [],
      movies: dbMovies,
      repoMovies: dbRepoResult?.movies || [],
      streamPreferences: dbStreamPrefs,
      syncMeta: dbSyncMeta,
      counts: {
        folders: dbFolders.length,
        favLists: dbFavLists.length,
        playlist: resolvedActiveItems.length,
        allPlaylistsCount: allPlaylistsCount,
        totalPlaylistItems: totalPlaylistItems,
        allFavMovies: totalFavs,
        greenFavs: greenCount,
        yellowFavs: yellowCount,
        purpleFavs: purpleCount,
        blackFavs: blackCount,
        customMovies: customCount,
        collectionMovies: effectiveCollectionMovies,
        repoMovies: repoMoviesCount,
        streamPreferences: Object.keys(dbStreamPrefs).length,
      },
    };
  } catch (err: any) {
    console.error('fetchFirestoreOverview error:', err);
    return {
      connected: false,
      timestamp: now,
      databaseId,
      projectId,
      folders: [],
      favoriteLists: [],
      cinemaPlaylist: [],
      allCinemaPlaylists: [],
      activeCinemaPlaylistId: 'playlist-default',
      allFavorites: null,
      customMovies: [],
      movies: [],
      repoMovies: [],
      streamPreferences: {},
      syncMeta: null,
      counts: {
        folders: 0,
        favLists: 0,
        playlist: 0,
        allPlaylistsCount: 0,
        totalPlaylistItems: 0,
        allFavMovies: 0,
        greenFavs: 0,
        yellowFavs: 0,
        purpleFavs: 0,
        blackFavs: 0,
        customMovies: 0,
        collectionMovies: 0,
        repoMovies: 0,
        streamPreferences: 0,
      },
    };
  }
}

// -------------------------------------------------------------
// 7. Global Real-Time Upload Status & Indicators
// -------------------------------------------------------------
export interface UploadStatusState {
  isUploading: boolean;
  operationName: string;
  operation?: string; // convenient alias
  progress: number; // 0 to 100
  status: 'idle' | 'running' | 'success' | 'error';
  message: string;
  details?: {
    type?: string;
    foldersCount?: number;
    favListsCount?: number;
    favMoviesCount?: number;
    playlistCount?: number;
    moviesCount?: number;
    streamPrefsCount?: number;
    count?: number;
    latencyMs?: number;
    timestamp?: string;
  };
  error?: string | null;
}

type UploadListener = (state: UploadStatusState) => void;
const uploadListeners = new Set<UploadListener>();

let currentUploadState: UploadStatusState = {
  isUploading: false,
  operationName: '',
  operation: '',
  progress: 0,
  status: 'idle',
  message: '',
  error: null,
};

export function getUploadStatus(): UploadStatusState {
  return currentUploadState;
}

export function subscribeToUploadStatus(listener: UploadListener): () => void {
  uploadListeners.add(listener);
  listener(currentUploadState);
  return () => {
    uploadListeners.delete(listener);
  };
}

export function notifyUploadStart(operationName: string, message: string) {
  currentUploadState = {
    isUploading: true,
    operationName,
    operation: operationName,
    progress: 20,
    status: 'running',
    message,
    error: null,
  };
  uploadListeners.forEach((l) => l(currentUploadState));
}

export function notifyUploadProgress(
  arg1: number | string,
  arg2?: string | number,
  arg3?: number
) {
  let progressNum = typeof arg1 === 'number' ? arg1 : typeof arg3 === 'number' ? arg3 : typeof arg2 === 'number' ? arg2 : currentUploadState.progress;
  let msg = typeof arg2 === 'string' ? arg2 : typeof arg1 === 'string' ? arg1 : currentUploadState.message;
  let op = typeof arg1 === 'string' ? arg1 : currentUploadState.operationName;

  currentUploadState = {
    ...currentUploadState,
    isUploading: true,
    status: 'running',
    operationName: op,
    operation: op,
    progress: Math.min(100, Math.max(0, progressNum)),
    message: msg || currentUploadState.message,
  };
  uploadListeners.forEach((l) => l(currentUploadState));
}

export function notifyUploadSuccess(message: string, details?: any) {
  const timestamp = new Date().toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  currentUploadState = {
    ...currentUploadState,
    isUploading: false,
    progress: 100,
    status: 'success',
    message,
    details: {
      ...details,
      timestamp,
    },
    error: null,
  };
  uploadListeners.forEach((l) => l(currentUploadState));
}

export function notifyUploadError(errorMsg: string) {
  currentUploadState = {
    ...currentUploadState,
    isUploading: false,
    status: 'error',
    error: errorMsg,
    message: `فشل الرفع إلى السحابة: ${errorMsg}`,
  };
  uploadListeners.forEach((l) => l(currentUploadState));
}

export function dismissUploadStatus() {
  currentUploadState = {
    ...currentUploadState,
    status: 'idle',
    isUploading: false,
    message: '',
    error: null,
  };
  uploadListeners.forEach((l) => l(currentUploadState));
}

// -------------------------------------------------------------
// 8. Comprehensive Upload Diagnostics & Testing Suite
// -------------------------------------------------------------
export interface UploadDiagnosticStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  latencyMs?: number;
  itemsCount?: number;
  message?: string;
  error?: string;
}

export interface UploadDiagnosticResult {
  overallSuccess: boolean;
  totalTimeMs: number;
  steps: UploadDiagnosticStep[];
  timestamp: string;
}

export async function runAllFirestoreUploadTests(data: {
  folders: DbFolder[];
  favoriteLists: DbFavoriteList[];
  allFavorites?: any;
  cinemaPlaylist?: any[];
  movies?: DbMovie[];
  onStepUpdate?: (step: UploadDiagnosticStep) => void;
}): Promise<UploadDiagnosticResult> {
  const startTime = Date.now();
  const steps: UploadDiagnosticStep[] = [
    { id: 'ping', name: 'فحص الاتصال بقاعدة بيانات Firestore', status: 'pending' },
    { id: 'folders', name: 'رفع ومزامنة المستودعات والأقسام', status: 'pending' },
    { id: 'favLists', name: 'رفع ومزامنة قوائم المفضلة المخصصة', status: 'pending' },
    { id: 'allFavs', name: 'رفع تقسيمات كل المفضلة (الألوان الأربعة)', status: 'pending' },
    { id: 'playlist', name: 'رفع قائمة تشغيل شاشة العرض (Playlist)', status: 'pending' },
    { id: 'streamPrefs', name: 'رفع تفضيلات البث والسيرفرات', status: 'pending' },
    { id: 'customMods', name: 'رفع بيانات الأفلام والتعديلات المخصصة', status: 'pending' },
  ];

  const update = (idx: number, patch: Partial<UploadDiagnosticStep>) => {
    steps[idx] = { ...steps[idx], ...patch };
    data.onStepUpdate?.(steps[idx]);
  };

  let allOk = true;

  // Step 0: Ping
  update(0, { status: 'running' });
  const t0 = Date.now();
  try {
    const ok = await testConnection();
    const lat = Date.now() - t0;
    if (ok) {
      update(0, { status: 'success', latencyMs: lat, message: `متصل بنجاح (${lat}ms)` });
    } else {
      update(0, { status: 'error', latencyMs: lat, message: 'تعذر الاتصال بـ Firestore.' });
      allOk = false;
    }
  } catch (err: any) {
    update(0, { status: 'error', error: err?.message });
    allOk = false;
  }

  // Step 1: Folders
  update(1, { status: 'running' });
  const t1 = Date.now();
  try {
    await saveAllFoldersToDb(data.folders || []);
    const lat = Date.now() - t1;
    update(1, {
      status: 'success',
      latencyMs: lat,
      itemsCount: data.folders?.length || 0,
      message: `تم رفع ${data.folders?.length || 0} مستودع بنجاح (${lat}ms)`,
    });
  } catch (err: any) {
    update(1, { status: 'error', error: err?.message });
    allOk = false;
  }

  // Step 2: Fav Lists
  update(2, { status: 'running' });
  const t2 = Date.now();
  try {
    await saveAllFavoriteListsToDb(data.favoriteLists || []);
    const lat = Date.now() - t2;
    update(2, {
      status: 'success',
      latencyMs: lat,
      itemsCount: data.favoriteLists?.length || 0,
      message: `تم رفع ${data.favoriteLists?.length || 0} قائمة مفضلة (${lat}ms)`,
    });
  } catch (err: any) {
    update(2, { status: 'error', error: err?.message });
    allOk = false;
  }

  // Step 3: All Favorites
  update(3, { status: 'running' });
  const t3 = Date.now();
  try {
    if (data.allFavorites) {
      await saveAllFavoritesToDb(data.allFavorites);
      const lat = Date.now() - t3;
      const count = data.allFavorites.movieIds?.length || 0;
      update(3, {
        status: 'success',
        latencyMs: lat,
        itemsCount: count,
        message: `تم رفع ${count} فيلم مفضلة (${lat}ms)`,
      });
    } else {
      update(3, { status: 'success', message: 'لا توجد عناصر مفضلة للرفع' });
    }
  } catch (err: any) {
    update(3, { status: 'error', error: err?.message });
    allOk = false;
  }

  // Step 4: Cinema Playlist & Multi-Playlists
  update(4, { status: 'running' });
  const t4 = Date.now();
  try {
    const pl = data.cinemaPlaylist || [];
    let allPls: DbCinemaPlaylistCollectionItem[] = [];
    let actId = 'playlist-default';
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('autocinema_cinema_playlists');
        if (raw) allPls = JSON.parse(raw);
        actId = localStorage.getItem('autocinema_active_playlist_id') || 'playlist-default';
      } catch (_) {}
    }
    if (!Array.isArray(allPls) || allPls.length === 0) {
      allPls = [{
        id: actId,
        name: 'قائمة التشغيل الرئيسية',
        items: pl,
        createdAt: new Date().toISOString(),
      }];
    }
    await saveAllCinemaPlaylistsToDb(allPls, actId);
    await saveCinemaPlaylistToDb(pl);
    const lat = Date.now() - t4;
    update(4, {
      status: 'success',
      latencyMs: lat,
      itemsCount: pl.length,
      message: `تم رفع واختبار ${allPls.length} قائمة شاشة عرض (${pl.length} عنصر بالنشطة) بنجاح (${lat}ms)`,
    });
  } catch (err: any) {
    update(4, { status: 'error', error: err?.message });
    allOk = false;
  }

  // Step 5: Stream Preferences
  update(5, { status: 'running' });
  const t5 = Date.now();
  try {
    await saveStreamPreferenceToDb('https://test-check.example/stream', {
      urlKey: 'https://test-check.example/stream',
      server: 'DiagnosticServer',
      quality: 'HD',
      savedAt: new Date().toISOString(),
    });
    const lat = Date.now() - t5;
    update(5, {
      status: 'success',
      latencyMs: lat,
      message: `تم حفظ واختبار تفضيلات السيرفرات (${lat}ms)`,
    });
  } catch (err: any) {
    update(5, { status: 'error', error: err?.message });
    allOk = false;
  }

  // Step 6: Custom Modifications & Movies Collection
  update(6, { status: 'running' });
  const t6 = Date.now();
  try {
    const customSample = (data.movies || [])
      .filter((m) => m.isUserAdded || m.isCustom || m.classification || m.storySummary)
      .slice(0, 50);
    await saveUserModificationsToDb({
      customMovies: customSample,
      deletedMovieIds: [],
    });
    if (customSample.length > 0) {
      await saveMovieToDb(customSample[0]);
    }
    const lat = Date.now() - t6;
    update(6, {
      status: 'success',
      latencyMs: lat,
      itemsCount: customSample.length,
      message: `تم حفظ واختبار بيانات الأفلام المعدلة والمخصصة في Firestore (${lat}ms)`,
    });
  } catch (err: any) {
    update(6, { status: 'error', error: err?.message });
    allOk = false;
  }

  const totalTimeMs = Date.now() - startTime;
  const now = new Date().toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return {
    overallSuccess: allOk,
    totalTimeMs,
    steps,
    timestamp: now,
  };
}

/**
 * Probes stream link health via backend /api/check-stream-health route.
 */
export async function checkStreamHealthApi(
  url: string,
  directUrl?: string,
  ref?: string
): Promise<{ alive: boolean; status?: number; type?: string; error?: string }> {
  try {
    const res = await fetch('/api/check-stream-health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, directUrl, ref }),
    });
    return await res.json();
  } catch (err: any) {
    return { alive: false, error: err?.message || 'Failed to check stream health' };
  }
}
