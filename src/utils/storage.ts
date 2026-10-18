import { Folder, MovieItem, FavoriteList, SortOption, ALL_FAVORITES_FOLDER, ALL_FAVORITES_FOLDER_ID, FavoriteColor } from '../types';
import { INITIAL_FOLDERS, INITIAL_MOVIES } from '../data/initialData';

// Helper to clean "Poster for HD", duration stamps like "(HD1:30:04)", "HD2:23:57", "[HD 1:45:00]" from titles
export const cleanMovieTitle = (title: string): string => {
  if (!title) return '';
  let clean = title;

  // 1. Bracketed or parenthesized duration stamps like (HD1:30:04), (1:30:04), [HD 1:45:20], [HD01:25:30]
  clean = clean.replace(
    /[([{\uFF08]\s*(?:HD|FHD|SD|4K|QHD)?\s*(?:جديد)?\s*\d{1,2}:\d{2}(?::\d{2})?\s*[)}\]\uFF09]/gi,
    ' '
  );

  // 2. Remove HD/FHD/SD/4K/جديد prefixes with timestamps e.g. HD2:23:57, HDجديد2:16:58, HD1:30:04, HD 1:30:04
  clean = clean.replace(
    /(?:HD|FHD|SD|4K|QHD)?\s*جديد\s*\d{1,2}:\d{2}(?::\d{2})?/gi,
    ' '
  );
  clean = clean.replace(
    /(?:HD|FHD|SD|4K|QHD)\s*\d{1,2}:\d{2}(?::\d{2})?/gi,
    ' '
  );

  // 3. Remove standalone timestamps H:MM:SS (hours:minutes:seconds) surrounded by spaces/delimiters
  clean = clean.replace(/(?:^|[\s\-_.:/|\\])\d{1,2}:\d{2}:\d{2}(?=[\s\-_.:/|\\]|$)/g, ' ');

  // 4. Remove "Poster for HD" phrases
  clean = clean.replace(/\(?\s*Poster\s+for\s+HD\s*\)?/gi, ' ');

  // 5. Clean empty brackets () [] {} left behind
  clean = clean.replace(/\(\s*\)|\[\s*\]|\{\s*\}|（\s*）/g, ' ');

  // 6. Clean dangling punctuation at ends and collapse multiple whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  clean = clean.replace(/^[\s\-_.:/|\\]+|[\s\-_.:/|\\]+$/g, '').trim();

  // If the title becomes empty (e.g. title was literally just "2:02:38"), preserve original title
  return clean.length > 0 ? clean : title;
};

// Helper to extract a readable Arabic/English title from URL slug when title is missing or unknown
export const extractTitleFromUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    const raw = url.trim();
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last.length > 2) {
      let decoded = decodeURIComponent(last);
      // Remove file extension if present
      let slug = decoded.replace(/\.[a-zA-Z0-9]+$/, '');
      // Replace dashes and underscores with spaces
      slug = slug.replace(/[-_]+/g, ' ').trim();
      const cleaned = cleanMovieTitle(slug);
      if (cleaned && cleaned.length > 2) return cleaned;
    }
  } catch (_) {}
  return null;
};

// Helper to normalize URL for duplicate comparison
export const normalizeMovieUrl = (url?: string): string => {
  if (!url) return '';
  let u = url.trim().toLowerCase();
  u = u.replace(/\/+$/, '');
  u = u.replace(/^http:\/\//, 'https://');
  try {
    const parsed = new URL(u.startsWith('http') ? u : `https://${u}`);
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    parsed.searchParams.delete('fbclid');
    return parsed.toString().replace(/\/+$/, '');
  } catch (_) {
    return u;
  }
};

// Helper to normalize Title for duplicate comparison
export const normalizeMovieTitle = (title?: string): string => {
  if (!title) return '';
  return cleanMovieTitle(title).trim().toLowerCase().replace(/\s+/g, ' ');
};

// Clean single movie item: title and extract duration if missing, resolve unknown titles from URL
export const cleanMovieItem = (movie: MovieItem): MovieItem => {
  let title = movie.title || '';
  const trimmedTitle = title.trim();
  if (!trimmedTitle || trimmedTitle === 'عنوان غير معروف' || trimmedTitle.toLowerCase() === 'unknown') {
    const extracted = extractTitleFromUrl(movie.url || movie.embedUrl);
    if (extracted) {
      title = extracted;
    }
  }

  const cleanedTitle = cleanMovieTitle(title);
  let duration = movie.duration;
  if (!duration) {
    const durMatch = (movie.title || '').match(
      /(?:[\(\[\{]\s*)?(?:HD|FHD|SD|4K|QHD)?\s*(?:جديد)?\s*(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[\)\]\}])?/i
    );
    if (durMatch && durMatch[1]) {
      duration = durMatch[1];
    }
  }
  return {
    ...movie,
    title: cleanedTitle || movie.title,
    duration: duration || movie.duration,
  };
};

// Batch clean all movies and report count of modified items
export const cleanAllMovieItems = (
  movies: MovieItem[]
): { cleanedMovies: MovieItem[]; modifiedCount: number } => {
  let modifiedCount = 0;
  const cleanedMovies = movies.map((m) => {
    const cleaned = cleanMovieItem(m);
    if (cleaned.title !== m.title || cleaned.duration !== m.duration) {
      modifiedCount++;
      return cleaned;
    }
    return m;
  });
  return { cleanedMovies, modifiedCount };
};

// Deduplicate movies within folders and overall database to prevent repeated items across pages
export const deduplicateMovieItems = (
  movies: MovieItem[]
): { deduplicatedMovies: MovieItem[]; removedDuplicatesCount: number } => {
  const seenIds = new Set<string>();
  const seenFolderUrl = new Set<string>();
  const seenFolderTitle = new Set<string>();
  let removedDuplicatesCount = 0;
  const deduplicatedMovies: MovieItem[] = [];

  for (const m of movies) {
    if (!m || !m.id) continue;

    // Enforce unique ID
    if (seenIds.has(m.id)) {
      removedDuplicatesCount++;
      continue;
    }

    const normUrl = normalizeMovieUrl(m.url || m.embedUrl);
    const normTitle = normalizeMovieTitle(m.title);
    const folderId = m.parentFolderId || '';

    const urlKey = `${folderId}|||${normUrl}`;
    const titleKey = `${folderId}|||${normTitle}`;

    // Duplicate URL in same folder
    if (normUrl && seenFolderUrl.has(urlKey)) {
      removedDuplicatesCount++;
      const existing = deduplicatedMovies.find(
        (x) => x.parentFolderId === folderId && normalizeMovieUrl(x.url || x.embedUrl) === normUrl
      );
      if (existing) {
        if (!existing.isFavorite && m.isFavorite) {
          existing.isFavorite = true;
          existing.favoriteColor = m.favoriteColor;
        }
        if (!existing.classification && m.classification) {
          existing.classification = m.classification;
          existing.classificationReason = m.classificationReason;
        }
      }
      continue;
    }

    // Duplicate title in same folder (ignore generic unknown titles)
    if (normTitle && normTitle !== 'عنوان غير معروف' && normTitle !== 'unknown' && seenFolderTitle.has(titleKey)) {
      removedDuplicatesCount++;
      const existing = deduplicatedMovies.find(
        (x) => x.parentFolderId === folderId && normalizeMovieTitle(x.title) === normTitle
      );
      if (existing) {
        if (!existing.isFavorite && m.isFavorite) {
          existing.isFavorite = true;
          existing.favoriteColor = m.favoriteColor;
        }
        if (!existing.classification && m.classification) {
          existing.classification = m.classification;
          existing.classificationReason = m.classificationReason;
        }
      }
      continue;
    }

    seenIds.add(m.id);
    if (normUrl) seenFolderUrl.add(urlKey);
    if (normTitle && normTitle !== 'عنوان غير معروف' && normTitle !== 'unknown') {
      seenFolderTitle.add(titleKey);
    }
    deduplicatedMovies.push(m);
  }

  return { deduplicatedMovies, removedDuplicatesCount };
};

const FOLDERS_KEY = 'autocinema_folders_v1';
const MOVIES_KEY = 'autocinema_movies_v1';
const FAVORITES_KEY = 'autocinema_favorite_lists_v1';
const DB_NAME = 'AutoCinemaDB';
const DB_VERSION = 1;

// In-memory cache for ultra-fast synchronous access
let memoryFoldersCache: Folder[] | null = null;
let memoryMoviesCache: MovieItem[] | null = null;
let memoryFavsCache: FavoriteList[] | null = null;

// IndexedDB Helper
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('store')) {
        db.createObjectStore('store');
      }
    };
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('store', 'readonly');
      const store = tx.objectStore('store');
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

async function idbSet(key: string, value: any): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('store', 'readwrite');
      const store = tx.objectStore('store');
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (e) {
    // Ignore IndexedDB write error silently
  }
}

// Async Storage Initialization (called on app startup)
export async function initStorageAsync(): Promise<{ folders: Folder[]; movies: MovieItem[]; favoriteLists: FavoriteList[] }> {
  try {
    const [idbFolders, idbMovies, idbFavs] = await Promise.all([
      idbGet<Folder[]>(FOLDERS_KEY),
      idbGet<MovieItem[]>(MOVIES_KEY),
      idbGet<FavoriteList[]>(FAVORITES_KEY),
    ]);

    if (idbFolders && Array.isArray(idbFolders) && idbFolders.length > 0) {
      memoryFoldersCache = idbFolders;
    }
    if (idbMovies && Array.isArray(idbMovies) && idbMovies.length > 0) {
      memoryMoviesCache = idbMovies;
    }
    if (idbFavs && Array.isArray(idbFavs)) {
      memoryFavsCache = idbFavs;
    }
  } catch (e) {
    console.warn('IndexedDB initial read failed, falling back to localStorage');
  }

  // Fallbacks if IndexedDB was empty
  if (!memoryFoldersCache) memoryFoldersCache = loadFolders();
  if (!memoryMoviesCache) memoryMoviesCache = loadMovies();
  if (!memoryFavsCache) memoryFavsCache = loadFavoriteLists();

  return {
    folders: memoryFoldersCache,
    movies: memoryMoviesCache,
    favoriteLists: memoryFavsCache,
  };
}

export function loadFolders(): Folder[] {
  if (memoryFoldersCache && Array.isArray(memoryFoldersCache)) return memoryFoldersCache;
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (!raw) {
      saveFolders(INITIAL_FOLDERS);
      return INITIAL_FOLDERS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryFoldersCache = parsed;
      return parsed;
    }
    return INITIAL_FOLDERS;
  } catch (e) {
    console.error('Error loading folders from localStorage', e);
    return INITIAL_FOLDERS;
  }
}

export function saveFolders(folders: Folder[]): void {
  memoryFoldersCache = folders;
  idbSet(FOLDERS_KEY, folders);
  try {
    localStorage.setItem('autocinema_has_user_data', 'true');
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  } catch (e) {
    console.warn('localStorage quota exceeded for folders. Data saved to IndexedDB.');
  }
}

export function loadMovies(): MovieItem[] {
  if (memoryMoviesCache && Array.isArray(memoryMoviesCache)) return memoryMoviesCache;
  try {
    const raw = localStorage.getItem(MOVIES_KEY);
    if (!raw || raw === '__INDEXEDDB_STORED__') {
      if (memoryMoviesCache && Array.isArray(memoryMoviesCache)) return memoryMoviesCache;
      return INITIAL_MOVIES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryMoviesCache = parsed;
      return parsed;
    }
    return INITIAL_MOVIES;
  } catch (e) {
    console.error('Error loading movies from localStorage', e);
    return memoryMoviesCache && Array.isArray(memoryMoviesCache) ? memoryMoviesCache : INITIAL_MOVIES;
  }
}

export function saveMovies(movies: MovieItem[]): void {
  memoryMoviesCache = movies;
  idbSet(MOVIES_KEY, movies);
  try {
    localStorage.setItem('autocinema_has_user_data', 'true');
    localStorage.setItem(MOVIES_KEY, JSON.stringify(movies));
  } catch (e) {
    try {
      localStorage.setItem(MOVIES_KEY, '__INDEXEDDB_STORED__');
    } catch (_) {}
    console.warn('localStorage quota exceeded for movies. Data saved safely in IndexedDB and RAM.');
  }
}

export function loadFavoriteLists(): FavoriteList[] {
  if (memoryFavsCache && Array.isArray(memoryFavsCache)) return memoryFavsCache;
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) {
      const defaultLists: FavoriteList[] = [
        {
          id: 'fav-list-default',
          name: 'المفضلة الرئيسية',
          description: 'القائمة الافتراضية لأفضل الأفلام والعروض',
          color: '#f59e0b',
          createdAt: new Date().toISOString(),
          movieIds: [],
        },
      ];
      saveFavoriteLists(defaultLists);
      return defaultLists;
    }
    const parsed = JSON.parse(raw);
    const result = Array.isArray(parsed) ? parsed : [];
    memoryFavsCache = result;
    return result;
  } catch (e) {
    console.error('Error loading favorite lists from localStorage', e);
    return [];
  }
}

export function saveFavoriteLists(favoriteLists: FavoriteList[]): void {
  memoryFavsCache = favoriteLists;
  idbSet(FAVORITES_KEY, favoriteLists);
  try {
    localStorage.setItem('autocinema_has_user_data', 'true');
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteLists));
  } catch (e) {
    console.warn('localStorage quota exceeded for favorite lists. Data saved to IndexedDB.');
  }
}

export function getDomainFromUrl(urlStr: string): string {
  if (!urlStr) return 'unknown.com';
  try {
    let cleanUrl = urlStr.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    const parsed = new URL(cleanUrl);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch (e) {
    return 'external';
  }
}

export function sortMovies(movies: MovieItem[], sortBy: SortOption): MovieItem[] {
  const items = [...movies];
  switch (sortBy) {
    case 'domain':
      return items.sort((a, b) => {
        const domA = getDomainFromUrl(a.url || a.embedUrl);
        const domB = getDomainFromUrl(b.url || b.embedUrl);
        const domCmp = domA.localeCompare(domB);
        if (domCmp !== 0) return domCmp;
        const titleCmp = (a.title || '').localeCompare(b.title || '');
        if (titleCmp !== 0) return titleCmp;
        return (a.id || '').localeCompare(b.id || '');
      });
    case 'title':
      return items.sort((a, b) => {
        const titleCmp = (a.title || '').localeCompare(b.title || '');
        if (titleCmp !== 0) return titleCmp;
        const timeA = new Date(a.addedAt || 0).getTime();
        const timeB = new Date(b.addedAt || 0).getTime();
        const dateDiff = (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
        if (dateDiff !== 0) return dateDiff;
        return (a.id || '').localeCompare(b.id || '');
      });
    case 'date':
      return items.sort((a, b) => {
        const timeA = new Date(a.addedAt || 0).getTime();
        const timeB = new Date(b.addedAt || 0).getTime();
        const dateDiff = (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
        if (dateDiff !== 0) return dateDiff;
        const titleCmp = (a.title || '').localeCompare(b.title || '');
        if (titleCmp !== 0) return titleCmp;
        return (a.id || '').localeCompare(b.id || '');
      });
    case 'manual':
      return items.sort((a, b) => {
        // Favorited items ALWAYS appear at the top when sorting manually
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        const orderA = a.favoriteOrder ?? a.manualOrder ?? 999999;
        const orderB = b.favoriteOrder ?? b.manualOrder ?? 999999;
        const orderDiff = orderA - orderB;
        if (orderDiff !== 0) return orderDiff;
        const timeA = new Date(a.addedAt || 0).getTime();
        const timeB = new Date(b.addedAt || 0).getTime();
        const dateDiff = (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
        if (dateDiff !== 0) return dateDiff;
        const titleCmp = (a.title || '').localeCompare(b.title || '');
        if (titleCmp !== 0) return titleCmp;
        return (a.id || '').localeCompare(b.id || '');
      });
    default:
      return items;
  }
}

export function getRandomFolderId(folders: Folder[]): string | null {
  const visibleFolders = folders.filter((f) => !f.isFolderHidden);
  if (visibleFolders.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * visibleFolders.length);
  return visibleFolders[randomIndex].id;
}

export function resetToDefaults(): { folders: Folder[]; movies: MovieItem[]; favoriteLists: FavoriteList[] } {
  saveFolders(INITIAL_FOLDERS);
  saveMovies(INITIAL_MOVIES);
  const defaultLists: FavoriteList[] = [
    {
      id: 'fav-list-default',
      name: 'المفضلة الرئيسية',
      description: 'القائمة الافتراضية لأفضل الأفلام والعروض',
      color: '#f59e0b',
      createdAt: new Date().toISOString(),
      movieIds: [],
    },
  ];
  saveFavoriteLists(defaultLists);
  return { folders: INITIAL_FOLDERS, movies: INITIAL_MOVIES, favoriteLists: defaultLists };
}

export const CHUNK_SIZE = 2000;

export interface AppDataChunk {
  fileName: string;
  chunkIndex: number;
  totalChunks: number;
  startItemIndex: number;
  endItemIndex: number;
  isPrimaryChunk: boolean;
  totalItemsCount: number;
  totalOverallItems: number;
  totalItemsNotice: string;
  appName: string;
  version: string;
  exportedAt: string;
  folders: Folder[];
  movies: MovieItem[];
  favoriteLists: FavoriteList[];
  allFavorites: any;
  hiddenFavoriteSections?: FavoriteColor[];
  isDeltaUpdate?: boolean;
  newMovies?: MovieItem[];
  modifiedMovies?: MovieItem[];
  deletedMovieIds?: string[];
}

export interface FavJsonData {
  fileName: string;
  appName: string;
  version: string;
  exportedAt: string;
  notice: string;
  allFavorites: {
    repository: Folder;
    totalFavoritesCount: number;
    movieIds: string[];
    sections?: {
      green: string[];
      yellow: string[];
      purple: string[];
      black: string[];
    };
    sectionsCount?: {
      green: number;
      yellow: number;
      purple: number;
      black: number;
    };
    movies?: MovieItem[];
  };
  favoriteLists: FavoriteList[];
  hiddenFavoriteSections?: FavoriteColor[];
}

/**
 * Prepares two app data files:
 * 1. initialData.json: Full Base dataset (contains all current items in current state)
 * 2. initialData2.json: Delta updates & additions (contains only new additions and modified items)
 */
export function prepareAppDataChunks(
  folders: Folder[],
  movies: MovieItem[],
  favoriteLists?: FavoriteList[],
  hiddenFavoriteSections?: FavoriteColor[]
): AppDataChunk[] {
  const activeFolders = folders && folders.length > 0 ? folders : loadFolders();
  const activeMovies = movies && movies.length > 0 ? movies : loadMovies();
  const listsToSave = favoriteLists && favoriteLists.length > 0 ? favoriteLists : loadFavoriteLists();

  const activeHiddenSections =
    hiddenFavoriteSections ||
    (() => {
      try {
        const s = localStorage.getItem('autocinema_hidden_favorite_sections');
        return s ? JSON.parse(s) : [];
      } catch {
        return [];
      }
    })();

  const exportedAt = new Date().toISOString();

  // 1. Base File: initialData.json (all current movies)
  const baseChunkFavMovies = activeMovies.filter(
    (m) => (m.isFavorite || (m.favoriteListIds && m.favoriteListIds.length > 0)) && !m.isHidden
  );

  const baseChunk: AppDataChunk = {
    fileName: 'initialData.json',
    chunkIndex: 1,
    totalChunks: 2,
    startItemIndex: 1,
    endItemIndex: activeMovies.length,
    isPrimaryChunk: true,
    totalItemsCount: activeMovies.length,
    totalOverallItems: activeMovies.length,
    totalItemsNotice: `الملف الأساسي الشامل لكافة العناصر الحالية (${activeMovies.length} عنصر) - يُنسخ لـ public مرة واحدة فقط ولا تحتاج لإعادة نسخه في كل مرة`,
    appName: 'AutoCinema',
    version: '2.0',
    exportedAt,
    folders: activeFolders,
    movies: activeMovies,
    favoriteLists: listsToSave,
    allFavorites: {
      repository: ALL_FAVORITES_FOLDER,
      totalFavoritesCount: baseChunkFavMovies.length,
      notice: `إجمالي عدد عناصر المفضلة العامة المصدّرة في هذا الملف: ${baseChunkFavMovies.length} عنصر`,
      movieIds: baseChunkFavMovies.map((m) => m.id),
      movies: baseChunkFavMovies,
    },
    hiddenFavoriteSections: activeHiddenSections,
  };

  // 2. Update File: initialData2.json (only new additions & modified items since base)
  let baseMovieIds: Set<string>;
  try {
    const rawBaseIds = localStorage.getItem('autocinema_base_movie_ids');
    if (rawBaseIds) {
      baseMovieIds = new Set(JSON.parse(rawBaseIds));
    } else {
      baseMovieIds = new Set(activeMovies.map((m) => m.id));
      localStorage.setItem('autocinema_base_movie_ids', JSON.stringify(Array.from(baseMovieIds)));
    }
  } catch {
    baseMovieIds = new Set(activeMovies.map((m) => m.id));
  }

  const newMovies = activeMovies.filter((m) => !baseMovieIds.has(m.id));
  const currentIds = new Set(activeMovies.map((m) => m.id));
  const deletedMovieIds = Array.from(baseMovieIds).filter((id) => !currentIds.has(id));

  // Determine modified movies
  const modifiedMovies = activeMovies.filter((m) => {
    if (!baseMovieIds.has(m.id)) return false;
    return Boolean(m.classification || m.storySummary || (m.favoriteOrder !== undefined && m.favoriteOrder > 0));
  });

  const deltaMovies = [...newMovies, ...modifiedMovies];
  const deltaFavMovies = deltaMovies.filter(
    (m) => (m.isFavorite || (m.favoriteListIds && m.favoriteListIds.length > 0)) && !m.isHidden
  );

  const updateChunk: AppDataChunk = {
    fileName: 'initialData2.json',
    chunkIndex: 2,
    totalChunks: 2,
    startItemIndex: 1,
    endItemIndex: deltaMovies.length,
    isPrimaryChunk: false,
    isDeltaUpdate: true,
    totalItemsCount: deltaMovies.length,
    totalOverallItems: activeMovies.length,
    totalItemsNotice: `ملف التحديثات والإضافات الجديدة (initialData2.json) - هذا هو الملف الوحيد المطلوب نسخه عند عمل إضافات أو تعديلات على الوضع الحالي (${newMovies.length} جديد، ${modifiedMovies.length} معدل)`,
    appName: 'AutoCinema',
    version: '2.0',
    exportedAt,
    folders: activeFolders,
    movies: deltaMovies,
    newMovies,
    modifiedMovies,
    deletedMovieIds,
    favoriteLists: listsToSave,
    allFavorites: {
      repository: ALL_FAVORITES_FOLDER,
      totalFavoritesCount: deltaFavMovies.length,
      notice: `إجمالي عدد عناصر المفضلة الجديدة أو المعدلة: ${deltaFavMovies.length} عنصر`,
      movieIds: deltaFavMovies.map((m) => m.id),
      movies: deltaFavMovies,
    },
    hiddenFavoriteSections: activeHiddenSections,
  };

  return [baseChunk, updateChunk];
}

export function downloadChunkFile(chunk: AppDataChunk): void {
  const jsonString = JSON.stringify(chunk, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = chunk.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadAllChunkFiles(chunks: AppDataChunk[]): void {
  chunks.forEach((chunk, idx) => {
    setTimeout(() => {
      downloadChunkFile(chunk);
    }, idx * 300);
  });
}

/**
 * Robustly attempts to fetch initialData.json and subsequent chunks (initialData2.json, initialData3.json...)
 * using the server API or candidate URLs with cache-busting queries.
 */
export async function fetchInitialDataJson(): Promise<{
  folders: Folder[];
  movies: MovieItem[];
  favoriteLists?: FavoriteList[];
  hiddenFavoriteSections?: FavoriteColor[];
  allFavorites?: any;
  exportedAt?: string;
  loadedChunks?: string[];
  totalChunks?: number;
} | null> {
  // First attempt: Server API endpoint which merges all chunks on the backend
  try {
    const apiRes = await fetch('/api/get-initial-data', { cache: 'no-store' });
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data && (Array.isArray(data.folders) || Array.isArray(data.movies))) {
        const validated = parseAndValidateFullAppData(JSON.stringify(data));
        try {
          if (!localStorage.getItem('autocinema_base_movie_ids')) {
            localStorage.setItem(
              'autocinema_base_movie_ids',
              JSON.stringify(validated.movies.map((m) => m.id))
            );
          }
        } catch (_) {}
        return {
          ...validated,
          loadedChunks: data.loadedChunks || ['initialData.json'],
          totalChunks: data.loadedChunks ? data.loadedChunks.length : 1,
        };
      }
    }
  } catch (e) {
    // API endpoint unavailable, fall back to direct file fetches
  }

  const cacheBuster = Date.now();

  const fetchSingleChunk = async (baseName: string): Promise<any | null> => {
    const candidateUrls = [
      `/${baseName}?v=${cacheBuster}`,
      `./${baseName}?v=${cacheBuster}`,
      `/${baseName.toLowerCase()}?v=${cacheBuster}`,
      `./${baseName.toLowerCase()}?v=${cacheBuster}`,
      `/${baseName}`,
      `./${baseName}`,
      `/${baseName.toLowerCase()}`,
      `./${baseName.toLowerCase()}`,
    ];

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim().startsWith('{')) {
            const parsed = parseAndValidateFullAppData(text);
            if (parsed && (parsed.folders.length > 0 || parsed.movies.length > 0)) {
              return { parsed, matchedName: baseName };
            }
          }
        }
      } catch (_) {}
    }
    return null;
  };

  // 1. Fetch primary chunk: initialData.json
  const primaryResult = await fetchSingleChunk('initialData.json');
  if (!primaryResult) {
    return null;
  }

  const primaryData = primaryResult.parsed;
  const loadedChunks: string[] = ['initialData.json'];

  try {
    localStorage.setItem(
      'autocinema_base_movie_ids',
      JSON.stringify(primaryData.movies.map((m: any) => m.id))
    );
  } catch (_) {}

  const combinedMovies: MovieItem[] = [...primaryData.movies];
  const combinedFolders: Folder[] = [...primaryData.folders];
  let combinedFavLists: FavoriteList[] = primaryData.favoriteLists ? [...primaryData.favoriteLists] : [];
  const seenMovieIds = new Set(combinedMovies.map((m) => m.id));
  const seenFolderIds = new Set(combinedFolders.map((f) => f.id));
  const seenFavListIds = new Set(combinedFavLists.map((l) => l.id));

  // 2. Fetch subsequent chunks sequentially: initialData2.json, initialData3.json...
  let chunkIdx = 2;
  while (chunkIdx <= 50) {
    const chunkName = `initialData${chunkIdx}.json`;
    const chunkResult = await fetchSingleChunk(chunkName);
    if (!chunkResult) {
      const nextResult = await fetchSingleChunk(`initialData${chunkIdx + 1}.json`);
      if (!nextResult) break;
      chunkIdx++;
      continue;
    }

    loadedChunks.push(chunkName);
    const chunkData = chunkResult.parsed;

    // Handle deleted items if present in delta
    if (Array.isArray(chunkData.deletedMovieIds)) {
      const delSet = new Set(chunkData.deletedMovieIds);
      for (let i = combinedMovies.length - 1; i >= 0; i--) {
        if (delSet.has(combinedMovies[i].id)) {
          seenMovieIds.delete(combinedMovies[i].id);
          combinedMovies.splice(i, 1);
        }
      }
    }

    if (Array.isArray(chunkData.movies)) {
      const movieMap = new Map(combinedMovies.map((m, idx) => [m.id, idx]));
      for (const m of chunkData.movies) {
        if (!m || !m.id) continue;
        if (movieMap.has(m.id)) {
          const idx = movieMap.get(m.id)!;
          combinedMovies[idx] = { ...combinedMovies[idx], ...m };
        } else {
          seenMovieIds.add(m.id);
          combinedMovies.unshift(m);
          movieMap.set(m.id, 0);
        }
      }
    }

    if (Array.isArray(chunkData.folders)) {
      for (const f of chunkData.folders) {
        if (f && f.id && !seenFolderIds.has(f.id)) {
          seenFolderIds.add(f.id);
          combinedFolders.push(f);
        }
      }
    }

    if (Array.isArray(chunkData.favoriteLists)) {
      for (const l of chunkData.favoriteLists) {
        if (l && l.id && !seenFavListIds.has(l.id)) {
          seenFavListIds.add(l.id);
          combinedFavLists.push(l);
        }
      }
    }

    chunkIdx++;
  }

  // 3. Layer independent fav.json if present in public
  try {
    const favData = await fetchFavDataJson();
    if (favData) {
      const favIdSet = new Set(favData.allFavorites?.movieIds || []);
      const sec: any = favData.allFavorites?.sections || {};
      const greenSet = new Set(sec.green || []);
      const yellowSet = new Set(sec.yellow || []);
      const purpleSet = new Set(sec.purple || []);
      const blackSet = new Set(sec.black || []);

      combinedMovies.forEach((m) => {
        if (favIdSet.has(m.id)) {
          m.isFavorite = true;
          if (greenSet.has(m.id)) m.favoriteColor = 'green';
          else if (purpleSet.has(m.id)) m.favoriteColor = 'purple';
          else if (blackSet.has(m.id)) m.favoriteColor = 'black';
          else if (yellowSet.has(m.id)) m.favoriteColor = 'yellow';
        }
      });

      if (Array.isArray(favData.favoriteLists) && favData.favoriteLists.length > 0) {
        combinedFavLists = favData.favoriteLists;
      }
    }
  } catch (_) {}

  return {
    folders: combinedFolders,
    movies: combinedMovies,
    favoriteLists: combinedFavLists,
    hiddenFavoriteSections: primaryData.hiddenFavoriteSections,
    exportedAt: primaryData.exportedAt || new Date().toISOString(),
    loadedChunks,
    totalChunks: loadedChunks.length,
  };
}

export async function resetToDefaultsFromInitialJson(): Promise<{
  folders: Folder[];
  movies: MovieItem[];
  favoriteLists: FavoriteList[];
}> {
  try {
    const parsed = await fetchInitialDataJson();
    if (parsed) {
      const favs =
        parsed.favoriteLists && Array.isArray(parsed.favoriteLists) && parsed.favoriteLists.length > 0
          ? parsed.favoriteLists
          : loadFavoriteLists();

      let finalMovies = parsed.movies;
      let finalFavs = favs;
      let favMsg = '';

      try {
        const favData = await fetchFavDataJson();
        if (favData) {
          const favIdSet = new Set(favData.allFavorites?.movieIds || []);
          const sec: any = favData.allFavorites?.sections || {};
          const greenSet = new Set(sec.green || []);
          const yellowSet = new Set(sec.yellow || []);
          const purpleSet = new Set(sec.purple || []);
          const blackSet = new Set(sec.black || []);

          finalMovies = finalMovies.map((m) => {
            if (favIdSet.has(m.id)) {
              let col = m.favoriteColor || 'yellow';
              if (greenSet.has(m.id)) col = 'green';
              else if (purpleSet.has(m.id)) col = 'purple';
              else if (blackSet.has(m.id)) col = 'black';
              else if (yellowSet.has(m.id)) col = 'yellow';
              return { ...m, isFavorite: true, favoriteColor: col };
            }
            return m;
          });

          if (Array.isArray(favData.favoriteLists) && favData.favoriteLists.length > 0) {
            finalFavs = favData.favoriteLists;
          }
          if (Array.isArray(favData.hiddenFavoriteSections)) {
            localStorage.setItem(
              'autocinema_hidden_favorite_sections',
              JSON.stringify(favData.hiddenFavoriteSections)
            );
          }
          favMsg = `\n• تم دمج وتحديث المفضلة تلقائياً من (fav.json): ${favIdSet.size} عنصر`;
        }
      } catch (_) {}

      saveFolders(parsed.folders);
      saveMovies(finalMovies);
      saveFavoriteLists(finalFavs);

      const seedTs = parsed.exportedAt || new Date().toISOString();
      localStorage.setItem('autocinema_seeded_timestamp', seedTs);

      const chunksCount = parsed.totalChunks || (parsed.loadedChunks ? parsed.loadedChunks.length : 1);
      const chunkNames = parsed.loadedChunks ? parsed.loadedChunks.join(' + ') : 'initialData.json';

      alert(
        `تمت استعادة البيانات بنجاح من مجلد public!\n\n` +
        `• ملف الأقسام والمحتوى: ${chunkNames} (${chunksCount} ملف/ملفات)\n` +
        `• إجمالي الأقسام (المستودعات): ${parsed.folders.length}\n` +
        `• إجمالي الأفلام والمسلسلات: ${finalMovies.length}` +
        favMsg
      );

      return { folders: parsed.folders, movies: finalMovies, favoriteLists: finalFavs };
    } else {
      alert(
        'تنبيه: لم يتم العثور على ملف (initialData.json) في مجلد public.\n\n' +
        'تأكد من وضع الملف المصدّر داخل مجلد public في مشروعك باسم initialData.json ثم قم بعمل إعادة استعادة.'
      );
    }
  } catch (e: any) {
    console.warn('Could not fetch initialData.json for reset, falling back to built-in defaults:', e);
    alert(`حدث خطأ أثناء قراءة initialData.json: ${e?.message || e}\nسيتم استعادة البيانات الافتراضية.`);
  }

  return resetToDefaults();
}

/**
 * Automatically syncs current folders, movies, and custom favorite lists to the server's initialData chunks
 * so that /public/initialData.json (and initialData2.json...) are always up-to-date with any additions or edits.
 */
export async function syncInitialDataFile(
  folders: Folder[],
  movies: MovieItem[],
  favoriteLists?: FavoriteList[],
  allFavorites?: any,
  hiddenFavoriteSections?: FavoriteColor[]
): Promise<void> {
  try {
    const currentFavs = favoriteLists || loadFavoriteLists();
    const folderMap = new Map<string, Folder>(folders.map((f) => [f.id, f]));
    const favMovies = movies.filter((m) => {
      const parentFolder = folderMap.get(m.parentFolderId);
      return (
        (m.isFavorite || (m.favoriteListIds && m.favoriteListIds.length > 0)) &&
        !m.isHidden &&
        !parentFolder?.isFolderHidden &&
        parentFolder?.includeInAllFavorites !== false
      );
    });
    const greenFavs = favMovies.filter((m) => m.favoriteColor === 'green');
    const yellowFavs = favMovies.filter((m) => m.favoriteColor === 'yellow' || (!m.favoriteColor && m.isFavorite));
    const purpleFavs = favMovies.filter((m) => m.favoriteColor === 'purple');
    const blackFavs = favMovies.filter((m) => m.favoriteColor === 'black');

    const favData = allFavorites || {
      repository: ALL_FAVORITES_FOLDER,
      totalFavoritesCount: favMovies.length,
      notice: `إجمالي عدد عناصر المفضلة العامة المصدّرة: ${favMovies.length} عنصر من جميع المستودعات المشمولة`,
      movieIds: favMovies.map((m) => m.id),
      movies: favMovies,
      sections: {
        green: greenFavs.map((m) => m.id),
        yellow: yellowFavs.map((m) => m.id),
        purple: purpleFavs.map((m) => m.id),
        black: blackFavs.map((m) => m.id),
      },
    };

    await fetch('/api/update-initial-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appName: 'AutoCinema',
        version: '1.0',
        folders,
        movies,
        favoriteLists: currentFavs,
        allFavorites: favData,
        hiddenFavoriteSections: hiddenFavoriteSections || [],
      }),
    });
  } catch (e) {
    // Silently ignore if server sync is unavailable
  }
}

/**
 * Exports Full App Data:
 * - File 1: initialData.json (Base full dataset - all current items)
 * - File 2: initialData2.json (Updates & additions - only new additions and modifications)
 */
export function exportFullAppData(
  folders: Folder[],
  movies: MovieItem[],
  favoriteLists?: FavoriteList[],
  hiddenFavoriteSections?: FavoriteColor[],
  targetChunkIndex?: number
): void {
  const activeFolders = folders && folders.length > 0 ? folders : loadFolders();
  const activeMovies = movies && movies.length > 0 ? movies : loadMovies();
  const listsToSave = favoriteLists && favoriteLists.length > 0 ? favoriteLists : loadFavoriteLists();

  const chunks = prepareAppDataChunks(activeFolders, activeMovies, listsToSave, hiddenFavoriteSections);

  // Sync all chunks to server disk
  syncInitialDataFile(activeFolders, activeMovies, listsToSave, undefined, hiddenFavoriteSections);

  if (targetChunkIndex === 2) {
    // Download specific chunk: initialData2.json (updates only)
    const updateChunk = chunks[1];
    downloadChunkFile(updateChunk);
    alert(
      `تم تنزيل ملف التحديثات والإضافات الجديدة (initialData2.json) بنجاح!\n\n` +
      `• عدد العناصر الجديدة والمعدلة: ${updateChunk.totalItemsCount}\n\n` +
      `💡 هذا هو الملف الوحيد المطلوب نقله إلى مجلد public!\n` +
      `الملف الأساسي (initialData.json) محفوظ في مكانه ولا تحتاج لإعادة نسخه إطلاقاً.`
    );
    return;
  }

  if (targetChunkIndex === 1) {
    // Download specific chunk: initialData.json (base full dataset)
    const baseChunk = chunks[0];
    downloadChunkFile(baseChunk);
    alert(
      `تم تنزيل الملف الأساسي الشامل (initialData.json) بنجاح!\n\n` +
      `• إجمالي العناصر بداخل الملف: ${baseChunk.totalItemsCount} عنصر\n\n` +
      `يحتوي على كافة العناصر الحالية بالكامل بالوضع الحالي. يُنسخ لمجلد public مرة واحدة فقط ولا تحتاج لإعادة نسخه عند إضافة عناصر جديدة.`
    );
    return;
  }

  // Default export: if there are updates in initialData2.json, export initialData2.json by default
  if (chunks[1].totalItemsCount > 0) {
    downloadChunkFile(chunks[1]);
    alert(
      `تم تنزيل ملف التحديثات والإضافات الجديدة (initialData2.json) بنجاح!\n\n` +
      `• عدد التحديثات والإضافات: ${chunks[1].totalItemsCount} عنصر\n\n` +
      `💡 ملاحظة:\n` +
      `هذا هو الملف الوحيد الذي تحتاج لنسخه إلى مجلد public لتطبيق الإضافات أو التعديلات الجديدة على الوضع الحالي دون الحاجة لإعادة نسخ الملف الأساسي الضخم (initialData.json)!`
    );
  } else {
    // If no updates yet, export base initialData.json
    downloadChunkFile(chunks[0]);
    alert(
      `تم تصدير وحفظ الملف الأساسي (initialData.json) بنجاح!\n\n` +
      `• إجمالي العناصر: ${chunks[0].totalItemsCount} عنصر\n\n` +
      `الملف الأساسي يحتوي على كافة العناصر الحالية. يُنسخ لـ public مرة واحدة فقط، وأي إضافات جديدة قادمة ستُصدر تلقائياً في initialData2.json دون الحاجة لتكرار نسخ هذا الملف.`
    );
  }
}

/**
 * 1. Export Favorites (fav.json):
 * Exports All Favorites and custom favorite lists independently to /public/fav.json
 */
export async function exportFavoritesData(
  movies: MovieItem[],
  favoriteLists?: FavoriteList[],
  hiddenFavoriteSections?: FavoriteColor[]
): Promise<void> {
  const activeMovies = movies && movies.length > 0 ? movies : loadMovies();
  const listsToSave = favoriteLists && favoriteLists.length > 0 ? favoriteLists : loadFavoriteLists();
  const activeHiddenSections =
    hiddenFavoriteSections ||
    (() => {
      try {
        const s = localStorage.getItem('autocinema_hidden_favorite_sections');
        return s ? JSON.parse(s) : [];
      } catch {
        return [];
      }
    })();

  const favMovies = activeMovies.filter(
    (m) => (m.isFavorite || (m.favoriteListIds && m.favoriteListIds.length > 0)) && !m.isHidden
  );

  const getEffectiveFavColor = (m: MovieItem): FavoriteColor => {
    if (m.classification === 'red' || m.classification === 'purple') return 'purple';
    return m.favoriteColor || 'yellow';
  };

  const green = favMovies.filter((m) => getEffectiveFavColor(m) === 'green');
  const yellow = favMovies.filter((m) => getEffectiveFavColor(m) === 'yellow');
  const purple = favMovies.filter((m) => getEffectiveFavColor(m) === 'purple');
  const black = favMovies.filter((m) => getEffectiveFavColor(m) === 'black');

  const favJsonData: FavJsonData = {
    fileName: 'fav.json',
    appName: 'AutoCinema',
    version: '2.0',
    exportedAt: new Date().toISOString(),
    notice:
      'ملف المفضلة المستقل (fav.json) - يحتوي على كافة عناصر كل المفضلة (All Favorites) وقوائم المفضلة المخصصة، يُوضع في مجلد public لاستعادة وتحديث المفضلة مستقلاً عن الأقسام',
    allFavorites: {
      repository: ALL_FAVORITES_FOLDER,
      totalFavoritesCount: favMovies.length,
      movieIds: favMovies.map((m) => m.id),
      sections: {
        green: green.map((m) => m.id),
        yellow: yellow.map((m) => m.id),
        purple: purple.map((m) => m.id),
        black: black.map((m) => m.id),
      },
      sectionsCount: {
        green: green.length,
        yellow: yellow.length,
        purple: purple.length,
        black: black.length,
      },
      movies: favMovies,
    },
    favoriteLists: listsToSave,
    hiddenFavoriteSections: activeHiddenSections,
  };

  // Sync to server disk /public/fav.json
  try {
    await fetch('/api/update-fav-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(favJsonData),
    });
  } catch (_) {}

  // Trigger browser download of fav.json
  const jsonString = JSON.stringify(favJsonData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fav.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert(
    `تم تصدير وحفظ ملف المفضلة المستقل (fav.json) بنجاح!\n\n` +
      `• إجمالي عناصر المفضلة المصدّرة: ${favMovies.length} عنصر\n` +
      `• أقسام المفضلة:\n` +
      `  - 🟢 مفضلة 1 خضراء: ${green.length}\n` +
      `  - 🟡 مفضلة 2 صفراء: ${yellow.length}\n` +
      `  - 🟣 مفضلة 3 بنفسجي: ${purple.length}\n` +
      `  - ⚫ مفضلة 4 أسود: ${black.length}\n` +
      `• عدد قوائم المفضلة المخصصة: ${listsToSave.length} قائمة\n\n` +
      `💡 ضع هذا الملف داخل مجلد public باسم (fav.json) لتحديث أو استعادة كافة بيانات المفضلة بصورة مستقلة تماماً عن بيانات الأقسام!`
  );
}

/**
 * Robustly fetches fav.json from server API or /fav.json with cache buster
 */
export async function fetchFavDataJson(): Promise<FavJsonData | null> {
  // 1. Try server API endpoint
  try {
    const apiRes = await fetch('/api/get-fav-data', { cache: 'no-store' });
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data && (data.allFavorites || Array.isArray(data.favoriteLists) || Array.isArray(data.movieIds))) {
        return data as FavJsonData;
      }
    }
  } catch (_) {}

  // 2. Direct candidate file paths in public
  const cacheBuster = Date.now();
  const candidates = [
    `/fav.json?v=${cacheBuster}`,
    `./fav.json?v=${cacheBuster}`,
    `/fav.json`,
    `./fav.json`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().startsWith('{')) {
          const parsed = JSON.parse(text);
          if (parsed && (parsed.allFavorites || Array.isArray(parsed.favoriteLists) || Array.isArray(parsed.movieIds))) {
            return parsed as FavJsonData;
          }
        }
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Restores and applies favorites independently from fav.json
 */
export async function restoreFavoritesFromFavJson(
  currentMovies: MovieItem[],
  currentFolders: Folder[]
): Promise<{
  updatedMovies: MovieItem[];
  updatedFavLists: FavoriteList[];
  hiddenSections?: FavoriteColor[];
  count: number;
} | null> {
  const favData = await fetchFavDataJson();
  if (!favData) {
    alert(
      'تنبيه: لم يتم العثور على ملف (fav.json) في مجلد public.\n\n' +
        'تأكد من وضع ملف المفضلة المصدّر باسم fav.json داخل مجلد public في مشروعك ثم أعد المحاولة.'
    );
    return null;
  }

  // Extract favorite movie IDs, colors, orders, and list mappings
  const favMetaMap = new Map<string, { color?: FavoriteColor; order?: number; listIds?: string[] }>();

  if (favData.allFavorites?.sections) {
    const sec = favData.allFavorites.sections;
    if (Array.isArray(sec.green)) sec.green.forEach((id) => favMetaMap.set(id, { color: 'green' }));
    if (Array.isArray(sec.yellow)) sec.yellow.forEach((id) => favMetaMap.set(id, { color: 'yellow' }));
    if (Array.isArray(sec.purple)) sec.purple.forEach((id) => favMetaMap.set(id, { color: 'purple' }));
    if (Array.isArray(sec.black)) sec.black.forEach((id) => favMetaMap.set(id, { color: 'black' }));
  }

  if (Array.isArray(favData.allFavorites?.movieIds)) {
    favData.allFavorites.movieIds.forEach((id) => {
      if (!favMetaMap.has(id)) favMetaMap.set(id, { color: 'yellow' });
    });
  }

  const incomingFavMovies: MovieItem[] = Array.isArray(favData.allFavorites?.movies)
    ? favData.allFavorites.movies
    : Array.isArray((favData as any).movies)
    ? (favData as any).movies
    : [];

  incomingFavMovies.forEach((m) => {
    if (m && m.id) {
      favMetaMap.set(m.id, {
        color: m.favoriteColor || favMetaMap.get(m.id)?.color || 'yellow',
        order: m.favoriteOrder,
        listIds: m.favoriteListIds,
      });
    }
  });

  const movieMap = new Map(currentMovies.map((m) => [m.id, { ...m }]));
  let appliedCount = 0;

  for (const [id, meta] of favMetaMap.entries()) {
    if (movieMap.has(id)) {
      const existing = movieMap.get(id)!;
      existing.isFavorite = true;
      if (meta.color) existing.favoriteColor = meta.color;
      if (meta.order !== undefined) existing.favoriteOrder = meta.order;
      if (meta.listIds) existing.favoriteListIds = meta.listIds;
      appliedCount++;
    }
  }

  // If there are favorite movies in fav.json that don't exist in currentMovies, add them
  const currentIds = new Set(currentMovies.map((m) => m.id));
  const newFavMoviesToAdd: MovieItem[] = [];
  const defaultFolderId = currentFolders[0]?.id || 'folder-default';

  for (const favM of incomingFavMovies) {
    if (favM && favM.id && !currentIds.has(favM.id)) {
      newFavMoviesToAdd.push({
        ...favM,
        parentFolderId: favM.parentFolderId || defaultFolderId,
        isFavorite: true,
        favoriteColor: favM.favoriteColor || 'yellow',
      });
      appliedCount++;
    }
  }

  const updatedMovies = [...newFavMoviesToAdd, ...Array.from(movieMap.values())];
  const updatedFavLists =
    Array.isArray(favData.favoriteLists) && favData.favoriteLists.length > 0
      ? favData.favoriteLists
      : loadFavoriteLists();
  const hiddenSections = Array.isArray(favData.hiddenFavoriteSections) ? favData.hiddenFavoriteSections : [];

  saveMovies(updatedMovies);
  saveFavoriteLists(updatedFavLists);
  try {
    localStorage.setItem('autocinema_hidden_favorite_sections', JSON.stringify(hiddenSections));
  } catch (_) {}

  // Sync back to server
  try {
    await fetch('/api/update-fav-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(favData),
    });
  } catch (_) {}

  alert(
    `تمت استعادة بيانات المفضلة بنجاح من (fav.json)!\n\n` +
      `• إجمالي عناصر المفضلة المستعادة والمحدثة: ${appliedCount} عنصر\n` +
      `• قوائم المفضلة المستعادة: ${updatedFavLists.length} قائمة`
  );

  return {
    updatedMovies,
    updatedFavLists,
    hiddenSections,
    count: appliedCount,
  };
}

/**
 * 2. Export Sections Data (initialData.json):
 * Exports all sections / folders and movies to initialData.json
 */
export async function exportSectionsData(folders: Folder[], movies: MovieItem[]): Promise<void> {
  const activeFolders = folders && folders.length > 0 ? folders : loadFolders();
  const activeMovies = movies && movies.length > 0 ? movies : loadMovies();

  const exportedAt = new Date().toISOString();

  const baseData = {
    fileName: 'initialData.json',
    isBaseData: true,
    chunkIndex: 1,
    totalChunks: 1,
    totalItemsCount: activeMovies.length,
    totalFoldersCount: activeFolders.length,
    totalItemsNotice: `الملف الأساسي الشامل لكافة الأقسام والمستودعات والمحتوى (${activeFolders.length} قسم، ${activeMovies.length} عنصر) - يُنسخ لـ public لتشغيل واستعادة كامل الأقسام`,
    appName: 'AutoCinema',
    version: '2.0',
    exportedAt,
    folders: activeFolders,
    movies: activeMovies,
  };

  // Sync to server disk /public/initialData.json
  try {
    await fetch('/api/update-initial-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appName: 'AutoCinema',
        version: '2.0',
        folders: activeFolders,
        movies: activeMovies,
        consolidateBase: true,
      }),
    });
  } catch (_) {}

  // Download initialData.json
  const jsonString = JSON.stringify(baseData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'initialData.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert(
    `تم تصدير ملف الأقسام والمستودعات (initialData.json) بنجاح!\n\n` +
      `• إجمالي الأقسام (المستودعات): ${activeFolders.length} قسم\n` +
      `• إجمالي الأفلام والمسلسلات: ${activeMovies.length} عنصر\n\n` +
      `💡 هذا هو الملف الأساسي الذي يحتوي على كافة بيانات الأقسام، ويوضع في مجلد public لاستعادة وتحديث الأقسام، بينما تُدار وتُصدّر المفضلة بصورة مستقلة عبر ملف fav.json.`
  );
}

/**
 * Consolidates all current items into initialData.json as the base dataset,
 * and clears initialData2.json.
 */
export async function consolidateBaseData(): Promise<{ success: boolean; message: string; count: number }> {
  const currentFolders = loadFolders();
  const currentMovies = loadMovies();
  const currentFavs = loadFavoriteLists();

  try {
    const res = await fetch('/api/update-initial-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appName: 'AutoCinema',
        version: '2.0',
        folders: currentFolders,
        movies: currentMovies,
        favoriteLists: currentFavs,
        consolidateBase: true,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      localStorage.setItem('autocinema_base_movie_ids', JSON.stringify(currentMovies.map((m) => m.id)));
      return { success: true, message: data.message || 'تم تثبيت الملف الأساسي بنجاح!', count: currentMovies.length };
    }
  } catch (err: any) {
    console.warn('Consolidate base API call failed:', err);
  }

  localStorage.setItem('autocinema_base_movie_ids', JSON.stringify(currentMovies.map((m) => m.id)));
  return {
    success: true,
    message: `تم تثبيت كافة العناصر (${currentMovies.length} عنصر) كملف أساسي بنجاح!`,
    count: currentMovies.length,
  };
}

export function mergeAppData(
  localData: { folders: Folder[]; movies: MovieItem[]; favoriteLists?: FavoriteList[] },
  initialData: { folders: Folder[]; movies: MovieItem[]; favoriteLists?: FavoriteList[] }
): { folders: Folder[]; movies: MovieItem[]; favoriteLists: FavoriteList[] } {
  const localFolders = localData.folders || [];
  const initialFolders = initialData.folders || [];

  const folderMap = new Map<string, Folder>();

  // 1. Add initialFolders
  initialFolders.forEach((f) => {
    if (f && f.id) {
      folderMap.set(f.id, f);
    }
  });

  // 2. Add localFolders (local overrides initialData if same folder ID, preserving user modifications)
  localFolders.forEach((f) => {
    if (f && f.id) {
      folderMap.set(f.id, f);
    }
  });

  const mergedFolders = Array.from(folderMap.values());

  // 3. Merge Movies
  const localMovies = localData.movies || [];
  const initialMovies = initialData.movies || [];

  const localMovieIds = new Set(localMovies.map((m) => m.id));
  const localMovieSignatures = new Set(
    localMovies.map((m) => `${m.parentFolderId}::${(m.url || m.embedUrl || '').trim()}::${(m.title || '').trim()}`)
  );

  const mergedMovies = [...localMovies];

  initialMovies.forEach((im) => {
    if (!im || !im.id) return;
    const sig = `${im.parentFolderId}::${(im.url || im.embedUrl || '').trim()}::${(im.title || '').trim()}`;
    if (!localMovieIds.has(im.id) && !localMovieSignatures.has(sig)) {
      mergedMovies.push(im);
      localMovieIds.add(im.id);
      localMovieSignatures.add(sig);
    }
  });

  // Self-healing check: ensure all movies have a parent folder entry
  const existingFolderIds = new Set(mergedFolders.map((f) => f.id));
  mergedMovies.forEach((m) => {
    if (m.parentFolderId === ALL_FAVORITES_FOLDER_ID) {
      const defaultId = mergedFolders.find((f) => !f.isFolderHidden && f.id !== ALL_FAVORITES_FOLDER_ID)?.id || mergedFolders[0]?.id || '';
      m.parentFolderId = defaultId;
      m.isFavorite = true;
    } else if (m.parentFolderId && !existingFolderIds.has(m.parentFolderId) && m.parentFolderId !== ALL_FAVORITES_FOLDER_ID) {
      const autoFolder: Folder = {
        id: m.parentFolderId,
        name: m.parentFolderId.startsWith('folder-') ? `مستودع (${m.parentFolderId.slice(-4)})` : m.parentFolderId,
        description: 'مستودع مستورد تلقائياً',
        color: '#8E24AA',
        sortBy: 'title',
        isFolderHidden: false,
      };
      mergedFolders.push(autoFolder);
      existingFolderIds.add(m.parentFolderId);
    }
  });

  const list1FolderIds = new Set(
    mergedFolders
      .filter((f) => {
        const name = (f.name || '').toLowerCase();
        return name.includes('list 1 fav') || name.includes('list1 fav') || name.includes('list 1fav') || name.includes('list of fav1') || name.includes('list of fav 1');
      })
      .map((f) => f.id)
  );
  const list2FolderIds = new Set(
    mergedFolders
      .filter((f) => {
        const name = (f.name || '').toLowerCase();
        return name.includes('list 2 fav') || name.includes('list2 fav') || name.includes('list 2fav') || name.includes('list of fav2') || name.includes('list of fav 2');
      })
      .map((f) => f.id)
  );
  const xxFolderIds = new Set(
    mergedFolders
      .filter((f) => {
        const name = (f.name || '').toLowerCase();
        return name.includes('xx-fav') || name.includes('xx fav') || name.includes('xxfav') || f.id.includes('xx-fav');
      })
      .map((f) => f.id)
  );

  mergedMovies.forEach((m) => {
    const isFromList1 = list1FolderIds.has(m.parentFolderId);
    const isFromList2 = list2FolderIds.has(m.parentFolderId);
    const isFromXX = xxFolderIds.has(m.parentFolderId);
    const isHighRating = m.classification === 'red' || m.classification === 'purple';

    if (m.isFavorite) {
      if (isHighRating) {
        m.favoriteColor = 'purple';
      } else if (isFromXX) {
        m.favoriteColor = 'black';
      } else if (isFromList1) {
        m.favoriteColor = 'green';
      } else if (isFromList2) {
        m.favoriteColor = 'yellow';
      } else if (!m.favoriteColor) {
        m.favoriteColor = 'yellow';
      }
    } else if (m.isFavorite === undefined) {
      if (isHighRating) {
        m.isFavorite = true;
        m.favoriteColor = 'purple';
      } else if (isFromList1) {
        m.isFavorite = true;
        m.favoriteColor = 'green';
      } else if (isFromList2) {
        m.isFavorite = true;
        m.favoriteColor = 'yellow';
      }
    }
  });

  // 4. Merge Favorite Lists
  const localFavs = localData.favoriteLists || [];
  const initialFavs = initialData.favoriteLists || [];

  const favMap = new Map<string, FavoriteList>();
  initialFavs.forEach((fav) => {
    if (fav && fav.id) {
      favMap.set(fav.id, { ...fav, movieIds: [...(fav.movieIds || [])] });
    }
  });

  localFavs.forEach((lFav) => {
    if (lFav && lFav.id) {
      const existing = favMap.get(lFav.id);
      if (existing) {
        const combinedIds = Array.from(new Set([...(lFav.movieIds || []), ...(existing.movieIds || [])]));
        favMap.set(lFav.id, { ...lFav, movieIds: combinedIds });
      } else {
        favMap.set(lFav.id, lFav);
      }
    }
  });

  const mergedFavs = Array.from(favMap.values());

  return {
    folders: mergedFolders,
    movies: mergedMovies,
    favoriteLists: mergedFavs,
  };
}

export async function checkAndAutoSeedData(): Promise<{ folders: Folder[]; movies: MovieItem[]; favoriteLists: FavoriteList[] }> {
  const localFolders = loadFolders();
  const localMovies = loadMovies();
  const localFavs = loadFavoriteLists();

  try {
    const initialData = await fetchInitialDataJson();
    if (initialData && (initialData.folders.length > 0 || initialData.movies.length > 0)) {
      const merged = mergeAppData(
        { folders: localFolders, movies: localMovies, favoriteLists: localFavs },
        initialData
      );

      // Save merged result locally so state is updated and retained
      saveFolders(merged.folders);
      saveMovies(merged.movies);
      saveFavoriteLists(merged.favoriteLists);

      const jsonExportedAt = initialData.exportedAt || new Date().toISOString();
      localStorage.setItem('autocinema_seeded_timestamp', jsonExportedAt);
      localStorage.setItem('autocinema_auto_seeded_v1', 'true');

      return merged;
    }
  } catch (e) {
    console.warn('Concurrent initialData fetch/merge skipped or failed:', e);
  }

  return {
    folders: localFolders,
    movies: localMovies,
    favoriteLists: localFavs,
  };
}

export function parseAndValidateFullAppData(jsonString: string): {
  folders: Folder[];
  movies: MovieItem[];
  favoriteLists?: FavoriteList[];
  hiddenFavoriteSections?: FavoriteColor[];
  allFavorites?: any;
  exportedAt?: string;
  isFavOnly?: boolean;
} {
  const parsed = JSON.parse(jsonString);
  let importedFolders: Folder[] = [];
  let importedMovies: MovieItem[] = [];
  let importedFavoriteLists: FavoriteList[] = [];

  const sectionColorByMovieId = new Map<string, FavoriteColor>();

  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.folders)) {
      importedFolders = parsed.folders.filter((f: any) => f && f.id !== ALL_FAVORITES_FOLDER_ID);
    }
    if (Array.isArray(parsed.movies)) {
      importedMovies = parsed.movies;
    }
    if (Array.isArray(parsed.favoriteLists)) {
      importedFavoriteLists = parsed.favoriteLists;
    }

    // Support allFavorites section in imported JSON
    if (parsed.allFavorites) {
      const allFavObj = parsed.allFavorites;
      const sections = allFavObj.sections || {};
      if (sections) {
        if (Array.isArray(sections.green)) sections.green.forEach((id: string) => sectionColorByMovieId.set(id, 'green'));
        if (Array.isArray(sections.yellow)) sections.yellow.forEach((id: string) => sectionColorByMovieId.set(id, 'yellow'));
        if (Array.isArray(sections.purple)) sections.purple.forEach((id: string) => sectionColorByMovieId.set(id, 'purple'));
        if (Array.isArray(sections.black)) sections.black.forEach((id: string) => sectionColorByMovieId.set(id, 'black'));
      }

      if (Array.isArray(allFavObj.movies)) {
        const existingMovieMap = new Map(importedMovies.map((m) => [m.id, m]));
        allFavObj.movies.forEach((favM: any) => {
          if (favM && favM.id) {
            const existing = existingMovieMap.get(favM.id);
            const favColor: FavoriteColor = favM.favoriteColor || sectionColorByMovieId.get(favM.id) || 'yellow';
            if (existing) {
              existing.isFavorite = true;
              existing.favoriteColor = favColor;
            } else {
              importedMovies.push({ ...favM, isFavorite: true, favoriteColor: favColor });
              existingMovieMap.set(favM.id, favM);
            }
          }
        });
      } else if (Array.isArray(allFavObj.movieIds)) {
        const favIdSet = new Set(allFavObj.movieIds);
        importedMovies.forEach((m) => {
          if (favIdSet.has(m.id)) {
            m.isFavorite = true;
            if (!m.favoriteColor) {
              m.favoriteColor = sectionColorByMovieId.get(m.id) || 'yellow';
            }
          }
        });
      }
    }
    if (!parsed.folders && !parsed.movies && Array.isArray(parsed)) {
      if (parsed.length > 0 && (parsed[0].parentFolderId || parsed[0].folderId)) {
        importedMovies = parsed;
      } else if (parsed.length > 0 && (parsed[0].name || parsed[0].id)) {
        importedFolders = parsed;
      }
    }
  }

  if (importedFolders.length === 0 && importedMovies.length === 0) {
    if (importedFavoriteLists.length > 0 || parsed.allFavorites) {
      // Valid fav.json standalone file
    } else {
      throw new Error('الملف لا يحتوي على بيانات مجلدات أو أفلام أو مفضلة صالحة.');
    }
  }

  // Self-healing: If movies exist with folder IDs not listed in importedFolders, create corresponding folder entries
  if (importedMovies.length > 0) {
    const existingFolderIds = new Set(importedFolders.map((f) => f.id));
    const missingFolderIds = new Set<string>();

    importedMovies.forEach((m: any) => {
      const parentId = m.parentFolderId || m.folderId;
      if (parentId && !existingFolderIds.has(parentId)) {
        missingFolderIds.add(parentId);
      }
    });

    missingFolderIds.forEach((missingId) => {
      const autoFolder: Folder = {
        id: missingId,
        name: missingId.startsWith('folder-') ? `مستودع مستورد (${missingId.slice(-4)})` : missingId,
        description: 'مستودع مستورد تلقائي لحفظ العناصر المرتبطة به',
        color: '#8E24AA',
        sortBy: 'title',
        isFolderHidden: false,
        includeInAllFavorites: true,
      };
      importedFolders.push(autoFolder);
      existingFolderIds.add(missingId);
    });
  }

  // Ensure all movies have a valid parentFolderId belonging to importedFolders
  if (importedFolders.length > 0 && importedMovies.length > 0) {
    const validFolderIds = new Set(importedFolders.map((f) => f.id));
    const defaultFolderId = importedFolders.find((f) => !f.isFolderHidden && f.id !== ALL_FAVORITES_FOLDER_ID)?.id || importedFolders[0].id;

    const list1FolderIds = new Set(
      importedFolders
        .filter((f) => {
          const name = (f.name || '').toLowerCase();
          return name.includes('list 1 fav') || name.includes('list1 fav') || name.includes('list 1fav') || name.includes('list of fav1') || name.includes('list of fav 1');
        })
        .map((f) => f.id)
    );
    const list2FolderIds = new Set(
      importedFolders
        .filter((f) => {
          const name = (f.name || '').toLowerCase();
          return name.includes('list 2 fav') || name.includes('list2 fav') || name.includes('list 2fav') || name.includes('list of fav2') || name.includes('list of fav 2');
        })
        .map((f) => f.id)
    );
    const xxFolderIds = new Set(
      importedFolders
        .filter((f) => {
          const name = (f.name || '').toLowerCase();
          return name.includes('xx-fav') || name.includes('xx fav') || name.includes('xxfav') || f.id.includes('xx-fav');
        })
        .map((f) => f.id)
    );

    importedMovies = importedMovies.map((m: any) => {
      const parentId = m.parentFolderId || m.folderId;
      const isFav = m.isFavorite === true;
      const finalParentId = (!parentId || !validFolderIds.has(parentId) || parentId === ALL_FAVORITES_FOLDER_ID)
        ? defaultFolderId
        : parentId;
      const isFinalFav = parentId === ALL_FAVORITES_FOLDER_ID ? true : isFav;
      let isItemFav = isFinalFav;

      const isFromList1 = list1FolderIds.has(finalParentId);
      const isFromList2 = list2FolderIds.has(finalParentId);
      const isFromXX = xxFolderIds.has(finalParentId);
      const isHighRating = m.classification === 'red' || m.classification === 'purple';

      let resolvedColor: FavoriteColor | undefined = m.favoriteColor || sectionColorByMovieId.get(m.id);
      if (isHighRating && (isItemFav || isFromList1 || isFromList2 || isFromXX)) {
        isItemFav = true;
        resolvedColor = 'purple';
      } else if (isFromList1) {
        isItemFav = true;
        resolvedColor = 'green';
      } else if (isFromList2) {
        isItemFav = true;
        resolvedColor = 'yellow';
      } else if (isItemFav) {
        if (isFromXX) {
          resolvedColor = 'black';
        } else if (!resolvedColor) {
          resolvedColor = 'yellow';
        }
      } else {
        resolvedColor = undefined;
      }

      return {
        ...m,
        parentFolderId: finalParentId,
        isFavorite: isItemFav,
        favoriteColor: resolvedColor,
      };
    });
  }

  return {
    folders: importedFolders,
    movies: importedMovies,
    favoriteLists: importedFavoriteLists,
    allFavorites: parsed.allFavorites,
    hiddenFavoriteSections: Array.isArray(parsed.hiddenFavoriteSections) ? parsed.hiddenFavoriteSections : undefined,
    exportedAt: parsed.exportedAt,
    isFavOnly: importedFolders.length === 0 && (importedFavoriteLists.length > 0 || Boolean(parsed.allFavorites)),
  };
}

/**
 * Returns a custom text color for specific repository names as requested:
 * - "xx-fav" -> Red (#ef4444)
 * - "list 1 fav" -> Green (#22c55e)
 * - "list 2 fav" -> Yellow (#facc15)
 */
export function getFolderTextColor(folderName: string | undefined): string | undefined {
  if (!folderName) return undefined;
  const norm = folderName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (norm.includes('xx-fav') || norm.includes('xx fav') || norm.includes('xxfav')) {
    return '#ef4444'; // Red
  }
  if (
    norm.includes('list 1 fav') ||
    norm.includes('list1 fav') ||
    norm.includes('list 1fav') ||
    norm.includes('list1-fav')
  ) {
    return '#22c55e'; // Green
  }
  if (
    norm.includes('list 2 fav') ||
    norm.includes('list2 fav') ||
    norm.includes('list 2fav') ||
    norm.includes('list2-fav')
  ) {
    return '#facc15'; // Yellow
  }
  return undefined;
}

export const CINEMA_PLAYLIST_KEY = 'autocinema_theater_playlist';

export function loadCinemaPlaylist(): import('../types').PlaylistItem[] {
  try {
    const raw = localStorage.getItem(CINEMA_PLAYLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCinemaPlaylist(playlist: import('../types').PlaylistItem[]): void {
  try {
    localStorage.setItem(CINEMA_PLAYLIST_KEY, JSON.stringify(playlist));
  } catch (e) {
    console.warn('Failed to save cinema playlist to localStorage', e);
  }
}

