// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as LucideIcons from "lucide-react";
import Hls from "hls.js";
import {
  saveCinemaPlaylistToDb,
  fetchCinemaPlaylistFromDb,
  saveAllCinemaPlaylistsToDb,
  fetchAllCinemaPlaylistsFromDb,
  deleteCinemaPlaylistFromDb,
  sanitizePlaylistItem,
  saveStreamPreferenceToDb,
  saveAllStreamPreferencesToDb,
  saveMovieToDb,
  saveAllCustomMoviesToDb,
} from "../services/firebaseDbService";
import {
  DEFAULT_CINEMA_PLAYLISTS,
  DEFAULT_ACTIVE_PLAYLIST_ID,
} from "../constants/defaultPlaylists";

export function extractYouTubeId(urlStr?: string): string | null {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const trimmed = urlStr.trim().replace(/^['"]|['"]$/g, '');
  const match = trimmed.match(/(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=|(?:shorts|live)\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (match) return match[1];
  try {
    const base = trimmed.startsWith('/') ? `http://localhost${trimmed}` : (trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const u = new URL(base);
    if (u.pathname.includes('youtube-player') || u.pathname.includes('player-embed') || u.pathname.includes('youtube')) {
      const v = u.searchParams.get('v') || u.searchParams.get('id') || u.searchParams.get('videoId');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && /^[a-zA-Z0-9_-]{11}$/.test(last)) return last;
    } else if (u.hostname.includes('youtu.be')) {
      const parts = u.pathname.split('/').filter(Boolean);
      const first = parts[0];
      if (first && /^[a-zA-Z0-9_-]{11}$/.test(first)) return first;
    }
  } catch (_) {}
  return null;
}

interface CinemaScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: any[];
  onUpdatePlaylist: (newPlaylist: any[]) => void;
  movies?: any[];
  onOpenExtractor?: (movie?: any) => void;
  initialActiveIndex?: number;
  onExportPlaylistFavJson?: (currentPlaylist?: any[], allPlaylists?: any[], activePlaylistId?: string) => void;
  onRestorePlaylistFavJson?: () => void;
  onOpenGoogleDriveSync?: () => void;
  onOpenDatabaseModal?: () => void;
  onSyncPlaylistToDb?: () => Promise<void>;
  onSyncPlaylistFromDb?: () => Promise<void>;
  fontScale?: number;
}

// Icons with safe fallback
const getIcon = (name: string, Fallback = LucideIcons.HelpCircle) =>
  (LucideIcons as any)[name] || Fallback;

const TvIcon = getIcon("Tv");
const ListVideoIcon = getIcon("ListVideo");
const PlusIcon = getIcon("Plus");
const DownloadIcon = getIcon("Download");
const RotateCcwIcon = getIcon("RotateCcw");
const CloudIcon = getIcon("Cloud");
const DatabaseIcon = getIcon("Database");
const UploadCloudIcon = getIcon("UploadCloud") || getIcon("Upload");
const DownloadCloudIcon = getIcon("DownloadCloud") || getIcon("Download");
const ArrowRightIcon = getIcon("ArrowRight");
const PlayIcon = getIcon("Play");
const PauseIcon = getIcon("Pause");
const Trash2Icon = getIcon("Trash2");
const ChevronUpIcon = getIcon("ChevronUp");
const ChevronDownIcon = getIcon("ChevronDown");
const SkipBackIcon = getIcon("SkipBack");
const SkipForwardIcon = getIcon("SkipForward");
const SlidersVerticalIcon = getIcon("SlidersVertical");
const SparklesIcon = getIcon("Sparkles");
const RefreshCwIcon = getIcon("RefreshCw");
const ExternalLinkIcon = getIcon("ExternalLink");
const Minimize2Icon = getIcon("Minimize2");
const Maximize2Icon = getIcon("Maximize2");
const CircleAlertIcon = getIcon("CircleAlert");
const CheckIcon = getIcon("Check");
const GripVerticalIcon = getIcon("GripVertical");
const TypeIcon = getIcon("Type");
const MoveHorizontalIcon = getIcon("MoveHorizontal");
const EyeIcon = getIcon("Eye");
const Volume2Icon = getIcon("Volume2");
const VolumeXIcon = getIcon("VolumeX");
const ArrowLeftIcon = getIcon("ArrowLeft");
const EditIcon = getIcon("Edit3") || getIcon("Pencil") || getIcon("Edit");
const FolderPlusIcon = getIcon("FolderPlus") || PlusIcon;
const LayersIcon = getIcon("Layers") || ListVideoIcon;
const SearchIcon = getIcon("Search") || getIcon("CircleAlert");
const CopyIcon = getIcon("Copy");
const MoreVerticalIcon = getIcon("MoreVertical");
const XIcon = getIcon("X");
const ArrowRightLeftIcon = getIcon("ArrowRightLeft") || MoveHorizontalIcon;
const FolderInputIcon = getIcon("FolderInput") || FolderPlusIcon;
const FilmIcon = getIcon("Film") || TvIcon;
const ZapIcon = getIcon("Zap") || SparklesIcon;
const ShieldCheckIcon = getIcon("ShieldCheck") || CheckIcon;
const ActivityIcon = getIcon("Activity") || RefreshCwIcon;
const ArrowUpDownIcon = getIcon("ArrowUpDown") || getIcon("ArrowDownUp") || RefreshCwIcon;
const SortAscIcon = getIcon("ArrowDownAZ") || getIcon("SortAsc") || ChevronDownIcon;
const SortDescIcon = getIcon("ArrowUpZA") || getIcon("SortDesc") || ChevronUpIcon;


const THEATER_PLAYLIST_KEY = "autocinema_theater_playlist";
const STREAM_PREFS_KEY = "autocinema_stream_preferences";
const CINEMA_PLAYLISTS_KEY = "autocinema_cinema_playlists";
const ACTIVE_PLAYLIST_ID_KEY = "autocinema_active_playlist_id";

function savePlaylistToLocalStorage(list: any[]) {
  try {
    localStorage.setItem(THEATER_PLAYLIST_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("[CinemaScreen] Failed to save playlist to localStorage", e);
  }
  try {
    if (typeof window !== "undefined" && window.indexedDB) {
      const req = window.indexedDB.open("applet_cinema_db", 1);
      req.onsuccess = () => {
        try {
          const db = req.result;
          if (db.objectStoreNames.contains("store")) {
            const tx = db.transaction("store", "readwrite");
            tx.objectStore("store").put(list, THEATER_PLAYLIST_KEY);
          }
        } catch (_) {}
      };
    }
  } catch (_) {}
}

async function syncRepairedPlaylistToBackendAndCloud(
  playlistToSync: any[],
  activePlId?: string,
  allPlaylistsToSync?: any[]
) {
  if (!Array.isArray(playlistToSync) || playlistToSync.length === 0) return;

  const targetActiveId =
    activePlId ||
    (typeof window !== "undefined"
      ? localStorage.getItem(ACTIVE_PLAYLIST_ID_KEY)
      : null) ||
    "playlist-default";

  // Harvest and build updated allPlaylists
  let targetAllPlaylists = allPlaylistsToSync;
  if (!Array.isArray(targetAllPlaylists) || targetAllPlaylists.length === 0) {
    try {
      const raw = localStorage.getItem(CINEMA_PLAYLISTS_KEY);
      if (raw) targetAllPlaylists = JSON.parse(raw);
    } catch (_) {}
  }
  if (!Array.isArray(targetAllPlaylists) || targetAllPlaylists.length === 0) {
    targetAllPlaylists = [
      {
        id: targetActiveId,
        name: "قائمة التشغيل الرئيسية",
        items: playlistToSync,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  } else {
    const idx = targetAllPlaylists.findIndex((p: any) => p.id === targetActiveId);
    if (idx !== -1) {
      targetAllPlaylists[idx] = {
        ...targetAllPlaylists[idx],
        items: playlistToSync,
        updatedAt: new Date().toISOString(),
      };
    } else {
      targetAllPlaylists.push({
        id: targetActiveId,
        name: "قائمة التشغيل الرئيسية",
        items: playlistToSync,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // 1. Persist locally to localStorage
  try {
    localStorage.setItem(THEATER_PLAYLIST_KEY, JSON.stringify(playlistToSync));
    localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(targetAllPlaylists));
    localStorage.setItem(ACTIVE_PLAYLIST_ID_KEY, targetActiveId);
  } catch (_) {}

  // 2. Persist stream preferences
  const prefs = getStreamPreferences();

  // 3. Persist immediately to Firestore cloud
  try {
    await Promise.allSettled([
      saveCinemaPlaylistToDb(playlistToSync),
      saveAllCinemaPlaylistsToDb(targetAllPlaylists, targetActiveId),
      prefs && Object.keys(prefs).length > 0 ? saveAllStreamPreferencesToDb(prefs) : Promise.resolve(),
    ]);
  } catch (err) {
    console.warn("[CinemaScreen] Firestore sync error:", err);
  }

  // 4. Persist to server /api/update-cinema-playlist (updates public/fav.json on disk)
  try {
    fetch("/api/update-cinema-playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cinemaPlaylist: playlistToSync,
        allCinemaPlaylists: targetAllPlaylists,
        activePlaylistId: targetActiveId,
        streamPreferences: prefs,
      }),
    }).catch((e) => console.warn("[CinemaScreen] Error syncing to /api/update-cinema-playlist:", e));
  } catch (_) {}

  try {
    window.dispatchEvent(new CustomEvent("autocinema:cinema-playlists-updated"));
  } catch (_) {}
}

function getStreamPreferences(): Record<string, any> {
  try {
    const raw = localStorage.getItem(STREAM_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function normalizeVideoKey(url: string | undefined): string {
  if (!url) return "";
  try {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  } catch {
    return (url || "").trim().toLowerCase();
  }
}

function saveStreamPreference(url: string | undefined, stream: any, mode?: string) {
  if (!url) return;
  try {
    const prefs = getStreamPreferences();
    const key = normalizeVideoKey(url);
    const existing = prefs[key] || {};
    const preferredMode =
      mode || existing.playbackMode || (stream?.type === "embed" ? "embed" : "direct");
    const updatedPref = {
      ...existing,
      urlKey: key,
      serverId: stream?.id || existing.serverId,
      serverName: stream?.server || existing.serverName,
      quality: stream?.quality || existing.quality,
      streamUrl: stream?.url || existing.streamUrl,
      directUrl: stream?.directUrl || existing.directUrl,
      type: stream?.type || existing.type,
      playbackMode: preferredMode,
      updatedAt: new Date().toISOString(),
    };
    prefs[key] = updatedPref;
    localStorage.setItem(STREAM_PREFS_KEY, JSON.stringify(prefs));
    saveStreamPreferenceToDb(key, updatedPref).catch(() => {});
  } catch (err) {
    console.warn("[CinemaScreen] Error saving stream preference", err);
  }
}

function findMatchingStream(streams: any[], pref: any) {
  if (!Array.isArray(streams) || streams.length === 0 || !pref) return null;
  if (pref.streamUrl || pref.directUrl) {
    const match = streams.find(
      (s) =>
        (pref.streamUrl && (s.url === pref.streamUrl || s.directUrl === pref.streamUrl)) ||
        (pref.directUrl && (s.url === pref.directUrl || s.directUrl === pref.directUrl))
    );
    if (match) return match;
  }
  if (pref.serverId) {
    const match = streams.find((s) => s.id === pref.serverId);
    if (match) return match;
  }
  if (pref.serverName) {
    const match = streams.find((s) => s.server === pref.serverName);
    if (match) return match;
  }
  return null;
}

function getStreamQualityScore(quality: string | undefined): number {
  if (!quality) return 720;
  const q = String(quality).toLowerCase().trim();
  if (/cinema/i.test(q)) return 1100;
  if (/app|تطبيق/i.test(q)) return 2000;
  if (/\b344\b|344p/i.test(q)) return 344;
  if (/\b360\b|360p/i.test(q)) return 360;
  if (/\b480\b|480p/i.test(q)) return 480;
  if (/\b720\b|720p/i.test(q)) return 720;
  if (/\b1080\b|1080p/i.test(q)) return 1080;
  if (/\b1440\b|1440p|2k/i.test(q)) return 1440;
  if (/\b2160\b|2160p|4k|uhd/i.test(q)) return 2160;
  if (/\b240\b|240p/i.test(q)) return 240;
  if (/\b144\b|144p/i.test(q)) return 144;

  const match = q.match(/(\d{3,4})p?/);
  if (match) {
    const val = parseInt(match[1], 10);
    if (val >= 144 && val <= 4320) return val;
  }
  if (/fhd|full\s*hd/i.test(q)) return 1080;
  if (/hd/i.test(q)) return 720;
  if (/sd|متوسط/i.test(q)) return 480;
  if (/منخفض|ضعيف|low/i.test(q)) return 360;
  return 720;
}

function getStreamQualityTier(qScore: number): number {
  if (qScore >= 340 && qScore <= 349) return 1; // 1st priority: 344p
  if (qScore >= 350 && qScore <= 380) return 2; // 2nd priority: 360p
  if (qScore > 380 && qScore <= 540) return 3;  // 3rd priority: 480p
  if (qScore > 540 && qScore <= 800) return 4;  // 4th priority: 720p
  if (qScore > 800 && qScore <= 1080) return 5; // 5th priority: 1080p
  if (qScore > 1080 && qScore <= 1200) return 6; // 6th priority: Cinema player
  if (qScore > 1200 && qScore < 2000) return 7; // 7th priority: 1440p / 2160p / 4K
  if (qScore >= 2000) return 8;                 // 8th priority: App / Popout
  return 9;                                     // 9th priority: < 340p (240p, 144p)
}

function sortStreamsAscending(streams: any[]): any[] {
  return sortStreamsByQualityTiersAscending(streams);
}

function pickDefaultQualityStream(streams: any[], userPref?: any): any {
  if (!Array.isArray(streams) || streams.length === 0) return null;
  if (userPref) {
    const matched = findMatchingStream(streams, userPref);
    if (matched) return matched;
  }
  // Check YouTube streams first - always prioritize preferred YouTube stream or YouTube 1080p player
  const ytPreferred = streams.find(
    (s) =>
      s &&
      s.preferred &&
      (s.isYouTube ||
        extractYouTubeId(s.url) ||
        extractYouTubeId(s.directUrl) ||
        s.url?.includes('/api/youtube-player'))
  );
  if (ytPreferred) return ytPreferred;

  const preferred = streams.find((s) => s && s.preferred);
  if (preferred) return preferred;
  const sorted = sortStreamsByQualityTiersAscending(streams);
  return sorted[0] || streams[0];
}

/**
 * Selects an alternative stream strictly in user order: 344 -> 360 -> 480 -> 720 -> 1080.
 * Filters out failing stream by URL and id.
 */
function pickLowerQualityAlternativeStream(
  streams: any[],
  failingUrl?: string,
  failingId?: string
): any {
  if (!Array.isArray(streams) || streams.length === 0) return null;
  const sorted = sortStreamsByQualityTiersAscending(streams, failingUrl, failingId);
  return sorted[0] || null;
}

/**
 * Sorts streams strictly adhering to user specification:
 * Starts from 344 -> then 360 -> then 480 -> then 720 -> then 1080 -> then 1440/4K -> then < 340.
 */
function sortStreamsByQualityTiersAscending(
  streams: any[],
  failingUrl?: string,
  failingId?: string
): any[] {
  if (!Array.isArray(streams) || streams.length === 0) return [];
  const cleanFail = (failingUrl || "").trim().toLowerCase();

  // Deduplicate streams by ID and URL so identical streams never repeat
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const deduped: any[] = [];
  for (const s of streams) {
    if (!s) continue;
    const sId = String(s.id || "").trim();
    const sUrl = String(s.url || s.directUrl || "").trim().toLowerCase();
    if (sId && seenIds.has(sId)) continue;
    if (sUrl && seenUrls.has(sUrl)) continue;
    if (sId) seenIds.add(sId);
    if (sUrl) seenUrls.add(sUrl);
    deduped.push(s);
  }

  const pool = deduped.filter((s) => {
    if (!s) return false;
    if (failingId && s.id === failingId) return false;
    if (cleanFail) {
      const u = (s.url || "").trim().toLowerCase();
      const d = (s.directUrl || "").trim().toLowerCase();
      if (u === cleanFail || d === cleanFail) return false;
    }
    return true;
  });
  const candidates = pool.length > 0 ? pool : deduped;

  return [...candidates].sort((a, b) => {
    // 0. Preferred streams always sort first
    if (a?.preferred && !b?.preferred) return -1;
    if (!a?.preferred && b?.preferred) return 1;

    const scoreA = getStreamQualityScore(a?.quality);
    const scoreB = getStreamQualityScore(b?.quality);
    const tierA = getStreamQualityTier(scoreA);
    const tierB = getStreamQualityTier(scoreB);

    // 1. Strict tier order: 344 (tier 1) -> 360 (tier 2) -> 480 (tier 3) -> 720 (tier 4) -> 1080 (tier 5)
    if (tierA !== tierB) return tierA - tierB;
    if (scoreA !== scoreB) return scoreA - scoreB;

    // 2. Official YouTube player bridge
    const isYtBridgeA = a?.url?.includes('/api/youtube-player') || a?.directUrl?.includes('/api/youtube-player');
    const isYtBridgeB = b?.url?.includes('/api/youtube-player') || b?.directUrl?.includes('/api/youtube-player');
    if (isYtBridgeA && !isYtBridgeB) return -1;
    if (!isYtBridgeA && isYtBridgeB) return 1;

    // 3. Within same tier, prefer direct HLS/MP4 streams
    const isDirectA = a?.type === "hls" || a?.type === "mp4" || a?.url?.includes(".m3u8") || a?.directUrl?.includes(".m3u8");
    const isDirectB = b?.type === "hls" || b?.type === "mp4" || b?.url?.includes(".m3u8") || b?.directUrl?.includes(".m3u8");
    if (isDirectA && !isDirectB) return -1;
    if (!isDirectA && isDirectB) return 1;
    return 0;
  });
}

export interface CinemaPlaylistGroup {
  id: string;
  name: string;
  items: any[];
  createdAt: string;
  updatedAt?: string;
}

// Extract year from movie title (e.g. 2025, 2024, 1999)
function extractYearFromTitle(title: string | undefined): string | null {
  if (!title) return null;
  const match = title.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? match[1] : null;
}

// Helper: Extract clean title from URL slug as reliable fallback
function extractSlugTitleFromUrl(urlStr: string | undefined): string {
  if (!urlStr) return "";
  try {
    const parsed = new URL(urlStr);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const lastPart = parts.pop() || "";
    if (lastPart) {
      const decoded = decodeURIComponent(lastPart)
        .replace(/\.(html|php|mp4|m3u8|webm)$/i, "")
        .replace(/[-_+]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (decoded && !/^(embed|watch|video|see|e|play|v|f|index|movie|series)$/i.test(decoded)) {
        return decoded;
      }
    }
  } catch (_) {}
  return "";
}

// Smart movie title resolver that guarantees no movie shows as "بدون عنوان"
function resolveSmartMovieTitle(item: any, moviesList?: any[]): string {
  if (!item) return "فيلم سينما";
  const cand = (item.movieTitle || item.title || item.name || item.filmTitle || "").trim();
  const isUntitled = !cand || cand === "بدون عنوان" || cand === "فيلم بدون عنوان" || cand === "undefined" || cand === "null";

  if (!isUntitled) {
    return cand.replace(/\s+/g, " ");
  }

  // 1. Try finding in global movies catalog by movieId
  if (item.movieId && Array.isArray(moviesList)) {
    const found = moviesList.find((m) => m.id === item.movieId);
    if (found && (found.title || found.name)) {
      return (found.title || found.name).trim();
    }
  }

  // 2. Try finding in global movies catalog by originalUrl or url
  const itemUrl = item.originalUrl || item.url || item.embedUrl;
  if (itemUrl && Array.isArray(moviesList)) {
    const norm = normalizeVideoKey(itemUrl);
    const found = moviesList.find(
      (m) =>
        (m.url && normalizeVideoKey(m.url) === norm) ||
        (m.embedUrl && normalizeVideoKey(m.embedUrl) === norm)
    );
    if (found && (found.title || found.name)) {
      return (found.title || found.name).trim();
    }
  }

  // 3. Extract title from URL slug
  const fromSlug = extractSlugTitleFromUrl(itemUrl);
  if (fromSlug) return fromSlug;

  // 4. Extract from stream URL if available
  if (item.selectedStream?.directUrl || item.selectedStream?.url) {
    const streamSlug = extractSlugTitleFromUrl(item.selectedStream.directUrl || item.selectedStream.url);
    if (streamSlug) return streamSlug;
  }

  return "فيلم سينما";
}

// Clean movie title for high-legibility display with catalog & slug fallback
function formatCleanMovieTitle(rawTitle: string | undefined, itemFallback?: any, moviesList?: any[]): string {
  if (!rawTitle || rawTitle === "بدون عنوان" || rawTitle === "فيلم بدون عنوان") {
    if (itemFallback) {
      return resolveSmartMovieTitle(itemFallback, moviesList);
    }
    return "فيلم سينما";
  }
  let t = rawTitle.trim();
  t = t.replace(/\s+/g, " ");
  return t;
}

// Resolve true origin movie page URL for re-extraction from provider
function resolveItemMovieSourceUrl(item: any, moviesList?: any[]): string | null {
  if (!item) return null;
  const isDirectMedia = (u?: string) => {
    if (!u) return false;
    const l = u.toLowerCase();
    return (
      l.includes(".m3u8") ||
      l.includes("/hls/") ||
      l.includes(".mp4") ||
      l.startsWith("/api/stream-proxy") ||
      l.startsWith("/api/player-embed")
    );
  };

  // 1. Try originalUrl if not a raw CDN/media link
  if (item.originalUrl && !isDirectMedia(item.originalUrl)) {
    return item.originalUrl.trim();
  }

  // 2. Try looking up in global movies catalog by movieId
  if (item.movieId && Array.isArray(moviesList)) {
    const found = moviesList.find((m) => m.id === item.movieId);
    if (found) {
      if (found.url && !isDirectMedia(found.url)) return found.url.trim();
      if (found.embedUrl && !isDirectMedia(found.embedUrl)) return found.embedUrl.trim();
    }
  }

  // 3. Try matching title in global movies catalog
  const cleanTitle = (item.movieTitle || item.title || "").trim().toLowerCase();
  if (cleanTitle && Array.isArray(moviesList)) {
    const found = moviesList.find(
      (m) =>
        (m.title && m.title.trim().toLowerCase() === cleanTitle) ||
        (m.name && m.name.trim().toLowerCase() === cleanTitle)
    );
    if (found) {
      if (found.url && !isDirectMedia(found.url)) return found.url.trim();
      if (found.embedUrl && !isDirectMedia(found.embedUrl)) return found.embedUrl.trim();
    }
  }

  // 4. Try item.url if not a direct media link
  if (item.url && !isDirectMedia(item.url)) {
    return item.url.trim();
  }

  // 5. Try item.embedUrl if not a direct media link
  if (item.embedUrl && !isDirectMedia(item.embedUrl)) {
    return item.embedUrl.trim();
  }

  // 6. As fallback, return originalUrl or url even if it looks like a media link
  return item.originalUrl || item.url || null;
}

// Determine the actual media URL for direct playback (m3u8 / mp4)
function getPlayableDirectUrl(stream: any, movie: any): string {
  if (!stream && !movie) return "";
  const candDirect = (stream?.directUrl || "").trim();
  const candUrl = (stream?.url || "").trim();

  // YouTube streams cannot be played directly via HTML5 video tag; must use embed player
  if (
    extractYouTubeId(candUrl) ||
    extractYouTubeId(candDirect) ||
    extractYouTubeId(movie?.originalUrl) ||
    extractYouTubeId(movie?.url)
  ) {
    return "";
  }

  // If already a proxied direct stream URL, return immediately
  if (candUrl && candUrl.startsWith("/api/stream-proxy")) return candUrl;
  if (candDirect && candDirect.startsWith("/api/stream-proxy")) return candDirect;

  // If stream is marked embed, check if candDirect is m3u8 or if movie.allStreams has a direct stream
  if (stream?.type === "embed") {
    if (candDirect && (candDirect.includes(".m3u8") || candDirect.includes("/hls/") || /\.(mp4|webm|mkv)/i.test(candDirect))) {
      return candDirect;
    }
    if (Array.isArray(movie?.allStreams)) {
      const direct = movie.allStreams.find(
        (s: any) =>
          s.type === "hls" ||
          s.type === "mp4" ||
          s.url?.includes(".m3u8") ||
          s.url?.includes("/hls/") ||
          s.url?.startsWith("/api/stream-proxy") ||
          s.directUrl?.includes(".m3u8") ||
          s.directUrl?.includes("/hls/") ||
          s.directUrl?.startsWith("/api/stream-proxy")
      );
      if (direct) {
        return (direct.directUrl || direct.url || "").trim();
      }
    }
    // Also if candUrl is a Vidmoly embed URL, the stream proxy can resolve it directly
    if (candUrl && /vidmoly\.(?:biz|net|me|to)\/embed-/i.test(candUrl)) {
      return candUrl;
    }
    return "";
  }

  // If candDirect is a media file, prefer it
  if (candDirect && (candDirect.includes(".m3u8") || candDirect.includes("/hls/") || /\.(mp4|webm|mkv)/i.test(candDirect))) {
    return candDirect;
  }
  // If candUrl is a media file, prefer it
  if (candUrl && (candUrl.includes(".m3u8") || candUrl.includes("/hls/") || /\.(mp4|webm|mkv)/i.test(candUrl))) {
    return candUrl;
  }
  // If stream type is hls or mp4, prefer candDirect if available and not an html embed page
  if (
    (stream?.type === "hls" || stream?.type === "mp4") &&
    candDirect &&
    !candDirect.includes("embed") &&
    !candDirect.endsWith(".html")
  ) {
    return candDirect;
  }
  // If URL is a Vidmoly URL, stream-proxy resolves it directly to master.m3u8
  if (candUrl && /vidmoly\.(?:biz|net|me|to)/i.test(candUrl)) {
    return candUrl;
  }
  return candUrl && !candUrl.endsWith(".html") ? candUrl : "";
}

// Ensure third-party CDN streams with CORS/Referer restrictions go through the stream proxy
function getCORSProxiedMediaUrl(rawMediaUrl: string): string {
  if (!rawMediaUrl) return "";
  if (rawMediaUrl.startsWith("/api/stream-proxy") || rawMediaUrl.startsWith("/api/embed-proxy") || rawMediaUrl.startsWith("/api/player-embed")) {
    return rawMediaUrl;
  }
  // Domains that require proxy headers for CORS & byte ranges
  const needsProxy =
    /vmpx\.online|vidmoly|vmeas\.cloud|staticmoly|uqload|luluvdo|sprintcdn|r66nv9ed|owphbf24|byse|bysetayico|bysesukior|mxcontent|mixdrop|tapecontent|streamtape|vstm\.shop|naturee\.site/i.test(
      rawMediaUrl
    ) || rawMediaUrl.includes(".m3u8") || rawMediaUrl.includes("/hls/");

  if (needsProxy && rawMediaUrl.startsWith("http")) {
    return `/api/stream-proxy?url=${encodeURIComponent(rawMediaUrl)}`;
  }
  return rawMediaUrl;
}

// Determine safe embed URL with anti-ad / anti-framebuster proxy when needed
function getPlayableEmbedUrl(stream: any, movie: any): string {
  let rawUrl = (stream?.url || stream?.directUrl || movie?.originalUrl || movie?.url || "").trim();
  if (!rawUrl) return "";

  // Direct YouTube Handler:
  if (rawUrl.startsWith("/api/youtube-player")) {
    return rawUrl;
  }
  if (rawUrl.startsWith("https://www.youtube.com/embed/")) {
    return rawUrl;
  }

  const ytId =
    extractYouTubeId(rawUrl) ||
    extractYouTubeId(stream?.directUrl) ||
    extractYouTubeId(movie?.originalUrl) ||
    extractYouTubeId(movie?.url);
  if (ytId) {
    return `https://www.youtube.com/embed/${ytId}?enablejsapi=1&playsinline=1&rel=0`;
  }

  if (rawUrl.startsWith("/api/player-embed")) {
    return rawUrl;
  }

  // If stream is marked direct/HLS, check if an underlying clean embed URL or alternative embed server exists
  if (stream?.type === "hls" || stream?.type === "mp4" || rawUrl.includes(".m3u8") || rawUrl.includes("/hls/") || rawUrl.startsWith("/api/stream-proxy")) {
    // If stream has a clean directUrl pointing to an embed page (e.g. /e/ or player link)
    if (
      stream?.directUrl &&
      (stream.directUrl.startsWith("http://") || stream.directUrl.startsWith("https://")) &&
      !stream.directUrl.includes(".m3u8") &&
      !stream.directUrl.includes("/hls/") &&
      !/\.(mp4|ts|jpg|vtt)/i.test(stream.directUrl)
    ) {
      try {
        const parsed = new URL(stream.directUrl);
        if (parsed.hostname && parsed.hostname.includes(".")) {
          const ref = movie?.originalUrl || stream.directUrl;
          return `/api/embed-proxy?url=${encodeURIComponent(stream.directUrl)}&ref=${encodeURIComponent(ref)}`;
        }
      } catch (_) {}
    }
    // Check if movie.allStreams has an alternative embed player
    if (Array.isArray(movie?.allStreams)) {
      const embedCandidate = movie.allStreams.find((s: any) => s.type === "embed" && s.url && !s.url.startsWith("/api/player-embed"));
      if (embedCandidate) {
        const target = (embedCandidate.directUrl || embedCandidate.url || "").trim();
        if (target.startsWith("/api/embed-proxy")) return target;
        if (target.startsWith("http://") || target.startsWith("https://")) {
          try {
            const parsedTarget = new URL(target);
            if (parsedTarget.hostname && parsedTarget.hostname.includes(".")) {
              const ref = movie?.originalUrl || target;
              return `/api/embed-proxy?url=${encodeURIComponent(target)}&ref=${encodeURIComponent(ref)}`;
            }
          } catch (_) {}
        }
      }
    }
    const title = movie?.movieTitle || movie?.title || stream?.server || "مشغل الفيديو";
    const poster = movie?.posterUrl || "";
    const sub = stream?.subtitles?.[0]?.file || "";
    return `/api/player-embed?url=${encodeURIComponent(rawUrl)}&title=${encodeURIComponent(title)}&poster=${encodeURIComponent(poster)}&sub=${encodeURIComponent(sub)}`;
  }

  if (rawUrl.startsWith("/api/embed-proxy")) {
    return rawUrl;
  }

  // Hosts known to break inside iframes due to framebusters or sandbox detectors
  const needsEmbedProxy =
    /abyssplayer|abyss\.to|iamcdn|vidmoly|vmpx|vstm\.shop|naturee\.site|playmogo|dood|ds2play|uqload/i.test(
      rawUrl
    );

  if (needsEmbedProxy && rawUrl.startsWith("http")) {
    const ref = movie?.originalUrl || rawUrl;
    return `/api/embed-proxy?url=${encodeURIComponent(rawUrl)}&ref=${encodeURIComponent(ref)}`;
  }
  return rawUrl;
}

export function CinemaScreenModal({
  isOpen,
  onClose,
  playlist,
  onUpdatePlaylist,
  movies = [],
  onOpenExtractor,
  initialActiveIndex = 0,
  onExportPlaylistFavJson,
  onRestorePlaylistFavJson,
  onOpenGoogleDriveSync,
  onOpenDatabaseModal,
  onSyncPlaylistToDb,
  onSyncPlaylistFromDb,
  fontScale = 100,
}: CinemaScreenModalProps) {
  // -------------------------------------------------------------
  // States
  // -------------------------------------------------------------
  const [showServersBar, setShowServersBar] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<"direct" | "embed">("direct");
  const [autoNext, setAutoNext] = useState(true);
  const [showPlaylist, setShowPlaylist] = useState(true);
  const [showPlaylistTools, setShowPlaylistTools] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  const [healingSuccessToast, setHealingSuccessToast] = useState<string | null>(null);
  const [selectedStreamOverride, setSelectedStreamOverride] = useState<any | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const replacedStreamRef = useRef<any>(null);

  // Cloud Playlist Sync States & Handlers
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudNotice, setCloudNotice] = useState<{ status: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Automatic Link Health Checking & Auto-Repair States
  const [isCheckingPlaylist, setIsCheckingPlaylist] = useState(false);
  const [isCheckPaused, setIsCheckPaused] = useState(false);
  const [playlistCheckProgress, setPlaylistCheckProgress] = useState<{
    current: number;
    total: number;
    fixedCount: number;
    currentTitle: string;
  } | null>(null);
  const [autoReplaceOnDefect, setAutoReplaceOnDefect] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("autocinema_auto_replace_broken_links");
      return stored !== null ? stored === "true" : true;
    } catch {
      return true;
    }
  });
  const stallTimeoutRef = useRef<any>(null);
  const normalLoadWatchdogRef = useRef<any>(null);
  const hasPlaybackStartedRef = useRef<boolean>(false);
  const lastHealedMovieKeyRef = useRef<string>("");
  const cancelCheckRef = useRef(false);
  const isCheckPausedRef = useRef(false);

  const handlePauseCheck = useCallback(() => {
    isCheckPausedRef.current = true;
    setIsCheckPaused(true);
    setCloudNotice({
      status: "info",
      text: "⏸️ تم إيقاف الفحص والتحديث مؤقتاً. يمكنك الآن تجربة السيرفرات أو تعديل الفيلم في شاشة العرض، ثم اضغط [استئناف الفحص] للمتابعة.",
    });
  }, []);

  const handleResumeCheck = useCallback(() => {
    isCheckPausedRef.current = false;
    setIsCheckPaused(false);
    setCloudNotice({
      status: "success",
      text: "▶️ تم استئناف فحص وتحديث قائمة التشغيل تلقائياً...",
    });
    setTimeout(() => setCloudNotice(null), 3000);
  }, []);

  const handleCancelCheck = useCallback(() => {
    cancelCheckRef.current = true;
    isCheckPausedRef.current = false;
    setIsCheckPaused(false);
    setIsCheckingPlaylist(false);
    setPlaylistCheckProgress(null);
  }, []);

  const toggleAutoReplaceOnDefect = () => {
    const nextVal = !autoReplaceOnDefect;
    setAutoReplaceOnDefect(nextVal);
    try {
      localStorage.setItem("autocinema_auto_replace_broken_links", String(nextVal));
    } catch (_) {}
  };

  // -------------------------------------------------------------
  // Multiple Playlists State Management
  // -------------------------------------------------------------
  const [playlists, setPlaylists] = useState<CinemaPlaylistGroup[]>(() => {
    try {
      const saved = localStorage.getItem(CINEMA_PLAYLISTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 1) {
          return parsed;
        }
      }
    } catch (_) {}
    return DEFAULT_CINEMA_PLAYLISTS;
  });

  const [activePlaylistId, setActivePlaylistId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_PLAYLIST_ID_KEY);
      if (saved) return saved;
    } catch (_) {}
    return DEFAULT_ACTIVE_PLAYLIST_ID;
  });

  // Ensure default playlists exist in localStorage only if completely uninitialized
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CINEMA_PLAYLISTS_KEY);
      if (!saved) {
        localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(DEFAULT_CINEMA_PLAYLISTS));
        localStorage.setItem(ACTIVE_PLAYLIST_ID_KEY, DEFAULT_ACTIVE_PLAYLIST_ID);
      }
    } catch (_) {}
  }, []);

  const [isNewPlaylistModalOpen, setIsNewPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistCopyFromCurrent, setNewPlaylistCopyFromCurrent] = useState(false);
  const [isRenamePlaylistModalOpen, setIsRenamePlaylistModalOpen] = useState(false);
  const [renamePlaylistName, setRenamePlaylistName] = useState("");
  const [isRenameMovieOpen, setIsRenameMovieOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editMovieTitleInput, setEditMovieTitleInput] = useState("");
  const [moveTargetPlaylistId, setMoveTargetPlaylistId] = useState<string>("");
  const [moveActionType, setMoveActionType] = useState<"move" | "copy">("move");
  const [isCreatingNewPlaylistInline, setIsCreatingNewPlaylistInline] = useState<boolean>(false);
  const [inlineNewPlaylistName, setInlineNewPlaylistName] = useState<string>("");
  const [switchAfterTransfer, setSwitchAfterTransfer] = useState<boolean>(false);
  const [playlistSearchTerm, setPlaylistSearchTerm] = useState("");
  const [playlistSortMode, setPlaylistSortMode] = useState<"manual" | "name-asc" | "name-desc">(() => {
    try {
      return (localStorage.getItem("autocinema_playlist_sort_mode") as any) || "manual";
    } catch {
      return "manual";
    }
  });

  // Drag & drop state for horizontal reordering of playlist tabs
  const [draggedPlaylistId, setDraggedPlaylistId] = useState<string | null>(null);
  const [dragOverPlaylistId, setDragOverPlaylistId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after">("before");
  const isDraggingTabRef = useRef<boolean>(false);

  // Strict deduplication helper to ensure no movie is added twice to the same playlist
  const deduplicatePlaylistItems = useCallback((items: any[]): any[] => {
    if (!Array.isArray(items) || items.length <= 1) return items || [];
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();
    const result: any[] = [];

    for (const item of items) {
      if (!item) continue;
      const mId = (item.movieId || item.id || "").toString().trim();
      const origUrl = item.originalUrl ? normalizeVideoKey(item.originalUrl) : "";
      const streamUrl = (item.selectedStream?.url || item.url || item.directUrl || item.streamUrl)
        ? normalizeVideoKey(item.selectedStream?.url || item.url || item.directUrl || item.streamUrl)
        : "";
      const cleanTitle = (item.movieTitle || item.title || "").trim().toLowerCase();

      let isDup = false;
      if (mId && seenIds.has(mId)) isDup = true;
      else if (origUrl && seenUrls.has(origUrl)) isDup = true;
      else if (streamUrl && seenUrls.has(streamUrl)) isDup = true;
      else if (cleanTitle && cleanTitle.length > 2 && seenTitles.has(cleanTitle)) isDup = true;

      if (!isDup) {
        if (mId) seenIds.add(mId);
        if (origUrl) seenUrls.add(origUrl);
        if (streamUrl) seenUrls.add(streamUrl);
        if (cleanTitle && cleanTitle.length > 2) seenTitles.add(cleanTitle);
        result.push(item);
      } else {
        // Upgrade existing item with better repaired streams if present
        const existingIdx = result.findIndex((ex) =>
          (mId && (ex.movieId === mId || ex.id === mId)) ||
          (origUrl && ex.originalUrl && normalizeVideoKey(ex.originalUrl) === origUrl) ||
          (cleanTitle && (ex.movieTitle || ex.title || "").trim().toLowerCase() === cleanTitle)
        );
        if (existingIdx !== -1) {
          const ex = result[existingIdx];
          if ((!ex.allStreams || ex.allStreams.length === 0) && item.allStreams && item.allStreams.length > 0) {
            result[existingIdx] = { ...ex, allStreams: item.allStreams };
          }
          if (!ex.selectedStream && item.selectedStream) {
            result[existingIdx] = { ...result[existingIdx], selectedStream: item.selectedStream, selectedQuality: item.selectedQuality, selectedServer: item.selectedServer };
          }
        }
      }
    }
    return result;
  }, []);

  // Handle re-ordering / sorting the playlist by Name or Manual Addition
  const handleSortPlaylist = useCallback((mode: "manual" | "name-asc" | "name-desc") => {
    setPlaylistSortMode(mode);
    try {
      localStorage.setItem("autocinema_playlist_sort_mode", mode);
    } catch (_) {}

    if (!Array.isArray(playlist) || playlist.length <= 1) return;

    const currentPlayingItem = playlist[activeIndex];
    const sorted = [...playlist];

    if (mode === "name-asc") {
      sorted.sort((a, b) => {
        const titleA = formatCleanMovieTitle(a?.movieTitle || a?.title, a, movies);
        const titleB = formatCleanMovieTitle(b?.movieTitle || b?.title, b, movies);
        return titleA.localeCompare(titleB, "ar", { sensitivity: "base", numeric: true });
      });
    } else if (mode === "name-desc") {
      sorted.sort((a, b) => {
        const titleA = formatCleanMovieTitle(a?.movieTitle || a?.title, a, movies);
        const titleB = formatCleanMovieTitle(b?.movieTitle || b?.title, b, movies);
        return titleB.localeCompare(titleA, "ar", { sensitivity: "base", numeric: true });
      });
    } else if (mode === "manual") {
      // Sort by manual addition: preserve original order / addedAt timestamp
      sorted.sort((a, b) => {
        const tA = a?.addedAt ? new Date(a.addedAt).getTime() : 0;
        const tB = b?.addedAt ? new Date(b.addedAt).getTime() : 0;
        if (tA && tB && tA !== tB) return tA - tB;
        return 0;
      });
    }

    // Keep active playing item selected
    let newActiveIdx = activeIndex;
    if (currentPlayingItem) {
      const foundIdx = sorted.findIndex(
        (it) =>
          it.id === currentPlayingItem.id ||
          (it.movieId && it.movieId === currentPlayingItem.movieId) ||
          (it.originalUrl && it.originalUrl === currentPlayingItem.originalUrl) ||
          ((it.movieTitle || it.title) && (it.movieTitle || it.title) === (currentPlayingItem.movieTitle || currentPlayingItem.title))
      );
      if (foundIdx !== -1) {
        newActiveIdx = foundIdx;
      }
    }

    setActiveIndex(newActiveIdx);
    onUpdatePlaylist(sorted);
    savePlaylistToLocalStorage(sorted);

    const nextPlaylists = playlists.map((p) =>
      p.id === activePlaylistId
        ? { ...p, items: sorted, updatedAt: new Date().toISOString() }
        : p
    );
    setPlaylists(nextPlaylists);
    try {
      localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
    } catch (_) {}

    saveCinemaPlaylistToDb(sorted, newActiveIdx).catch((err) => console.warn(err));
    saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch((err) => console.warn(err));

    const sortLabels: Record<string, string> = {
      "manual": "وفقاً للإضافة اليدوية 📌",
      "name-asc": "وفقاً للاسم (أ - ي) 🔤",
      "name-desc": "وفقاً للاسم (ي - أ) 🔤",
    };
    setCloudNotice({
      status: "success",
      text: `✓ تم إعادة ترتيب قائمة التشغيل ${sortLabels[mode] || mode}`,
    });
    setTimeout(() => setCloudNotice(null), 3000);
  }, [playlist, activeIndex, activePlaylistId, playlists, onUpdatePlaylist, movies]);

  const activePlaylist = useMemo(() => {
    const found = playlists.find((p) => p.id === activePlaylistId);
    return found || playlists[0] || { id: "playlist-default", name: "قائمة التشغيل الرئيسية", items: [] };
  }, [playlists, activePlaylistId]);

  const handleRestoreDefaultPlaylist = useCallback(() => {
    const defaultGroup = DEFAULT_CINEMA_PLAYLISTS.find((p) => p.id === activePlaylistId) || DEFAULT_CINEMA_PLAYLISTS[0];
    const defaultItems = defaultGroup?.items || [];
    if (defaultItems.length === 0) return;

    if (typeof onUpdatePlaylist === "function") {
      onUpdatePlaylist(defaultItems);
    }
    savePlaylistToLocalStorage(defaultItems);

    const nextPlaylists = playlists.map((p) =>
      p.id === activePlaylistId ? { ...p, items: defaultItems, updatedAt: new Date().toISOString() } : p
    );
    if (!nextPlaylists.some((p) => p.id === activePlaylistId)) {
      nextPlaylists.unshift({
        id: activePlaylistId,
        name: defaultGroup.name || "أساسية",
        items: defaultItems,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    setPlaylists(nextPlaylists);
    try {
      localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
      localStorage.setItem(ACTIVE_PLAYLIST_ID_KEY, activePlaylistId);
    } catch (_) {}

    saveCinemaPlaylistToDb(defaultItems, 0).catch(() => {});
    saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch(() => {});
    setCloudNotice({
      status: "success",
      text: `✓ تم استعادة عناصر قائمة "${defaultGroup.name}" الافتراضية بنجاح (${defaultItems.length} فيلماً بسيرفرات البث)!`,
    });
    setTimeout(() => setCloudNotice(null), 4000);
  }, [activePlaylistId, onUpdatePlaylist, playlists]);

  // Keep playlists synced when incoming playlist prop updates from outside or when cloud sync updates
  useEffect(() => {
    const handleCloudPlaylistsUpdated = () => {
      try {
        const saved = localStorage.getItem(CINEMA_PLAYLISTS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPlaylists(parsed);
          }
        }
        const savedActiveId = localStorage.getItem(ACTIVE_PLAYLIST_ID_KEY);
        if (savedActiveId) {
          setActivePlaylistId(savedActiveId);
        }
      } catch (_) {}
    };

    window.addEventListener("autocinema:cinema-playlists-updated", handleCloudPlaylistsUpdated);
    return () => {
      window.removeEventListener("autocinema:cinema-playlists-updated", handleCloudPlaylistsUpdated);
    };
  }, []);

  // Listen for replaced stream playback events (when user re-extracts and replaces in playlist from extractor modal)
  useEffect(() => {
    const applyReplacedStream = (detail: any) => {
      if (!detail) return;
      const { index, stream, mode, movie } = detail;
      const chosenStream = stream || movie?.selectedStream;
      replacedStreamRef.current = chosenStream;

      if (typeof index === "number" && index >= 0) {
        setActiveIndex(index);
      }

      if (chosenStream) {
        setSelectedStreamOverride(chosenStream);
      }

      const effectiveMode =
        mode ||
        (chosenStream?.type === "embed"
          ? "embed"
          : chosenStream?.type === "hls" ||
            chosenStream?.type === "mp4" ||
            chosenStream?.url?.includes(".m3u8") ||
            chosenStream?.url?.includes("/hls/")
          ? "direct"
          : "direct");

      setPlaybackMode(effectiveMode);
      setErrorMessage(null);
      hasPlaybackStartedRef.current = false;
      setIsPlaying(true);
      setReloadCounter((c) => c + 1);

      const sName = chosenStream?.server || "السيرفر";
      const sQuality = chosenStream?.quality || "HD";
      setHealingSuccessToast(`✓ تم بنجاح استبدال وتحديث الرابط وتشغيله فوراً على الشاشة (${sName} - ${sQuality})! ⚡`);
      setTimeout(() => setHealingSuccessToast(null), 4500);

      // Force video element to play immediately if direct mode
      setTimeout(() => {
        const vid = videoRef.current;
        if (vid && effectiveMode === "direct") {
          vid.play().then(() => {
            hasPlaybackStartedRef.current = true;
            setIsPlaying(true);
            setErrorMessage(null);
          }).catch(() => {
            vid.muted = true;
            setIsMuted(true);
            vid.play().then(() => {
              hasPlaybackStartedRef.current = true;
              setIsPlaying(true);
            }).catch(() => {});
          });
        }
      }, 150);

      // Auto-scroll playlist item into view
      setTimeout(() => {
        if (playlistContainerRef.current) {
          const activeEl = playlistContainerRef.current.querySelector("[data-active='true']");
          if (activeEl) {
            activeEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
          }
        }
      }, 200);
    };

    const handlePlayReplacedStream = (evt: any) => {
      applyReplacedStream(evt?.detail);
    };

    window.addEventListener("autocinema:play-replaced-stream", handlePlayReplacedStream as EventListener);

    if ((window as any).__autocinema_pending_replaced_stream) {
      const pending = (window as any).__autocinema_pending_replaced_stream;
      (window as any).__autocinema_pending_replaced_stream = null;
      applyReplacedStream(pending);
    }

    return () => {
      window.removeEventListener("autocinema:play-replaced-stream", handlePlayReplacedStream as EventListener);
    };
  }, []);

  // Reload latest synced playlists from localStorage whenever Cinema Screen modal is opened
  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = localStorage.getItem(CINEMA_PLAYLISTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          setPlaylists(parsed);
        } else {
          setPlaylists(DEFAULT_CINEMA_PLAYLISTS);
        }
      } else {
        setPlaylists(DEFAULT_CINEMA_PLAYLISTS);
      }
      const savedActiveId = localStorage.getItem(ACTIVE_PLAYLIST_ID_KEY);
      if (savedActiveId) {
        setActivePlaylistId(savedActiveId);
      } else {
        setActivePlaylistId(DEFAULT_ACTIVE_PLAYLIST_ID);
      }
    } catch (_) {
      setPlaylists(DEFAULT_CINEMA_PLAYLISTS);
      setActivePlaylistId(DEFAULT_ACTIVE_PLAYLIST_ID);
    }

    if ((window as any).__autocinema_pending_replaced_stream) {
      const pending = (window as any).__autocinema_pending_replaced_stream;
      (window as any).__autocinema_pending_replaced_stream = null;
      const { index, stream, mode, movie } = pending;
      const chosenStream = stream || movie?.selectedStream;
      replacedStreamRef.current = chosenStream;
      if (typeof index === "number" && index >= 0) setActiveIndex(index);
      if (chosenStream) setSelectedStreamOverride(chosenStream);
      const effectiveMode =
        mode ||
        (chosenStream?.type === "embed"
          ? "embed"
          : chosenStream?.type === "hls" ||
            chosenStream?.type === "mp4" ||
            chosenStream?.url?.includes(".m3u8") ||
            chosenStream?.url?.includes("/hls/")
          ? "direct"
          : "direct");
      setPlaybackMode(effectiveMode);
      setErrorMessage(null);
      hasPlaybackStartedRef.current = false;
      setIsPlaying(true);
      setReloadCounter((c) => c + 1);
    }
    if (isOpen) {
      setShowPlaylistTools(false);
    }
  }, [isOpen]);

  // Ensure strict deduplication of playlist items so no duplicate movie ever appears in the playlist
  useEffect(() => {
    if (!isOpen || !Array.isArray(playlist) || playlist.length <= 1) return;
    const deduped = deduplicatePlaylistItems(playlist);
    if (deduped.length < playlist.length) {
      onUpdatePlaylist(deduped);
      savePlaylistToLocalStorage(deduped);
      const nextPlaylists = playlists.map((p) =>
        p.id === activePlaylistId ? { ...p, items: deduped, updatedAt: new Date().toISOString() } : p
      );
      setPlaylists(nextPlaylists);
      try {
        localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
      } catch (_) {}
      saveCinemaPlaylistToDb(deduped, Math.min(activeIndex, Math.max(0, deduped.length - 1))).catch(() => {});
      saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch(() => {});
    }
  }, [isOpen, playlist, activePlaylistId, playlists, onUpdatePlaylist, activeIndex, deduplicatePlaylistItems]);

  // Keep playlists synced when incoming playlist prop updates from outside
  useEffect(() => {
    if (!Array.isArray(playlist)) return;
    setPlaylists((prev) => {
      // Check if localStorage has newer multi-playlists stored
      let baseList = prev;
      try {
        const saved = localStorage.getItem(CINEMA_PLAYLISTS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            baseList = parsed;
          }
        }
      } catch (_) {}

      const idx = baseList.findIndex((p) => p.id === activePlaylistId);
      if (idx !== -1) {
        if (baseList[idx].items.length !== playlist.length || JSON.stringify(baseList[idx].items) !== JSON.stringify(playlist)) {
          const updated = [...baseList];
          updated[idx] = { ...updated[idx], items: playlist, updatedAt: new Date().toISOString() };
          try {
            localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(updated));
          } catch (_) {}
          return updated;
        }
        return baseList;
      } else {
        const defSource = DEFAULT_CINEMA_PLAYLISTS.find((p) => p.id === activePlaylistId) || DEFAULT_CINEMA_PLAYLISTS[0];
        const initialItems = playlist.length > 0 ? playlist : (defSource?.items || []);
        const newGroup = {
          id: activePlaylistId,
          name: "قائمة التشغيل الرئيسية",
          items: initialItems,
          createdAt: new Date().toISOString(),
        };
        const updated = [...baseList, newGroup];
        try {
          localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(updated));
        } catch (_) {}
        if (playlist.length === 0 && initialItems.length > 0) {
          setTimeout(() => {
            if (typeof onUpdatePlaylist === "function") {
              onUpdatePlaylist(initialItems);
            }
          }, 0);
        }
        return updated;
      }
    });
  }, [playlist, activePlaylistId, onUpdatePlaylist]);

  const handleSwitchPlaylist = (targetId: string) => {
    const target = playlists.find((p) => p.id === targetId);
    if (!target) return;
    setActivePlaylistId(targetId);
    try {
      localStorage.setItem(ACTIVE_PLAYLIST_ID_KEY, targetId);
    } catch (_) {}
    setActiveIndex(0);
    const deduped = deduplicatePlaylistItems(target.items || []);
    onUpdatePlaylist(deduped);
    savePlaylistToLocalStorage(deduped);
  };

  const handleCreatePlaylist = (name: string, copyFromActive = false) => {
    const cleanName = (name || "").trim() || `قائمة ${playlists.length + 1}`;
    const newId = `pl-group-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newItems = copyFromActive && Array.isArray(playlist) ? [...playlist] : [];
    const newGroup: CinemaPlaylistGroup = {
      id: newId,
      name: cleanName,
      items: newItems,
      createdAt: new Date().toISOString(),
    };
    const nextPlaylists = [...playlists, newGroup];
    setPlaylists(nextPlaylists);
    setActivePlaylistId(newId);
    try {
      localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
      localStorage.setItem(ACTIVE_PLAYLIST_ID_KEY, newId);
    } catch (_) {}
    setActiveIndex(0);
    onUpdatePlaylist(newItems);
    savePlaylistToLocalStorage(newItems);
    saveAllCinemaPlaylistsToDb(nextPlaylists, newId).catch((err) => console.warn(err));
    setCloudNotice({
      status: "success",
      text: `✓ تم إنشاء وتفعيل قائمة التشغيل الجديدة: "${cleanName}" 🎬`,
    });
    setTimeout(() => setCloudNotice(null), 4000);
    setIsNewPlaylistModalOpen(false);
    setNewPlaylistName("");
    setNewPlaylistCopyFromCurrent(false);
  };

  const handleCreateNewPlaylist = handleCreatePlaylist;

  const handleRenamePlaylist = (playlistId: string, newName: string) => {
    const cleanName = (newName || "").trim();
    if (!cleanName) return;
    const nextPlaylists = playlists.map((p) =>
      p.id === playlistId ? { ...p, name: cleanName, updatedAt: new Date().toISOString() } : p
    );
    setPlaylists(nextPlaylists);
    try {
      localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
    } catch (_) {}
    saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch((err) => console.warn(err));
    setCloudNotice({
      status: "success",
      text: `✓ تم تعديل اسم القائمة إلى: "${cleanName}"`,
    });
    setTimeout(() => setCloudNotice(null), 3500);
    setIsRenamePlaylistModalOpen(false);
    setRenamePlaylistName("");
  };

  const handleDeletePlaylist = (playlistId: string) => {
    if (playlists.length <= 1) {
      setCloudNotice({
        status: "error",
        text: "لا يمكن حذف قائمة التشغيل الوحيدة. يجب أن تتوفر قائمة واحدة على الأقل.",
      });
      setTimeout(() => setCloudNotice(null), 3500);
      return;
    }
    const nextPlaylists = playlists.filter((p) => p.id !== playlistId);
    const nextActiveId = activePlaylistId === playlistId ? nextPlaylists[0].id : activePlaylistId;
    setPlaylists(nextPlaylists);
    setActivePlaylistId(nextActiveId);
    try {
      localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
      localStorage.setItem(ACTIVE_PLAYLIST_ID_KEY, nextActiveId);
    } catch (_) {}
    const nextActive = nextPlaylists.find((p) => p.id === nextActiveId) || nextPlaylists[0];
    onUpdatePlaylist(nextActive.items || []);
    savePlaylistToLocalStorage(nextActive.items || []);
    deleteCinemaPlaylistFromDb(playlistId).catch((err) => console.warn(err));
    saveAllCinemaPlaylistsToDb(nextPlaylists, nextActiveId).catch((err) => console.warn(err));
    setCloudNotice({
      status: "info",
      text: "تم حذف قائمة التشغيل بنجاح والتحويل للقائمة التالية.",
    });
    setTimeout(() => setCloudNotice(null), 3500);
  };

  // -------------------------------------------------------------
  // Horizontal Reordering of Playlists (Drag & Drop + Directions)
  // -------------------------------------------------------------
  const handleReorderPlaylists = useCallback((fromId: string, toId: string, pos: "before" | "after" = "before") => {
    if (!fromId || !toId || fromId === toId) return;

    setPlaylists((prev) => {
      const fromIdx = prev.findIndex((p) => p.id === fromId);
      const toIdx = prev.findIndex((p) => p.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;

      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);

      let targetIdx = next.findIndex((p) => p.id === toId);
      if (targetIdx === -1) targetIdx = toIdx;
      if (pos === "after") {
        targetIdx += 1;
      }

      next.splice(targetIdx, 0, moved);

      try {
        localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(next));
      } catch (_) {}

      saveAllCinemaPlaylistsToDb(next, activePlaylistId).catch((err) =>
        console.warn("[CinemaScreen] Failed to save reordered playlists to Firestore:", err)
      );

      try {
        fetch("/api/update-cinema-playlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allCinemaPlaylists: next,
            activePlaylistId: activePlaylistId,
          }),
        }).catch(() => {});
      } catch (_) {}

      try {
        window.dispatchEvent(new CustomEvent("autocinema:cinema-playlists-updated"));
      } catch (_) {}

      setCloudNotice({
        status: "success",
        text: `✓ تم تغيير الترتيب الأفقي للقوائم: "${moved.name}" ↔️`,
      });
      setTimeout(() => setCloudNotice(null), 3000);

      return next;
    });
  }, [activePlaylistId]);

  const handleMovePlaylistDirection = useCallback((playlistId: string, direction: "prev" | "next") => {
    setPlaylists((prev) => {
      const idx = prev.findIndex((p) => p.id === playlistId);
      if (idx === -1) return prev;
      // In RTL: "prev" moves rightward (lower index in list), "next" moves leftward (higher index in list)
      const targetIdx = direction === "prev" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;

      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);

      try {
        localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(next));
      } catch (_) {}

      saveAllCinemaPlaylistsToDb(next, activePlaylistId).catch((err) =>
        console.warn("[CinemaScreen] Failed to save reordered playlists:", err)
      );

      try {
        fetch("/api/update-cinema-playlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allCinemaPlaylists: next,
            activePlaylistId: activePlaylistId,
          }),
        }).catch(() => {});
      } catch (_) {}

      try {
        window.dispatchEvent(new CustomEvent("autocinema:cinema-playlists-updated"));
      } catch (_) {}

      setCloudNotice({
        status: "success",
        text: `✓ تم تحريك "${moved.name}" ${direction === "prev" ? "لليمين ◀" : "لليسار ▶"}`,
      });
      setTimeout(() => setCloudNotice(null), 2500);

      return next;
    });
  }, [activePlaylistId]);

  const handleRenamePlaylistItem = (itemIndex: number, newTitle: string) => {
    const clean = (newTitle || "").trim();
    if (!clean) return;
    const updated = [...playlist];
    if (updated[itemIndex]) {
      updated[itemIndex] = {
        ...updated[itemIndex],
        movieTitle: clean,
        title: clean,
      };
      onUpdatePlaylist(updated);
      savePlaylistToLocalStorage(updated);
      const nextPlaylists = playlists.map((p) =>
        p.id === activePlaylistId ? { ...p, items: updated, updatedAt: new Date().toISOString() } : p
      );
      setPlaylists(nextPlaylists);
      try {
        localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
      } catch (_) {}
      saveCinemaPlaylistToDb(updated, activeIndex).catch((err) => console.warn(err));
      saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch((err) => console.warn(err));
      const targetMId = updated[itemIndex]?.movieId || updated[itemIndex]?.id;
      if (targetMId) {
        saveMovieToDb({
          id: targetMId,
          title: clean,
          url: updated[itemIndex].url || "",
          embedUrl: updated[itemIndex].embedUrl || "",
          category: updated[itemIndex].category || "أفلام",
          posterUrl: updated[itemIndex].posterUrl || "",
          isUserAdded: true,
          isCustom: true,
          updatedAt: new Date().toISOString(),
        } as any).catch(() => {});
      }
      setCloudNotice({
        status: "success",
        text: `✓ تم تعديل اسم الفيلم إلى: "${clean}"`,
      });
      setTimeout(() => setCloudNotice(null), 3500);
    }
  };

  const handleSaveTitleOnly = () => {
    if (editingItemIndex === null || editingItemIndex < 0 || editingItemIndex >= playlist.length) {
      setIsRenameMovieOpen(false);
      return;
    }
    const updated = [...playlist];
    const trimmed = editMovieTitleInput.trim() || updated[editingItemIndex].movieTitle || updated[editingItemIndex].title || "فيلم بدون عنوان";
    updated[editingItemIndex] = {
      ...updated[editingItemIndex],
      movieTitle: trimmed,
      title: trimmed,
    };
    onUpdatePlaylist(updated);
    savePlaylistToLocalStorage(updated);
    const nextPlaylists = playlists.map((p) =>
      p.id === activePlaylistId ? { ...p, items: updated, updatedAt: new Date().toISOString() } : p
    );
    setPlaylists(nextPlaylists);
    try {
      localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
    } catch (_) {}
    saveCinemaPlaylistToDb(updated, activeIndex).catch(() => {});
    saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch(() => {});
    const targetMId = updated[editingItemIndex]?.movieId || updated[editingItemIndex]?.id;
    if (targetMId) {
      saveMovieToDb({
        id: targetMId,
        title: trimmed,
        url: updated[editingItemIndex].url || "",
        embedUrl: updated[editingItemIndex].embedUrl || "",
        category: updated[editingItemIndex].category || "أفلام",
        posterUrl: updated[editingItemIndex].posterUrl || "",
        isUserAdded: true,
        isCustom: true,
        updatedAt: new Date().toISOString(),
      } as any).catch(() => {});
    }
    setIsRenameMovieOpen(false);
    setEditingItemIndex(null);
    setCloudNotice({
      status: "success",
      text: `✓ تم حفظ اسم الفيلم: "${trimmed}"`,
    });
    setTimeout(() => setCloudNotice(null), 3000);
  };

  const handleTransferMovie = (
    targetId: string,
    action: "move" | "copy" = "move",
    newPlaylistNameInput?: string,
    switchAfter: boolean = false
  ) => {
    if (editingItemIndex === null || editingItemIndex < 0 || editingItemIndex >= playlist.length) {
      setIsRenameMovieOpen(false);
      return;
    }

    const currentItem = playlist[editingItemIndex];
    const trimmedTitle = editMovieTitleInput.trim() || currentItem.movieTitle || currentItem.title || "فيلم بدون عنوان";
    const itemToTransfer = sanitizePlaylistItem({
      ...currentItem,
      movieTitle: trimmedTitle,
      title: trimmedTitle,
    });

    let resolvedTargetId = targetId;
    let resolvedTargetName = "";
    let nextPlaylists = [...playlists];

    // Case 1: Create a brand new playlist inline
    if (targetId === "__new__" || isCreatingNewPlaylistInline) {
      const cleanName = (newPlaylistNameInput || "").trim() || `قائمة ${playlists.length + 1}`;
      resolvedTargetId = `pl-group-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      resolvedTargetName = cleanName;
      const newGroup: CinemaPlaylistGroup = {
        id: resolvedTargetId,
        name: cleanName,
        items: [itemToTransfer],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      nextPlaylists.push(newGroup);
    } else {
      // Case 2: Target existing playlist
      const targetIdx = nextPlaylists.findIndex((p) => p.id === targetId);
      if (targetIdx === -1) {
        alert("يرجى اختيار قائمة تشغيل صالحة لنقل الفيلم إليها.");
        return;
      }
      resolvedTargetName = nextPlaylists[targetIdx].name;
      const existingItems = Array.isArray(nextPlaylists[targetIdx].items)
        ? [...nextPlaylists[targetIdx].items]
        : [];

      const mId = (itemToTransfer.movieId || itemToTransfer.id || "").toString().trim();
      const origUrl = itemToTransfer.originalUrl ? normalizeVideoKey(itemToTransfer.originalUrl) : "";
      const mTitle = (itemToTransfer.movieTitle || itemToTransfer.title || "").trim().toLowerCase();

      const dupIdx = existingItems.findIndex((it) => {
        if (!it) return false;
        if (mId && (it.movieId === mId || it.id === mId)) return true;
        if (origUrl && it.originalUrl && normalizeVideoKey(it.originalUrl) === origUrl) return true;
        if (mTitle && mTitle.length > 2 && ((it.movieTitle && it.movieTitle.trim().toLowerCase() === mTitle) || (it.title && it.title.trim().toLowerCase() === mTitle))) return true;
        return false;
      });

      if (dupIdx !== -1) {
        setCloudNotice({
          status: "error",
          text: `⚠️ لا يمكن التكرار: الفيلم موجود بالفعل في قائمة "${resolvedTargetName}"!`,
        });
        setTimeout(() => setCloudNotice(null), 4000);
        setIsRenameMovieOpen(false);
        setEditingItemIndex(null);
        return;
      }

      existingItems.push(itemToTransfer);
      nextPlaylists[targetIdx] = {
        ...nextPlaylists[targetIdx],
        items: existingItems,
        updatedAt: new Date().toISOString(),
      };
    }

    // Handle current active playlist
    let updatedActiveItems = [...playlist];
    let nextActiveIndex = activeIndex;

    if (action === "move") {
      // Remove item from active playlist
      updatedActiveItems = updatedActiveItems.filter((_, idx) => idx !== editingItemIndex);

      if (editingItemIndex === activeIndex) {
        if (updatedActiveItems.length === 0) {
          nextActiveIndex = 0;
        } else if (activeIndex >= updatedActiveItems.length) {
          nextActiveIndex = updatedActiveItems.length - 1;
        }
      } else if (editingItemIndex < activeIndex) {
        nextActiveIndex = Math.max(0, activeIndex - 1);
      }
      setActiveIndex(nextActiveIndex);
    } else {
      // For "copy", retain item in active playlist with updated title
      updatedActiveItems[editingItemIndex] = itemToTransfer;
    }

    // Synchronize current playlist in nextPlaylists
    const activeIdxInGroups = nextPlaylists.findIndex((p) => p.id === activePlaylistId);
    if (activeIdxInGroups !== -1) {
      nextPlaylists[activeIdxInGroups] = {
        ...nextPlaylists[activeIdxInGroups],
        items: updatedActiveItems,
        updatedAt: new Date().toISOString(),
      };
    }

    // Save all playlists to state and localStorage
    setPlaylists(nextPlaylists);
    try {
      localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
    } catch (_) {}

    // Save to Firestore
    saveAllCinemaPlaylistsToDb(
      nextPlaylists,
      switchAfter ? resolvedTargetId : activePlaylistId
    ).catch((err) => console.warn("[Firestore] Failed to save playlists after move:", err));

    if (switchAfter && resolvedTargetId) {
      // Switch to the destination playlist right away
      setActivePlaylistId(resolvedTargetId);
      try {
        localStorage.setItem(ACTIVE_PLAYLIST_ID_KEY, resolvedTargetId);
      } catch (_) {}
      const targetGroup = nextPlaylists.find((p) => p.id === resolvedTargetId);
      const targetItems = targetGroup?.items || [];
      const newIdx = Math.max(0, targetItems.length - 1);
      setActiveIndex(newIdx);
      onUpdatePlaylist(targetItems);
      savePlaylistToLocalStorage(targetItems);
      saveCinemaPlaylistToDb(targetItems, newIdx).catch(() => {});
    } else {
      onUpdatePlaylist(updatedActiveItems);
      savePlaylistToLocalStorage(updatedActiveItems);
      saveCinemaPlaylistToDb(updatedActiveItems, nextActiveIndex).catch(() => {});
    }

    setIsRenameMovieOpen(false);
    setEditingItemIndex(null);

    setCloudNotice({
      status: "success",
      text:
        action === "move"
          ? `✓ تم نقل فيلم "${trimmedTitle}" إلى قائمة "${resolvedTargetName}" بنجاح 🎬`
          : `✓ تم نسخ فيلم "${trimmedTitle}" إلى قائمة "${resolvedTargetName}" بنجاح 📋`,
    });
    setTimeout(() => setCloudNotice(null), 4000);
  };

  const handleQuickSyncPlaylistToCloud = async () => {
    setIsCloudSyncing(true);
    setCloudNotice(null);
    try {
      // 1. Harvest stream preferences from all items across all playlists
      const prefs = getStreamPreferences();
      for (const pl of playlists) {
        for (const item of (pl.items || [])) {
          if (!item) continue;
          const stream = item.selectedStream;
          const srv = (stream == null ? void 0 : stream.server) || item.selectedServer;
          const qual = (stream == null ? void 0 : stream.quality) || item.selectedQuality;
          const typ = (stream == null ? void 0 : stream.type) || item.selectedType;
          const pMode = (stream == null ? void 0 : stream.preferredMode) || item.preferredMode || ((stream == null ? void 0 : stream.type) === "embed" ? "embed" : "direct");
          const sUrl = (stream == null ? void 0 : stream.url) || item.streamUrl || item.directUrl;
          const tKey = item.originalUrl || item.url || (stream == null ? void 0 : stream.url);

          if (tKey && (srv || qual || sUrl || pMode)) {
            const normKey = normalizeVideoKey(tKey);
            if (normKey) {
              prefs[normKey] = {
                urlKey: normKey,
                serverId: (stream == null ? void 0 : stream.id) || prefs[normKey]?.serverId,
                serverName: srv || prefs[normKey]?.serverName,
                quality: qual || prefs[normKey]?.quality,
                type: typ || prefs[normKey]?.type,
                playbackMode: pMode || prefs[normKey]?.playbackMode,
                streamUrl: sUrl || prefs[normKey]?.streamUrl,
                directUrl: (stream == null ? void 0 : stream.directUrl) || item.directUrl || prefs[normKey]?.directUrl,
                updatedAt: new Date().toISOString(),
              };
            }
          }
        }
      }
      try {
        localStorage.setItem(STREAM_PREFS_KEY, JSON.stringify(prefs));
      } catch (_) {}

      // 2. Save all playlists to Firestore
      await saveAllCinemaPlaylistsToDb(playlists, activePlaylistId);

      // 3. Save stream preferences to Firestore
      if (Object.keys(prefs).length > 0) {
        await saveAllStreamPreferencesToDb(prefs);
      }

      // 4. Save custom/edited movies from playlists to Firestore
      const customMoviesList: any[] = [];
      const knownIds = new Set<string>();
      for (const pl of playlists) {
        for (const item of (pl.items || [])) {
          const mId = item.movieId || item.id;
          if (mId && !knownIds.has(mId)) {
            knownIds.add(mId);
            if (item.isCustom || item.isUserAdded || mId.startsWith("mov-") || mId.startsWith("custom-") || item.allStreams?.length > 0) {
              customMoviesList.push({
                id: mId,
                title: item.movieTitle || item.title || "فيلم بدون عنوان",
                url: item.url || (item.selectedStream && item.selectedStream.url) || "",
                embedUrl: item.embedUrl || "",
                category: item.category || "أفلام",
                duration: item.duration || "",
                posterUrl: item.posterUrl || "",
                isUserAdded: true,
                isCustom: true,
                selectedServer: item.selectedServer || item.selectedStream?.server,
                selectedQuality: item.selectedQuality || item.selectedStream?.quality,
                selectedType: item.selectedType || item.selectedStream?.type,
                preferredMode: item.preferredMode || item.selectedStream?.preferredMode || "direct",
                updatedAt: new Date().toISOString(),
              });
            }
          }
        }
      }
      if (customMoviesList.length > 0) {
        await saveAllCustomMoviesToDb(customMoviesList);
      }

      const totalItems = playlists.reduce((sum, p) => sum + (p.items?.length || 0), 0);
      setCloudNotice({
        status: 'success',
        text: `✓ بيان المزامنة: تم بنجاح رفع وحفظ كافة قوائم التشغيل (${playlists.length} قائمة • ${totalItems} عنصر) مع السيرفرات والجودات وتفضيلات البث (${Object.keys(prefs).length} تفضيل) في Firestore!`,
      });
      setTimeout(() => setCloudNotice(null), 4500);
    } catch (err: any) {
      setCloudNotice({
        status: 'error',
        text: `فشل حفظ قوائم شاشة العرض: ${err?.message || 'خطأ غير معروف'}`,
      });
      setTimeout(() => setCloudNotice(null), 4500);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handleQuickSyncPlaylistFromCloud = async () => {
    setIsCloudSyncing(true);
    setCloudNotice(null);
    try {
      const res = await fetchAllCinemaPlaylistsFromDb();
      if (res && res.playlists && res.playlists.length > 0) {
        setPlaylists(res.playlists);
        setActivePlaylistId(res.activeId);
        try {
          localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(res.playlists));
          localStorage.setItem(ACTIVE_PLAYLIST_ID_KEY, res.activeId);
        } catch (_) {}
        const active = res.playlists.find(p => p.id === res.activeId) || res.playlists[0];
        onUpdatePlaylist(active.items || []);
        savePlaylistToLocalStorage(active.items || []);
        setCloudNotice({
          status: 'success',
          text: `✓ بيان المزامنة: تم بنجاح جلب كافة قوائم التشغيل (${res.playlists.length} قائمة • ${active.items.length} عنصر) من Firestore!`,
        });
      } else if (onSyncPlaylistFromDb) {
        await onSyncPlaylistFromDb();
      } else {
        const items = await fetchCinemaPlaylistFromDb();
        if (items && Array.isArray(items) && items.length > 0) {
          onUpdatePlaylist(items);
          savePlaylistToLocalStorage(items);
          setCloudNotice({
            status: 'success',
            text: `✓ بيان المزامنة: تم بنجاح جلب وتحديث قائمة شاشة العرض (${items.length} عنصر) من Firestore!`,
          });
        } else {
          setCloudNotice({
            status: 'info',
            text: 'قائمة شاشة العرض فارغة في Firestore حالياً.',
          });
        }
      }
      setTimeout(() => setCloudNotice(null), 4500);
    } catch (err: any) {
      setCloudNotice({
        status: 'error',
        text: `فشل جلب قائمة شاشة العرض: ${err?.message || 'خطأ غير معروف'}`,
      });
      setTimeout(() => setCloudNotice(null), 4500);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Title wrap mode in playlist: 'clamp' (2 lines) | 'full' (all lines) | 'single' (1 line)
  const [titleWrapMode, setTitleWrapMode] = useState<"clamp" | "full" | "single">(() => {
    try {
      const saved = localStorage.getItem("cinema_title_mode");
      if (saved === "clamp" || saved === "full" || saved === "single") return saved;
    } catch (_) {}
    return "clamp";
  });

  // Playlist drawer width in pixels (draggable sideways for resize)
  const [playlistWidth, setPlaylistWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("cinema_playlist_width");
      if (saved) {
        const val = parseInt(saved, 10);
        if (val >= 260 && val <= 850) return val;
      }
    } catch (_) {}
    return 360; // Default comfortable width
  });

  const [isDraggingDivider, setIsDraggingDivider] = useState(false);

  // Built-in proxy state synced with main app
  const [isBuiltinProxyActive, setIsBuiltinProxyActive] = useState(() => {
    try {
      return localStorage.getItem("autocinema_builtin_proxy_enabled") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleProxyChange = (e: any) => {
      if (e && e.detail && typeof e.detail.enabled === "boolean") {
        setIsBuiltinProxyActive(e.detail.enabled);
      }
    };
    window.addEventListener("autocinema:proxy-toggled", handleProxyChange);
    return () => {
      window.removeEventListener("autocinema:proxy-toggled", handleProxyChange);
    };
  }, []);

  const handleToggleBuiltinProxy = () => {
    setIsBuiltinProxyActive((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("autocinema_builtin_proxy_enabled", String(next));
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent("autocinema:proxy-toggled", { detail: { enabled: next } }));
      } catch {}
      return next;
    });
  };

  // Refs
  const controlsTimeoutRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const cinemaContainerRef = useRef<HTMLDivElement | null>(null);
  const playlistContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(360);

  const scaleRatio = fontScale > 5 ? fontScale / 100 : fontScale || 1;

  // -------------------------------------------------------------
  // Controls Auto-hide in Fullscreen
  // -------------------------------------------------------------
  const pingControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (document.fullscreenElement) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) {
        setShowControls(false);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      } else {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  // Sync initial index
  useEffect(() => {
    if (initialActiveIndex >= 0 && initialActiveIndex < playlist.length) {
      setActiveIndex(initialActiveIndex);
    }
  }, [initialActiveIndex, playlist.length]);

  // Auto-scroll active item into view
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (!playlistContainerRef.current) return;
      const activeEl = playlistContainerRef.current.querySelector("[data-active='true']");
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [activeIndex, isOpen, playlist.length, showPlaylist]);

  // -------------------------------------------------------------
  // Draggable Playlist Resize Divider (Sideways Dragging)
  // -------------------------------------------------------------
  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = playlistWidth;
    setIsDraggingDivider(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleDividerTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.touches[0].clientX;
    dragStartWidthRef.current = playlistWidth;
    setIsDraggingDivider(true);
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      // In RTL (dir="rtl"), playlist is on the RIGHT.
      // Moving mouse to the left (clientX decreases) expands the playlist width.
      const deltaX = dragStartXRef.current - e.clientX;
      const maxWidth = Math.floor(window.innerWidth * 0.72);
      const newWidth = Math.max(260, Math.min(maxWidth, dragStartWidthRef.current + deltaX));
      setPlaylistWidth(newWidth);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      const deltaX = dragStartXRef.current - e.touches[0].clientX;
      const maxWidth = Math.floor(window.innerWidth * 0.72);
      const newWidth = Math.max(260, Math.min(maxWidth, dragStartWidthRef.current + deltaX));
      setPlaylistWidth(newWidth);
    };

    const handleDragEnd = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDraggingDivider(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try {
          localStorage.setItem("cinema_playlist_width", String(playlistWidth));
        } catch (_) {}
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleDragEnd);
    window.addEventListener("touchcancel", handleDragEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleDragEnd);
      window.removeEventListener("touchcancel", handleDragEnd);
    };
  }, [playlistWidth]);

  // Double click divider to toggle preset sizes
  const handleDividerDoubleClick = () => {
    setPlaylistWidth((prev) => {
      let next = 360;
      if (prev < 380) next = 480;
      else if (prev < 520) next = 620;
      else next = 320;
      try {
        localStorage.setItem("cinema_playlist_width", String(next));
      } catch (_) {}
      return next;
    });
  };

  // Toggle title display mode
  const cycleTitleWrapMode = () => {
    setTitleWrapMode((prev) => {
      const next = prev === "clamp" ? "full" : prev === "full" ? "single" : "clamp";
      try {
        localStorage.setItem("cinema_title_mode", next);
      } catch (_) {}
      return next;
    });
  };

  // -------------------------------------------------------------
  // Current Playing Movie & Stream Selection
  // -------------------------------------------------------------
  const currentMovie = playlist[activeIndex] || playlist[0] || null;
  const currentStream = selectedStreamOverride || currentMovie?.selectedStream || null;

  useEffect(() => {
    if (replacedStreamRef.current) {
      setSelectedStreamOverride(replacedStreamRef.current);
      replacedStreamRef.current = null;
    } else {
      setSelectedStreamOverride(null);
    }
    hasPlaybackStartedRef.current = false;
    if (stallTimeoutRef.current) {
      clearTimeout(stallTimeoutRef.current);
      stallTimeoutRef.current = null;
    }
    if (normalLoadWatchdogRef.current) {
      clearTimeout(normalLoadWatchdogRef.current);
      normalLoadWatchdogRef.current = null;
    }
    return () => {
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = null;
      }
      if (normalLoadWatchdogRef.current) {
        clearTimeout(normalLoadWatchdogRef.current);
        normalLoadWatchdogRef.current = null;
      }
    };
  }, [activeIndex, isOpen]);

  const sortedStreams = useMemo(() => {
    return sortStreamsAscending(currentMovie?.allStreams || []);
  }, [currentMovie?.allStreams]);

  // -------------------------------------------------------------
  // Real Screen Video Playback Verifier
  // Accurately tests if the video element is genuinely decoding frames and advancing playback
  // -------------------------------------------------------------
  const verifyScreenPlayback = useCallback(
    (timeoutMs = 3800): Promise<{ ok: boolean; reason?: string }> => {
      return new Promise((resolve) => {
        let isDone = false;
        let pollInterval: any = null;
        let timeoutHandle: any = null;

        const cleanup = () => {
          if (pollInterval) clearInterval(pollInterval);
          if (timeoutHandle) clearTimeout(timeoutHandle);
          const v = videoRef.current;
          if (v) {
            v.removeEventListener("playing", onPlaying);
            v.removeEventListener("timeupdate", onTimeUpdate);
            v.removeEventListener("error", onError);
          }
        };

        const finish = (ok: boolean, reason?: string) => {
          if (isDone) return;
          isDone = true;
          cleanup();
          resolve({ ok, reason });
        };

        // For embed players and YouTube streams, they render in iframe and manage their own playback
        const isCurrentEmbedOrYt =
          playbackMode === "embed" ||
          !!(
            extractYouTubeId(currentStream?.url) ||
            extractYouTubeId(currentStream?.directUrl) ||
            extractYouTubeId(currentMovie?.originalUrl) ||
            extractYouTubeId(currentMovie?.url) ||
            currentStream?.isYouTube
          );
        if (isCurrentEmbedOrYt) {
          finish(true, "embed_or_youtube_stream");
          return;
        }

        const onPlaying = () => {
          const v = videoRef.current;
          if (v && (v.currentTime > 0.05 || v.readyState >= 3 || v.videoWidth > 0)) {
            finish(true, "playing_event");
          }
        };

        const onTimeUpdate = () => {
          const v = videoRef.current;
          if (v && v.currentTime > 0.1) {
            finish(true, "timeupdate_advancing");
          }
        };

        const onError = () => {
          finish(false, "video_error_event");
        };

        const v = videoRef.current;
        if (v) {
          v.addEventListener("playing", onPlaying);
          v.addEventListener("timeupdate", onTimeUpdate);
          v.addEventListener("error", onError);

          // If browser policy paused video, try unmuting and playing
          if (v.paused && v.readyState >= 1) {
            v.play().catch(() => {
              v.muted = true;
              v.play().catch(() => {});
            });
          }
        }

        // Poll every 250ms to inspect real video playback state and frame progression
        pollInterval = setInterval(() => {
          if (cancelCheckRef.current) {
            finish(false, "cancelled");
            return;
          }
          const vid = videoRef.current;
          if (vid) {
            if (vid.error) {
              finish(false, "element_error");
              return;
            }
            // If currentTime has advanced and video is not paused
            if (vid.currentTime > 0.12 && !vid.paused) {
              finish(true, "playback_advancing");
              return;
            }
            // If readyState is HAVE_FUTURE_DATA (3) or HAVE_ENOUGH_DATA (4) with time > 0.05
            if (vid.readyState >= 3 && vid.currentTime > 0.05 && !vid.paused) {
              finish(true, "ready_and_playing");
              return;
            }
            // If video has dimensions and currentTime > 0
            if (vid.videoWidth > 0 && vid.currentTime > 0.08) {
              finish(true, "frame_decoded");
              return;
            }
            // Attempt autoplay retry if stuck paused
            if (vid.paused && vid.readyState >= 1) {
              vid.muted = true;
              vid.play().catch(() => {});
            }
          }
        }, 250);

        timeoutHandle = setTimeout(() => {
          const vid = videoRef.current;
          if (vid && vid.currentTime > 0.08 && !vid.paused && !vid.error) {
            finish(true, "timeout_with_valid_playback");
          } else {
            finish(false, "timeout_no_playback");
          }
        }, timeoutMs);
      });
    },
    [playbackMode, currentStream, currentMovie]
  );

  // -------------------------------------------------------------
  // Auto-extraction and healing helper (re-extracts fresh streams and updates screen & playlist immediately)
  // Strictly tests and selects candidate streams starting from 344p upwards (344 -> 360 -> 480 -> 720 -> 1080)
  // -------------------------------------------------------------
  const triggerAutoHeal = useCallback(
    async (reason = "خلل في الرابط", isManual = false) => {
      if (!currentMovie || isAutoHealing) return;

      // CRITICAL SHIELD: If this is an automatic heal and the video is currently playing or has started playing, NEVER interrupt playback!
      if (!isManual) {
        if (hasPlaybackStartedRef.current) {
          console.log("[Cinema Auto-Heal] Auto-heal prevented: video has already started playing successfully.");
          return;
        }
        const vid = videoRef.current;
        if (vid && !vid.error && (vid.currentTime > 0.05 || !vid.paused || vid.videoWidth > 0)) {
          hasPlaybackStartedRef.current = true;
          console.log("[Cinema Auto-Heal] Auto-heal skipped: video is already active on screen.");
          return;
        }
        if (playbackMode === "embed") {
          return;
        }
      }

      const sourceUrl =
        resolveItemMovieSourceUrl(currentMovie, movies) ||
        (currentMovie.originalUrl || currentStream?.directUrl || currentStream?.url || "").trim();

      if (!sourceUrl) {
        setErrorMessage("تعذر العثور على رابط المصدر لإعادة استخراج الفيلم.");
        return;
      }

      setIsAutoHealing(true);
      const movieDisplayTitle = formatCleanMovieTitle(currentMovie.movieTitle || currentMovie.title, currentMovie, movies);
      setErrorMessage(`جاري فحص وإعادة استخراج روابط السيرفرات تلقائياً لـ "${movieDisplayTitle}" (${reason})... ⏳`);

      const probeStreamAlive = async (
        urlStr?: string,
        directUrlStr?: string,
        refStr?: string
      ): Promise<{ alive: boolean; playableDirect: boolean; type?: string }> => {
        const target = (directUrlStr || urlStr || "").trim();
        if (!target) return { alive: false, playableDirect: false };
        try {
          const healthRes = await fetch("/api/check-stream-health", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: target,
              directUrl: directUrlStr,
              ref: refStr || target,
            }),
          });
          if (!healthRes.ok) return { alive: false, playableDirect: false };
          const healthData = await healthRes.json();
          return {
            alive: !!healthData.alive,
            playableDirect: !!healthData.playableDirect,
            type: healthData.type,
          };
        } catch {
          return { alive: false, playableDirect: false };
        }
      };

      try {
        let workingStream: any = null;
        let allFreshStreams: any[] = [];

        // 1. Re-extract fresh streams directly from provider (generates brand new valid tokens)
        try {
          const ctrl = new AbortController();
          const tId = setTimeout(() => ctrl.abort(), 10000);
          const response = await fetch("/api/extract-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: sourceUrl,
              title: currentMovie.movieTitle || currentMovie.title,
            }),
            signal: ctrl.signal,
          });
          clearTimeout(tId);

          let data: any = null;
          try {
            const rawText = await response.text();
            data = JSON.parse(rawText);
          } catch (_) {
            data = null;
          }

          if (data && data.success && Array.isArray(data.streams) && data.streams.length > 0) {
            allFreshStreams = data.streams;
            const sortedFresh = sortStreamsByQualityTiersAscending(
              allFreshStreams,
              currentStream?.url,
              currentStream?.id
            );

            // Test candidate streams strictly in quality tier order: 344 -> 360 -> 480 -> 720 -> 1080
            for (const cand of sortedFresh) {
              const probeRes = await probeStreamAlive(
                cand.directUrl || cand.url,
                cand.directUrl,
                sourceUrl
              );
              if (!probeRes.alive) continue;

              // Test candidate directly on the screen
              const candMode = cand.type === "embed" ? "embed" : "direct";
              setSelectedStreamOverride(cand);
              setPlaybackMode(candMode);
              setErrorMessage(`جاري فحص وتأكيد تشغيل: ${cand.server} (${cand.quality || "جودة"}) على الشاشة... ⏳`);

              await new Promise((r) => setTimeout(r, 450));
              const candVerify = await verifyScreenPlayback(3600);
              if (candVerify.ok) {
                workingStream = cand;
                break;
              }
            }

            // Fallback to first probe-alive candidate if none decoded on screen
            if (!workingStream && sortedFresh.length > 0) {
              for (const cand of sortedFresh) {
                const probeRes = await probeStreamAlive(
                  cand.directUrl || cand.url,
                  cand.directUrl,
                  sourceUrl
                );
                if (probeRes.alive) {
                  workingStream = cand;
                  setSelectedStreamOverride(cand);
                  setPlaybackMode(cand.type === "embed" ? "embed" : "direct");
                  break;
                }
              }
            }
          }
        } catch (_) {}

        // 2. If fresh extraction was unavailable, test existing allStreams as fallback
        if (!workingStream && Array.isArray(currentMovie.allStreams) && currentMovie.allStreams.length > 0) {
          const sortedExisting = sortStreamsByQualityTiersAscending(
            currentMovie.allStreams,
            currentStream?.url,
            currentStream?.id
          );
          for (const cand of sortedExisting) {
            const probeRes = await probeStreamAlive(
              cand.directUrl || cand.url,
              cand.directUrl,
              sourceUrl
            );
            if (!probeRes.alive) continue;

            const candMode = cand.type === "embed" ? "embed" : "direct";
            setSelectedStreamOverride(cand);
            setPlaybackMode(candMode);
            await new Promise((r) => setTimeout(r, 450));
            const candVerify = await verifyScreenPlayback(3600);
            if (candVerify.ok) {
              workingStream = cand;
              break;
            }
          }

          if (!workingStream) {
            for (const cand of sortedExisting) {
              const probeRes = await probeStreamAlive(
                cand.directUrl || cand.url,
                cand.directUrl,
                sourceUrl
              );
              if (probeRes.alive) {
                workingStream = cand;
                setSelectedStreamOverride(cand);
                setPlaybackMode(cand.type === "embed" ? "embed" : "direct");
                break;
              }
            }
          }
        }

        if (workingStream) {
          const targetMode = workingStream.type === "embed" ? "embed" : "direct";
          const workingUrl = workingStream.url || workingStream.directUrl || currentMovie.url;
          const workingDirectUrl = workingStream.directUrl || workingStream.url || currentMovie.directUrl;
          const updatedMovie = {
            ...currentMovie,
            url: workingUrl,
            directUrl: workingDirectUrl,
            streamUrl: workingUrl,
            selectedStream: { ...workingStream, preferredMode: targetMode },
            preferredMode: targetMode,
            selectedServer: workingStream.server,
            selectedQuality: workingStream.quality,
            selectedType: workingStream.type,
            allStreams: allFreshStreams.length > 0 ? allFreshStreams : currentMovie.allStreams,
            originalUrl: sourceUrl || currentMovie.originalUrl,
            wasAutoRepaired: true,
            repairedQuality: workingStream.quality,
            repairedAt: new Date().toISOString(),
          };

          const newPlaylist = [...playlist];
          newPlaylist[activeIndex] = updatedMovie;
          onUpdatePlaylist(newPlaylist);
          savePlaylistToLocalStorage(newPlaylist);
          saveStreamPreference(sourceUrl || updatedMovie.originalUrl || updatedMovie.url, updatedMovie.selectedStream, targetMode);

          const nextPlaylists = playlists.map((p) =>
            p.id === activePlaylistId ? { ...p, items: newPlaylist, updatedAt: new Date().toISOString() } : p
          );
          setPlaylists(nextPlaylists);
          try {
            localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
          } catch (_) {}
          saveCinemaPlaylistToDb(newPlaylist, activeIndex).catch(() => {});
          saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch(() => {});
          syncRepairedPlaylistToBackendAndCloud(newPlaylist, activePlaylistId, nextPlaylists);

          try {
            window.dispatchEvent(new CustomEvent("autocinema:cinema-playlists-updated"));
          } catch (_) {}

          // Reflect immediately and change directly on the screen!
          setSelectedStreamOverride(workingStream);
          setPlaybackMode(targetMode);
          setErrorMessage(null);
          setHealingSuccessToast(`✓ تم بنجاح استخراج واستبدال الرابط وتشغيله فوراً على الشاشة (${workingStream.server} - ${workingStream.quality})! ⚡`);
          setTimeout(() => setHealingSuccessToast(null), 4000);
        } else {
          setErrorMessage("تعذر استخراج رابط شغال حالياً من المصدر. يمكنك تجربة [نافذة مستقلة].");
        }
      } catch (err: any) {
        console.warn("[Cinema Auto-Heal Error]", err);
        setErrorMessage("فشل فحص وتحديث الرابط. يمكنك فتح الفيلم عبر [نافذة مستقلة].");
      } finally {
        setIsAutoHealing(false);
      }
    },
    [currentMovie, currentStream, activeIndex, playlist, onUpdatePlaylist, isAutoHealing, playlists, activePlaylistId, movies, verifyScreenPlayback, playbackMode]
  );

  const triggerAutoHealRef = useRef(triggerAutoHeal);
  useEffect(() => {
    triggerAutoHealRef.current = triggerAutoHeal;
  }, [triggerAutoHeal]);

  // -------------------------------------------------------------
  // Automatic Link Health Checker & Batch Playlist Repairer
  // -------------------------------------------------------------
  const handleAutoCheckAndRefreshPlaylist = async () => {
    if (isCheckingPlaylist || playlist.length === 0) return;
    setIsCheckingPlaylist(true);
    setIsCheckPaused(false);
    isCheckPausedRef.current = false;
    cancelCheckRef.current = false;

    let updatedPlaylist = [...playlist];
    let repairedCount = 0;
    const total = updatedPlaylist.length;

    const waitWhilePaused = async () => {
      while (isCheckPausedRef.current && !cancelCheckRef.current) {
        await new Promise((r) => setTimeout(r, 200));
      }
    };

    const probeStreamAlive = async (
      urlStr?: string,
      directUrlStr?: string,
      refStr?: string
    ): Promise<{ alive: boolean; playableDirect: boolean; type?: string }> => {
      const target = (directUrlStr || urlStr || "").trim();
      if (!target) return { alive: false, playableDirect: false };
      try {
        const healthRes = await fetch("/api/check-stream-health", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: target,
            directUrl: directUrlStr,
            ref: refStr || target,
          }),
        });
        if (!healthRes.ok) return { alive: false, playableDirect: false };
        const healthData = await healthRes.json();
        return {
          alive: !!healthData.alive,
          playableDirect: !!healthData.playableDirect,
          type: healthData.type,
        };
      } catch {
        return { alive: false, playableDirect: false };
      }
    };

    try {
      for (let i = 0; i < total; i++) {
        if (cancelCheckRef.current) break;
        await waitWhilePaused();
        if (cancelCheckRef.current) break;

        const item = updatedPlaylist[i];
        const title = formatCleanMovieTitle(item.movieTitle || item.title || `فيلم #${i + 1}`, item, movies);
        setPlaylistCheckProgress({
          current: i + 1,
          total,
          fixedCount: repairedCount,
          currentTitle: title,
        });

        // 1. Immediately transition to movie i: open, play, and display it on screen!
        setActiveIndex(i);
        let currentStreamObj = item.selectedStream;
        const initialMode =
          (currentStreamObj?.preferredMode || item.preferredMode) === "embed"
            ? "embed"
            : "direct";
        setPlaybackMode(initialMode);
        setSelectedStreamOverride(currentStreamObj || null);
        setErrorMessage(null);

        // Scroll playlist to center movie i
        try {
          const itemEl = playlistContainerRef.current?.querySelector(`[data-index="${i}"]`);
          itemEl?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        } catch (_) {}

        // Check if user paused right after displaying
        await waitWhilePaused();
        if (cancelCheckRef.current) break;

        // Check if user manually intervened during pause and selected a stream
        const userManualItem = playlist[i];
        if (
          userManualItem?.selectedStream &&
          (userManualItem.selectedStream.url !== currentStreamObj?.url ||
            userManualItem.selectedStream.server !== currentStreamObj?.server)
        ) {
          currentStreamObj = userManualItem.selectedStream;
          updatedPlaylist[i] = {
            ...updatedPlaylist[i],
            ...userManualItem,
          };
        }

        const movieOriginUrl = resolveItemMovieSourceUrl(item, movies);
        const directMediaUrl = getPlayableDirectUrl(currentStreamObj, item);

        // 2. Perform thorough verification:
        const itemYtId =
          extractYouTubeId(currentStreamObj?.url) ||
          extractYouTubeId(currentStreamObj?.directUrl) ||
          extractYouTubeId(item.originalUrl) ||
          extractYouTubeId(item.url);
        const isItemYouTube = !!(itemYtId || currentStreamObj?.isYouTube);

        // A: Probe link health via server
        let probeIsAlive = false;
        if (isItemYouTube) {
          probeIsAlive = true;
        } else if (directMediaUrl) {
          const p = await probeStreamAlive(directMediaUrl, currentStreamObj?.directUrl, movieOriginUrl || directMediaUrl);
          probeIsAlive = p.alive;
        } else if (currentStreamObj?.url) {
          const p = await probeStreamAlive(currentStreamObj.url, currentStreamObj.directUrl, movieOriginUrl || currentStreamObj.url);
          probeIsAlive = p.alive;
        }

        await waitWhilePaused();
        if (cancelCheckRef.current) break;

        // B: True on-screen playback test (give video element time to attach and buffer)
        let screenPlaybackOk = false;
        if (isItemYouTube) {
          screenPlaybackOk = true;
        } else if (probeIsAlive) {
          // Wait 400ms for React/HLS DOM mount
          await new Promise((r) => setTimeout(r, 400));
          // Verify playback on the real video element on screen
          const verifyResult = await verifyScreenPlayback(3800);
          screenPlaybackOk = verifyResult.ok;
        }

        await waitWhilePaused();
        if (cancelCheckRef.current) break;

        const isWorking = probeIsAlive && screenPlaybackOk;

        if (isWorking) {
          // Movie is confirmed alive and currently playing properly on screen!
          setHealingSuccessToast(`✓ فيلم #${i + 1} "${title}" يعمل بصورة صحيحة على الشاشة (${currentStreamObj?.server || "سيرفر"} - ${currentStreamObj?.quality || "HD"}) ✨`);
          // Pause up to 2.2 seconds allowing immediate pause interruption for manual intervention
          for (let delayMs = 0; delayMs < 2200; delayMs += 200) {
            if (cancelCheckRef.current) break;
            await waitWhilePaused();
            await new Promise((r) => setTimeout(r, 200));
          }
        } else {
          // 3. Broken, stalled, or not playing on screen:
          // Re-extract fresh streams directly from origin movie page and test candidates in order: 344 -> 360 -> 480 -> 720 -> 1080!
          setErrorMessage(`⚠️ الرابط لا يفتح أو لا يعمل على الشاشة... جاري إعادة فحص وتحديث السيرفرات لـ "${title}"... ⏳`);
          let fixedStream: any = null;
          let allAvailableStreams: any[] = [];

          // Re-extract fresh from source page
          if (movieOriginUrl) {
            try {
              const ctrl = new AbortController();
              const tId = setTimeout(() => ctrl.abort(), 10000);
              const extractRes = await fetch("/api/extract-video", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: movieOriginUrl,
                  title,
                }),
                signal: ctrl.signal,
              });
              clearTimeout(tId);
              let extData: any = null;
              try {
                extData = await extractRes.json();
              } catch (_) {
                extData = null;
              }
              if (extData && extData.success && Array.isArray(extData.streams) && extData.streams.length > 0) {
                allAvailableStreams = extData.streams;
              }
            } catch (_) {}
          }

          if (allAvailableStreams.length === 0 && Array.isArray(item.allStreams) && item.allStreams.length > 0) {
            allAvailableStreams = item.allStreams;
          }

          const candidateStreams = sortStreamsByQualityTiersAscending(
            allAvailableStreams,
            currentStreamObj?.url,
            currentStreamObj?.id
          );

          // Test candidate streams strictly starting from 344 -> 360 -> 480 -> 720 -> 1080
          for (const cand of candidateStreams) {
            if (cancelCheckRef.current) break;
            await waitWhilePaused();
            if (cancelCheckRef.current) break;

            // If user manually chose a stream during pause, adopt it immediately
            if (
              playlist[i]?.selectedStream &&
              (playlist[i].selectedStream.url !== currentStreamObj?.url ||
                playlist[i].selectedStream.server !== currentStreamObj?.server)
            ) {
              fixedStream = playlist[i].selectedStream;
              break;
            }

            const candTarget = (cand.directUrl || cand.url || "").trim();
            const p = await probeStreamAlive(candTarget, cand.directUrl, movieOriginUrl);
            if (!p.alive) continue;

            // Try this candidate directly on screen!
            const candMode = cand.type === "embed" ? "embed" : "direct";
            setSelectedStreamOverride(cand);
            setPlaybackMode(candMode);
            setErrorMessage(`جاري فحص وتأكيد تشغيل: ${cand.server} (${cand.quality || "جودة"}) على الشاشة... ⏳`);

            await new Promise((r) => setTimeout(r, 450));
            const candVerify = await verifyScreenPlayback(3600);
            if (candVerify.ok) {
              fixedStream = cand;
              break;
            }
          }

          // If no candidate decoded frames on screen, fallback to first probe-alive stream in 344 -> 360 -> 480 -> 720 -> 1080 order
          if (!fixedStream && candidateStreams.length > 0) {
            for (const cand of candidateStreams) {
              const candTarget = (cand.directUrl || cand.url || "").trim();
              const p = await probeStreamAlive(candTarget, cand.directUrl, movieOriginUrl);
              if (p.alive) {
                fixedStream = cand;
                const candMode = cand.type === "embed" ? "embed" : "direct";
                setSelectedStreamOverride(cand);
                setPlaybackMode(candMode);
                break;
              }
            }
          }

          // If replacement stream resolved, pin as default and update IMMEDIATELY on screen & state!
          if (fixedStream) {
            repairedCount++;
            const targetMode = fixedStream.type === "embed" ? "embed" : "direct";
            const resolvedUrl = fixedStream.url || fixedStream.directUrl || item.url;
            const resolvedDirectUrl = fixedStream.directUrl || fixedStream.url || item.directUrl;
            const updatedItem = {
              ...item,
              url: resolvedUrl,
              directUrl: resolvedDirectUrl,
              streamUrl: resolvedUrl,
              selectedStream: { ...fixedStream, preferredMode: targetMode },
              preferredMode: targetMode,
              selectedServer: fixedStream.server,
              selectedQuality: fixedStream.quality,
              selectedType: fixedStream.type,
              allStreams: allAvailableStreams.length > 0 ? allAvailableStreams : item.allStreams,
              originalUrl: movieOriginUrl || item.originalUrl || item.url,
              wasAutoRepaired: true,
              repairedQuality: fixedStream.quality,
              repairedAt: new Date().toISOString(),
            };

            updatedPlaylist[i] = updatedItem;

            // Replace immediately and update live on screen right away!
            onUpdatePlaylist([...updatedPlaylist]);
            savePlaylistToLocalStorage(updatedPlaylist);

            const nextPlaylists = playlists.map((p) =>
              p.id === activePlaylistId ? { ...p, items: [...updatedPlaylist], updatedAt: new Date().toISOString() } : p
            );
            setPlaylists(nextPlaylists);
            try {
              localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
            } catch (_) {}
            saveCinemaPlaylistToDb(updatedPlaylist, i).catch(() => {});
            saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch(() => {});

            saveStreamPreference(
              movieOriginUrl || item.originalUrl || item.url,
              updatedItem.selectedStream,
              targetMode
            );

            // Keep playing the repaired stream live on screen
            setSelectedStreamOverride(fixedStream);
            setPlaybackMode(targetMode);
            setErrorMessage(null);
            setHealingSuccessToast(
              `✓ تم بنجاح تحديث السيرفرات واختيار (${fixedStream.server} - ${fixedStream.quality}) وتشغيله على الشاشة! ⚡`
            );

            try {
              window.dispatchEvent(new CustomEvent("autocinema:cinema-playlists-updated"));
            } catch (_) {}

            // Wait up to 2.5 seconds allowing pause interruption
            for (let delayMs = 0; delayMs < 2500; delayMs += 200) {
              if (cancelCheckRef.current) break;
              await waitWhilePaused();
              await new Promise((r) => setTimeout(r, 200));
            }
          } else {
            setErrorMessage(`⚠️ تعذر تشغيل أي رابط تلقائياً لـ "${title}".`);
            for (let delayMs = 0; delayMs < 2000; delayMs += 200) {
              if (cancelCheckRef.current) break;
              await waitWhilePaused();
              await new Promise((r) => setTimeout(r, 200));
            }
          }
        }
      }

      // Persist final state
      onUpdatePlaylist(updatedPlaylist);
      savePlaylistToLocalStorage(updatedPlaylist);

      const nextPlaylists = playlists.map((p) =>
        p.id === activePlaylistId ? { ...p, items: updatedPlaylist, updatedAt: new Date().toISOString() } : p
      );
      setPlaylists(nextPlaylists);
      try {
        localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
      } catch (_) {}

      // Await complete cloud upload to Firestore and disk persistence
      await syncRepairedPlaylistToBackendAndCloud(updatedPlaylist, activePlaylistId, nextPlaylists);

      try {
        window.dispatchEvent(new CustomEvent("autocinema:cinema-playlists-updated"));
      } catch (_) {}

      if (repairedCount > 0) {
        setCloudNotice({
          status: "success",
          text: `✓ اكتمل فحص وتحديث قائمة التشغيل: تم فحص ${total} أفلام وتحديث ${repairedCount} روابط معطوبة وتثبيت السيرفرات والجودات ورفعها تلقائياً إلى السحابة Firestore! ☁️⚡`,
        });
      } else {
        setCloudNotice({
          status: "success",
          text: `✓ اكتمل الفحص وتثبيت البيانات: تم فحص وتأكيد جميع روابط وسيرفرات القائمة (${total} أفلام) ورفعها تلقائياً إلى السحابة Firestore! ☁️✨`,
        });
      }
      setTimeout(() => setCloudNotice(null), 6000);
    } finally {
      setIsCheckingPlaylist(false);
      setIsCheckPaused(false);
      isCheckPausedRef.current = false;
      setPlaylistCheckProgress(null);
    }
  };

  // Quick single item check and repair
  const handleCheckAndFixSingleItem = async (idx: number) => {
    if (idx < 0 || idx >= playlist.length) return;
    setActiveIndex(idx); // Transition to this movie on screen immediately!
    const item = playlist[idx];
    const title = formatCleanMovieTitle(item.movieTitle || item.title || `فيلم #${idx + 1}`, item, movies);

    const currentStreamObj = item.selectedStream;
    const initialMode =
      (currentStreamObj?.preferredMode || item.preferredMode) === "embed"
        ? "embed"
        : "direct";
    setPlaybackMode(initialMode);
    setSelectedStreamOverride(currentStreamObj || null);
    setErrorMessage(null);
    setHealingSuccessToast(`جاري الانتقال وفحص تشغيل: "${title}" على الشاشة... ⏳`);

    try {
      const itemEl = playlistContainerRef.current?.querySelector(`[data-index="${idx}"]`);
      itemEl?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    } catch (_) {}

    const movieOriginUrl = resolveItemMovieSourceUrl(item, movies);
    const directMediaUrl = getPlayableDirectUrl(currentStreamObj, item);

    const probeStreamAlive = async (
      urlStr?: string,
      directUrlStr?: string,
      refStr?: string
    ): Promise<{ alive: boolean; playableDirect: boolean; type?: string }> => {
      const target = (directUrlStr || urlStr || "").trim();
      if (!target) return { alive: false, playableDirect: false };
      try {
        const healthRes = await fetch("/api/check-stream-health", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: target,
            directUrl: directUrlStr,
            ref: refStr || target,
          }),
        });
        if (!healthRes.ok) return { alive: false, playableDirect: false };
        const healthData = await healthRes.json();
        return {
          alive: !!healthData.alive,
          playableDirect: !!healthData.playableDirect,
          type: healthData.type,
        };
      } catch {
        return { alive: false, playableDirect: false };
      }
    };

    const itemYtId =
      extractYouTubeId(currentStreamObj?.url) ||
      extractYouTubeId(currentStreamObj?.directUrl) ||
      extractYouTubeId(item.originalUrl) ||
      extractYouTubeId(item.url);
    const isItemYouTube = !!(itemYtId || currentStreamObj?.isYouTube);

    let probeIsAlive = false;
    if (isItemYouTube) {
      probeIsAlive = true;
    } else if (directMediaUrl) {
      const p = await probeStreamAlive(directMediaUrl, currentStreamObj?.directUrl, movieOriginUrl || directMediaUrl);
      probeIsAlive = p.alive;
    } else if (currentStreamObj?.url) {
      const p = await probeStreamAlive(currentStreamObj.url, currentStreamObj.directUrl, movieOriginUrl || currentStreamObj.url);
      probeIsAlive = p.alive;
    }

    let screenPlaybackOk = false;
    if (isItemYouTube) {
      screenPlaybackOk = true;
    } else if (probeIsAlive) {
      await new Promise((r) => setTimeout(r, 400));
      const verifyRes = await verifyScreenPlayback(3800);
      screenPlaybackOk = verifyRes.ok;
    }

    const isWorking = probeIsAlive && screenPlaybackOk;

    let fixedStream: any = null;
    let allAvailableStreams: any[] = [];

    if (!isWorking || !currentStreamObj) {
      setErrorMessage(`⚠️ الرابط لا يفتح أو لا يعمل على الشاشة... جاري إعادة فحص وتحديث السيرفرات لـ "${title}"... ⏳`);

      // 1. Re-extract fresh from source page
      if (movieOriginUrl) {
        try {
          const ctrl = new AbortController();
          const tId = setTimeout(() => ctrl.abort(), 10000);
          const extRes = await fetch("/api/extract-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: movieOriginUrl,
              title,
            }),
            signal: ctrl.signal,
          });
          clearTimeout(tId);
          let extData: any = null;
          try {
            extData = await extRes.json();
          } catch (_) {
            extData = null;
          }
          if (extData && extData.success && Array.isArray(extData.streams) && extData.streams.length > 0) {
            allAvailableStreams = extData.streams;
          }
        } catch (_) {}
      }

      if (allAvailableStreams.length === 0 && Array.isArray(item.allStreams) && item.allStreams.length > 0) {
        allAvailableStreams = item.allStreams;
      }

      const candidateStreams = sortStreamsByQualityTiersAscending(
        allAvailableStreams,
        currentStreamObj?.url,
        currentStreamObj?.id
      );

      // Test candidate streams strictly in order: 344 -> 360 -> 480 -> 720 -> 1080
      for (const cand of candidateStreams) {
        const candTarget = (cand.directUrl || cand.url || "").trim();
        const p = await probeStreamAlive(candTarget, cand.directUrl, movieOriginUrl);
        if (!p.alive) continue;

        const candMode = cand.type === "embed" ? "embed" : "direct";
        setSelectedStreamOverride(cand);
        setPlaybackMode(candMode);
        setErrorMessage(`جاري فحص وتأكيد تشغيل: ${cand.server} (${cand.quality || "جودة"}) على الشاشة... ⏳`);

        await new Promise((r) => setTimeout(r, 450));
        const candVerify = await verifyScreenPlayback(3600);
        if (candVerify.ok) {
          fixedStream = cand;
          break;
        }
      }

      // Fallback to first probe-alive stream in 344 -> 360 -> 480 -> 720 -> 1080 order if none decoded on screen
      if (!fixedStream && candidateStreams.length > 0) {
        for (const cand of candidateStreams) {
          const candTarget = (cand.directUrl || cand.url || "").trim();
          const p = await probeStreamAlive(candTarget, cand.directUrl, movieOriginUrl);
          if (p.alive) {
            fixedStream = cand;
            const candMode = cand.type === "embed" ? "embed" : "direct";
            setSelectedStreamOverride(cand);
            setPlaybackMode(candMode);
            break;
          }
        }
      }
    } else {
      setHealingSuccessToast(`✓ الرابط الحالي يعمل بكفاءة وجاري عرضه على الشاشة (${currentStreamObj?.server || "سيرفر"} - ${currentStreamObj?.quality || "HD"}) ✨`);
      setTimeout(() => setHealingSuccessToast(null), 3500);
      return;
    }

    if (fixedStream) {
      const targetMode = fixedStream.type === "embed" ? "embed" : "direct";
      const resolvedUrl = fixedStream.url || fixedStream.directUrl || item.url;
      const resolvedDirectUrl = fixedStream.directUrl || fixedStream.url || item.directUrl;
      const updatedItem = {
        ...item,
        url: resolvedUrl,
        directUrl: resolvedDirectUrl,
        streamUrl: resolvedUrl,
        selectedStream: { ...fixedStream, preferredMode: targetMode },
        preferredMode: targetMode,
        selectedServer: fixedStream.server,
        selectedQuality: fixedStream.quality,
        selectedType: fixedStream.type,
        allStreams: allAvailableStreams.length > 0 ? allAvailableStreams : item.allStreams,
        originalUrl: movieOriginUrl || item.originalUrl || item.url,
        wasAutoRepaired: true,
        repairedQuality: fixedStream.quality,
        repairedAt: new Date().toISOString(),
      };

      const updated = [...playlist];
      updated[idx] = updatedItem;

      // Replace immediately and update live on screen right away!
      onUpdatePlaylist(updated);
      savePlaylistToLocalStorage(updated);
      saveStreamPreference(movieOriginUrl || item.originalUrl || item.url, updatedItem.selectedStream, targetMode);

      const nextPlaylists = playlists.map((p) =>
        p.id === activePlaylistId ? { ...p, items: updated, updatedAt: new Date().toISOString() } : p
      );
      setPlaylists(nextPlaylists);
      try {
        localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
      } catch (_) {}
      
      await syncRepairedPlaylistToBackendAndCloud(updated, activePlaylistId, nextPlaylists);

      try {
        window.dispatchEvent(new CustomEvent("autocinema:cinema-playlists-updated"));
      } catch (_) {}

      // Switch screen display immediately to repaired stream!
      setPlaybackMode(targetMode);
      setSelectedStreamOverride(fixedStream);
      setErrorMessage(null);

      setHealingSuccessToast(`✓ تم بنجاح استخراج واستبدال الرابط بـ (${fixedStream.server} - ${fixedStream.quality}) وتشغيله ورفعه للسحابة Firestore! ⚡`);
      setTimeout(() => setHealingSuccessToast(null), 4000);
    } else {
      setHealingSuccessToast(`⚠️ تعذر استخراج رابط شغال حالياً لهذا الفيلم.`);
      setTimeout(() => setHealingSuccessToast(null), 3500);
    }
  };


  // Sync preference mode on movie change
  useEffect(() => {
    if (!isOpen || !currentMovie) return;
    const targetUrl = (currentStream?.url || currentMovie.originalUrl || "").trim();
    const prefs = getStreamPreferences();
    const pref = prefs[normalizeVideoKey(targetUrl || currentMovie.originalUrl)];

    if (currentMovie.allStreams && currentMovie.allStreams.length > 0) {
      const sorted = sortStreamsAscending(currentMovie.allStreams);
      if (pref) {
        const matched = findMatchingStream(sorted, pref);
        if (matched && (matched.url !== currentStream?.url || matched.id !== currentStream?.id)) {
          const isMatchedYt = !!(
            extractYouTubeId(matched.url) ||
            extractYouTubeId(matched.directUrl) ||
            extractYouTubeId(currentMovie.originalUrl) ||
            matched.isYouTube ||
            matched.url?.includes("/api/youtube-player")
          );
          const mode = isMatchedYt
            ? "embed"
            : (pref.playbackMode ||
              (matched.type === "embed"
                ? "embed"
                : matched.type === "hls" || matched.type === "mp4" || matched.directUrl?.includes(".m3u8")
                ? "direct"
                : "embed"));
          const streamWithPref = { ...matched, preferredMode: mode };
          const updated = [...playlist];
          updated[activeIndex] = {
            ...currentMovie,
            selectedStream: streamWithPref,
            preferredMode: mode,
            selectedServer: matched.server,
            selectedQuality: matched.quality,
            selectedType: matched.type,
            allStreams: sorted,
          };
          setTimeout(() => {
            onUpdatePlaylist(updated);
            savePlaylistToLocalStorage(updated);
          }, 0);
          setPlaybackMode(mode);
          setErrorMessage(null);
          return;
        }
      } else if (!currentStream) {
        const def = pickDefaultQualityStream(sorted);
        if (def) {
          const isDefYt = !!(
            extractYouTubeId(def.url) ||
            extractYouTubeId(def.directUrl) ||
            extractYouTubeId(currentMovie.originalUrl) ||
            def.isYouTube ||
            def.url?.includes("/api/youtube-player")
          );
          const mode = isDefYt ? "embed" : (def.type === "embed" ? "embed" : "direct");
          const streamWithPref = { ...def, preferredMode: mode };
          const updated = [...playlist];
          updated[activeIndex] = {
            ...currentMovie,
            selectedStream: streamWithPref,
            preferredMode: mode,
            selectedServer: def.server,
            selectedQuality: def.quality,
            selectedType: def.type,
            allStreams: sorted,
          };
          setTimeout(() => {
            onUpdatePlaylist(updated);
            savePlaylistToLocalStorage(updated);
          }, 0);
          setPlaybackMode(mode);
          setErrorMessage(null);
          return;
        }
      }
    }

    const isCurrentYt = !!(
      extractYouTubeId(currentStream?.url) ||
      extractYouTubeId(currentStream?.directUrl) ||
      extractYouTubeId(currentMovie?.originalUrl) ||
      extractYouTubeId(currentMovie?.url) ||
      currentStream?.isYouTube
    );

    if (isCurrentYt) {
      setPlaybackMode("embed");
    } else if (pref?.playbackMode) {
      setPlaybackMode(pref.playbackMode);
    } else if (currentStream?.preferredMode) {
      setPlaybackMode(currentStream.preferredMode);
    } else if (currentStream) {
      const hasDirect =
        currentStream.type !== "embed" && !!getPlayableDirectUrl(currentStream, currentMovie);
      setPlaybackMode(hasDirect ? "direct" : "embed");
    }
    setErrorMessage(null);
  }, [
    activeIndex,
    currentMovie?.id,
    currentStream?.url,
    currentStream?.directUrl,
  ]);

  // Check if item has no streams at all, and auto-resolve for initial unextracted items
  useEffect(() => {
    if (!isOpen || !currentMovie) return;
    if (hasPlaybackStartedRef.current) return;

    const targetUrl = (currentStream?.url || currentMovie.originalUrl || "").trim();
    const hasStreams = Array.isArray(currentMovie.allStreams) && currentMovie.allStreams.length > 0;
    const prefs = getStreamPreferences();
    const pref = prefs[normalizeVideoKey(targetUrl || currentMovie.originalUrl)];
    const hasSavedPref = !!(pref && (pref.serverId || pref.serverName || pref.playbackMode));

    // NEVER auto-resolve if video is already playing or ready on screen
    const vid = videoRef.current;
    if (vid && !vid.error && (!vid.paused || vid.currentTime > 0.1 || vid.videoWidth > 0)) {
      hasPlaybackStartedRef.current = true;
      return;
    }

    // Only resolve if this item has NEVER been extracted before (no streams and no stream selected)
    const needsInitialExtraction = !hasStreams && !currentStream && !hasSavedPref && targetUrl;

    if (needsInitialExtraction) {
      triggerAutoHealRef.current("استخراج روابط الفيلم الأولية");
    }
  }, [isOpen, activeIndex, currentMovie?.id]);

  // -------------------------------------------------------------
  // Normal Opening Playback Watchdog:
  // When opening a movie normally (outside batch check), verify that playback actually starts on initial load.
  // ONLY triggers if the video genuinely failed to play on initial opening.
  // If the video plays, NO updating of links occurs!
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !currentMovie || isCheckingPlaylist || isAutoHealing) {
      if (normalLoadWatchdogRef.current) {
        clearTimeout(normalLoadWatchdogRef.current);
        normalLoadWatchdogRef.current = null;
      }
      return;
    }

    const movieKey = `${currentMovie.id || currentMovie.movieTitle || activeIndex}`;

    if (normalLoadWatchdogRef.current) {
      clearTimeout(normalLoadWatchdogRef.current);
      normalLoadWatchdogRef.current = null;
    }

    // Give the video an 8.5s window to start playing on initial opening
    normalLoadWatchdogRef.current = setTimeout(() => {
      if (isCheckingPlaylist || isAutoHealing) return;

      // RULE: YouTube streams render in official iframe player; bypass HTML5 video watchdog
      const isYtStream = !!(
        extractYouTubeId(currentStream?.url) ||
        extractYouTubeId(currentStream?.directUrl) ||
        extractYouTubeId(currentMovie?.originalUrl) ||
        extractYouTubeId(currentMovie?.url) ||
        currentStream?.isYouTube
      );
      if (isYtStream) {
        hasPlaybackStartedRef.current = true;
        return;
      }

      // RULE: If video has already started playing, DO NOT RE-EXTRACT OR UPDATE LINKS!
      if (hasPlaybackStartedRef.current) {
        return;
      }

      const vid = videoRef.current;
      if (vid && !vid.error && (vid.currentTime > 0.05 || !vid.paused || vid.videoWidth > 0)) {
        hasPlaybackStartedRef.current = true;
        return;
      }

      if (playbackMode === "direct") {
        // Only trigger if video element has a true error, or is dead/unresponsive on initial opening
        const isPlaybackFailing =
          vid &&
          (vid.error !== null ||
            vid.networkState === 3 || // NETWORK_NO_SOURCE
            (!vid.paused && vid.currentTime <= 0.01 && vid.readyState < 2));

        if (isPlaybackFailing) {
          const now = Date.now();
          const lastHealed = (window as any).__autocinema_last_healed_time || 0;
          const lastHealedKey = (window as any).__autocinema_last_healed_key || "";
          if (lastHealedKey === movieKey && now - lastHealed < 30000) {
            return;
          }

          console.warn("[Cinema Player] Normal opening failed to play on initial opening, attempting recovery...");
          (window as any).__autocinema_last_healed_time = now;
          (window as any).__autocinema_last_healed_key = movieKey;
          triggerAutoHealRef.current("تعذر تشغيل الفيديو عند الفتح الأولي");
        }
      }
    }, 8500);

    return () => {
      if (normalLoadWatchdogRef.current) {
        clearTimeout(normalLoadWatchdogRef.current);
        normalLoadWatchdogRef.current = null;
      }
    };
  }, [isOpen, activeIndex, currentMovie?.id, isCheckingPlaylist, playbackMode]);

  // -------------------------------------------------------------
  // Video & HLS Playback Engine
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !currentMovie || playbackMode !== "direct") {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Resolve true playable direct URL (not HTML embed)
    const rawDirectUrl = getPlayableDirectUrl(currentStream, currentMovie);
    if (!rawDirectUrl) {
      setPlaybackMode("embed");
      return;
    }

    const finalPlayableUrl = getCORSProxiedMediaUrl(rawDirectUrl);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHlsStream =
      rawDirectUrl.includes(".m3u8") ||
      rawDirectUrl.includes("/hls/") ||
      finalPlayableUrl.includes(".m3u8") ||
      finalPlayableUrl.includes("/hls/") ||
      currentStream?.type === "hls";

    if (isHlsStream) {
      if (Hls.isSupported()) {
        const hlsInstance = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          xhrSetup: (xhr) => {
            xhr.withCredentials = false;
          },
        });
        hlsRef.current = hlsInstance;

        hlsInstance.loadSource(finalPlayableUrl);
        hlsInstance.attachMedia(videoEl);

        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          videoEl
            .play()
            .then(() => {
              hasPlaybackStartedRef.current = true;
              setIsPlaying(true);
              setErrorMessage(null);
            })
            .catch(() => {
              videoEl.muted = true;
              setIsMuted(true);
              videoEl.play().then(() => {
                hasPlaybackStartedRef.current = true;
                setIsPlaying(true);
              }).catch(() => {});
            });
        });

        hlsInstance.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            console.warn("[Cinema Player HLS Fatal Error]", data.type, data.details);
            // If already played or during batch link check, never cut off playback
            if (isCheckingPlaylist || hasPlaybackStartedRef.current) {
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hlsInstance.recoverMediaError();
              }
              return;
            }
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (data.response && (data.response.code === 403 || data.response.code === 404)) {
                  console.warn("[Cinema Player] 403/404 token expired on initial load, auto-healing...");
                  triggerAutoHealRef.current("انتهاء صلاحية التوكن 403/404 عند الفتح الأولي");
                } else if (!finalPlayableUrl.startsWith("/api/stream-proxy")) {
                  const proxied = `/api/stream-proxy?url=${encodeURIComponent(rawDirectUrl)}`;
                  hlsInstance.loadSource(proxied);
                  hlsInstance.startLoad();
                } else {
                  triggerAutoHealRef.current("عطب أو توقف في شبكة البث المباشر (HLS Network Error)");
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hlsInstance.recoverMediaError();
                break;
              default:
                hlsInstance.destroy();
                triggerAutoHealRef.current("عطب وتوقف في مشغل البث عند الفتح الأولي");
                break;
            }
          }
        });
      } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
        videoEl.src = finalPlayableUrl;
        videoEl.play().then(() => {
          hasPlaybackStartedRef.current = true;
          setIsPlaying(true);
        }).catch(() => {});
      } else {
        setPlaybackMode("embed");
      }
    } else {
      // Standard MP4
      videoEl.src = finalPlayableUrl;
      videoEl
        .play()
        .then(() => {
          hasPlaybackStartedRef.current = true;
          setIsPlaying(true);
          setErrorMessage(null);
        })
        .catch(() => {
          videoEl.muted = true;
          setIsMuted(true);
          videoEl.play().then(() => {
            hasPlaybackStartedRef.current = true;
            setIsPlaying(true);
          }).catch(() => {});
        });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [
    isOpen,
    currentMovie?.id,
    currentStream?.url,
    currentStream?.directUrl,
    playbackMode,
    reloadCounter,
  ]);

  // -------------------------------------------------------------
  // Navigation & Control Actions
  // -------------------------------------------------------------
  const handleSelectMode = (mode: "direct" | "embed") => {
    setPlaybackMode(mode);
    if (currentMovie && currentStream) {
      let targetStream = currentStream;
      if (mode === "direct" && currentStream.type === "embed" && Array.isArray(currentMovie.allStreams)) {
        const directCandidate = currentMovie.allStreams.find(
          (s: any) =>
            s.type === "hls" ||
            s.type === "mp4" ||
            s.url?.includes(".m3u8") ||
            s.directUrl?.includes(".m3u8")
        );
        if (directCandidate) {
          targetStream = directCandidate;
        }
      } else if (mode === "embed" && currentStream.type !== "embed" && Array.isArray(currentMovie.allStreams)) {
        const embedCandidate = currentMovie.allStreams.find((s: any) => s.type === "embed");
        if (embedCandidate) {
          targetStream = embedCandidate;
        }
      }

      const streamWithPref = { ...targetStream, preferredMode: mode };
      const updated = [...playlist];
      updated[activeIndex] = {
        ...currentMovie,
        selectedStream: streamWithPref,
        preferredMode: mode,
        selectedServer: targetStream.server,
        selectedQuality: targetStream.quality,
        selectedType: targetStream.type,
      };
      onUpdatePlaylist(updated);
      savePlaylistToLocalStorage(updated);
      saveStreamPreference(currentMovie.originalUrl || targetStream.url, streamWithPref, mode);

      const nextPlaylists = playlists.map((p) =>
        p.id === activePlaylistId ? { ...p, items: updated, updatedAt: new Date().toISOString() } : p
      );
      setPlaylists(nextPlaylists);
      try {
        localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
      } catch (_) {}
      saveCinemaPlaylistToDb(updated, activeIndex).catch(() => {});
      saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch(() => {});
    }
    setErrorMessage(null);
  };

  const handleTogglePlay = () => {
    if (playbackMode === "direct" && videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleNextMovie = () => {
    if (playlist.length <= 1) return;
    const nextIdx = (activeIndex + 1) % playlist.length;
    setActiveIndex(nextIdx);
  };

  const handlePrevMovie = () => {
    if (playlist.length <= 1) return;
    const prevIdx = (activeIndex - 1 + playlist.length) % playlist.length;
    setActiveIndex(prevIdx);
  };

  const handleSelectStream = (stream: any) => {
    if (!currentMovie) return;
    const preferredMode =
      stream.type === "embed"
        ? "embed"
        : stream.type === "hls" || stream.type === "mp4" || stream.directUrl?.includes(".m3u8")
        ? "direct"
        : playbackMode;

    const streamWithPref = { ...stream, preferredMode };
    setSelectedStreamOverride(streamWithPref);
    setPlaybackMode(preferredMode);
    setErrorMessage(null);

    const updated = [...playlist];
    const streamTargetUrl = stream.url || stream.directUrl || currentMovie.url;
    const streamTargetDirectUrl = stream.directUrl || stream.url || currentMovie.directUrl;
    updated[activeIndex] = {
      ...currentMovie,
      url: streamTargetUrl,
      directUrl: streamTargetDirectUrl,
      streamUrl: streamTargetUrl,
      selectedStream: streamWithPref,
      preferredMode,
      selectedServer: stream.server,
      selectedQuality: stream.quality,
      selectedType: stream.type,
      allStreams: sortedStreams.length > 0 ? sortedStreams : (currentMovie.allStreams || []),
    };
    onUpdatePlaylist(updated);
    savePlaylistToLocalStorage(updated);
    saveStreamPreference(currentMovie.originalUrl || stream.url, streamWithPref, preferredMode);

    const nextPlaylists = playlists.map((p) =>
      p.id === activePlaylistId ? { ...p, items: updated, updatedAt: new Date().toISOString() } : p
    );
    setPlaylists(nextPlaylists);
    try {
      localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
    } catch (_) {}
    saveCinemaPlaylistToDb(updated, activeIndex).catch(() => {});
    saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch(() => {});
  };

  const handleNextServer = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const streams = sortedStreams.length > 0 ? sortedStreams : (currentMovie?.allStreams || []);
    if (!currentMovie || !Array.isArray(streams) || streams.length === 0) {
      triggerAutoHeal("استخراج سيرفرات بديلة", true);
      return;
    }
    if (streams.length === 1) {
      setHealingSuccessToast(`لا يوجد سوى سيرفر واحد متاح حالياً (${streams[0].server}) ⚡`);
      setTimeout(() => setHealingSuccessToast(null), 3000);
      return;
    }

    let curIdx = -1;
    if (currentStream) {
      // 1. Match by stream ID
      if (currentStream.id) {
        curIdx = streams.findIndex((s: any) => s.id && s.id === currentStream.id);
      }
      // 2. Match by exact directUrl or url
      if (curIdx === -1 && (currentStream.url || currentStream.directUrl)) {
        curIdx = streams.findIndex(
          (s: any) =>
            (currentStream.url && (s.url === currentStream.url || s.directUrl === currentStream.url)) ||
            (currentStream.directUrl && (s.directUrl === currentStream.directUrl || s.url === currentStream.directUrl))
        );
      }
      // 3. Match by Server name AND Quality (exact stream match - avoids getting stuck on the same server)
      if (curIdx === -1 && currentStream.server) {
        curIdx = streams.findIndex(
          (s: any) =>
            s.server === currentStream.server &&
            (!currentStream.quality || s.quality === currentStream.quality)
        );
      }
      // 4. Fallback match by Server name
      if (curIdx === -1 && currentStream.server) {
        curIdx = streams.findIndex((s: any) => s.server === currentStream.server);
      }
    }

    // Try finding next distinct server provider first (e.g. from Stream to VidCloud), or cycle sequentially
    let nextIdx = curIdx === -1 ? 0 : (curIdx + 1) % streams.length;
    if (curIdx !== -1 && streams.length > 2) {
      const curServerBase = (currentStream?.server || "").replace(/\s*\(.*?\)/, "").trim().toLowerCase();
      // Look forward for a different server provider
      const diffIdx = streams.findIndex((s: any, idx: number) => {
        if (idx <= curIdx) return false;
        const sBase = (s.server || "").replace(/\s*\(.*?\)/, "").trim().toLowerCase();
        return sBase && sBase !== curServerBase;
      });
      if (diffIdx !== -1) {
        nextIdx = diffIdx;
      } else {
        // Check if there is another server provider earlier in the list before wrapping
        const wrapDiffIdx = streams.findIndex((s: any) => {
          const sBase = (s.server || "").replace(/\s*\(.*?\)/, "").trim().toLowerCase();
          return sBase && sBase !== curServerBase;
        });
        if (wrapDiffIdx !== -1 && wrapDiffIdx !== curIdx) {
          nextIdx = wrapDiffIdx;
        }
      }
    }

    const nextStream = streams[nextIdx];
    if (nextStream) {
      handleSelectStream(nextStream);
      setHealingSuccessToast(
        `تم الانتقال إلى السيرفر [${nextIdx + 1}/${streams.length}]: ${nextStream.server} (${nextStream.quality || "HD"}) ⚡`
      );
      setTimeout(() => setHealingSuccessToast(null), 3500);
    }
  };

  const handleRemoveFromPlaylist = (indexToRemove: number) => {
    const updated = playlist.filter((_, idx) => idx !== indexToRemove);
    onUpdatePlaylist(updated);
    savePlaylistToLocalStorage(updated);
    const nextPlaylists = playlists.map((p) =>
      p.id === activePlaylistId ? { ...p, items: updated, updatedAt: new Date().toISOString() } : p
    );
    setPlaylists(nextPlaylists);
    try {
      localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
    } catch (_) {}
    saveCinemaPlaylistToDb(updated, activeIndex).catch((err) => console.warn(err));
    saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch((err) => console.warn(err));
    if (activeIndex >= updated.length) {
      setActiveIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleMoveItem = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= playlist.length) return;
    setPlaylistSortMode("manual");
    try {
      localStorage.setItem("autocinema_playlist_sort_mode", "manual");
    } catch (_) {}
    const updated = [...playlist];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    onUpdatePlaylist(updated);
    savePlaylistToLocalStorage(updated);
    const nextPlaylists = playlists.map((p) =>
      p.id === activePlaylistId ? { ...p, items: updated, updatedAt: new Date().toISOString() } : p
    );
    setPlaylists(nextPlaylists);
    try {
      localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
    } catch (_) {}
    saveCinemaPlaylistToDb(updated, activeIndex).catch((err) => console.warn(err));
    saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch((err) => console.warn(err));
    if (activeIndex === fromIdx) setActiveIndex(toIdx);
    else if (activeIndex === toIdx) setActiveIndex(fromIdx);
  };

  const toggleFullscreen = () => {
    if (!cinemaContainerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      cinemaContainerRef.current.requestFullscreen?.().catch(() => {});
    }
  };

  const openInPopoutWindow = () => {
    let popUrl =
      currentStream?.directUrl || currentStream?.url || currentMovie?.originalUrl;
    if (popUrl) {
      const ytId = extractYouTubeId(popUrl);
      if (ytId) {
        const vqMatch = String(currentStream?.url || "").match(/vq=([a-z0-9]+)/i);
        const vq = vqMatch ? vqMatch[1] : "medium";
        popUrl = `https://www.youtube.com/embed/${ytId}?autoplay=1&playsinline=1&rel=0&vq=${vq}`;
      } else if (isBuiltinProxyActive && !popUrl.startsWith("/api/")) {
        popUrl = `/api/proxy?url=${encodeURIComponent(popUrl)}`;
      }
      const w = window.open(
        popUrl,
        "_blank",
        "width=960,height=560,toolbar=no,menubar=no,status=no,resizable=yes"
      );
      if (w) {
        try {
          w.focus();
        } catch (_) {}
      }
    }
  };

  if (!isOpen) return null;

  const currentEmbedUrl = getPlayableEmbedUrl(currentStream, currentMovie);
  const currentTitle = formatCleanMovieTitle(currentMovie?.movieTitle || currentMovie?.title, currentMovie, movies);
  const currentYear = extractYearFromTitle(currentTitle);
  const rawSubUrl = currentStream?.subtitles?.[0]?.file || currentMovie?.subtitles?.[0]?.file || "";
  const currentSubtitleUrl = rawSubUrl ? (rawSubUrl.startsWith("/api/") ? rawSubUrl : `/api/stream-proxy?url=${encodeURIComponent(rawSubUrl)}`) : "";

  const isYouTubeStream = !!(
    extractYouTubeId(currentEmbedUrl) ||
    extractYouTubeId(currentStream?.url) ||
    extractYouTubeId(currentStream?.directUrl) ||
    extractYouTubeId(currentMovie?.originalUrl) ||
    extractYouTubeId(currentMovie?.url) ||
    currentStream?.isYouTube ||
    (currentEmbedUrl && (currentEmbedUrl.includes("youtube.com") || currentEmbedUrl.includes("youtu.be")))
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 dir-rtl overflow-hidden animate-in fade-in duration-200 select-none"
      style={{ fontSize: `${scaleRatio * 100}%` }}
    >
      {/* -------------------------------------------------------------
          TOP HEADER
      ------------------------------------------------------------- */}
      <header className="flex items-center justify-between px-2.5 sm:px-4 py-1.5 bg-slate-950/98 backdrop-blur-xl border-b border-indigo-500/30 shadow-md flex-shrink-0 z-30 min-h-[42px] max-h-[46px]">
        {/* Right side in RTL: Brand & Playlist Icon directly above playlist drawer */}
        <div className="flex items-center gap-2 min-w-0 shrink">
          <div className="p-1.5 rounded-lg bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <TvIcon className="w-4 h-4 animate-pulse" />
          </div>
          <h2 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5 truncate">
            <span>شاشة العرض</span>
            <span className="text-amber-400">🎬</span>
          </h2>

          {/* Playlist Icon & Toggle Button Placed Directly Above the Playlist */}
          <button
            type="button"
            onClick={() => setShowPlaylist(!showPlaylist)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer whitespace-nowrap shadow-sm active:scale-95 ${
              showPlaylist
                ? "bg-gradient-to-r from-amber-500/25 via-indigo-900/70 to-purple-900/50 text-amber-300 border-amber-500/60 shadow-amber-500/20"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750 hover:text-white"
            }`}
            title={showPlaylist ? "إخفاء قائمة التشغيل" : "إظهار قائمة التشغيل"}
          >
            <div className="relative">
              <ListVideoIcon className="w-4 h-4 text-amber-400" />
              {playlists.length > 1 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-400 ring-1 ring-slate-950" />
              )}
            </div>
            <span>قائمة التشغيل</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-900/90 text-amber-300 border border-slate-700 font-mono text-[10px] font-bold">
              {playlist.length}
            </span>
            {playlists.length > 1 && (
              <span className="hidden sm:inline-flex px-1.5 py-0.2 rounded-full bg-indigo-600/50 text-indigo-200 border border-indigo-400/30 text-[10px] font-bold">
                {playlists.length} قوائم
              </span>
            )}
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showPlaylist ? "rotate-180 text-amber-400" : "text-slate-400"
              }`}
            />
          </button>
        </div>

        {/* Header Toolbar */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 overflow-x-auto">
          {/* Add movie to playlist */}
          <button
            type="button"
            onClick={() => onOpenExtractor && onOpenExtractor()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
            title="استخراج وإضافة رابط فيلم جديد إلى قائمة التشغيل"
          >
            <PlusIcon className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden xs:inline">إضافة فيلم</span>
          </button>

          {/* Title wrap display mode toggle */}
          <button
            type="button"
            onClick={cycleTitleWrapMode}
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold cursor-pointer transition-colors"
            title={`نمط عرض الأسماء: ${
              titleWrapMode === "clamp"
                ? "سطرين (تلقائي)"
                : titleWrapMode === "full"
                ? "كامل متعدد الأسطر"
                : "سطر واحد"
            } - اضغط للتبديل`}
          >
            <TypeIcon className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px]">
              {titleWrapMode === "clamp" ? "سطرين" : titleWrapMode === "full" ? "كامل" : "مختصر"}
            </span>
          </button>

          {/* Width Preset Buttons (Visible on desktop) */}
          <div className="hidden xl:flex items-center gap-0.5 bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setPlaylistWidth(300);
                try {
                  localStorage.setItem("cinema_playlist_width", "300");
                } catch (_) {}
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                playlistWidth <= 320 ? "bg-amber-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
              }`}
              title="عرض ضيق 300px"
            >
              ضيق
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaylistWidth(440);
                try {
                  localStorage.setItem("cinema_playlist_width", "440");
                } catch (_) {}
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                playlistWidth > 320 && playlistWidth <= 500
                  ? "bg-amber-500 text-slate-950 font-black"
                  : "text-slate-400 hover:text-white"
              }`}
              title="عرض متوسط 440px"
            >
              متوسط
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaylistWidth(600);
                try {
                  localStorage.setItem("cinema_playlist_width", "600");
                } catch (_) {}
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                playlistWidth > 500 ? "bg-amber-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
              }`}
              title="عرض عريض 600px"
            >
              عريض
            </button>
          </div>

          {/* Export fav.json */}
          {onExportPlaylistFavJson && (
            <button
              type="button"
              onClick={async () => {
                const baseItems = (Array.isArray(playlist) && playlist.length > 0)
                  ? playlist
                  : (activePlaylist && Array.isArray(activePlaylist.items) && activePlaylist.items.length > 0)
                    ? activePlaylist.items
                    : [];
                const prefs = getStreamPreferences();
                // Enrich items with current active overrides and stored stream preferences
                const enrichedItems = baseItems.map((it: any, idx: number) => {
                  let activeStream = it.selectedStream;
                  if (idx === activeIndex && selectedStreamOverride) {
                    activeStream = selectedStreamOverride;
                  }
                  const tKey = it.originalUrl || it.url || (activeStream && activeStream.url);
                  const nKey = tKey ? normalizeVideoKey(tKey) : "";
                  const pref = nKey ? prefs[nKey] : null;

                  if (!activeStream && pref && (pref.streamUrl || pref.directUrl)) {
                    activeStream = {
                      id: pref.serverId || "",
                      server: pref.serverName || "سيرفر",
                      quality: pref.quality || "HD",
                      type: pref.type || "direct",
                      url: pref.streamUrl || pref.directUrl,
                      directUrl: pref.directUrl || pref.streamUrl,
                      preferredMode: pref.playbackMode || "direct",
                    };
                  }

                  const srv = (activeStream && (activeStream.server || activeStream.serverName)) || it.selectedServer || pref?.serverName || "سيرفر";
                  const qual = (activeStream && activeStream.quality) || it.selectedQuality || pref?.quality || "HD";
                  const typ = (activeStream && activeStream.type) || it.selectedType || pref?.type || "direct";
                  const pMode = (activeStream && activeStream.preferredMode) || it.preferredMode || pref?.playbackMode || ((activeStream && activeStream.type) === "embed" ? "embed" : "direct");
                  const resolvedUrl = (activeStream && (activeStream.url || activeStream.directUrl)) || pref?.streamUrl || it.streamUrl || it.url || "";
                  const resolvedDirectUrl = (activeStream && (activeStream.directUrl || activeStream.url)) || pref?.directUrl || it.directUrl || resolvedUrl || "";

                  return {
                    ...it,
                    url: resolvedUrl || it.url,
                    directUrl: resolvedDirectUrl,
                    streamUrl: resolvedUrl,
                    selectedServer: srv,
                    selectedQuality: qual,
                    selectedType: typ,
                    preferredMode: pMode,
                    selectedStream: activeStream ? { ...activeStream, preferredMode: pMode, server: srv, quality: qual } : it.selectedStream,
                    allStreams: (it.allStreams && it.allStreams.length > 0) ? it.allStreams : (activeStream ? [activeStream] : []),
                    wasAutoRepaired: Boolean(it.wasAutoRepaired || it.repairedQuality || (pref && pref.quality)),
                    repairedQuality: it.repairedQuality || qual,
                    repairedAt: it.repairedAt || (it.wasAutoRepaired ? new Date().toISOString() : undefined),
                  };
                });

                const syncedPlaylists = (playlists || []).map((p) =>
                  p.id === activePlaylistId ? { ...p, items: enrichedItems, updatedAt: new Date().toISOString() } : p
                );

                // Asynchronously sync to Firestore & backend in background
                syncRepairedPlaylistToBackendAndCloud(enrichedItems, activePlaylistId, syncedPlaylists).catch(() => {});

                onExportPlaylistFavJson(enrichedItems, syncedPlaylists, activePlaylistId);
                setCloudNotice({
                  status: 'success',
                  text: '✓ تم بنجاح تصدير ملف fav.json بأحدث الروابط وجودات السيرفرات لقائمة التشغيل والمفضلة! ⚡',
                });
                setTimeout(() => setCloudNotice(null), 4500);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer whitespace-nowrap"
              title="تصدير قائمة شاشة العرض والمفضلة إلى fav.json بأحدث الجودات والسيرفرات فوراً"
            >
              <DownloadIcon className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">تصدير fav.json</span>
            </button>
          )}

          {/* Import fav.json */}
          {onRestorePlaylistFavJson && (
            <button
              type="button"
              onClick={onRestorePlaylistFavJson}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-850 hover:bg-slate-750 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
              title="استيراد وتحديث fav.json"
            >
              <RotateCcwIcon className="w-3 h-3 text-amber-400" />
              <span className="hidden lg:inline">استيراد</span>
            </button>
          )}

          {/* Restore Default Primary Playlist */}
          <button
            type="button"
            onClick={handleRestoreDefaultPlaylist}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/50 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
            title="استعادة عناصر القائمة الأساسية الافتراضية الأصلية (21 فيلماً مع سيرفرات البث)"
          >
            <RotateCcwIcon className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
            <span className="hidden sm:inline">استعادة أساسية ({DEFAULT_CINEMA_PLAYLISTS[0]?.items?.length || 21})</span>
          </button>

          {/* Google Drive Sync */}
          {onOpenGoogleDriveSync && (
            <button
              type="button"
              onClick={onOpenGoogleDriveSync}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gradient-to-r from-amber-500/90 via-indigo-600/90 to-purple-600/90 hover:from-amber-400 text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap border border-amber-400/40"
              title="مزامنة وتحديث فوري مع Google Drive"
            >
              <CloudIcon className="w-3 h-3 text-amber-300" />
              <span className="hidden sm:inline">Drive</span>
            </button>
          )}

          {/* Firestore Database Sync & Inspector */}
          {onOpenDatabaseModal && (
            <button
              type="button"
              onClick={onOpenDatabaseModal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-600 via-amber-700 to-indigo-700 hover:from-amber-500 hover:to-indigo-600 text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap border border-amber-400/40 ring-1 ring-amber-500/30"
              title="إدارة وحفظ شاشة العرض والمفضلة في قاعدة بيانات Firestore"
            >
              <DatabaseIcon className="w-3 h-3 text-amber-300 animate-pulse" />
              <span className="hidden sm:inline">قاعدة البيانات</span>
            </button>
          )}

          {/* Built-in Proxy Toggle */}
          <button
            type="button"
            onClick={handleToggleBuiltinProxy}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap border ${
              isBuiltinProxyActive
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400/50 shadow-emerald-600/30 ring-1 ring-emerald-500/40"
                : "bg-slate-850 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-750"
            }`}
            title={
              isBuiltinProxyActive
                ? "البروكسي المدمج مفعّل 🟢 (تجاوز الحجب المحلي وسيرفرات المشاهدة) - اضغط للإغلاق"
                : "البروكسي المدمج مغلق ⚪ - اضغط للتشغيل وتجاوز الحجب المحلي"
            }
          >
            {isBuiltinProxyActive ? (
              <ShieldCheckIcon className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            ) : (
              <ZapIcon className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className="hidden sm:inline">البروكسي</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black border ${
                isBuiltinProxyActive
                  ? "bg-emerald-950 text-emerald-300 border-emerald-500/50"
                  : "bg-slate-900 text-slate-400 border-slate-700"
              }`}
            >
              {isBuiltinProxyActive ? "مفعل 🟢" : "مغلق ⚪"}
            </span>
          </button>

          {/* Close / Return to Library */}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
            title="العودة لتصفح المستودعات والأفلام"
          >
            <span>المكتبة</span>
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Cloud Notification Toast inside Cinema Screen */}
      {cloudNotice && (
        <div className={`px-4 py-2 text-xs font-bold text-center border-b shadow-md flex items-center justify-center gap-2 animate-in slide-in-from-top-2 duration-200 z-50 ${
          cloudNotice.status === 'success'
            ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200'
            : cloudNotice.status === 'error'
              ? 'bg-rose-950/95 border-rose-500/60 text-rose-200'
              : 'bg-indigo-950/95 border-indigo-500/60 text-indigo-200'
        }`}>
          <span>{cloudNotice.text}</span>
          <button
            type="button"
            onClick={() => setCloudNotice(null)}
            className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------
          MAIN SPLIT VIEW: PLAYLIST DRAWER + VIDEO PLAYER
      ------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* =========================================================
            PLAYLIST DRAWER / ASIDE (RESIZABLE SIDEWAYS VIA DRAGGER)
        ========================================================= */}
        {showPlaylist && (
          <aside
            style={{
              width: `${playlistWidth}px`,
              minWidth: "260px",
              maxWidth: "75vw",
            }}
            className="w-full md:w-auto flex flex-col bg-slate-900 border-b md:border-b-0 md:border-l border-indigo-500/30 flex-shrink-0 max-h-80 md:max-h-none z-20 shadow-2xl transition-[width] duration-75 ease-out"
          >
            {/* =========================================================
                MULTI-PLAYLIST HEADER DIRECTLY ABOVE PLAYLIST ITEMS
            ========================================================= */}
            <div className="p-2 sm:p-2.5 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-b border-indigo-500/30 flex flex-col gap-2 shrink-0">
              {/* Row 1: Playlist Icon + Active Playlist Badge + Actions */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-xl bg-gradient-to-br from-amber-500/20 via-indigo-600/30 to-purple-600/30 text-amber-400 border border-amber-500/40 shadow-inner flex items-center justify-center shrink-0">
                    <ListVideoIcon className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs sm:text-sm font-black text-white truncate flex items-center gap-1">
                        <span>{activePlaylist.name || "قائمة التشغيل"}</span>
                      </h4>
                      <span className="px-1.5 py-0.2 rounded-full bg-indigo-600/40 text-[10px] font-black text-amber-300 border border-indigo-500/30 shrink-0 font-mono">
                        {playlist.length}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block truncate">
                      {playlists.length > 1 ? `القائمة النشطة (${playlists.length} قوائم متاحة)` : "قائمة التشغيل الرئيسية"}
                    </span>
                  </div>
                </div>

                {/* Toggle Button for Playlist Tools & Functions */}
                <button
                  type="button"
                  onClick={() => setShowPlaylistTools(!showPlaylistTools)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95 border ${
                    showPlaylistTools
                      ? "bg-amber-500 text-slate-950 border-amber-300 ring-1 ring-amber-400/50"
                      : "bg-slate-800 hover:bg-slate-750 text-amber-300 border-indigo-500/50 hover:border-amber-400"
                  }`}
                  title={
                    showPlaylistTools
                      ? "إخفاء أدوات ووظائف القائمة لتوفير المساحة للعناصر"
                      : "إظهار أدوات ووظائف القائمة (البحث، الفحص التلقائي، السحابي، الترتيب، وإدارة القوائم)"
                  }
                >
                  <SlidersVerticalIcon className="w-3.5 h-3.5" />
                  <span>{showPlaylistTools ? "إخفاء الأدوات ▴" : "أدوات وخيارات القائمة ▾"}</span>
                </button>
              </div>

              {/* ALWAYS VISIBLE: Playlist Names / Tabs (Draggable for horizontal reordering) */}
              <div className="flex flex-col gap-1 border-t border-slate-800/80 pt-1 pb-1">
                {draggedPlaylistId && (
                  <div className="flex items-center justify-center gap-1.5 py-0.5 px-2 rounded-md bg-amber-950/70 border border-amber-500/50 text-[10px] font-black text-amber-300 animate-pulse text-center">
                    <MoveHorizontalIcon className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>اسحب بالماوس وضع اسم القائمة بين القوائم لتغيير الترتيب الأفقي ↔️</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                  {playlists.map((pl) => {
                    const isCurrent = pl.id === activePlaylistId;
                    const count = isCurrent ? playlist.length : (pl.items || []).length;
                    const isDragged = draggedPlaylistId === pl.id;
                    const isOver = dragOverPlaylistId === pl.id && !isDragged;

                    return (
                      <React.Fragment key={pl.id}>
                        {/* Insertion indicator before this tab in RTL (right edge) */}
                        {isOver && dragOverPosition === "before" && (
                          <div className="w-1.5 h-6 bg-gradient-to-b from-amber-400 to-amber-500 rounded-full shadow-[0_0_10px_rgba(251,191,36,0.95)] animate-pulse shrink-0 -mx-0.5 z-20" />
                        )}

                        <div
                          draggable={true}
                          onDragStart={(e) => {
                            isDraggingTabRef.current = true;
                            setDraggedPlaylistId(pl.id);
                            e.dataTransfer.setData("text/plain", pl.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = "move";
                            if (draggedPlaylistId && draggedPlaylistId !== pl.id) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const relX = (e.clientX - rect.left) / rect.width;
                              // In RTL layout: right half (relX > 0.5) is before, left half (relX <= 0.5) is after
                              const pos = relX > 0.5 ? "before" : "after";
                              if (dragOverPlaylistId !== pl.id || dragOverPosition !== pos) {
                                setDragOverPlaylistId(pl.id);
                                setDragOverPosition(pos);
                              }
                            }
                          }}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            if (draggedPlaylistId && draggedPlaylistId !== pl.id) {
                              setDragOverPlaylistId(pl.id);
                            }
                          }}
                          onDragLeave={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                            if (dragOverPlaylistId === pl.id) {
                              setDragOverPlaylistId(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (draggedPlaylistId && draggedPlaylistId !== pl.id) {
                              handleReorderPlaylists(draggedPlaylistId, pl.id, dragOverPosition);
                            }
                            setDraggedPlaylistId(null);
                            setDragOverPlaylistId(null);
                            setTimeout(() => {
                              isDraggingTabRef.current = false;
                            }, 150);
                          }}
                          onDragEnd={() => {
                            setDraggedPlaylistId(null);
                            setDragOverPlaylistId(null);
                            setTimeout(() => {
                              isDraggingTabRef.current = false;
                            }, 150);
                          }}
                          onClick={() => {
                            if (isDraggingTabRef.current) return;
                            handleSwitchPlaylist(pl.id);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              handleSwitchPlaylist(pl.id);
                            }
                          }}
                          className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all shrink-0 cursor-grab active:cursor-grabbing border select-none ${
                            isDragged
                              ? "opacity-40 scale-95 border-amber-400 border-dashed bg-amber-950/40 ring-2 ring-amber-400/80 shadow-2xl"
                              : isOver
                                ? "border-amber-400 bg-amber-950/30 ring-2 ring-amber-400/50 scale-102"
                                : isCurrent
                                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-400 shadow-md ring-1 ring-indigo-400/50 font-black scale-102"
                                  : "bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700 font-bold"
                          }`}
                          title={`اضغط واسحب بالماوس لتحريك "${pl.name}" أفقياً بين القوائم، أو انقر للتبديل إليها (${count} عنصر)`}
                        >
                          {/* Drag handle icon */}
                          <MoveHorizontalIcon className="w-3 h-3 text-slate-500 group-hover:text-amber-300 opacity-60 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab active:cursor-grabbing" />

                          <span className="truncate max-w-[130px]">{pl.name}</span>

                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                              isCurrent ? "bg-amber-400 text-slate-950 shadow-sm" : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {count}
                          </span>
                        </div>

                        {/* Insertion indicator after this tab in RTL (left edge) */}
                        {isOver && dragOverPosition === "after" && (
                          <div className="w-1.5 h-6 bg-gradient-to-b from-amber-400 to-amber-500 rounded-full shadow-[0_0_10px_rgba(251,191,36,0.95)] animate-pulse shrink-0 -mx-0.5 z-20" />
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Quick Add Playlist Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setNewPlaylistName("");
                      setNewPlaylistCopyFromCurrent(false);
                      setIsNewPlaylistModalOpen(true);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-amber-300 hover:text-amber-200 border border-slate-700 hover:border-amber-400 text-xs font-bold transition-all shrink-0 cursor-pointer shadow-sm active:scale-95"
                    title="إنشاء قائمة تشغيل جديدة +"
                  >
                    <PlusIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span className="text-[11px] font-black">جديدة</span>
                  </button>
                </div>
              </div>

              {/* Collapsible Tools & Functions Section (Hidden by default to save space for items) */}
              {showPlaylistTools && (
                <div className="flex flex-col gap-2 pt-1 border-t border-indigo-500/20 animate-in slide-in-from-top-2 duration-150">
                  {/* Playlist Management Actions */}
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-bold text-slate-300">إدارة وترتيب القائمة الحالية:</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Horizontal Move Direction Buttons */}
                      {playlists.length > 1 && (
                        <div className="flex items-center gap-0.5 border-l border-slate-700 pl-1.5 ml-1">
                          <button
                            type="button"
                            onClick={() => handleMovePlaylistDirection(activePlaylist.id, "prev")}
                            disabled={playlists.findIndex((p) => p.id === activePlaylist.id) === 0}
                            className="flex items-center gap-0.5 px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700 text-xs transition-colors disabled:opacity-25 cursor-pointer"
                            title="تحريك القائمة يميناً في الترتيب الأفقي ◀"
                          >
                            <ArrowRightIcon className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold">يمين</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMovePlaylistDirection(activePlaylist.id, "next")}
                            disabled={playlists.findIndex((p) => p.id === activePlaylist.id) === playlists.length - 1}
                            className="flex items-center gap-0.5 px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700 text-xs transition-colors disabled:opacity-25 cursor-pointer"
                            title="تحريك القائمة يساراً في الترتيب الأفقي ▶"
                          >
                            <span className="text-[10px] font-bold">يسار</span>
                            <ArrowLeftIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setRenamePlaylistName(activePlaylist.name);
                          setIsRenamePlaylistModalOpen(true);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs transition-colors cursor-pointer"
                        title="إعادة تسمية القائمة الحالية"
                      >
                        <EditIcon className="w-3.5 h-3.5" />
                        <span className="text-[11px]">إعادة تسمية</span>
                      </button>

                      {playlists.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من حذف قائمة "${activePlaylist.name}" بالكامل؟`)) {
                              handleDeletePlaylist(activePlaylist.id);
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-xs transition-colors cursor-pointer"
                          title="حذف هذه القائمة"
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                          <span className="text-[11px]">حذف القائمة</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Search filter & Quick toolbar */}
                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-800/80">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="text"
                    value={playlistSearchTerm}
                    onChange={(e) => setPlaylistSearchTerm(e.target.value)}
                    placeholder="ابحث في القائمة..."
                    className="w-full bg-slate-950 text-slate-200 text-xs rounded-lg px-2.5 py-1 border border-slate-800 focus:outline-none focus:border-indigo-400 font-sans"
                  />
                  {playlistSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setPlaylistSearchTerm("")}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Quick Scroll To Top */}
                  {playlist.length > 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        playlistContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:border-indigo-400 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
                      title="التمرير السريع إلى بداية القائمة ⬆"
                    >
                      <ChevronUpIcon className="w-3.5 h-3.5 text-indigo-400 stroke-[2.5]" />
                    </button>
                  )}

                  {/* Scroll to current active */}
                  {playlist.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const activeEl = playlistContainerRef.current?.querySelector(
                          '[data-active="true"]'
                        );
                        activeEl?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                          inline: "nearest",
                        });
                      }}
                      className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-black transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                      title="تحريك الرؤية وتوسيط الفيلم المعروض حالياً"
                    >
                      <PlayIcon className="w-3 h-3 fill-amber-300" />
                      <span className="font-mono">#{activeIndex + 1}</span>
                    </button>
                  )}

                  {/* Quick Scroll To Bottom */}
                  {playlist.length > 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (playlistContainerRef.current) {
                          playlistContainerRef.current.scrollTo({
                            top: playlistContainerRef.current.scrollHeight,
                            behavior: "smooth",
                          });
                        }
                      }}
                      className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:border-indigo-400 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
                      title="التمرير السريع إلى نهاية القائمة ⬇"
                    >
                      <ChevronDownIcon className="w-3.5 h-3.5 text-indigo-400 stroke-[2.5]" />
                    </button>
                  )}

                  {/* Quick Cloud Save Playlist */}
                  <button
                    type="button"
                    onClick={handleQuickSyncPlaylistToCloud}
                    disabled={isCloudSyncing || playlist.length === 0}
                    className="px-2 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40"
                    title="رفع وحفظ كافة قوائم التشغيل في Firestore سحابياً"
                  >
                    <UploadCloudIcon className={`w-3.5 h-3.5 text-emerald-400 ${isCloudSyncing ? 'animate-spin' : ''}`} />
                    <span className="hidden xl:inline text-[10px]">رفع للسحابة</span>
                  </button>

                  {/* Quick Cloud Pull Playlist */}
                  <button
                    type="button"
                    onClick={handleQuickSyncPlaylistFromCloud}
                    disabled={isCloudSyncing}
                    className="px-2 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40"
                    title="جلب وتحديث قوائم التشغيل من Firestore سحابياً"
                  >
                    <DownloadCloudIcon className={`w-3.5 h-3.5 text-indigo-400 ${isCloudSyncing ? 'animate-spin' : ''}`} />
                    <span className="hidden xl:inline text-[10px]">تحديث</span>
                  </button>

                  {/* Display mode toggle button */}
                  <button
                    type="button"
                    onClick={cycleTitleWrapMode}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                    title={`تغيير طريقة عرض أسماء الأفلام (الحالي: ${
                      titleWrapMode === "clamp" ? "سطرين" : titleWrapMode === "full" ? "كامل" : "مختصر"
                    })`}
                  >
                    <TypeIcon className="w-3.5 h-3.5" />
                  </button>

                  {/* Clear all in playlist */}
                  {playlist.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`هل أنت متأكد من رغبتك في تفريغ كافة عناصر "${activePlaylist.name}"؟`)) {
                          onUpdatePlaylist([]);
                          savePlaylistToLocalStorage([]);
                          const nextPlaylists = playlists.map((p) =>
                            p.id === activePlaylistId ? { ...p, items: [], updatedAt: new Date().toISOString() } : p
                          );
                          setPlaylists(nextPlaylists);
                          try {
                            localStorage.setItem(CINEMA_PLAYLISTS_KEY, JSON.stringify(nextPlaylists));
                          } catch (_) {}
                          saveCinemaPlaylistToDb([], 0).catch((err) => console.warn(err));
                          saveAllCinemaPlaylistsToDb(nextPlaylists, activePlaylistId).catch((err) => console.warn(err));
                        }
                      }}
                      className="text-xs font-bold text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-950/40 transition-colors cursor-pointer flex items-center gap-0.5"
                      title="مسح كافة عناصر هذه القائمة"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-bold hidden sm:inline">مسح</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Row 4: Auto Link Health & Auto-Repair Tool (أداة فحص وتحديث الروابط التلقائية) */}
              <div className="flex flex-col gap-1.5 pt-1.5 border-t border-indigo-500/20 bg-indigo-950/20 -mx-2 -mb-2 p-2 rounded-b-lg">
                <div className="flex items-center justify-between gap-1.5">
                  {/* Main Auto Check & Refresh Action Button */}
                  <button
                    type="button"
                    onClick={handleAutoCheckAndRefreshPlaylist}
                    disabled={isCheckingPlaylist || playlist.length === 0}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer shadow-md active:scale-95 border ${
                      isCheckingPlaylist
                        ? "bg-amber-500/30 text-amber-300 border-amber-500/50 animate-pulse"
                        : "bg-gradient-to-r from-amber-500 via-emerald-600 to-teal-600 hover:from-amber-400 hover:to-emerald-500 text-slate-950 border-amber-300/80 shadow-emerald-950/40"
                    } disabled:opacity-40`}
                    title="فحص وتحديث كافة روابط القائمة تلقائياً واستبدال المتعطل برابط سليم بدءاً من جودة 360/344p"
                  >
                    <ZapIcon className={`w-3.5 h-3.5 ${isCheckingPlaylist ? "animate-spin text-amber-300" : "fill-slate-950"}`} />
                    <span className="truncate">
                      {isCheckingPlaylist ? "جاري فحص وتحديث الروابط..." : "فحص وتحديث الروابط تلقائياً ⚡"}
                    </span>
                  </button>

                  {/* Auto-replace on stall/error toggle */}
                  <button
                    type="button"
                    onClick={toggleAutoReplaceOnDefect}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer border ${
                      autoReplaceOnDefect
                        ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/60 shadow-inner"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
                    }`}
                    title="استبدال الروابط تلقائياً عند حدوث عطب أو توقف البث مبتدئاً بالجودة الأقل (360p / 344p)"
                  >
                    <ShieldCheckIcon className={`w-3.5 h-3.5 ${autoReplaceOnDefect ? "text-emerald-400" : "text-slate-500"}`} />
                    <span className="hidden sm:inline">استبدال عند العطب</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${autoReplaceOnDefect ? "bg-emerald-400 animate-ping" : "bg-slate-600"}`} />
                  </button>
                </div>

                {/* Live Progress Bar with Pause / Resume / Cancel Controls */}
                {isCheckingPlaylist && playlistCheckProgress && (
                  <div
                    className={`rounded-xl p-2.5 border space-y-2 animate-in fade-in duration-200 transition-all ${
                      isCheckPaused
                        ? "bg-amber-950/95 border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/50"
                        : "bg-slate-950/95 border-amber-500/40 shadow-lg"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isCheckPaused ? (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-black text-[10px] flex items-center gap-1 shrink-0 animate-pulse">
                            <PauseIcon className="w-3 h-3 fill-slate-950" />
                            <span>موقوف مؤقتاً</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-600/70 text-indigo-200 border border-indigo-400/30 text-[10px] font-black flex items-center gap-1 shrink-0">
                            <ZapIcon className="w-3 h-3 text-amber-300 animate-spin" />
                            <span>جاري الفحص</span>
                          </span>
                        )}
                        <span className="text-amber-300 truncate font-black max-w-[140px] sm:max-w-[180px]">
                          {playlistCheckProgress.currentTitle}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                        <span className="text-slate-300 font-bold">
                          {playlistCheckProgress.current} / {playlistCheckProgress.total}
                        </span>
                        {playlistCheckProgress.fixedCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 text-[10px] font-black">
                            +{playlistCheckProgress.fixedCount} مصلح ⚡
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress track */}
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          isCheckPaused
                            ? "bg-amber-400"
                            : "bg-gradient-to-r from-amber-400 to-emerald-400"
                        }`}
                        style={{
                          width: `${Math.round(
                            (playlistCheckProgress.current / playlistCheckProgress.total) * 100
                          )}%`,
                        }}
                      />
                    </div>

                    {/* Control Action Buttons: Pause/Resume + Cancel */}
                    <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-800/80">
                      <div className="flex items-center gap-1.5">
                        {isCheckPaused ? (
                          <button
                            type="button"
                            onClick={handleResumeCheck}
                            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs transition-all shadow-md active:scale-95 cursor-pointer ring-1 ring-emerald-300"
                            title="استئناف الفحص التلقائي والمتابعة"
                          >
                            <PlayIcon className="w-3.5 h-3.5 fill-slate-950" />
                            <span>استئناف الفحص ▶️</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handlePauseCheck}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
                            title="إيقاف مؤقت للتدخل اليدوي واختيار السيرفرات"
                          >
                            <PauseIcon className="w-3.5 h-3.5 fill-slate-950" />
                            <span>إيقاف مؤقت ⏸️</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleCancelCheck}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 hover:bg-rose-950/80 text-rose-400 hover:text-rose-200 border border-slate-800 hover:border-rose-500/40 text-xs font-bold transition-all cursor-pointer"
                        title="إلغاء عملية الفحص والتحديث"
                      >
                        <XIcon className="w-3 h-3" />
                        <span>إلغاء</span>
                      </button>
                    </div>

                    {/* Manual intervention guide note when paused */}
                    {isCheckPaused && (
                      <div className="bg-amber-950/60 rounded-lg p-2 border border-amber-500/30 text-[11px] text-amber-200 leading-relaxed font-sans animate-in fade-in duration-150">
                        💡 <strong className="text-amber-100 font-bold">التدخل اليدوي متاح الآن:</strong> يمكنك اختيار سيرفر بديل من شريط السيرفرات، تجربة المشغل أو تعديل الفيلم، ثم الضغط على <strong className="text-emerald-300 underline font-black">[استئناف الفحص]</strong> للمتابعة التلقائية.
                      </div>
                    )}
                  </div>
                )}
              </div>

                {/* Sorting & Order Control Bar (إعادة ترتيب الأفلام وفقاً للاسم أو الإضافة اليدوية) */}
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-r from-slate-950 via-indigo-950/40 to-slate-950 border-t border-indigo-500/30 gap-1.5 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-300 font-bold shrink-0">
                    <ArrowUpDownIcon className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                    <span className="text-[11px] text-amber-300 font-black">ترتيب القائمة:</span>
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar flex-nowrap">
                    {/* Manual / Addition order button */}
                    <button
                      type="button"
                      onClick={() => handleSortPlaylist("manual")}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer whitespace-nowrap border shadow-sm active:scale-95 ${
                        playlistSortMode === "manual"
                          ? "bg-indigo-600 text-white border-indigo-400 shadow-indigo-950/60 ring-1 ring-indigo-400/50"
                          : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                      }`}
                      title="الترتيب وفقاً للإضافة اليدوية (الترتيب الأصلي مع إمكانية تحريك الأفلام يدوياً لأعلى ولأسفل)"
                    >
                      <span>📌 وفقاً للإضافة اليدوية</span>
                    </button>

                    {/* Name Ascending (أ - ي) */}
                    <button
                      type="button"
                      onClick={() => handleSortPlaylist("name-asc")}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer whitespace-nowrap border shadow-sm active:scale-95 ${
                        playlistSortMode === "name-asc"
                          ? "bg-amber-500 text-slate-950 border-amber-300 shadow-amber-950/60 ring-1 ring-amber-400/50"
                          : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                      }`}
                      title="ترتيب قائمة الأفلام أبجدياً وفقاً للاسم (من أ إلى ي)"
                    >
                      <SortAscIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>وفقاً للاسم (أ - ي)</span>
                    </button>

                    {/* Name Descending (ي - أ) */}
                    <button
                      type="button"
                      onClick={() => handleSortPlaylist("name-desc")}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer whitespace-nowrap border shadow-sm active:scale-95 ${
                        playlistSortMode === "name-desc"
                          ? "bg-amber-500 text-slate-950 border-amber-300 shadow-amber-950/60 ring-1 ring-amber-400/50"
                          : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                      }`}
                      title="ترتيب قائمة الأفلام أبجدياً وفقاً للاسم بالعكس (من ي إلى أ)"
                    >
                      <SortDescIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>(ي - أ)</span>
                    </button>
                  </div>
                </div>

                {/* Drag resize hint bar (desktop) */}
                <div className="hidden md:flex items-center justify-between px-2.5 py-1 bg-slate-950/60 border-t border-slate-800/60 text-[10px] text-slate-400 shrink-0">
                  <span className="flex items-center gap-1 font-mono">
                    <MoveHorizontalIcon className="w-3 h-3 text-amber-400/80" />
                    <span>العرض: {playlistWidth}px</span>
                  </span>
                  <span className="text-slate-500">اسحب المقبض الأيسر لتكبير القائمة ↔</span>
                </div>
              </div>
            )}
          </div>

          {/* Mini Progress Bar when tools are collapsed but check is running */}
          {!showPlaylistTools && isCheckingPlaylist && playlistCheckProgress && (
            <div className="px-2.5 py-1 bg-amber-950/80 border-b border-amber-500/40 text-[11px] text-amber-200 flex items-center justify-between shrink-0 animate-pulse">
              <span className="truncate max-w-[200px]">⚡ فحص: {playlistCheckProgress.currentTitle} ({playlistCheckProgress.current}/{playlistCheckProgress.total})</span>
              <button
                type="button"
                onClick={() => setShowPlaylistTools(true)}
                className="text-amber-400 underline font-black text-[10px] hover:text-white cursor-pointer ml-1"
              >
                عرض الأدوات والتحكم ▾
              </button>
            </div>
          )}

            {/* Playlist Movie Items Scroll Area */}
            <div
              ref={playlistContainerRef}
              className="flex-1 overflow-y-auto p-2 space-y-1.5 playlist-scroll-prominent divide-y divide-transparent relative"
            >
              {playlist.length === 0 ? (
                <div className="py-12 text-center text-slate-500 space-y-3 text-xs">
                  <ListVideoIcon className="w-10 h-10 text-slate-600 mx-auto opacity-50" />
                  <p className="font-bold text-slate-300 text-sm">قائمة التشغيل الحالية فارغة.</p>
                  <p className="text-[0.75rem] text-indigo-400 max-w-xs mx-auto leading-relaxed">
                    اضغط على زر الاستعادة بالأسفل لتحميل وتفعيل قائمة "أساسية" الافتراضية الأصلية ({DEFAULT_CINEMA_PLAYLISTS[0]?.items?.length || 21} فيلماً بسيرفرات البث والجودات)، أو اختر سيرفرات لأي فيلم من المكتبة.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleRestoreDefaultPlaylist}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-emerald-950/50 transition-all cursor-pointer active:scale-95 border border-emerald-400/40"
                    >
                      <RotateCcwIcon className="w-4 h-4 text-emerald-200 stroke-[2.5]" />
                      <span>استعادة قائمة أساسية الأصلية ({DEFAULT_CINEMA_PLAYLISTS[0]?.items?.length || 21} فيلماً) 🎬</span>
                    </button>
                  </div>
                </div>
              ) : (
                playlist.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  const itemTitle = formatCleanMovieTitle(item.movieTitle || item.title, item, movies);
                  const year = extractYearFromTitle(itemTitle);
                  const activeStream = item.selectedStream;
                  const serverLabel = activeStream?.server || item.selectedServer;
                  const qualityLabel = activeStream?.quality || item.selectedQuality;
                  const modeLabel =
                    (activeStream?.preferredMode || item.preferredMode) === "embed"
                      ? "Embed"
                      : "HLS";

                  if (
                    playlistSearchTerm.trim() &&
                    !itemTitle.toLowerCase().includes(playlistSearchTerm.trim().toLowerCase()) &&
                    !(serverLabel || "").toLowerCase().includes(playlistSearchTerm.trim().toLowerCase())
                  ) {
                    return null;
                  }

                  return (
                    <div
                      key={item.id || idx}
                      data-index={idx}
                      data-active={isActive ? "true" : "false"}
                      onClick={() => setActiveIndex(idx)}
                      className={`group relative flex flex-col gap-1.5 p-2.5 rounded-xl transition-all duration-200 cursor-pointer select-none border ${
                        isActive
                          ? "bg-gradient-to-l from-amber-500/20 via-indigo-950/90 to-slate-900 border-r-4 border-r-amber-400 border-y-indigo-500/50 border-l-indigo-500/50 shadow-[0_0_16px_rgba(245,158,11,0.22)] ring-1 ring-amber-400/40 text-white"
                          : "bg-slate-900/70 hover:bg-slate-850 border-slate-800/90 hover:border-slate-700/80 text-slate-300 hover:text-white"
                      }`}
                    >
                      {/* Top: Movie Title occupying Lines 1 and 2 */}
                      <div className="flex items-start gap-2 min-w-0">
                        {/* Play Status / Number Badge */}
                        <div className="relative shrink-0 flex items-center justify-center pt-0.5">
                          {isActive ? (
                            <div
                              className="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xs shadow-md shadow-amber-400/30"
                              title="يعرض الآن"
                            >
                              <PlayIcon className="w-3.5 h-3.5 fill-slate-950 animate-pulse" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 group-hover:bg-indigo-600/30 group-hover:text-indigo-200 group-hover:border-indigo-500/30 border border-slate-700/80 flex items-center justify-center font-mono text-[11px] font-bold transition-all">
                              {idx + 1}
                            </div>
                          )}
                        </div>

                        {/* Full width title container for Lines 1 and 2 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1.5">
                            <h5
                              title={itemTitle}
                              className={`text-xs sm:text-[13px] leading-snug font-bold ${
                                isActive
                                  ? "text-amber-300 font-black drop-shadow-sm"
                                  : "text-slate-100 group-hover:text-white"
                              } ${
                                titleWrapMode === "single"
                                  ? "truncate"
                                  : titleWrapMode === "full"
                                  ? "break-words"
                                  : "line-clamp-2 break-words"
                              }`}
                            >
                              {itemTitle}
                            </h5>

                            {/* Year Badge if found */}
                            {year && (
                              <span className="shrink-0 px-1.5 py-0.2 rounded bg-slate-800/90 text-amber-300/90 border border-slate-700 font-mono text-[10px] font-bold">
                                {year}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Line: Stream Tags & Badges + Move Up/Down, Rename & Delete Action Buttons */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60 mt-0.5">
                        {/* Stream Tags / Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-none min-w-0">
                          {isActive && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-[10px] font-black shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                              <span>يعرض الآن</span>
                            </span>
                          )}

                          {serverLabel && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold truncate max-w-[130px] shrink-0 ${
                                isActive
                                  ? "bg-red-600/50 text-red-100 border border-red-400/60 font-black shadow-sm"
                                  : "bg-slate-800 text-slate-300 border border-slate-700"
                              }`}
                              title={`السيرفر: ${serverLabel}`}
                            >
                              {serverLabel}
                            </span>
                          )}

                          <span
                            className={`px-1 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                              isActive
                                ? "bg-red-600/35 text-red-200 border border-red-500/50 font-black"
                                : "bg-slate-850 text-slate-400 border border-slate-750"
                            }`}
                          >
                            {modeLabel}
                          </span>

                          {qualityLabel && (
                            <span
                              className={`px-1 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                                isActive
                                  ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                                  : "bg-slate-800/80 text-amber-400/80"
                              }`}
                            >
                              {qualityLabel}
                            </span>
                          )}

                          {item.allStreams && item.allStreams.length > 1 && (
                            <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                              ({item.allStreams.length} سيرفر)
                            </span>
                          )}

                          {item.wasAutoRepaired && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 flex items-center gap-1 shrink-0 shadow-sm"
                              title={`تم فحص هذا الرابط وتحديثه تلقائياً بجودة ${item.repairedQuality || '360p'}`}
                            >
                              <ZapIcon className="w-2.5 h-2.5 text-amber-300 fill-amber-300" />
                              <span>محدث ({item.repairedQuality || '360p'})</span>
                            </span>
                          )}
                        </div>

                        {/* Bottom Row Action Buttons: Move up/down, Rename movie title, Delete */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-0.5 shrink-0 bg-slate-950/80 border border-slate-800/90 rounded-lg p-0.5 shadow-sm"
                        >
                          {/* Quick single-item check & refresh button */}
                          <button
                            type="button"
                            onClick={() => handleCheckAndFixSingleItem(idx)}
                            className="p-1 rounded text-slate-400 hover:text-emerald-300 hover:bg-emerald-950/60 cursor-pointer transition-colors"
                            title="فحص وتحديث رابط هذا الفيلم واستبداله تلقائياً بجودة 360p المستقرة عند العطب ⚡"
                          >
                            <SparklesIcon className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItemIndex(idx);
                              setEditMovieTitleInput(itemTitle);
                              const otherPl = playlists.find((p) => p.id !== activePlaylistId);
                              setMoveTargetPlaylistId(otherPl ? otherPl.id : "__new__");
                              setMoveActionType("move");
                              setIsCreatingNewPlaylistInline(!otherPl);
                              setInlineNewPlaylistName("");
                              setSwitchAfterTransfer(false);
                              setIsRenameMovieOpen(true);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer transition-colors"
                            title="تعديل اسم هذا الفيلم أو نقله إلى قائمة تشغيل أخرى"
                          >
                            <EditIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveItem(idx, idx - 1)}
                            disabled={idx === 0}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 cursor-pointer transition-colors"
                            title="تحريك لأعلى"
                          >
                            <ChevronUpIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveItem(idx, idx + 1)}
                            disabled={idx === playlist.length - 1}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 cursor-pointer transition-colors"
                            title="تحريك لأسفل"
                          >
                            <ChevronDownIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromPlaylist(idx)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 cursor-pointer transition-colors"
                            title="حذف من قائمة التشغيل"
                          >
                            <Trash2Icon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Add Link Button */}
            <div className="p-2.5 bg-slate-950 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => onOpenExtractor && onOpenExtractor()}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-black transition-all border border-slate-700 cursor-pointer active:scale-95"
              >
                <PlusIcon className="w-4 h-4 stroke-[2.5]" />
                <span>إضافة رابط جديد للـ Playlist</span>
              </button>
            </div>
          </aside>
        )}

        {/* =========================================================
            DRAGGABLE SPLITTER / RESIZE DIVIDER (SIDEWAYS RESIZING)
        ========================================================= */}
        {showPlaylist && (
          <div
            role="separator"
            aria-orientation="vertical"
            title="اسحب لتكبير أو تصغير عرض قائمة التشغيل (انقر مرتين للتبديل السريع)"
            onMouseDown={handleDividerMouseDown}
            onTouchStart={handleDividerTouchStart}
            onDoubleClick={handleDividerDoubleClick}
            className={`hidden md:flex flex-col items-center justify-center w-2.5 -mr-1 hover:w-3.5 z-30 cursor-col-resize transition-all select-none group/divider ${
              isDraggingDivider
                ? "bg-amber-400 w-3.5 ring-2 ring-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.8)]"
                : "bg-slate-800/90 hover:bg-amber-500/90 border-r border-slate-750"
            }`}
          >
            <GripVerticalIcon
              className={`w-3.5 h-5 transition-colors ${
                isDraggingDivider
                  ? "text-slate-950 stroke-[3]"
                  : "text-slate-500 group-hover/divider:text-slate-950"
              }`}
            />
          </div>
        )}

        {/* =========================================================
            VIDEO PLAYER STAGE
        ========================================================= */}
        <div
          ref={cinemaContainerRef}
          onMouseMove={pingControls}
          onPointerMove={pingControls}
          onTouchStart={pingControls}
          onClick={pingControls}
          className={`flex-1 min-w-0 flex flex-col bg-black relative overflow-hidden select-none ${
            isFullscreen && !showControls ? "cursor-none" : "cursor-default"
          }`}
        >
          {currentMovie ? (
            <div className="flex-1 flex flex-col relative w-full h-full bg-black">
              {/* Ambient Poster Glow */}
              {currentMovie.posterUrl && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-10 blur-3xl pointer-events-none scale-125 transition-all duration-700"
                  style={{ backgroundImage: `url(${currentMovie.posterUrl})` }}
                />
              )}

              {/* Player Canvas Area */}
              <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden group/player">
                {/* 1. Direct Video Element */}
                {playbackMode === "direct" && !isYouTubeStream ? (
                  <video
                    ref={videoRef}
                    className="w-full h-full object-contain z-10"
                    controls
                    playsInline
                    autoPlay
                    crossOrigin="anonymous"
                    onEnded={() => autoNext && handleNextMovie()}
                    onPlay={() => {
                      hasPlaybackStartedRef.current = true;
                      setIsPlaying(true);
                      if (normalLoadWatchdogRef.current) {
                        clearTimeout(normalLoadWatchdogRef.current);
                        normalLoadWatchdogRef.current = null;
                      }
                    }}
                    onWaiting={() => {
                      // Routine buffer wait - never interrupt or cut off playing video
                    }}
                    onStalled={() => {
                      // Routine network buffer pause - do not interrupt video playback
                    }}
                    onPlaying={() => {
                      hasPlaybackStartedRef.current = true;
                      setIsPlaying(true);
                      setErrorMessage(null);
                      if (normalLoadWatchdogRef.current) {
                        clearTimeout(normalLoadWatchdogRef.current);
                        normalLoadWatchdogRef.current = null;
                      }
                    }}
                    onTimeUpdate={() => {
                      if (videoRef.current && (videoRef.current.currentTime > 0.05 || videoRef.current.videoWidth > 0)) {
                        hasPlaybackStartedRef.current = true;
                        if (normalLoadWatchdogRef.current) {
                          clearTimeout(normalLoadWatchdogRef.current);
                          normalLoadWatchdogRef.current = null;
                        }
                      }
                    }}
                    onError={() => {
                      console.warn("[Cinema Player] Direct video error occurred");
                      // ONLY auto-heal if video genuinely failed to start upon initial opening
                      if (!isCheckingPlaylist && !hasPlaybackStartedRef.current) {
                        triggerAutoHealRef.current("عطب أو خطأ في تشغيل الرابط عند الفتح الأولي");
                      }
                    }}
                  >
                    {currentSubtitleUrl && (
                      <track
                        kind="subtitles"
                        src={currentSubtitleUrl}
                        srcLang="ar"
                        label="عربي"
                        default
                      />
                    )}
                  </video>
                ) : (
                  /* 2. Safe Embed Iframe */
                  <iframe
                    key={`${currentEmbedUrl || currentMovie?.id || "embed"}-${reloadCounter}`}
                    src={currentEmbedUrl}
                    title={currentTitle}
                    className="w-full h-full border-0 z-10 bg-black"
                    sandbox={
                      isYouTubeStream
                        ? undefined
                        : "allow-scripts allow-same-origin allow-forms allow-presentation allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                    }
                    allow={
                      isYouTubeStream
                        ? "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                        : "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen; cross-origin-isolated"
                    }
                    allowFullScreen
                    referrerPolicy={isYouTubeStream ? "strict-origin-when-cross-origin" : "no-referrer-when-downgrade"}
                    onLoad={() => {
                      hasPlaybackStartedRef.current = true;
                      setIsPlaying(true);
                      setErrorMessage(null);
                      if (normalLoadWatchdogRef.current) {
                        clearTimeout(normalLoadWatchdogRef.current);
                        normalLoadWatchdogRef.current = null;
                      }
                    }}
                    onError={() => {
                      console.warn("[Cinema Player] Iframe error occurred");
                      if (
                        !isYouTubeStream &&
                        !isCheckingPlaylist &&
                        !hasPlaybackStartedRef.current
                      ) {
                        triggerAutoHealRef.current("عطب أو خطأ في تشغيل رابط التضمين عند الفتح الأولي");
                      }
                    }}
                  />
                )}

                {/* Error Banner / Auto-heal Notice */}
                {errorMessage && (
                  <div className="absolute top-14 inset-x-4 z-30 p-3 rounded-xl bg-red-950/95 border border-red-500/60 text-red-200 text-xs flex items-center justify-between gap-3 shadow-2xl backdrop-blur-md animate-in fade-in">
                    <div className="flex items-center gap-2 min-w-0">
                      <CircleAlertIcon className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="font-bold leading-normal truncate">{errorMessage}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => triggerAutoHeal("إعادة المحاولة اليدوية", true)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        <RefreshCwIcon className={`w-3 h-3 ${isAutoHealing ? "animate-spin" : ""}`} />
                        <span>تحديث الرابط</span>
                      </button>

                      {playbackMode !== "embed" && (
                        <button
                          type="button"
                          onClick={() => handleSelectMode("embed")}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold cursor-pointer"
                        >
                          مشغل Embed
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={openInPopoutWindow}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-black cursor-pointer flex items-center gap-1"
                      >
                        <ExternalLinkIcon className="w-3 h-3 text-amber-200" />
                        <span>نافذة مستقلة</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Healing Success Toast */}
                {healingSuccessToast && (
                  <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-emerald-950/95 border border-emerald-500 text-emerald-200 text-xs font-black shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in slide-in-from-top-2">
                    <CheckIcon className="w-4 h-4 text-emerald-400" />
                    <span>{healingSuccessToast}</span>
                  </div>
                )}

                {/* Floating Auto-Check Status & Pause / Resume Pill */}
                {isCheckingPlaylist && playlistCheckProgress && (
                  <div
                    className={`absolute top-3 left-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-xl backdrop-blur-md shadow-2xl border transition-all text-xs font-bold ${
                      isCheckPaused
                        ? "bg-amber-950/95 border-amber-500/80 text-amber-200 ring-1 ring-amber-400/50 shadow-amber-500/20"
                        : "bg-slate-950/90 border-indigo-500/60 text-slate-200"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isCheckPaused ? "bg-amber-400 animate-ping" : "bg-emerald-400 animate-pulse"
                      }`}
                    />
                    <span className="truncate max-w-[140px] sm:max-w-xs">
                      {isCheckPaused
                        ? "⏸️ الفحص موقوف مؤقتاً للتدخل اليدوي"
                        : `⚡ فحص وتحديث: ${playlistCheckProgress.currentTitle}`}
                    </span>

                    {isCheckPaused ? (
                      <button
                        type="button"
                        onClick={handleResumeCheck}
                        className="px-2.5 py-0.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
                        title="استئناف الفحص والمتابعة تلقائياً"
                      >
                        <PlayIcon className="w-3 h-3 fill-slate-950" />
                        <span>استئناف</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePauseCheck}
                        className="px-2.5 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
                        title="إيقاف مؤقت للتدخل اليدوي"
                      >
                        <PauseIcon className="w-3 h-3 fill-slate-950" />
                        <span>إيقاف مؤقت</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Floating Top Controls (Mode selector, servers dropdown, popout, fullscreen) */}
                <div
                  className={`absolute top-3 right-3 z-20 flex items-center gap-2 bg-slate-950/85 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/80 shadow-2xl transition-all duration-300 ${
                    isFullscreen && !showControls
                      ? "opacity-0 pointer-events-none -translate-y-2"
                      : "opacity-100 pointer-events-auto translate-y-0"
                  }`}
                >
                  {/* Mode switcher: Direct HLS vs Embed */}
                  <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-750">
                    {isYouTubeStream ? (
                      <div className="flex items-center gap-1.5">
                        <div className="px-2.5 py-1 rounded-md text-xs font-black bg-red-600/25 text-red-300 border border-red-500/35 flex items-center gap-1.5 shadow-sm">
                          <span>🎬 مشغل يوتيوب المعتمد</span>
                        </div>
                        <button
                          type="button"
                          onClick={openInPopoutWindow}
                          className="px-2.5 py-1 rounded-md text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer transition-all"
                          title="تشغيل في نافذة مستقلة لتجاوز أي حظر أو مطالبة بتسجيل الدخول من يوتيوب"
                        >
                          <span>⚡ تشغيل نافذة مستقلة (بدون حظر) ↗</span>
                        </button>
                        <a
                          href={currentStream?.directUrl || (extractYouTubeId(currentEmbedUrl || currentMovie?.originalUrl) ? `https://www.youtube.com/watch?v=${extractYouTubeId(currentEmbedUrl || currentMovie?.originalUrl)}` : currentMovie?.originalUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-md text-xs font-bold bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white flex items-center gap-1 border border-slate-700 transition-all cursor-pointer"
                          title="المشاهدة مباشرة في موقع وتطبيق يوتيوب"
                        >
                          <span>يوتيوب ↗</span>
                        </a>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSelectMode("direct")}
                          className={`px-2.5 py-1 rounded-md text-xs font-black transition-all border flex items-center gap-1.5 cursor-pointer ${
                            playbackMode === "direct"
                              ? "bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white border-red-300 shadow-md shadow-red-600/40 ring-1 ring-red-400"
                              : "bg-slate-950/80 hover:bg-slate-800 text-slate-400 border-transparent"
                          }`}
                          title="تشغيل عبر مشغل HLS/MP4 المباشر النقي بدون إعلانات"
                        >
                          <span>⚡ HLS مباشر</span>
                          {playbackMode === "direct" && (
                            <CheckIcon className="w-3 h-3 text-white stroke-[3]" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectMode("embed")}
                          className={`px-2.5 py-1 rounded-md text-xs font-black transition-all border flex items-center gap-1.5 cursor-pointer ${
                            playbackMode === "embed"
                              ? "bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white border-red-300 shadow-md shadow-red-600/40 ring-1 ring-red-400"
                              : "bg-slate-950/80 hover:bg-slate-800 text-slate-400 border-transparent"
                          }`}
                          title="تشغيل عبر سيرفر التضمين Embed المحمي"
                        >
                          <span>🌐 سيرفر Embed</span>
                          {playbackMode === "embed" && (
                            <CheckIcon className="w-3 h-3 text-white stroke-[3]" />
                          )}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Open in external window button */}
                  <button
                    type="button"
                    onClick={openInPopoutWindow}
                    className="px-2.5 py-1 rounded-lg text-xs font-black transition-all border flex items-center gap-1.5 cursor-pointer bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white border-amber-500/40 shadow-sm"
                    title="فتح في نافذة مستقلة لتجاوز أي قيود حظر أو أخطاء تضمين"
                  >
                    <ExternalLinkIcon className="w-3 h-3 text-amber-300" />
                    <span className="hidden sm:inline">نافذة مستقلة</span>
                  </button>

                  {/* Servers quick dropdown */}
                  {sortedStreams.length > 1 && (
                    <div className="relative group/servers">
                      <button
                        type="button"
                        className="px-2.5 py-1 rounded-lg text-xs font-black bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white flex items-center gap-1.5 border border-red-300 ring-1 ring-red-400/80 shadow-md shadow-red-600/30 cursor-pointer"
                        title="تبديل السيرفر أو الجودة الحالية"
                      >
                        <TvIcon className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">
                          {currentStream?.server || "السيرفر"}
                        </span>
                        <span className="text-[0.6875rem] text-amber-300 font-bold bg-indigo-950 px-1 rounded">
                          {currentStream?.quality || "HD"}
                        </span>
                        <ChevronDownIcon className="w-3 h-3 text-white/80" />
                      </button>

                      <div className="absolute right-0 top-full mt-1.5 w-56 bg-slate-900/98 backdrop-blur-xl border border-slate-700 rounded-xl shadow-2xl p-1.5 hidden group-hover/servers:block z-30 animate-in fade-in duration-150">
                        <div className="px-2 py-1 text-[0.6875rem] font-black text-slate-400 border-b border-slate-800">
                          اختر سيرفر أو جودة أخرى:
                        </div>
                        <div className="max-h-52 overflow-y-auto space-y-1 pt-1 custom-scrollbar">
                          {sortedStreams.map((st: any, sIdx: number) => {
                            const isCur = st.url === currentStream?.url;
                            return (
                              <button
                                key={`${st.id || 'stream'}-${sIdx}`}
                                type="button"
                                onClick={() => handleSelectStream(st)}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold text-right transition-colors cursor-pointer border ${
                                  isCur
                                    ? "bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white font-black border-red-300 shadow-md ring-1 ring-red-400/60"
                                    : "hover:bg-slate-800 text-slate-300 border-transparent"
                                }`}
                              >
                                <span className="truncate">{st.server}</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[0.6875rem] font-mono px-1 rounded bg-slate-950/60 text-amber-300">
                                    {st.quality}
                                  </span>
                                  {isCur && (
                                    <CheckIcon className="w-3.5 h-3.5 text-emerald-300 stroke-[3]" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quick arrow button to jump directly to the next server without opening dropdown */}
                  {sortedStreams.length > 1 && (
                    <button
                      type="button"
                      onClick={handleNextServer}
                      className="px-2.5 py-1 rounded-lg text-xs font-black bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 flex items-center gap-1.5 border border-amber-300 ring-1 ring-amber-300/80 shadow-md shadow-amber-950/40 cursor-pointer active:scale-95 transition-all group/nextsrv"
                      title="الانتقال المباشر إلى السيرفر التالي بدون الحاجة لفتح الخانة"
                    >
                      <span className="hidden xs:inline">السيرفر التالي</span>
                      <ArrowLeftIcon className="w-3.5 h-3.5 stroke-[2.5] group-hover/nextsrv:-translate-x-0.5 transition-transform text-slate-950" />
                    </button>
                  )}

                  {/* Fullscreen toggle button with distinguished green arrow styling */}
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-black text-xs transition-all cursor-pointer active:scale-95 shadow-md ${
                      isFullscreen
                        ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/60 hover:bg-emerald-900"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-300 shadow-emerald-900/50 ring-1 ring-emerald-300/80 group/fs"
                    }`}
                    title={isFullscreen ? "إنهاء ملء الشاشة (تصغير)" : "تكبير الشاشة (ملء الشاشة)"}
                  >
                    {isFullscreen ? (
                      <>
                        <Minimize2Icon className="w-4 h-4 text-emerald-300 stroke-[2.5]" />
                        <span className="hidden sm:inline">تصغير</span>
                      </>
                    ) : (
                      <>
                        <Maximize2Icon className="w-4 h-4 text-emerald-100 group-hover/fs:scale-110 stroke-[2.5] transition-transform" />
                        <span className="hidden sm:inline">ملء الشاشة</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Floating Fullscreen Title Overlay */}
                {isFullscreen && (
                  <div
                    className={`absolute top-3 left-3 z-20 flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-2xl transition-all duration-300 ${
                      showControls
                        ? "opacity-100 pointer-events-auto translate-y-0"
                        : "opacity-0 pointer-events-none -translate-y-2"
                    }`}
                  >
                    <TvIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-xs font-black text-white max-w-sm truncate">
                      {currentTitle}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-indigo-600/60 text-[0.6875rem] font-bold text-amber-300 font-mono">
                      {activeIndex + 1} / {playlist.length}
                    </span>
                  </div>
                )}
              </div>

              {/* Servers & Qualities Expandable Bar */}
              {showServersBar && (
                <div
                  className={`bg-slate-900/98 backdrop-blur-xl border-t border-indigo-500/40 px-3 sm:px-4 py-2.5 z-30 shadow-2xl transition-all duration-200 animate-in slide-in-from-bottom-2 ${
                    isFullscreen
                      ? `absolute bottom-12 inset-x-0 ${
                          showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                        }`
                      : "relative flex-shrink-0"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800/80 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1 rounded-md bg-indigo-600/30 text-indigo-300 border border-indigo-400/30">
                        <SlidersVerticalIcon className="w-3.5 h-3.5 text-amber-300" />
                      </div>
                      <span className="text-xs font-black text-white">
                        الجودات وسيرفرات البث المكتشفة:
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => triggerAutoHeal("إعادة فحص يدوي")}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                        title="إعادة فحص الروابط وجلب سيرفرات جديدة"
                      >
                        <RefreshCwIcon className={`w-3 h-3 ${isAutoHealing ? "animate-spin" : ""}`} />
                        <span>فحص وتحديث السيرفرات</span>
                      </button>
                    </div>
                  </div>

                  {/* Horizontal streams list */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                    {sortedStreams.length > 0 ? (
                      sortedStreams.map((st: any, sIdx: number) => {
                        const isCur = st.url === currentStream?.url;
                        return (
                          <button
                            key={`${st.id || 'stream'}-${sIdx}`}
                            type="button"
                            onClick={() => handleSelectStream(st)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap cursor-pointer active:scale-95 ${
                              isCur
                                ? "bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-300 shadow-md ring-1 ring-red-400 font-black"
                                : "bg-slate-850 hover:bg-slate-800 text-slate-300 border-slate-700"
                            }`}
                          >
                            <TvIcon className="w-3.5 h-3.5 text-amber-300" />
                            <span>{st.server}</span>
                            <span className="text-[10px] font-mono px-1 rounded bg-slate-950/60 text-amber-300">
                              {st.quality}
                            </span>
                            {isCur && <CheckIcon className="w-3.5 h-3.5 text-emerald-300 stroke-[3]" />}
                          </button>
                        );
                      })
                    ) : (
                      <div className="text-xs text-slate-400 py-1">
                        لم يتم استخراج سيرفرات بديلة لهذا الفيلم بعد. اضغط على [فحص وتحديث السيرفرات].
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom Player Controller Bar */}
              <div
                className={`px-3 py-2 bg-slate-950/98 border-t border-slate-800/90 flex items-center justify-between gap-2 z-20 flex-shrink-0 transition-all duration-300 min-h-[50px] ${
                  isFullscreen
                    ? `absolute bottom-0 inset-x-0 ${
                        showControls
                          ? "opacity-100 pointer-events-auto translate-y-0"
                          : "opacity-0 pointer-events-none translate-y-6"
                      }`
                    : "relative"
                }`}
              >
                {/* Left: Movie Info */}
                <div className="flex items-center gap-2.5 min-w-0 max-w-[42%] sm:max-w-[48%]">
                  {currentMovie.posterUrl && (
                    <img
                      src={currentMovie.posterUrl}
                      alt={currentTitle}
                      className="w-7 h-9 object-cover rounded border border-slate-700 shadow-sm flex-shrink-0 hidden xs:block"
                    />
                  )}
                  <div className="min-w-0 flex flex-col justify-center gap-0.5">
                    <h3
                      title={currentMovie.movieTitle || currentMovie.title}
                      className="text-xs sm:text-sm font-black text-white truncate drop-shadow-sm"
                    >
                      {currentTitle}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      {currentStream && (
                        <span className="px-1.5 py-0.2 bg-gradient-to-r from-red-600 to-rose-600 text-white border border-red-300 rounded font-black truncate max-w-[100px] shadow-sm">
                          {currentStream.server}
                        </span>
                      )}
                      <span className="px-1.5 py-0.2 bg-red-600/30 text-red-200 border border-red-500/50 rounded font-black">
                        {playbackMode === "direct" ? "⚡ HLS" : "🌐 Embed"}
                      </span>
                      {currentStream?.quality && (
                        <span className="px-1 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-mono font-black">
                          {currentStream.quality}
                        </span>
                      )}
                      <span className="text-slate-500 font-mono hidden md:inline">
                        #{activeIndex + 1}/{playlist.length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Center: Playback Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleNextMovie}
                    disabled={playlist.length <= 1}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 disabled:opacity-30 text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95 border border-slate-800"
                    title="الفيلم التالي"
                  >
                    <SkipForwardIcon className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className="p-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black shadow-md shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
                    title={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
                  >
                    {isPlaying ? (
                      <PauseIcon className="w-4 h-4 fill-white" />
                    ) : (
                      <PlayIcon className="w-4 h-4 fill-white" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handlePrevMovie}
                    disabled={playlist.length <= 1}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 disabled:opacity-30 text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95 border border-slate-800"
                    title="الفيلم السابق"
                  >
                    <SkipBackIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* Right: Controls & Server bar toggle */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  {/* Next server button in bottom controller bar */}
                  {sortedStreams.length > 1 && (
                    <button
                      type="button"
                      onClick={handleNextServer}
                      className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-black bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 border border-amber-300 ring-1 ring-amber-300/80 shadow-md shadow-amber-950/40 cursor-pointer active:scale-95 transition-all group/nextsrv"
                      title="الانتقال المباشر إلى السيرفر التالي بدون الحاجة لفتح الخانة"
                    >
                      <span className="hidden xs:inline">السيرفر التالي</span>
                      <ArrowLeftIcon className="w-3.5 h-3.5 stroke-[2.5] group-hover/nextsrv:-translate-x-0.5 transition-transform text-slate-950" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowServersBar((prev) => !prev)}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer active:scale-95 whitespace-nowrap ${
                      showServersBar
                        ? "bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-300 shadow-md ring-1 ring-red-400 font-black"
                        : "bg-slate-900 hover:bg-slate-850 text-rose-300 border-red-500/40"
                    }`}
                    title={showServersBar ? "إخفاء لوحة الجودات والسيرفرات" : "إظهار لوحة الجودات وسيرفرات البث"}
                  >
                    <SlidersVerticalIcon className="w-3.5 h-3.5 text-amber-300" />
                    <span className="hidden xs:inline">السيرفرات</span>
                    {sortedStreams.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black bg-amber-400 text-slate-950">
                        {sortedStreams.length}
                      </span>
                    )}
                    {showServersBar ? (
                      <ChevronDownIcon className="w-3 h-3" />
                    ) : (
                      <ChevronUpIcon className="w-3 h-3" />
                    )}
                  </button>

                  {/* Transition button to re-extract stream links of the displayed movie */}
                  <div className="flex items-center rounded-lg bg-slate-900 border border-indigo-500/40 p-0.5 shadow-md">
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenExtractor) {
                          onOpenExtractor(currentMovie);
                        } else {
                          triggerAutoHeal("إعادة استخراج بطلب المستخدم");
                        }
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white cursor-pointer active:scale-95 transition-all whitespace-nowrap group/reextract"
                      title="الانتقال إلى أداة إعادة استخراج روابط وسيرفرات بث الفيلم المعروض"
                    >
                      <SparklesIcon className="w-3.5 h-3.5 text-amber-300 group-hover/reextract:rotate-12 transition-transform" />
                      <span>إعادة استخراج الروابط</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerAutoHeal("إعادة استخراج سريعة وتحديث البث");
                      }}
                      disabled={isAutoHealing}
                      className="p-1 text-indigo-300 hover:text-white hover:bg-indigo-700/40 rounded transition-colors cursor-pointer"
                      title="فحص واستخراج فوري وسريع للبث من المصدر مباشرة"
                    >
                      <RefreshCwIcon className={`w-3 h-3 ${isAutoHealing ? "animate-spin text-amber-400" : ""}`} />
                    </button>
                  </div>

                  {/* Auto-play next movie toggle */}
                  <button
                    type="button"
                    onClick={() => setAutoNext(!autoNext)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      autoNext
                        ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                        : "bg-slate-900 text-slate-400 border-slate-800"
                    }`}
                    title="تشغيل الفيلم التالي تلقائياً عند انتهاء الحالي"
                  >
                    <RefreshCwIcon className="w-3 h-3" />
                    <span className="hidden lg:inline text-[11px]">متتالي</span>
                  </button>

                  {/* Open in original page */}
                  {currentMovie.originalUrl && (
                    <a
                      href={currentMovie.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
                      title="فتح صفحة الفيلم الأصلية في نافذة جديدة"
                    >
                      <ExternalLinkIcon className="w-3.5 h-3.5" />
                    </a>
                  )}

                  {/* Fullscreen toggle with green accent */}
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                      isFullscreen
                        ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-900/40 ring-1 ring-emerald-300/80"
                    }`}
                    title={isFullscreen ? "إنهاء ملء الشاشة" : "تكبير الشاشة (ملء الشاشة)"}
                  >
                    {isFullscreen ? (
                      <Minimize2Icon className="w-3.5 h-3.5 text-emerald-300 stroke-[2.5]" />
                    ) : (
                      <Maximize2Icon className="w-3.5 h-3.5 text-emerald-100 stroke-[2.5]" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Empty Cinema State */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-indigo-600/20 border-2 border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-xl">
                <TvIcon className="w-10 h-10 animate-bounce" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-xl font-black text-white">شاشة العرض خالية حالياً!</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  قم بالضغط على بطاقة أي فيلم في التطبيق لاختيار سيرفر البث وإضافته إلى playlist شاشة
                  العرض، أو أضف رابط فيلم مباشرة هنا.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onOpenExtractor && onOpenExtractor()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
                >
                  <PlusIcon className="w-4 h-4 stroke-[2.5]" />
                  <span>استخراج وإضافة رابط فيلم للشاشة</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700 transition-colors cursor-pointer"
                >
                  العودة لتصفح الأفلام
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =============================================================
          MODAL: CREATE NEW PLAYLIST
      ============================================================= */}
      {isNewPlaylistModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <ListVideoIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-white">إنشاء قائمة تشغيل جديدة</h3>
                  <p className="text-xs text-slate-400">خصص قائمة مستقلة للمسلسلات أو سهرات الأفلام</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewPlaylistModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-base"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  اسم قائمة التشغيل:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreatePlaylist(newPlaylistName, newPlaylistCopyFromCurrent);
                    }
                  }}
                  placeholder="مثال: سهرة الأكشن، كلاسيكيات، أفلام عائلية..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl text-sm text-white focus:outline-none"
                />
              </div>

              {playlist.length > 0 && (
                <label className="flex items-center gap-2.5 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 cursor-pointer hover:bg-slate-950">
                  <input
                    type="checkbox"
                    checked={newPlaylistCopyFromCurrent}
                    onChange={(e) => setNewPlaylistCopyFromCurrent(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 focus:ring-offset-slate-900 accent-amber-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-200">نسخ أفلام القائمة الحالية</span>
                    <span className="text-slate-400 block text-[11px]">
                      ستبدأ القائمة الجديدة بنسخة من ({playlist.length}) أفلام موجودة حالياً
                    </span>
                  </div>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsNewPlaylistModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleCreatePlaylist(newPlaylistName, newPlaylistCopyFromCurrent)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <PlusIcon className="w-4 h-4 stroke-[3]" />
                <span>إنشاء وتفعيل القائمة 🎬</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
          MODAL: RENAME ACTIVE PLAYLIST
      ============================================================= */}
      {isRenamePlaylistModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-slate-900 border border-indigo-500/40 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <EditIcon className="w-4 h-4 text-amber-400" />
                <h3 className="font-black text-sm text-white">إعادة تسمية قائمة التشغيل</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRenamePlaylistModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-base"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                الاسم الجديد:
              </label>
              <input
                type="text"
                autoFocus
                value={renamePlaylistName}
                onChange={(e) => setRenamePlaylistName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRenamePlaylist(activePlaylist.id, renamePlaylistName);
                  }
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 focus:border-indigo-400 rounded-xl text-sm text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsRenamePlaylistModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleRenamePlaylist(activePlaylist.id, renamePlaylistName)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-md transition-all cursor-pointer active:scale-95"
              >
                حفظ التعديل ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
          MODAL: RENAME & TRANSFER MOVIE ITEM
      ============================================================= */}
      {isRenameMovieOpen && editingItemIndex !== null && editingItemIndex >= 0 && editingItemIndex < playlist.length && (() => {
        const currentItem = playlist[editingItemIndex];
        const otherPlaylists = playlists.filter((p) => p.id !== activePlaylistId);
        const currentTitle = currentItem?.movieTitle || currentItem?.title || "فيلم بدون عنوان";

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-150 dir-rtl text-right">
            <div className="w-full max-w-lg bg-slate-900 border-2 border-amber-500/70 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[92vh] overflow-y-auto custom-scrollbar">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <EditIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm sm:text-base text-white">
                      تعديل اسم الفيلم ونقله بين القوائم
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      القائمة الحالية: <span className="font-bold text-amber-300">{activePlaylist.name}</span> ({playlist.length} عنصر)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRenameMovieOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-base"
                >
                  ✕
                </button>
              </div>

              {/* Current Movie Summary */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-amber-400 shrink-0 border border-slate-700">
                  <FilmIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black text-white truncate">{currentTitle}</div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 flex-wrap">
                    {currentItem.selectedServer && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        سيرفر: {currentItem.selectedServer}
                      </span>
                    )}
                    {currentItem.selectedQuality && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30 font-mono">
                        {currentItem.selectedQuality}
                      </span>
                    )}
                    <span className="text-slate-500 font-mono">
                      الترتيب الحالي: #{editingItemIndex + 1}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 1: Edit Movie Name */}
              <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                <label className="block text-xs font-black text-amber-300">
                  ✏️ اسم الفيلم الظاهر في قائمة التشغيل:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={editMovieTitleInput}
                    onChange={(e) => setEditMovieTitleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveTitleOnly();
                      }
                    }}
                    placeholder="اكتب اسم الفيلم المراد عرضه..."
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl text-xs sm:text-sm text-white focus:outline-none"
                  />
                  {editMovieTitleInput !== currentTitle && (
                    <button
                      type="button"
                      onClick={() => setEditMovieTitleInput(currentTitle)}
                      className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                      title="استعادة الاسم الأصلي"
                    >
                      استعادة
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  يتم حفظ الاسم فوراً ومزامنته سحابياً مع شاشة العرض.
                </p>
              </div>

              {/* Section 2: Transfer to another playlist */}
              <div className="space-y-3 bg-slate-950/80 p-3.5 rounded-xl border-2 border-indigo-500/40">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-indigo-300">
                    <ArrowRightLeftIcon className="w-4 h-4 text-indigo-400" />
                    <span>نقل / نسخ الفيلم إلى قائمة تشغيل أخرى:</span>
                  </div>
                  {/* Action Mode Toggle: Move vs Copy */}
                  <div className="flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-700 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setMoveActionType("move")}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                        moveActionType === "move"
                          ? "bg-indigo-600 text-white shadow-sm font-black"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      قص ونقل (Move)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMoveActionType("copy")}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                        moveActionType === "copy"
                          ? "bg-amber-600 text-white shadow-sm font-black"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      نسخ أيضاً (Copy)
                    </button>
                  </div>
                </div>

                {/* Target Playlist Selection */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-slate-300">
                    اختر قائمة التشغيل الوجهة:
                  </label>
                  
                  <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-0.5">
                    {otherPlaylists.map((pl) => {
                      const isSelected = moveTargetPlaylistId === pl.id && !isCreatingNewPlaylistInline;
                      return (
                        <div
                          key={pl.id}
                          onClick={() => {
                            setMoveTargetPlaylistId(pl.id);
                            setIsCreatingNewPlaylistInline(false);
                          }}
                          className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? "bg-indigo-600/25 border-indigo-400 text-white ring-1 ring-indigo-400 shadow-sm"
                              : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-850"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-2 h-2 rounded-full ${isSelected ? "bg-indigo-400 ring-2 ring-indigo-400/40" : "bg-slate-600"}`} />
                            <span className="font-bold truncate">{pl.name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-400 text-[10px] font-mono border border-slate-800 shrink-0">
                            {pl.items?.length || 0} عنصر
                          </span>
                        </div>
                      );
                    })}

                    {/* New Playlist Option */}
                    <div
                      onClick={() => {
                        setMoveTargetPlaylistId("__new__");
                        setIsCreatingNewPlaylistInline(true);
                      }}
                      className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                        isCreatingNewPlaylistInline || otherPlaylists.length === 0
                          ? "bg-emerald-600/20 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400 shadow-sm"
                          : "bg-slate-900 border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FolderPlusIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-bold">➕ إنشاء قائمة تشغيل جديدة ونقل الفيلم إليها</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold">جديدة</span>
                    </div>
                  </div>

                  {/* Inline New Playlist Name Input */}
                  {(isCreatingNewPlaylistInline || otherPlaylists.length === 0) && (
                    <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-1.5 animate-in fade-in">
                      <label className="block text-[11px] font-bold text-emerald-300">
                        اسم قائمة التشغيل الجديدة:
                      </label>
                      <input
                        type="text"
                        value={inlineNewPlaylistName}
                        onChange={(e) => setInlineNewPlaylistName(e.target.value)}
                        placeholder={`مثال: قائمة سهرة مختارة (${playlists.length + 1})`}
                        className="w-full px-3 py-1.5 bg-slate-950 border border-emerald-500/50 focus:border-emerald-400 rounded-lg text-xs text-white focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Switch to target playlist toggle */}
                  <label className="flex items-center gap-2 cursor-pointer pt-1 text-[11px] text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={switchAfterTransfer}
                      onChange={(e) => setSwitchAfterTransfer(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                    <span>الانتقال فوراً إلى القائمة المنقول إليها وتفعيلها في شاشة العرض</span>
                  </label>
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRenameMovieOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer text-center order-3 sm:order-1"
                >
                  إلغاء
                </button>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end order-1 sm:order-2">
                  <button
                    type="button"
                    onClick={handleSaveTitleOnly}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer active:scale-95 text-center flex-1 sm:flex-initial"
                    title="حفظ الاسم فقط مع إبقاء الفيلم في نفس القائمة"
                  >
                    حفظ الاسم فقط ✓
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const target = isCreatingNewPlaylistInline ? "__new__" : moveTargetPlaylistId;
                      handleTransferMovie(target, moveActionType, inlineNewPlaylistName, switchAfterTransfer);
                    }}
                    disabled={!isCreatingNewPlaylistInline && !moveTargetPlaylistId}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-black shadow-lg shadow-indigo-950/60 border border-indigo-400/50 transition-all cursor-pointer active:scale-95 text-center flex-1 sm:flex-initial flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <ArrowRightLeftIcon className="w-3.5 h-3.5" />
                    <span>
                      {moveActionType === "move" ? "نقل الفيلم إلى القائمة المختارة 🚀" : "نسخ الفيلم إلى القائمة 📋"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
export default CinemaScreenModal;

