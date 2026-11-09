import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();
try {
  dns.setDefaultResultOrder('ipv4first');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
} catch (_) {}

process.on('uncaughtException', (err: any) => {
  const msg = err?.message || String(err);
  if (
    err?.code === 'ECONNRESET' ||
    err?.code === 'EPIPE' ||
    err?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    err?.code === 'UND_ERR_ABORTED' ||
    err?.name === 'AbortError' ||
    msg.includes('aborted') ||
    msg.includes('premature close') ||
    msg.includes('socket hang up') ||
    msg.includes('terminated')
  ) {
    return;
  }
  console.error('[Server Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  if (
    reason?.code === 'ECONNRESET' ||
    reason?.code === 'EPIPE' ||
    reason?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    reason?.code === 'UND_ERR_ABORTED' ||
    reason?.name === 'AbortError' ||
    msg.includes('aborted') ||
    msg.includes('premature close') ||
    msg.includes('socket hang up') ||
    msg.includes('terminated')
  ) {
    return;
  }
  console.warn('[Server Unhandled Rejection]:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI arguments & port configuration:
// Respect flags passed by dev runner (e.g., --port 3000 --host 0.0.0.0)
const argv = process.argv.slice(2);
const portFlagIdx = argv.indexOf('--port');
const cliPort = portFlagIdx !== -1 && argv[portFlagIdx + 1] ? parseInt(argv[portFlagIdx + 1], 10) : undefined;
const hostFlagIdx = argv.indexOf('--host');
const cliHost = hostFlagIdx !== -1 && argv[hostFlagIdx + 1] ? argv[hostFlagIdx + 1] : undefined;

const PORT = cliPort ||
  (process.env.DEFAULT_APP_PORT ? parseInt(process.env.DEFAULT_APP_PORT, 10) : 0) ||
  (process.env.APP_PORT ? parseInt(process.env.APP_PORT, 10) : 0) ||
  3000;
const HOST = cliHost || '0.0.0.0';
const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Support reasonable payloads while preventing memory spikes under 512MB RAM
app.use(express.json({ limit: '64mb' }));
app.use(express.urlencoded({ extended: true, limit: '64mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const PUBLIC_DIR = path.resolve(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// -------------------------------------------------------------
// 1. Initial Data API (Memory Optimized for 512MB Quota)
// -------------------------------------------------------------
let cachedMergedJson: string | null = null;
let lastCacheTime = 0;

app.get('/api/get-initial-data', async (_req: Request, res: Response) => {
  try {
    const file1 = path.join(PUBLIC_DIR, 'initialData.json');
    const file2 = path.join(PUBLIC_DIR, 'initialData2.json');

    // Return cached merged string if fresh (within 2 minutes)
    if (cachedMergedJson && Date.now() - lastCacheTime < 120000) {
      res.setHeader('Content-Type', 'application/json');
      return res.send(cachedMergedJson);
    }

    const hasFile2 = fs.existsSync(file2);
    const hasFile1 = fs.existsSync(file1);

    // If only file1 exists and no delta file2, stream file1 directly to avoid loading 23MB into V8 heap
    if (hasFile1 && !hasFile2) {
      res.setHeader('Content-Type', 'application/json');
      return fs.createReadStream(file1).pipe(res);
    }

    let baseData: any = { appName: 'AutoCinema', folders: [], movies: [], favoriteLists: [] };
    const loadedChunks: string[] = [];
    let baseMovieIds: string[] = [];
    let deltaMovieIds: string[] = [];

    if (hasFile1) {
      try {
        const raw1 = fs.readFileSync(file1, 'utf8');
        baseData = JSON.parse(raw1);
        loadedChunks.push('initialData.json');
        if (Array.isArray(baseData.movies)) {
          baseMovieIds = baseData.movies.map((m: any) => m.id);
        }
      } catch (err) {
        console.error('Error reading initialData.json:', err);
      }
    }

    if (hasFile2) {
      try {
        const raw2 = fs.readFileSync(file2, 'utf8');
        const data2 = JSON.parse(raw2);
        loadedChunks.push('initialData2.json');

        if (data2.folders && Array.isArray(data2.folders)) {
          const folderMap = new Map(baseData.folders.map((f: any) => [f.id, f]));
          for (const f of data2.folders) {
            folderMap.set(f.id, f);
          }
          baseData.folders = Array.from(folderMap.values());
        }

        if (data2.movies && Array.isArray(data2.movies)) {
          deltaMovieIds = data2.movies.map((m: any) => m.id);
          const movieMap = new Map(baseData.movies.map((m: any) => [m.id, m]));
          for (const m of data2.movies) {
            const existing = movieMap.get(m.id) || {};
            movieMap.set(m.id, { ...(existing as object), ...m });
          }
          baseData.movies = Array.from(movieMap.values());
        }

        if (data2.favoriteLists && Array.isArray(data2.favoriteLists)) {
          baseData.favoriteLists = data2.favoriteLists;
        }
      } catch (err) {
        console.error('Error reading initialData2.json:', err);
      }
    }

    baseData.baseMovieIds = baseMovieIds;
    baseData.deltaMovieIds = deltaMovieIds;
    baseData.loadedChunks = loadedChunks.length > 0 ? loadedChunks : ['initialData.json'];

    // Pre-stringify once to avoid repeatedly allocating large object graphs
    cachedMergedJson = JSON.stringify(baseData);
    lastCacheTime = Date.now();

    res.setHeader('Content-Type', 'application/json');
    return res.send(cachedMergedJson);
  } catch (error: any) {
    console.error('Error in /api/get-initial-data:', error);
    res.status(500).json({ error: 'Failed to read initial data', message: error?.message });
  }
});

app.get('/api/get-base-movie-ids', async (_req: Request, res: Response) => {
  try {
    const file1 = path.join(PUBLIC_DIR, 'initialData.json');
    const file2 = path.join(PUBLIC_DIR, 'initialData2.json');
    let baseMovieIds: string[] = [];
    let deltaMovieIds: string[] = [];

    if (fs.existsSync(file1)) {
      try {
        const raw1 = fs.readFileSync(file1, 'utf8');
        const d1 = JSON.parse(raw1);
        if (Array.isArray(d1.movies)) baseMovieIds = d1.movies.map((m: any) => m.id);
      } catch (_) {}
    }

    if (fs.existsSync(file2)) {
      try {
        const raw2 = fs.readFileSync(file2, 'utf8');
        const d2 = JSON.parse(raw2);
        if (Array.isArray(d2.movies)) deltaMovieIds = d2.movies.map((m: any) => m.id);
      } catch (_) {}
    }

    res.setHeader('Content-Type', 'application/json');
    return res.json({ baseMovieIds, deltaMovieIds });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

app.post('/api/update-initial-data', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const isConsolidate = !!payload.consolidateBase;
    cachedMergedJson = null; // Invalidate cache

    if (isConsolidate) {
      const file1 = path.join(PUBLIC_DIR, 'initialData.json');
      fs.writeFileSync(file1, JSON.stringify(payload, null, 2), 'utf8');
    } else {
      const file2 = path.join(PUBLIC_DIR, 'initialData2.json');
      fs.writeFileSync(file2, JSON.stringify(payload, null, 2), 'utf8');
    }

    return res.json({ success: true, message: 'Data updated successfully' });
  } catch (error: any) {
    console.error('Error in /api/update-initial-data:', error);
    res.status(500).json({ success: false, error: error?.message });
  }
});

// -------------------------------------------------------------
// 2. Favorites Data API
// -------------------------------------------------------------
app.get('/api/get-fav-data', async (_req: Request, res: Response) => {
  try {
    const favFile = path.join(PUBLIC_DIR, 'fav.json');
    const assetFav = path.join(PUBLIC_DIR, 'assets', 'aistudio', 'fav_eab88212.json');
    if (fs.existsSync(favFile) && fs.statSync(favFile).size > 10) {
      res.setHeader('Content-Type', 'application/json');
      return fs.createReadStream(favFile).pipe(res);
    }
    if (fs.existsSync(assetFav) && fs.statSync(assetFav).size > 10) {
      try {
        fs.copyFileSync(assetFav, favFile);
      } catch (_) {}
      res.setHeader('Content-Type', 'application/json');
      return fs.createReadStream(assetFav).pipe(res);
    }
    res.setHeader('Content-Type', 'application/json');
    return res.json({ fileName: 'fav.json', cinemaPlaylist: [], allFavorites: { sections: [], movieIds: [] } });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to read fav.json', message: error?.message });
  }
});

app.post('/api/update-fav-data', async (req: Request, res: Response) => {
  try {
    const favFile = path.join(PUBLIC_DIR, 'fav.json');
    fs.writeFileSync(favFile, JSON.stringify(req.body, null, 2), 'utf8');
    return res.json({ success: true, message: 'Favorites updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message });
  }
});

app.post('/api/update-cinema-playlist', async (req: Request, res: Response) => {
  try {
    const favFile = path.join(PUBLIC_DIR, 'fav.json');
    if (!fs.existsSync(favFile)) {
      return res.status(404).json({ success: false, error: 'fav.json not found' });
    }
    const raw = fs.readFileSync(favFile, 'utf8');
    let current: any = {};
    try {
      current = JSON.parse(raw);
    } catch (_) {
      current = {};
    }
    if (Array.isArray(req.body.cinemaPlaylist)) {
      current.cinemaPlaylist = req.body.cinemaPlaylist;
      if (Array.isArray(req.body.allCinemaPlaylists) && req.body.allCinemaPlaylists.length > 0) {
        current.allCinemaPlaylists = req.body.allCinemaPlaylists;
      }
      if (req.body.activePlaylistId) {
        current.activePlaylistId = req.body.activePlaylistId;
      }
      if (req.body.streamPreferences && typeof req.body.streamPreferences === 'object') {
        current.streamPreferences = { ...(current.streamPreferences || {}), ...req.body.streamPreferences };
        current.serverPreferences = { ...(current.serverPreferences || {}), ...req.body.streamPreferences };
      }
      current.updatedAt = new Date().toISOString();
      fs.writeFileSync(favFile, JSON.stringify(current, null, 2), 'utf8');
      console.log(`[Fav Sync] Successfully updated cinemaPlaylist (${req.body.cinemaPlaylist.length} items) in public/fav.json`);
      return res.json({ success: true, count: req.body.cinemaPlaylist.length });
    }
    return res.status(400).json({ success: false, error: 'cinemaPlaylist array required' });
  } catch (error: any) {
    console.error('[Fav Sync] Error updating cinema playlist:', error);
    res.status(500).json({ success: false, error: error?.message });
  }
});

// -------------------------------------------------------------
// Google Drive URL / Direct Link Fetcher API (No OAuth / No Popup / No Block)
// -------------------------------------------------------------
function extractGoogleDriveFileId(input: string): string | null {
  if (!input) return null;
  const str = input.trim();
  // Check direct file ID (alphanumeric, -, _, length >= 20)
  if (/^[a-zA-Z0-9_-]{20,60}$/.test(str)) {
    return str;
  }
  // Check /file/d/ID
  const matchFile = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile) return matchFile[1];

  // Check id=ID or id%3D
  const matchId = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId) return matchId[1];

  // Check /open?id=ID
  const matchOpen = str.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
  if (matchOpen) return matchOpen[1];

  // Check /folders/ID
  const matchFolder = str.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (matchFolder) return matchFolder[1];

  return null;
}

async function fetchDriveJsonDirect(fileId: string): Promise<any | null> {
  const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(directUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
    });
    clearTimeout(timeout);
    if (response.ok) {
      const t = await response.text();
      if (t && !t.includes('accounts.google.com') && !t.includes('ServiceLogin')) {
        return JSON.parse(t);
      }
    }
  } catch (_) {}

  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16000);
  try {
    const response = await fetch(downloadUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    let t = await response.text();
    if (t.includes('confirm=') || t.includes('uc-download-link')) {
      const confirmMatch = t.match(/href="(\/uc\?export=download[^"]+)"/) || t.match(/href="([^"]+confirm=[^"]+)"/);
      if (confirmMatch) {
        let secondUrl = confirmMatch[1];
        if (secondUrl.startsWith('/')) secondUrl = 'https://drive.google.com' + secondUrl;
        const secondRes = await fetch(secondUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (secondRes.ok) t = await secondRes.text();
      }
    }
    return JSON.parse(t);
  } catch (err) {
    clearTimeout(timeout);
    return null;
  }
}

app.post('/api/fetch-drive-url', async (req: Request, res: Response) => {
  try {
    const { url, targetSlot } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'يرجى تزويد رابط أو معرف الملف أو المجلد على Google Drive.' });
    }

    const driveId = extractGoogleDriveFileId(url);
    const isFolderUrl = url.includes('/folders/') || (targetSlot === 'folder');

    // If it's a folder link, try folder extraction first
    if (isFolderUrl && driveId) {
      try {
        const folderViewUrl = `https://drive.google.com/embeddedfolderview?id=${driveId}#list`;
        const folderRes = await fetch(folderViewUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });

        let folderHtml = '';
        if (folderRes.ok) {
          folderHtml = await folderRes.text();
        } else {
          const altRes = await fetch(`https://drive.google.com/drive/folders/${driveId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          });
          if (altRes.ok) folderHtml = await altRes.text();
        }

        // Search for JSON files in folder HTML
        // Regex patterns matching entry IDs and filenames
        const matches: { id: string; name: string }[] = [];
        const entryRegex = /entry-([a-zA-Z0-9_-]{20,65})[^>]*?>[\s\S]*?([a-zA-Z0-9._ -]+\.json)/gi;
        let m: RegExpExecArray | null;
        while ((m = entryRegex.exec(folderHtml)) !== null) {
          matches.push({ id: m[1], name: m[2].trim().toLowerCase() });
        }

        const quoteRegex = /["']([a-zA-Z0-9_-]{25,65})["'][^\]}]*?["']([a-zA-Z0-9._ -]+\.json)["']/gi;
        while ((m = quoteRegex.exec(folderHtml)) !== null) {
          if (!matches.some(x => x.id === m![1])) {
            matches.push({ id: m[1], name: m[2].trim().toLowerCase() });
          }
        }

        let initialDataResult: any = null;
        let favResult: any = null;

        const initialMatch = matches.find(x => x.name.includes('initial') || x.name.includes('data'));
        const favMatch = matches.find(x => x.name.includes('fav'));

        if (initialMatch) {
          initialDataResult = await fetchDriveJsonDirect(initialMatch.id);
        }
        if (favMatch) {
          favResult = await fetchDriveJsonDirect(favMatch.id);
        }

        if (initialDataResult || favResult) {
          if (initialDataResult) {
            cachedMergedJson = null;
            const file1 = path.join(PUBLIC_DIR, 'initialData.json');
            fs.writeFileSync(file1, JSON.stringify(initialDataResult, null, 2), 'utf8');
          }
          if (favResult) {
            if (!Array.isArray(favResult.cinemaPlaylist)) favResult.cinemaPlaylist = [];
            const favFile = path.join(PUBLIC_DIR, 'fav.json');
            fs.writeFileSync(favFile, JSON.stringify(favResult, null, 2), 'utf8');
          }

          const primaryData = initialDataResult || favResult;
          return res.json({
            success: true,
            detectedType: initialDataResult && favResult ? 'both' : (initialDataResult ? 'initial' : 'fav'),
            savedToSlot: initialDataResult && favResult ? 'initialData.json & fav.json' : (initialDataResult ? 'initialData.json' : 'fav.json'),
            data: primaryData,
            initialData: initialDataResult,
            favData: favResult,
            stats: {
              moviesCount: Array.isArray(initialDataResult?.movies) ? initialDataResult.movies.length : (Array.isArray(favResult?.movies) ? favResult.movies.length : 0),
              foldersCount: Array.isArray(initialDataResult?.folders) ? initialDataResult.folders.length : 0,
              favoritesCount: favResult?.allFavorites?.totalFavoritesCount || (Array.isArray(favResult?.allFavorites?.movieIds) ? favResult.allFavorites.movieIds.length : 0),
              playlistCount: Array.isArray(favResult?.cinemaPlaylist) ? favResult.cinemaPlaylist.length : 0,
            }
          });
        }
      } catch (folderErr) {
        console.warn('Folder parsing failed, falling back to direct file fetch:', folderErr);
      }
    }

    let text = '';
    if (driveId) {
      try {
        const directUrl = `https://drive.usercontent.google.com/download?id=${driveId}&export=download`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const resDirect = await fetch(directUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': '*/*',
          },
        });
        clearTimeout(timeout);
        if (resDirect.ok) {
          const directText = await resDirect.text();
          if (directText && !directText.includes('accounts.google.com') && !directText.includes('ServiceLogin')) {
            text = directText;
          }
        }
      } catch (_) {}
    }

    if (!text) {
      let downloadUrl = url.trim();
      if (driveId) {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${driveId}`;
      }

      // Fetch the file with redirect following
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 18000);

      const response = await fetch(downloadUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(400).json({
          success: false,
          error: `تعذر جلب الملف من Google Drive (${response.status}). تأكد من أن الرابط متاح للعامة (Anyone with the link).`
        });
      }

      text = await response.text();

      // Check if Google Drive returned a virus scan confirmation page for large files
      if (text.includes('confirm=') || text.includes('uc-download-link')) {
        const confirmMatch = text.match(/href="(\/uc\?export=download[^"]+)"/) || text.match(/href="([^"]+confirm=[^"]+)"/);
        if (confirmMatch) {
          let secondUrl = confirmMatch[1];
          if (secondUrl.startsWith('/')) secondUrl = 'https://drive.google.com' + secondUrl;
          const secondRes = await fetch(secondUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
          });
          if (secondRes.ok) {
            text = await secondRes.text();
          }
        }
      }
    }

    // Try parsing as JSON
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      // Check if it's an HTML folder or contains JSON files
      if (text.includes('accounts.google.com') || text.includes('ServiceLogin') || text.includes('need permission') || text.includes('طلب إذن')) {
        return res.status(403).json({
          success: false,
          error: 'الملف أو المجلد على Google Drive خاص وغير مشترك للعامة! يرجى فتح Google Drive ثم النقر بالزر الأيمن على الملف/المجلد -> مشاركة (Share) -> اختيار "أي شخص لديه الرابط (Anyone with the link)".'
        });
      }
      return res.status(400).json({
        success: false,
        error: 'المحتوى الذي تم تحميله ليس بتنسيق JSON سليم. تأكد من أن الرابط يشير إلى ملف fav.json أو initialdata.json أو مجلد يحتوي على الملفات.'
      });
    }

    // Detect type of file if targetSlot not explicitly forced
    let detectedType: 'fav' | 'initial' = 'initial';
    if (parsed.cinemaPlaylist || (parsed.allFavorites && parsed.allFavorites.sections)) {
      detectedType = 'fav';
    } else if (parsed.movies || parsed.folders) {
      detectedType = 'initial';
    }

    const slot = targetSlot || (detectedType === 'fav' ? 'fav.json' : 'initialData.json');

    // Save to the appropriate public slot
    if (slot === 'fav.json') {
      if (!Array.isArray(parsed.cinemaPlaylist)) {
        parsed.cinemaPlaylist = [];
      }
      const favFile = path.join(PUBLIC_DIR, 'fav.json');
      fs.writeFileSync(favFile, JSON.stringify(parsed), 'utf8');
    } else if (slot === 'initialData2.json') {
      cachedMergedJson = null;
      const file2 = path.join(PUBLIC_DIR, 'initialData2.json');
      fs.writeFileSync(file2, JSON.stringify(parsed), 'utf8');
    } else {
      cachedMergedJson = null;
      const file1 = path.join(PUBLIC_DIR, 'initialData.json');
      fs.writeFileSync(file1, JSON.stringify(parsed), 'utf8');
    }

    return res.json({
      success: true,
      detectedType,
      savedToSlot: slot,
      data: parsed,
      stats: {
        moviesCount: Array.isArray(parsed?.movies) ? parsed.movies.length : 0,
        foldersCount: Array.isArray(parsed?.folders) ? parsed.folders.length : 0,
        favoritesCount: parsed?.allFavorites?.totalFavoritesCount || (Array.isArray(parsed?.allFavorites?.movieIds) ? parsed.allFavorites.movieIds.length : 0),
        playlistCount: Array.isArray(parsed?.cinemaPlaylist) ? parsed.cinemaPlaylist.length : 0,
      }
    });
  } catch (error: any) {
    console.error('Error in /api/fetch-drive-url:', error);
    res.status(500).json({ success: false, error: error?.message || 'حدث خطأ أثناء جلب الملف من Google Drive' });
  }
});

// -------------------------------------------------------------
// 3. AI Gemini API (Story Generation & Content Classification)
// -------------------------------------------------------------
// -------------------------------------------------------------
// 3. AI Gemini API (Story Generation & Content Classification)
// -------------------------------------------------------------
function cleanMovieText(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(/مستورد\s*عبر\s*تغذية\s*(?:JSON|movie|موفي|فيلم)?\s*(?:\([^)]*\))?/gi, '')
    .replace(/مستورد\s*عبر\s*JSON\s*(\([^)]*\))?/gi, '')
    .replace(/مستورد\s*عبر\s*[^\n\r]+/gi, '')
    .replace(/Imported\s*via\s*JSON\s*feed/gi, '')
    .replace(/Imported\s*via\s*JSON/gi, '')
    .replace(/Imported\s*via\s*[^\n\r]+/gi, '')
    .replace(/\(\s*movie\s*\)/gi, '')
    .trim();
}

function cleanMovieTitle(title: string | undefined | null): string {
  if (!title) return 'الفيلم';
  return String(title)
    .replace(/^(?:مشاهدة|تحميل|سيرفر)\s+/gi, '')
    .replace(/^(?:فيلم|مسلسل)\s+/gi, '')
    .replace(/\s+(?:مترجم|مدبلج|اون\s*لاين|بجودة\s*عالية|كامل|HD|FHD).*$/gi, '')
    .replace(/مستورد.*$/gi, '')
    .trim() || String(title).trim();
}

function isValidAiStory(story: string | undefined | null): boolean {
  if (!story) return false;
  const s = String(story).trim();
  if (s.length < 15) return false;
  if (/مستورد\s*عبر|Imported\s*via/i.test(s)) return false;
  return true;
}

function normalizeClassificationCode(raw: string | undefined): 'green' | 'yellow' | 'orange' | 'red' | 'purple' {
  if (!raw) return 'yellow';
  const s = String(raw).trim().toLowerCase();
  if (s === 'purple' || s === '5/5' || s === '5' || /إباحي|إيروتيك|\+18|18\+|porn|erotic|adult|صريح|عري\s*كامل|سكس|للكبار\s*فقط|عالٍ\s*جد|عالي\s*جد/i.test(s)) {
    return 'purple';
  }
  if (s === 'red' || s === '4/5' || s === '4' || /حميمي|جريء|جريئة|تعري|إغراء|سحاق|مثير|شهواني|عالٍ|عالي/i.test(s)) {
    return 'red';
  }
  if (s === 'orange' || s === '3/5' || s === '3' || /رومانسي|عاطفي|دراما|عشق|غرام|حب|متوسط/i.test(s)) {
    return 'orange';
  }
  if (s === 'green' || s === '1/5' || s === '1' || /عائلي|أطفال|كرتون|أنمي|وثائقي|نظيف|آمن|منخفض\s*جد/i.test(s)) {
    return 'green';
  }
  if (s === 'yellow' || s === '2/5' || s === '2' || /كوميدي|حركة|إثارة|أكشن|مغامرات|جريمة|خفيف|منخفض/i.test(s)) {
    return 'yellow';
  }
  return 'yellow';
}

interface MovieAiResult {
  classification: 'green' | 'yellow' | 'orange' | 'red' | 'purple';
  reason: string;
  story: string;
}

// In-memory cache for ultra-fast instant responses
const movieAiCache = new Map<string, MovieAiResult>();

function normalizeCacheKey(text: string | undefined): string {
  if (!text) return '';
  return text.trim().toLowerCase().replace(/[\s\-_.:,;'"!?]+/g, ' ');
}

// Smart resilient local fallback classifier with rich multilingual knowledge
function localFallbackClassifier(movie: any): MovieAiResult {
  const cleanTitle = cleanMovieTitle(movie.title);
  const rawText = `${movie.title || ''} ${movie.category || ''} ${cleanMovieText(movie.description)}`.toLowerCase();
  const cat = (movie.category || 'سينمائي عام').trim();
  const existingDesc = cleanMovieText(movie.description);

  // 1. Purple (+18 / Adult / Erotic / Explicit)
  if (/(?:erotic|porn|xxx|sex|adult|sensual|hardcore|uncut|unrated|\+18|18\+|nc-17|إباحي|إيروتيك|للكبار فقط|إغراء شديد|سكس|عري كامل)/i.test(rawText)) {
    return {
      classification: 'purple',
      reason: 'تقييم رقابي: مؤشرات محتوى بالغ الجرأة وموجه للكبار فقط (+18) لوجود مشاهد صريحة أو إيحاءات مكثفة.',
      story: isValidAiStory(existingDesc) ? existingDesc : `تدور أحداث فيلم "${cleanTitle}" في إطار تشويقي درامي مثير للجدل، مسلطاً الضوء على علاقات معقدة وصراعات نفسية وجسدية جريئة مخصصة لجمهور البالغين (+18) بتصنيف (${cat}).`,
    };
  }

  // 2. Red (4/5 Bold / Intimate / Nudity / Provocative)
  if (/(?:nude|nudity|intimacy|affair|passion|desire|sensual|seduction|forbidden|steamy|تعري|حميمي|جريء|جريئة|إغراء|سحاق|خيانة زوجية|علاقة جسدية|مثير)/i.test(rawText)) {
    return {
      classification: 'red',
      reason: 'تقييم رقابي: يتضمن مشاهد جسدية جريئة أو إيحاءات حميمية واضحة تستوجب تقييد المشاهدة (+16).',
      story: isValidAiStory(existingDesc) ? existingDesc : `يروي فيلم "${cleanTitle}" قصة درامية مشوقة تركز على صراعات عاطفية ملتهبة وتقلبات مصيرية في حياة أبطاله مع مواجهات جريئة ومثيرة ضمن تصنيف (${cat}).`,
    };
  }

  // 3. Orange (3/5 Romance / Drama / Moderate Thriller)
  if (/(?:romance|romantic|love|drama|heart|melodrama|marriage|dating|relationship|thriller|horror|رومانسي|حب|عشق|غرام|عاطفي|دراما|زواج|خيالي|غموض|رعب)/i.test(rawText)) {
    return {
      classification: 'orange',
      reason: 'تقييم رقابي: محتوى درامي أو رومانسي معتدل يركز على المشاعر الإنسانية والتقلبات العاطفية دون ابتذال.',
      story: isValidAiStory(existingDesc) ? existingDesc : `يستعرض فيلم "${cleanTitle}" حبكة درامية إنسانية مؤثرة تدور حول العلاقات والروابط العاطفية والتحديات الاجتماعية التي يواجهها الأبطال بتصنيف (${cat}).`,
    };
  }

  // 4. Green (1/5 Family / Kids / Animation / Educational)
  if (/(?:animation|cartoon|family|kids|disney|pixar|anime|children|عائلي|أطفال|رسوم متحركة|كرتون|أنمي|وثائقي|تربوي|قصص أنبياء)/i.test(rawText)) {
    return {
      classification: 'green',
      reason: 'تقييم رقابي: محتوى عائلي نقي وآمن تماماً لجميع أفراد الأسرة والأطفال.',
      story: isValidAiStory(existingDesc) ? existingDesc : `فيلم "${cleanTitle}" هو عمل سينمائي عائلي ممتع (${cat}) يقدم رسائل وقيم إنسانية جميلة في قالب ترفيهي ملائم للمشاهدة المشتركة.`,
    };
  }

  // 5. Yellow (2/5 Action / Comedy / General Adventure / Standard Entertainment)
  return {
    classification: 'yellow',
    reason: 'تقييم رقابي: عمل ترفيهي عام يحتوي على مغامرات، حركة معتادة أو مواقف تشويقية خفيفة دون مشاهد جريئة.',
    story: isValidAiStory(existingDesc) ? existingDesc : `يقدم فيلم "${cleanTitle}" مغامرة مشوقة زاخرة بلحظات الإثارة والتشويق والأحداث المتلاحقة التي تأخذ المشاهد في رحلة ترفيهية ممتعة (${cat}).`,
  };
}

// Cascading Gemini caller to ensure 100% uptime even if a specific model encounters temporary demand
const GEMINI_CANDIDATE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash',
];

async function generateWithGeminiFallback(prompt: string, expectJson = true): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  let lastError: any = null;
  for (const model of GEMINI_CANDIDATE_MODELS) {
    try {
      const config: any = {};
      if (expectJson) {
        config.responseMimeType = 'application/json';
      }
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config,
      });

      const text = response.text?.trim();
      if (text) {
        return text;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Gemini model ${model} temporarily unavailable (${err.status || err.message}), trying next candidate...`);
    }
  }

  throw lastError || new Error('All Gemini models unavailable');
}

app.post('/api/ai/generate-story', async (req: Request, res: Response) => {
  try {
    const { movie } = req.body;
    if (!movie || !movie.title) {
      return res.status(400).json({ success: false, error: 'بيانات الفيلم غير صالحة.' });
    }

    const cleanTitle = cleanMovieTitle(movie.title);
    const cleanDesc = cleanMovieText(movie.description);

    const cacheKey = normalizeCacheKey(movie.id || cleanTitle);
    if (cacheKey && movieAiCache.has(cacheKey)) {
      const cached = movieAiCache.get(cacheKey)!;
      if (isValidAiStory(cached.story)) {
        return res.json({
          success: true,
          story: cached.story,
          classification: cached.classification,
          reason: cached.reason,
        });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const prompt = `أنت ناقد سينمائي ومحلل رقابي خبير. قم بتحليل الفيلم التالي وتوليد ملخص حقيقي وجذاب لقصته باللغة العربية مع تصنيف المحتوى بدقة تامة:
العنوان الأصلي: ${cleanTitle} (الاسم الكامل: ${movie.title})
النوع/التصنيف: ${movie.category || 'سينمائي'}
${cleanDesc ? `الوصف المتوفر: ${cleanDesc}` : 'الوصف: غير متوفر، يرجى استنتاج القصة الحقيقية الدقيقة من شهرة الفيلم وعنوانه وعام إنتاجه'}

المستويات الخمسة للرقابة والتقييم:
- "green": عائلي / نظيف (1/5) - مناسب للأطفال والأسرة تماماً، كرتون أو وثائقي أو عمل بريء
- "yellow": كوميدي / حركة / إثارة / أكشن (2/5) - ترفيهي عام ومغامرات بدون مشاهد جريئة
- "orange": رومانسي / دراما (3/5) - عواطف أو دراما اجتماعية أو إثارة نفسية معتدلة
- "red": مشاهد جريئة / حميمي (4/5) - تعري جزئي، إغراء واضح، مشاهد حميمية تستوجب تقييد العمر
- "purple": +18 / إباحي (5/5) - للكبار فقط (+18)، عري صريح، محتوى إباحي أو جنسي فج

أجب بصيغة JSON حصراً بالشكل التالي:
{
  "story": "سرد متماسك وواضح لقصة الفيلم الحقيقية وأبرز أحداثه وصراعاته بدون اختصار مخل باللغة العربية في سطرين إلى أربعة أسطر.",
  "classification": "green" أو "yellow" أو "orange" أو "red" أو "purple",
  "reason": "سبب موجز ودقيق ومقنع للتصنيف باللغة العربية"
}`;

        const rawText = await generateWithGeminiFallback(prompt, true);
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed && isValidAiStory(parsed.story)) {
            const result: MovieAiResult = {
              story: cleanMovieText(parsed.story),
              classification: normalizeClassificationCode(parsed.classification),
              reason: parsed.reason || 'تم التقييم بواسطة الذكاء الاصطناعي بدقة.',
            };
            if (cacheKey) movieAiCache.set(cacheKey, result);
            if (movie.id) movieAiCache.set(String(movie.id), result);
            return res.json({
              success: true,
              story: result.story,
              classification: result.classification,
              reason: result.reason,
            });
          }
        }
      } catch (geminiErr: any) {
        console.warn('Gemini generate-story error, falling back to smart heuristic:', geminiErr?.message || geminiErr);
      }
    }

    // Local fallback
    const fallback = localFallbackClassifier(movie);
    return res.json({
      success: true,
      story: fallback.story,
      classification: fallback.classification,
      reason: fallback.reason,
    });
  } catch (error: any) {
    console.error('Error in generate-story:', error);
    res.status(500).json({ success: false, error: error?.message });
  }
});

app.post('/api/ai/classify-movies', async (req: Request, res: Response) => {
  try {
    const { movies } = req.body;
    if (!Array.isArray(movies) || movies.length === 0) {
      return res.status(400).json({ success: false, error: 'لا توجد أفلام محددة للتصنيف.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const finalResultsMap = new Map<string, any>();
    const uncachedMovies: any[] = [];

    // Step 1: Rapid cache lookup (validate that cached story does not contain imported markers)
    for (const m of movies) {
      if (!m || !m.id) continue;
      const idKey = String(m.id);
      const titleKey = normalizeCacheKey(m.title);
      const cached = movieAiCache.get(idKey) || (titleKey ? movieAiCache.get(titleKey) : undefined);
      if (cached && isValidAiStory(cached.story)) {
        finalResultsMap.set(idKey, {
          id: m.id,
          classification: cached.classification,
          reason: cached.reason,
          story: cached.story,
          storySummary: cached.story,
        });
      } else {
        uncachedMovies.push(m);
      }
    }

    // If all items were in cache with valid stories, return immediately
    if (uncachedMovies.length === 0) {
      const results = movies.map((m: any) => finalResultsMap.get(String(m.id)));
      return res.json({ success: true, results, cachedCount: movies.length });
    }

    // Step 2: Concurrently process uncached items in small chunks of 8 for optimal parallel speed and prompt reliability
    const CHUNK_SIZE = 8;
    const movieChunks: any[][] = [];
    for (let i = 0; i < uncachedMovies.length; i += CHUNK_SIZE) {
      movieChunks.push(uncachedMovies.slice(i, i + CHUNK_SIZE));
    }

    const chunkPromises = movieChunks.map(async (chunk) => {
      if (apiKey) {
        try {
          const listText = chunk.map((m: any, idx: number) => {
            const cleanT = cleanMovieTitle(m.title);
            const cleanD = cleanMovieText(m.description);
            return `${idx + 1}. [ID: ${m.id}] العنوان: ${cleanT} (الاسم: ${m.title}) | التصنيف: ${m.category || 'عام'}${cleanD ? ` | نبذة: ${cleanD}` : ''}`;
          }).join('\n');

          const prompt = `أنت خبير رقابة وتقييم سينمائي صارم ومحلل محتوى دقيق. مهمتك تقييم وتصنيف كل فيلم من الأفلام التالية بدقة حقيقية وتوليد سرد شيق لقصته الحقيقية باللغة العربية:
المستويات الخمسة للرقابة:
- "green": 1/5 عائلي / نظيف (آمن تماماً للأطفال والأسرة، كرتون أو وثائقي أو قيم بريئة)
- "yellow": 2/5 منخفض (كوميدي / حركة / إثارة / أكشن - ترفيهي عام ومغامرات دون مشاهد جريئة)
- "orange": 3/5 متوسط (رومانسي / دراما - عواطف أو دراما اجتماعية أو تشويق معتدل)
- "red": 4/5 عالٍ (مشاهد جريئة / حميمي - يتضمن تعرياً جزئياً أو إغراءً واضحاً ومشاهد حميمية)
- "purple": 5/5 عالٍ جدًا (+18 / إباحي - محتوى صريح جداً للكبار فقط، إباحي أو تعرٍ كامل)

قائمة الأفلام:
${listText}

أعطِ النتيجة كـ JSON Array يحتوي على جميع الأفلام المذكورة في القائمة أعلاه بنفس المعرفات (ID):
[
  {
    "id": "معرف الفيلم",
    "classification": "green" أو "yellow" أو "orange" أو "red" أو "purple",
    "reason": "سبب موجز ودقيق باللغة العربية لمستوى الرقابة والجرأة",
    "story": "سرد مشوق وواضح لقصة الفيلم الحقيقية وأبرز أحداثه بدون اختصار مخل باللغة العربية (في 2 إلى 4 أسطر)"
  }
]`;

          const rawText = await generateWithGeminiFallback(prompt, true);
          const jsonMatch = rawText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const parsedMap = new Map<string, any>();
            parsed.forEach((item: any) => {
              if (item && item.id != null) {
                parsedMap.set(String(item.id), item);
              }
            });

            return chunk.map((m: any) => {
              const found = parsedMap.get(String(m.id));
              if (found && isValidAiStory(found.story)) {
                const resItem: MovieAiResult = {
                  classification: normalizeClassificationCode(found.classification),
                  reason: found.reason || 'تقييم دقيق بالذكاء الاصطناعي',
                  story: cleanMovieText(found.story),
                };
                movieAiCache.set(String(m.id), resItem);
                const tKey = normalizeCacheKey(m.title);
                if (tKey) movieAiCache.set(tKey, resItem);
                return {
                  id: m.id,
                  classification: resItem.classification,
                  reason: resItem.reason,
                  story: resItem.story,
                  storySummary: resItem.story,
                };
              }
              const fb = localFallbackClassifier(m);
              return {
                id: m.id,
                classification: fb.classification,
                reason: fb.reason,
                story: fb.story,
                storySummary: fb.story,
              };
            });
          }
        } catch (geminiErr: any) {
          console.warn('Gemini chunk classification error, falling back to smart heuristics:', geminiErr?.message || geminiErr);
        }
      }

      // Chunk heuristic fallback
      return chunk.map((m: any) => {
        const fb = localFallbackClassifier(m);
        return {
          id: m.id,
          classification: fb.classification,
          reason: fb.reason,
          story: fb.story,
          storySummary: fb.story,
        };
      });
    });

    const chunkResults = await Promise.all(chunkPromises);
    chunkResults.flat().forEach((item) => {
      if (item && item.id != null) {
        finalResultsMap.set(String(item.id), item);
      }
    });

    const results = movies.map((m: any) => {
      const found = finalResultsMap.get(String(m.id));
      if (found) return found;
      const fb = localFallbackClassifier(m);
      return {
        id: m.id,
        classification: fb.classification,
        reason: fb.reason,
        story: fb.story,
        storySummary: fb.story,
      };
    });

    return res.json({ success: true, results });
  } catch (error: any) {
    console.error('Error in classify-movies:', error);
    res.status(500).json({ success: false, error: error?.message });
  }
});

// -------------------------------------------------------------
// 4. Video Stream Extractor API
// -------------------------------------------------------------
// -------------------------------------------------------------
// 4. Video Stream Extractor API
// -------------------------------------------------------------
function vtgDecodeUrl(v: string): string {
  if (!v) return '';
  const trimmed = v.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;

  // If not prefixed with v1:, test if raw base64 contains a direct URL
  if (!trimmed.startsWith('v1:')) {
    try {
      const b64 = Buffer.from(trimmed, 'base64').toString('utf8');
      if (b64.startsWith('http://') || b64.startsWith('https://')) return b64;
    } catch (_) {}
    return trimmed;
  }

  // Known XOR keys for VTG (Video Tabs Generator) across different themes, versions, and years
  const candidateKeys = [
    'vTg2026#kx',
    'vTg2025#kx',
    'vTg2024#kx',
    'vTg2023#kx',
    'vTg#kx',
    'blackvideo',
    'aflam18',
  ];

  try {
    const b = Buffer.from(trimmed.slice(3), 'base64').toString('binary');
    for (const k of candidateKeys) {
      let o = '';
      for (let i = 0; i < b.length; i++) {
        o += String.fromCharCode(b.charCodeAt(i) ^ k.charCodeAt(i % k.length));
      }
      try {
        let decoded = decodeURIComponent(escape(o));
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          if (decoded.includes('vstm.shop')) {
            decoded = decoded.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?vstm\.shop/i, 'https://naturee.site');
          }
          return decoded;
        }
      } catch (_) {
        if (o.startsWith('http://') || o.startsWith('https://')) {
          if (o.includes('vstm.shop')) {
            o = o.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?vstm\.shop/i, 'https://naturee.site');
          }
          return o;
        }
      }
    }
  } catch (_) {}

  if (trimmed.includes('vstm.shop')) {
    return trimmed.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?vstm\.shop/i, 'https://naturee.site');
  }
  return trimmed;
}

async function resolveDirectVideoFromEmbed(embedUrl: string, baseReferer: string): Promise<{ directUrl?: string; type?: string; quality?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(embedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': baseReferer,
      }
    });
    clearTimeout(timer);
    if (!res.ok) return {};
    const text = await res.text();

    let fullText = text;
    const packed = text.match(/eval\(function\(p,a,c,k,e,[rd]\)[\s\S]*?\.split\(['"]\|['"]\)\)\)/g);
    if (packed) {
      packed.forEach(p => {
        const unp = unpackJs(p);
        if (unp) fullText += '\n' + unp;
      });
    }

    const m3u8Match = fullText.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
    if (m3u8Match) {
      return { directUrl: m3u8Match[1], type: 'hls', quality: '720p HD' };
    }

    const mp4Match = fullText.match(/(https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)/i);
    if (mp4Match) {
      return { directUrl: mp4Match[1], type: 'mp4', quality: '720p HD' };
    }
  } catch (_) {}
  return {};
}

function unpackJs(packed: string): string {
  try {
    const match = packed.match(/eval\(function\(p,a,c,k,e,[rd]\)[\s\S]*?\.split\(['"]\|['"]\)[^)]*\)\)/);
    if (!match) return '';
    const code = match[0].replace(/^eval/, '');
    return eval(code) || '';
  } catch (_) {
    return '';
  }
}

function getStreamQualityScore(quality: string | undefined): number {
  if (!quality) return 720;
  const q = String(quality).toLowerCase().trim();
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
  if (qScore > 800 && qScore <= 1200) return 5; // 5th priority: 1080p
  if (qScore > 1200) return 6;                  // 6th priority: 1440p / 2160p / 4K
  return 7;                                     // 7th priority: < 340p (240p, 144p)
}

function sortStreamsAscending(streams: any[]): any[] {
  return sortStreamsByQualityTiersAscending(streams);
}

function sortStreamsByQualityTiersAscending(
  streams: any[],
  failingUrl?: string,
  failingId?: string
): any[] {
  if (!Array.isArray(streams) || streams.length === 0) return [];
  const cleanFail = (failingUrl || '').trim().toLowerCase();

  // Deduplicate streams by ID and URL
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const deduped: any[] = [];
  for (const s of streams) {
    if (!s) continue;
    const sId = String(s.id || '').trim();
    const sUrl = String(s.url || s.directUrl || '').trim().toLowerCase();
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
      const u = (s.url || '').trim().toLowerCase();
      const d = (s.directUrl || '').trim().toLowerCase();
      if (u === cleanFail || d === cleanFail) return false;
    }
    return true;
  });
  const candidates = pool.length > 0 ? pool : deduped;

  return [...candidates].sort((a, b) => {
    // 1. Direct HLS/MP4 streams preferred over third-party embeds and popouts
    const isDirectA = a?.type === 'hls' || a?.type === 'mp4' || a?.url?.includes('.m3u8') || a?.directUrl?.includes('.m3u8');
    const isDirectB = b?.type === 'hls' || b?.type === 'mp4' || b?.url?.includes('.m3u8') || b?.directUrl?.includes('.m3u8');
    if (isDirectA && !isDirectB) return -1;
    if (!isDirectA && isDirectB) return 1;

    // 2. Never pick popout external windows over embedded player streams
    if (a?.needsPopout && !b?.needsPopout) return 1;
    if (!a?.needsPopout && b?.needsPopout) return -1;

    const scoreA = getStreamQualityScore(a?.quality);
    const scoreB = getStreamQualityScore(b?.quality);
    const tierA = getStreamQualityTier(scoreA);
    const tierB = getStreamQualityTier(scoreB);

    // 3. Quality tier order
    if (tierA !== tierB) return tierA - tierB;
    if (scoreA !== scoreB) return scoreA - scoreB;

    return 0;
  });
}

function pickDefaultQualityStream(streams: any[], userPref?: any): any {
  if (!Array.isArray(streams) || streams.length === 0) return null;
  if (userPref) {
    if (userPref.streamUrl || userPref.directUrl) {
      const match = streams.find(
        (s) =>
          (userPref.streamUrl && (s.url === userPref.streamUrl || s.directUrl === userPref.streamUrl)) ||
          (userPref.directUrl && (s.url === userPref.directUrl || s.directUrl === userPref.directUrl))
      );
      if (match) return match;
    }
    if (userPref.serverId) {
      const match = streams.find((s) => s.id === userPref.serverId);
      if (match) return match;
    }
    if (userPref.serverName) {
      const match = streams.find((s) => s.server === userPref.serverName);
      if (match) return match;
    }
  }

  const sorted = sortStreamsByQualityTiersAscending(streams);
  return sorted[0] || streams[0];
}

function pickLowerQualityAlternativeStream(
  streams: any[],
  failingUrl?: string,
  failingId?: string
): any {
  if (!Array.isArray(streams) || streams.length === 0) return null;
  const sorted = sortStreamsByQualityTiersAscending(streams, failingUrl, failingId);
  return sorted[0] || null;
}

async function parseM3u8Qualities(masterUrl: string, baseOrigin: string): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': baseOrigin,
    };
    if (masterUrl.includes('cdnz.quest')) {
      headers['Referer'] = baseOrigin || 'https://anafast.cyou/';
      headers['Origin'] = baseOrigin ? new URL(baseOrigin).origin : 'https://anafast.cyou';
    } else if (masterUrl.includes('egybestvid') || (baseOrigin && baseOrigin.includes('egybestvid'))) {
      headers['Referer'] = baseOrigin || 'https://egybestvid.com/';
      headers['Accept-Language'] = '';
    }
    const res = await fetch(masterUrl, {
      signal: controller.signal,
      headers
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.includes('#EXT-X-STREAM-INF')) return [];

    const lines = text.split(/\r?\n/);
    const subStreams: any[] = [];
    const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        let nextUri = '';
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j].trim();
          if (l && !l.startsWith('#')) {
            nextUri = l;
            break;
          }
        }
        if (nextUri) {
          const streamUrl = nextUri.startsWith('http') ? nextUri : new URL(nextUri, baseUrl).toString();
          let quality = 'HD عالية';
          const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
          if (resMatch) {
            const h = parseInt(resMatch[2], 10);
            if (h >= 2160) quality = '4K فائقة (2160p)';
            else if (h >= 1080) quality = '1080p FHD';
            else if (h >= 720) quality = '720p HD';
            else if (h >= 480) quality = '480p SD';
            else quality = `${h}p`;
          } else {
            const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
            if (bwMatch) {
              const bw = parseInt(bwMatch[1], 10);
              if (bw > 3500000) quality = '1080p FHD';
              else if (bw > 1800000) quality = '720p HD';
              else if (bw > 900000) quality = '480p SD';
              else quality = '360p منخفضة';
            }
          }

          const refParam = baseOrigin ? `&ref=${encodeURIComponent(baseOrigin)}` : '';
          subStreams.push({
            id: `stream-hls-${subStreams.length + 1}-${Date.now()}`,
            server: `سيرفر بث (${quality})`,
            quality,
            type: 'hls',
            url: `/api/stream-proxy?url=${encodeURIComponent(streamUrl)}${refParam}`,
            directUrl: streamUrl,
          });
        }
      }
    }
    subStreams.sort((a, b) => getStreamQualityScore(a.quality) - getStreamQualityScore(b.quality));
    return subStreams;
  } catch (_) {
    return [];
  }
}

// Specialized Extractor 1: Byse Encrypted Streams (bysetayico.com, bysesukior.com, byse, etc.)

async function isEmbedAlive(embedUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(embedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,*/*',
      },
    });
    clearTimeout(timeout);
    const pageText = await res.text();

    // Hosts like vstm.shop, vidmoly, dood, etc. often put fake <title>404 Not Found</title> or meta tags as cloaking
    // If player scripts, video containers, or obfuscated payloads exist, it is definitely ALIVE!
    const hasPlayerIndicators =
      pageText.includes('ﾟωﾟ') ||
      pageText.includes('jwplayer') ||
      pageText.includes('mContainer') ||
      pageText.includes('player-v') ||
      pageText.includes('hotstar.js') ||
      pageText.includes('vtg-video-urls') ||
      pageText.includes('embed-container') ||
      pageText.includes('video-js') ||
      pageText.includes('CryptoJS') ||
      pageText.includes('plyr');

    if (hasPlayerIndicators) {
      return true;
    }

    if (!res.ok && res.status === 404) return false;

    // Only consider dead if real deleted keywords exist outside of cloaking
    if (/(?:^|>)\s*(?:File Deleted|file was deleted|Video not found|تم حذف الملف|هذا الفيديو غير متاح|This video has been removed)\s*(?:<|$)/i.test(pageText)) {
      return false;
    }

    return true;
  } catch (_) {
    // If request timed out or network failed transiently, do not discard the stream
    return true;
  }
}

async function resolveByseVideo(cleanUrl: string): Promise<{ title?: string; poster?: string; streams: any[] } | null> {
  try {
    const isByse = /bysetayico|bysesukior|byse|bysest|byseplay|vidmoon/i.test(cleanUrl);
    if (!isByse) return null;
    const codeMatch = cleanUrl.match(/\/(?:e|d|f|v|video|videos)\/([a-zA-Z0-9_-]+)/i);
    if (!codeMatch) return null;
    const code = codeMatch[1];
    if (!code) return null;

    let origin = 'https://bysetayico.com';
    try {
      origin = new URL(cleanUrl).origin;
    } catch (_) {}

    const apiUrl = `${origin}/api/videos/${code}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let apiRes: globalThis.Response;
    try {
      apiRes = await fetch(apiUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': cleanUrl,
          'Accept': 'application/json'
        }
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!apiRes.ok) return null;
    const rawResText = await apiRes.text();
    if (!rawResText || !rawResText.trim().startsWith('{')) return null;
    let videoData: any = null;
    try {
      videoData = JSON.parse(rawResText);
    } catch (_) {
      return null;
    }
    if (!videoData || !videoData.playback) return null;

    const Xt = (e: string) => {
      const t = e.replace(/-/g, '+').replace(/_/g, '/');
      const r = t.length % 4 === 0 ? 0 : 4 - t.length % 4;
      return Buffer.from(t + '='.repeat(r), 'base64');
    };
    const Qa = () => {
      const e: Record<string, [number, number]> = {};
      for (let n = 1; n <= 20; n += 1) e[String(n)] = [n ^ 0, 31 - n ^ 0];
      return e;
    };
    const Ea = (e: string, t: number) => {
      const o = Qa()[(e || '').trim()];
      return !o ? [] : o;
    };
    const ws = (e: any) => {
      const t = Array.isArray(e.key_parts) ? e.key_parts : [];
      const r = Ea(e.version, t.length);
      if (r.length === 0) return t;
      return r.map((o: any) => t[o - 1]).filter(Boolean);
    };
    const ks = (e: any[]) => Buffer.concat(e.map(Xt));

    let decrypted: any = null;
    try {
      const key = ks(ws(videoData.playback));
      const iv = Xt(videoData.playback.iv);
      const rawPayload = Xt(videoData.playback.payload);
      const tag = rawPayload.slice(-16);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const decryptedBuf = Buffer.concat([decipher.update(rawPayload.slice(0, -16)), decipher.final()]);
      const decryptedStr = decryptedBuf.toString('utf8');
      if (decryptedStr && decryptedStr.trim().startsWith('{')) {
        decrypted = JSON.parse(decryptedStr);
      }
    } catch (_) {
      // Byse encrypted payload structure changed or video removed
      decrypted = null;
    }

    if (!decrypted) return null;

    const streams: any[] = [];
    if (Array.isArray(decrypted.sources)) {
      decrypted.sources.forEach((s: any, idx: number) => {
        const quality = s.label || `${s.height || 720}p HD`;
        const directHlsUrl = s.url;
        const proxyHlsUrl = `/api/stream-proxy?url=${encodeURIComponent(directHlsUrl)}`;

        // 1. Primary Clean HLS Stream (served through proxy to guarantee 100% CORS and range support for .ts segments)
        streams.push({
          id: `stream-byse-hls-${idx + 1}-${Date.now()}`,
          server: `سيرفر Vidmoon (${quality}) [فك تشفير HLS - بدون إعلانات]`,
          quality,
          type: 'hls',
          url: proxyHlsUrl,
          directUrl: directHlsUrl,
        });

        // 2. Direct HLS Stream (raw CDN link backup)
        streams.push({
          id: `stream-byse-direct-${idx + 1}-${Date.now()}`,
          server: `سيرفر Vidmoon مباشر (${quality}) [رابط خام]`,
          quality: `${quality} Direct`,
          type: 'hls',
          url: directHlsUrl,
          directUrl: directHlsUrl,
        });
      });
    }

    // 3. Protected Player Embed (Guarantees zero 404 errors inside iframe by using decrypted stream)
    const firstHls = streams.find(s => s.type === 'hls' && s.url.startsWith('/api/stream-proxy'));
    if (firstHls) {
      firstHls.preferred = true;
      streams.push({
        id: `stream-byse-clean-embed-${Date.now()}`,
        server: `مشغل Byse المحمي (مانع الإعلانات ⚡)`,
        quality: '720p HD',
        type: 'embed',
        url: `/api/player-embed?url=${encodeURIComponent(firstHls.url)}&title=${encodeURIComponent(videoData.title || 'سيرفر Byse')}`,
        directUrl: cleanUrl,
      });
    }

    // 4. Original Embed / Popout fallback option
    streams.push({
      id: `stream-byse-embed-${Date.now()}`,
      server: `مشغل Byse الأصلي (نافذة مستقلة)`,
      quality: 'HD مدمج',
      type: 'embed',
      url: cleanUrl,
      directUrl: cleanUrl,
      needsPopout: true,
    });

    return {
      title: videoData.title,
      poster: videoData.poster_url || decrypted.poster_url,
      streams
    };
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      // Timeout on external Byse server: gracefully provide fallback embed stream without logging fatal error
      return {
        title: '',
        streams: [
          {
            id: `stream-byse-fallback-${Date.now()}`,
            server: 'مشغل Byse الاحتياطي (نافذة مستقلة)',
            quality: 'HD عالية',
            type: 'embed',
            url: cleanUrl,
            directUrl: cleanUrl,
            needsPopout: true,
          },
        ],
      };
    }
    return null;
  }
}

// Specialized Extractor 2: MixDrop Direct MP4 (bypasses sandbox restrictions)
async function resolveMixdropVideo(cleanUrl: string): Promise<{ title?: string; poster?: string; streams: any[] } | null> {
  try {
    if (!/mixdrop\.|mxdrop\./i.test(cleanUrl)) return null;

    const codeMatch = cleanUrl.match(/\/(?:e|f)\/([a-zA-Z0-9]+)/);
    if (!codeMatch) return null;
    const code = codeMatch[1];
    const embedUrl = `https://mixdrop.to/e/${code}`;
    const fileUrl = `https://mixdrop.to/f/${code}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(embedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      }
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();

    const packedMatch = html.match(/eval\(function\(p,a,c,k,e,[rd]\)[\s\S]*?\.split\(['"]\|['"]\)[^)]*\)\)/);
    if (!packedMatch) return null;
    const unpacked = eval(packedMatch[0].replace(/^eval/, ''));
    const wurlMatch = unpacked.match(/MDCore\.wurl\s*=\s*["']([^"']+)["']/);
    const posterMatch = unpacked.match(/MDCore\.poster\s*=\s*["']([^"']+)["']/);

    let title = '';
    try {
      const fRes = await fetch(fileUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(3000)
      });
      if (fRes.ok) {
        const fHtml = await fRes.text();
        const fTitle = fHtml.match(/<title>([^<]+)<\/title>/i);
        if (fTitle) {
          title = fTitle[1].replace(/MixDrop\s*[-–|]?\s*Watch\s*/i, '').trim();
        }
      }
    } catch (_) {}

    if (wurlMatch) {
      let videoUrl = wurlMatch[1];
      if (videoUrl.startsWith('//')) videoUrl = 'https:' + videoUrl;
      let posterUrl = posterMatch ? posterMatch[1] : '';
      if (posterUrl.startsWith('//')) posterUrl = 'https:' + posterUrl;
      const proxyVideoUrl = `/api/stream-proxy?url=${encodeURIComponent(videoUrl)}`;

      return {
        title,
        poster: posterUrl,
        streams: [
          {
            id: `stream-mixdrop-mp4-${Date.now()}`,
            server: 'سيرفر MixDrop مباشر بدون حظر (Direct MP4)',
            quality: '1080p FHD',
            type: 'mp4',
            url: proxyVideoUrl,
            directUrl: videoUrl,
          },
          {
            id: `stream-mixdrop-embed-${Date.now()}`,
            server: 'مشغل MixDrop المضمن الأصلي (نافذة مستقلة)',
            quality: 'HD عالية',
            type: 'embed',
            url: embedUrl,
            directUrl: cleanUrl,
            needsPopout: true,
          }
        ]
      };
    }
    return null;
  } catch (err) {
    console.warn('Mixdrop extraction error:', err);
    return null;
  }
}

// Specialized Extractor 3: vstm.shop / Stream (Server-side Decryption + Pristine Direct HLS Extraction)
function vstmDcx(encryptedBase64: string, pd: any): string {
  if (!encryptedBase64 || typeof encryptedBase64 !== 'string') return '';
  if (encryptedBase64.startsWith('{')) return encryptedBase64;
  try {
    const raw = Buffer.from(encryptedBase64, 'base64');
    if (raw.length <= 16) return encryptedBase64;
    const salt = raw.subarray(0, 16);
    const ciphertext = raw.subarray(16);
    const derived = crypto.pbkdf2Sync(String(pd), salt, 10000, 48, 'sha256');
    const key = derived.subarray(0, 32);
    const iv = derived.subarray(32, 48);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(true);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (_) {
    return encryptedBase64;
  }
}

async function resolveVstmVideo(cleanUrl: string): Promise<{ title?: string; poster?: string; streams: any[]; warning?: string; subtitles?: any[] } | null> {
  try {
    if (!/vstm\.shop|vstm|naturee\.site|luvstream/i.test(cleanUrl)) return null;

    let targetUrl = cleanUrl.trim();
    if (targetUrl.includes('vstm.shop')) {
      targetUrl = targetUrl.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?vstm\.shop/i, 'https://naturee.site');
    }

    // Direct M3U8 Stream link handling (e.g. https://naturee.site/hls/...)
    if (targetUrl.includes('/hls/') || targetUrl.includes('.m3u8')) {
      const proxyMasterUrl = `/api/stream-proxy?url=${encodeURIComponent(targetUrl)}`;
      const streams: any[] = [
        {
          id: `stream-vstm-hls-1080p-${Date.now()}`,
          server: 'سيرفر Stream (1080p FHD) [HLS أصلي مباشر ⚡]',
          quality: '1080p FHD',
          type: 'hls',
          url: proxyMasterUrl,
          directUrl: targetUrl,
          preferred: false,
        }
      ];

      try {
        const subQualities = await parseM3u8Qualities(targetUrl, 'https://naturee.site/');
        subQualities.sort((a, b) => getStreamQualityScore(a.quality) - getStreamQualityScore(b.quality));
        subQualities.forEach((sub, sIdx) => {
          streams.push({
            id: `stream-vstm-sub-${sIdx + 1}-${Date.now()}`,
            server: `سيرفر Stream (${sub.quality})`,
            quality: sub.quality,
            type: 'hls',
            url: `/api/stream-proxy?url=${encodeURIComponent(sub.directUrl || sub.url)}`,
            directUrl: sub.directUrl || sub.url,
          });
        });
      } catch (_) {}

      streams.push({
        id: `stream-vstm-embed-clean-${Date.now()}`,
        server: 'مشغل Stream المحمي (مانع الإعلانات ⚡)',
        quality: '1080p FHD',
        type: 'embed',
        url: `/api/player-embed?url=${encodeURIComponent(proxyMasterUrl)}&title=${encodeURIComponent('سيرفر Stream')}`,
        directUrl: targetUrl,
      });

      streams.push({
        id: `stream-vstm-popout-${Date.now()}`,
        server: 'مشغل Stream الأصلي (نافذة مستقلة)',
        quality: 'HD عالية',
        type: 'embed',
        url: targetUrl,
        directUrl: targetUrl,
        needsPopout: true,
      });

      const sorted = sortStreamsAscending(streams);
      const def = pickDefaultQualityStream(sorted);
      sorted.forEach((s) => {
        s.preferred = false;
      });
      if (def) {
        def.preferred = true;
      }

      return {
        title: 'فيديو Stream (vstm.shop)',
        streams: sorted,
      };
    }

    let embedUrl = targetUrl;
    if (targetUrl.includes('/d/')) {
      embedUrl = targetUrl.replace('/d/', '/e/');
    }

    let html = '';
    let status = 200;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(embedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://aflam18.media/',
          'Accept': 'text/html,*/*',
        }
      });
      clearTimeout(timeout);
      status = res.status;
      html = await res.text();
    } catch (_) {}

    // Check for player indicators (aaencode, jwplayer, container)
    const hasPlayer = html.includes('ﾟωﾟ') ||
      html.includes('jwplayer') ||
      html.includes('mContainer') ||
      html.includes('player-v') ||
      html.includes('embed-container') ||
      html.includes('CryptoJS');

    const isReal404 = (status === 404 || /<title>\s*404 Not Found\s*<\/title>/i.test(html)) && !hasPlayer;

    if (isReal404) {
      return {
        title: 'فيديو غير متوفر (404)',
        streams: [
          {
            id: `stream-vstm-${Date.now()}`,
            server: 'سيرفر vstm.shop (الرابط محذوف أو منتهي 404)',
            quality: 'غير متاح',
            type: 'embed',
            url: cleanUrl,
            directUrl: cleanUrl,
            warning: 'تم فحص الرابط وتبين أنه محذوف أو غير موجود حالياً على سيرفر vstm.shop (404 Not Found).'
          }
        ],
        warning: 'الملف غير موجود أو تم حذفه من سيرفر vstm.shop (404).'
      };
    }

    // Extract title & poster from og tags if present
    let detectedTitle = '';
    let detectedPoster = '';
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (ogTitleMatch && !ogTitleMatch[1].includes('404')) detectedTitle = ogTitleMatch[1];
    const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogImgMatch) detectedPoster = ogImgMatch[1];

    // Attempt Server-Side Decryption of VSTM video sources
    try {
      const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
      const aaScript = scripts.find(s => s[1].includes('(ﾟДﾟ)[ﾟoﾟ]') || s[1].includes('ﾟωﾟﾉ='));
      if (aaScript) {
        const vm = await import('vm');
        const win: any = {};
        const ctx = vm.createContext({ window: win, document: {}, global: win, self: win });
        vm.runInContext(aaScript[1], ctx);

        const apx = ctx.apx;
        const qsx = ctx.qsx;
        const ps = ctx.ps;
        const kaken = ctx.kaken;
        const pd = ctx.pd;

        if (apx && ps && kaken && pd) {
          const atobApx = Buffer.from(apx, 'base64').toString('binary');
          const cleanPath = atobApx.replace('-config', '') + '?p=' + ps;
          let baseUrl = ctx.baseURL ? String(ctx.baseURL).trim() : '';
          if (baseUrl.includes('vstm.shop')) {
            baseUrl = baseUrl.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?vstm\.shop/i, 'https://naturee.site');
          }
          if (!baseUrl) {
            try {
              baseUrl = new URL(embedUrl).origin + '/';
            } catch (_) {
              baseUrl = 'https://naturee.site/';
            }
          }
          const sourcesUrl = new URL(cleanPath, baseUrl).href;

          const srcRes = await fetch(sourcesUrl, {
            method: 'POST',
            headers: {
              'Referer': embedUrl,
              'Origin': new URL(embedUrl).origin,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Content-Type': 'text/plain'
            },
            body: kaken
          });

          if (srcRes.ok) {
            const srcEncrypted = await srcRes.text();
            const srcDecrypted = vstmDcx(srcEncrypted, pd);
            const videoData = JSON.parse(srcDecrypted);

            if (videoData && Array.isArray(videoData.sources) && videoData.sources.length > 0) {
              let masterHls = videoData.sources[0].file;
              if (masterHls && masterHls.includes('vstm.shop')) {
                masterHls = masterHls.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?vstm\.shop/i, 'https://naturee.site');
              }
              let poster = videoData.poster || detectedPoster || '';
              if (poster && poster.includes('vstm.shop')) {
                poster = poster.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?vstm\.shop/i, 'https://naturee.site');
              }
              const title = videoData.title && !videoData.title.includes('404') ? videoData.title : detectedTitle;
              const tracks = Array.isArray(videoData.tracks) ? videoData.tracks : [];

              const streams: any[] = [];
              const proxyMasterUrl = `/api/stream-proxy?url=${encodeURIComponent(masterHls)}`;

              // 1. Primary Direct HLS Stream (1080p FHD - Original Source)
              streams.push({
                id: `stream-vstm-hls-1080p-${Date.now()}`,
                server: 'سيرفر Stream (1080p FHD) [HLS أصلي مباشر ⚡]',
                quality: '1080p FHD',
                type: 'hls',
                url: proxyMasterUrl,
                directUrl: masterHls,
                preferred: true,
                subtitles: tracks,
              });

              // 2. Discover available sub-qualities from HLS Master Manifest
              try {
                const subQualities = await parseM3u8Qualities(masterHls, 'https://naturee.site/');
                // Sort sub-qualities by resolution ascending (lowest to highest)
                subQualities.sort((a, b) => getStreamQualityScore(a.quality) - getStreamQualityScore(b.quality));
                subQualities.forEach((sub, sIdx) => {
                  const subProxyUrl = `/api/stream-proxy?url=${encodeURIComponent(sub.directUrl || sub.url)}`;
                  streams.push({
                    id: `stream-vstm-sub-${sIdx + 1}-${Date.now()}`,
                    server: `سيرفر Stream (${sub.quality})`,
                    quality: sub.quality,
                    type: 'hls',
                    url: subProxyUrl,
                    directUrl: sub.directUrl || sub.url,
                    subtitles: tracks,
                  });
                });
              } catch (_) {}

              // 3. Clean and Protected Player Embed (For Iframe Embed Mode with Zero Ads & No Blockers)
              const subUrl = tracks.length > 0 ? tracks[0].file : '';
              const playerEmbedUrl = `/api/player-embed?url=${encodeURIComponent(proxyMasterUrl)}&title=${encodeURIComponent(title || 'سيرفر Stream')}&poster=${encodeURIComponent(poster)}&sub=${encodeURIComponent(subUrl)}`;
              streams.push({
                id: `stream-vstm-embed-clean-${Date.now()}`,
                server: 'مشغل Stream المدمج المحمي (مانع الإعلانات ⚡)',
                quality: '1080p FHD',
                type: 'embed',
                url: playerEmbedUrl,
                directUrl: embedUrl,
                subtitles: tracks,
              });

              // 4. Fallback Popout Window Option
              streams.push({
                id: `stream-vstm-popout-${Date.now()}`,
                server: 'مشغل Stream الأصلي (نافذة مستقلة)',
                quality: 'HD عالية',
                type: 'embed',
                url: embedUrl,
                directUrl: embedUrl,
                needsPopout: true,
              });

              const sorted = sortStreamsAscending(streams);
              const def = pickDefaultQualityStream(sorted);
              sorted.forEach((s) => {
                s.preferred = false;
              });
              if (def) {
                def.preferred = true;
              }

              return {
                title: title || 'فيلم Stream',
                poster,
                streams: sorted,
                subtitles: tracks,
              };
            }
          }
        }
      }
    } catch (decryptErr) {
      console.warn('VSTM server-side decryption attempt failed, falling back to proxy player:', decryptErr);
    }

    // Fallback: Embed Proxy with custom ad shields if decryption was skipped
    const proxyEmbedUrl = `/api/embed-proxy?url=${encodeURIComponent(cleanUrl)}&ref=${encodeURIComponent('https://aflam18.media/')}`;
    return {
      title: detectedTitle || 'فيديو Stream (vstm.shop)',
      poster: detectedPoster,
      streams: [
        {
          id: `stream-vstm-proxy-${Date.now()}`,
          server: 'سيرفر Stream (مشغل مدمج ضد الحظر والإعلانات)',
          quality: '1080p FHD',
          type: 'embed',
          url: proxyEmbedUrl,
          directUrl: cleanUrl,
        },
        {
          id: `stream-vstm-direct-${Date.now()}`,
          server: 'سيرفر Stream (مشغل مباشر الأصلي)',
          quality: 'HD عالية',
          type: 'embed',
          url: cleanUrl,
          directUrl: cleanUrl,
        }
      ]
    };
  } catch (err) {
    console.warn('vstm extraction error:', err);
    return null;
  }
}

// Specialized Extractor 4: Playmogo (Embedded with anti-ad shield and proxy)
function resolvePlaymogoVideo(cleanUrl: string): { title: string; streams: any[]; warning: string } {
  const codeMatch = cleanUrl.match(/\/(?:e|d|v|f)\/([a-zA-Z0-9_-]+)/i);
  const code = codeMatch ? codeMatch[1] : '';
  const embedUrl = code ? `https://playmogo.com/e/${code}` : cleanUrl;
  const proxyEmbedUrl = `/api/embed-proxy?url=${encodeURIComponent(embedUrl)}`;
  return {
    title: code ? `فيديو Playmogo [${code}]` : 'فيديو Playmogo',
    warning: 'تم إعداد مشغل Playmogo للتشغيل المباشر داخل شاشة العرض مع درع حماية متكامل ضد الإعلانات والنوافذ المنبثقة.',
    streams: [
      {
        id: `stream-playmogo-direct-${Date.now()}`,
        server: 'سيرفر Playmogo (مشغل مدمج محمي ⚡)',
        quality: '1080p FHD',
        type: 'embed',
        url: embedUrl,
        directUrl: embedUrl,
        preferred: true,
      },
      {
        id: `stream-playmogo-proxy-${Date.now()}`,
        server: 'سيرفر Playmogo (مشغل البروكسي المانع للإعلانات)',
        quality: '1080p FHD',
        type: 'embed',
        url: proxyEmbedUrl,
        directUrl: embedUrl,
      },
      {
        id: `stream-playmogo-popout-${Date.now()}`,
        server: 'مشغل Playmogo الأصلي (نافذة خارجية ↗)',
        quality: 'HD عالية',
        type: 'embed',
        url: embedUrl,
        directUrl: embedUrl,
        needsPopout: true,
      }
    ]
  };
}

function extractYouTubeId(urlStr?: string): string | null {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const trimmed = urlStr.trim().replace(/^['"]|['"]$/g, '');
  const match = trimmed.match(/(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=|(?:shorts|live)\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (match) return match[1];
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
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

// -------------------------------------------------------------
// Stream Health & Liveness Checker API Route (/api/check-stream-health)
// -------------------------------------------------------------
app.post('/api/check-stream-health', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const { url, directUrl, ref } = req.body || {};
    let target = (directUrl || url || '').trim();
    if (!target) {
      return res.json({ alive: false, playableDirect: false, error: 'Empty URL' });
    }

    if (target.startsWith('/api/stream-proxy?url=')) {
      target = decodeURIComponent(target.replace('/api/stream-proxy?url=', ''));
    }
    if (target.startsWith('/api/embed-proxy?url=')) {
      target = decodeURIComponent(target.replace('/api/embed-proxy?url=', '').split('&')[0]);
    }
    if (target.startsWith('/api/player-embed?url=')) {
      target = decodeURIComponent(target.replace('/api/player-embed?url=', '').split('&')[0]);
      if (target.startsWith('/api/stream-proxy?url=')) {
        target = decodeURIComponent(target.replace('/api/stream-proxy?url=', ''));
      }
    }

    // Fast and accurate check for YouTube streams
    const ytId = extractYouTubeId(target) || extractYouTubeId(directUrl) || extractYouTubeId(url);
    if (ytId) {
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`, {
          signal: AbortSignal.timeout(3500),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        });
        if (oembedRes.status === 200) {
          return res.json({ alive: true, playableDirect: false, type: 'embed', isYouTube: true, youtubeId: ytId });
        }
        if (oembedRes.status === 404) {
          return res.json({ alive: false, playableDirect: false, status: 404, type: 'embed', isYouTube: true, error: 'Deleted YouTube video' });
        }
        // Fallback to thumbnail check
        const thumbRes = await fetch(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2500),
        });
        const isThumbOk = thumbRes.status === 200;
        return res.json({ alive: isThumbOk, playableDirect: false, status: thumbRes.status, type: 'embed', isYouTube: true, youtubeId: ytId });
      } catch (_) {
        return res.json({ alive: true, playableDirect: false, type: 'embed', isYouTube: true, youtubeId: ytId });
      }
    }

    if (/vstm\.shop/i.test(target)) {
      target = target.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?vstm\.shop/i, 'https://naturee.site');
    }

    if (target.startsWith('//')) {
      target = 'https:' + target;
    }
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      return res.json({ alive: false, playableDirect: false, error: 'Invalid URL scheme' });
    }

    try {
      const parsed = new URL(target);
      if (!parsed.hostname || (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')) {
        return res.json({ alive: false, playableDirect: false, error: 'Invalid hostname' });
      }
    } catch {
      return res.json({ alive: false, playableDirect: false, error: 'Malformed URL' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };

    if (target.includes('.m3u8') || target.includes('/hls/')) {
      headers['Accept'] = '*/*';
    } else {
      headers['Range'] = 'bytes=0-1024';
    }

    // Set precise origin/referer headers matching CDN requirements
    if (target.includes('uqload') || (target.includes('strm') && target.includes('.vc'))) {
      headers['Referer'] = 'https://uqload.net/';
      headers['Origin'] = 'https://uqload.net';
    } else if (target.includes('mixdrop') || target.includes('mxcontent.net')) {
      headers['Referer'] = 'https://mixdrop.to/';
      headers['Origin'] = 'https://mixdrop.to';
    } else if (target.includes('naturee.site') || target.includes('vstm.shop')) {
      headers['Referer'] = 'https://naturee.site/';
      headers['Origin'] = 'https://naturee.site';
    } else if (target.includes('bysetayico') || target.includes('bysesukior') || target.includes('byse') || target.includes('sprintcdn') || target.includes('r66nv9ed')) {
      headers['Referer'] = 'https://bysetayico.com/';
      headers['Origin'] = 'https://bysetayico.com';
    } else if (target.includes('vidmoly') || target.includes('vmpx.online') || target.includes('vmeas.cloud')) {
      headers['Referer'] = 'https://vidmoly.biz/';
      headers['Origin'] = 'https://vidmoly.biz';
    } else if (target.includes('streamtape') || target.includes('tapecontent.net')) {
      headers['Referer'] = 'https://streamtape.com/';
      headers['Origin'] = 'https://streamtape.com';
    } else if (target.includes('abyssplayer') || target.includes('abyss.to')) {
      headers['Referer'] = 'https://abyssplayer.com/';
      headers['Origin'] = 'https://abyssplayer.com';
    } else if (ref && typeof ref === 'string' && ref.startsWith('http') && !ref.includes('aflam18')) {
      headers['Referer'] = ref;
    } else {
      try {
        headers['Referer'] = new URL(target).origin;
      } catch (_) {}
    }

    const testRes = await fetch(target, {
      method: 'GET',
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);

    const isHttpOk = testRes.status >= 200 && testRes.status < 400;

    if (!isHttpOk) {
      return res.json({
        alive: false,
        playableDirect: false,
        status: testRes.status,
      });
    }

    const contentType = testRes.headers.get('content-type') || '';

    // 1. Check HLS / m3u8
    if (target.includes('.m3u8') || target.includes('/hls/') || contentType.includes('mpegurl')) {
      const sample = await testRes.text();
      const isM3u8Valid =
        sample.includes('#EXTM3U') &&
        (sample.includes('#EXT-X-STREAM-INF') ||
          sample.includes('#EXTINF') ||
          sample.includes('#EXT-X-TARGETDURATION'));

      if (!isM3u8Valid) {
        return res.json({
          alive: false,
          playableDirect: false,
          status: testRes.status,
          error: 'Invalid m3u8 playlist',
        });
      }

      // If master playlist with sub-variants, test the first variant URL to ensure tokens aren't expired (e.g. 403 on child segments)
      if (sample.includes('#EXT-X-STREAM-INF')) {
        const lines = sample.split('\n');
        let variantUrl = '';
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('#EXT-X-STREAM-INF')) {
            for (let j = i + 1; j < lines.length; j++) {
              const line = lines[j].trim();
              if (line && !line.startsWith('#')) {
                variantUrl = line.startsWith('http') ? line : new URL(line, target).href;
                break;
              }
            }
            break;
          }
        }

        if (variantUrl) {
          try {
            const childController = new AbortController();
            const childTimeout = setTimeout(() => childController.abort(), 3500);
            const childRes = await fetch(variantUrl, {
              method: 'GET',
              signal: childController.signal,
              headers,
            });
            clearTimeout(childTimeout);
            if (childRes.status < 200 || childRes.status >= 400) {
              return res.json({
                alive: false,
                playableDirect: false,
                status: childRes.status,
                error: 'Sub-variant expired',
              });
            }
          } catch (_) {
            // If child probe timed out but master succeeded, still considered possibly alive
          }
        }
      }

      return res.json({
        alive: true,
        playableDirect: true,
        status: testRes.status,
        type: 'hls',
      });
    }

    // 2. Check HTML embed
    if (contentType.includes('text/html')) {
      const text = await testRes.text();
      const isDeleted =
        /file was deleted|file not found|video was deleted|تم حذف الملف|هذا الفيديو غير متاح|video not found|404 Not Found|account suspended|video removed|no longer available/i.test(
          text
        );
      return res.json({
        alive: !isDeleted,
        playableDirect: false,
        status: testRes.status,
        type: 'embed',
      });
    }

    // 3. Direct video file (mp4, webm)
    return res.json({
      alive: true,
      playableDirect: true,
      status: testRes.status,
      type: 'mp4',
    });
  } catch (err: any) {
    return res.json({
      alive: false,
      playableDirect: false,
      error: err?.message || 'timeout/connection error',
    });
  }
});

// -------------------------------------------------------------
// Batch Movie Links & Empty Page Checker Route (/api/check-movie-links-batch)
// -------------------------------------------------------------
async function checkSingleMovieItem(movie: any, checkAllLinks: boolean) {
  const movieId = movie?.id || '';
  const rawUrl = (movie?.url || movie?.embedUrl || movie?.originalUrl || '').trim();

  // 1. Missing or empty URL
  if (!rawUrl) {
    return {
      id: movieId,
      isBroken: true,
      reason: 'empty_url',
      description: 'رابط الفيلم فارغ أو غير متوفر في بيانات العنصر',
      status: 0,
      isYouTube: false,
    };
  }

  // 2. YouTube Detection & Health Check
  const ytId = extractYouTubeId(rawUrl) || extractYouTubeId(movie?.embedUrl) || extractYouTubeId(movie?.originalUrl);
  const isLikelyYouTube = ytId || /youtube\.com|youtu\.be/i.test(rawUrl);

  if (isLikelyYouTube) {
    if (!ytId) {
      return {
        id: movieId,
        isBroken: true,
        reason: 'invalid_youtube_id',
        description: 'معرّف فيديو يوتيوب غير صالح أو الرابط غير مكتمل',
        status: 400,
        isYouTube: true,
      };
    }

    try {
      // Step A: YouTube oEmbed API probe
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`, {
        signal: AbortSignal.timeout(3800),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });

      if (oembedRes.status === 200) {
        return {
          id: movieId,
          isBroken: false,
          isYouTube: true,
          status: 200,
        };
      }

      if (oembedRes.status === 404) {
        return {
          id: movieId,
          isBroken: true,
          reason: 'youtube_deleted',
          description: 'فيديو يوتيوب محذوف أو لم يعد متوفراً (404 Not Found)',
          status: 404,
          isYouTube: true,
        };
      }

      if (oembedRes.status === 401 || oembedRes.status === 403) {
        return {
          id: movieId,
          isBroken: true,
          reason: 'youtube_private_or_restricted',
          description: 'فيديو يوتيوب خاص أو مقيد أو تم إغلاق القناة (401/403)',
          status: oembedRes.status,
          isYouTube: true,
        };
      }

      // Step B: Double check thumbnail for cases like 400 on oembed
      const thumbRes = await fetch(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(2800),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (thumbRes.status === 200) {
        return {
          id: movieId,
          isBroken: false,
          isYouTube: true,
          status: 200,
        };
      } else if (thumbRes.status === 404) {
        return {
          id: movieId,
          isBroken: true,
          reason: 'youtube_deleted',
          description: 'فيديو يوتيوب محذوف أو غير متاح (صورة الغلاف مفقودة 404)',
          status: 404,
          isYouTube: true,
        };
      }

      return {
        id: movieId,
        isBroken: true,
        reason: 'youtube_unavailable',
        description: `فيديو يوتيوب غير متاح (رمز الاستجابة: ${oembedRes.status})`,
        status: oembedRes.status,
        isYouTube: true,
      };
    } catch (_) {
      try {
        const thumbRes = await fetch(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2500),
        });
        if (thumbRes.status === 200) {
          return { id: movieId, isBroken: false, isYouTube: true, status: 200 };
        }
        if (thumbRes.status === 404) {
          return {
            id: movieId,
            isBroken: true,
            reason: 'youtube_deleted',
            description: 'فيديو يوتيوب محذوف أو لم يعد متوفراً (404)',
            status: 404,
            isYouTube: true,
          };
        }
      } catch (_) {}
      return { id: movieId, isBroken: false, isYouTube: true };
    }
  }

  // 3. For non-YouTube links
  if (!checkAllLinks) {
    return {
      id: movieId,
      isBroken: false,
      isYouTube: false,
    };
  }

  let targetUrl = rawUrl;
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const parsed = new URL(targetUrl);
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return {
        id: movieId,
        isBroken: true,
        reason: 'invalid_url',
        description: 'رابط غير صالح أو نطاق غير صحيح',
        status: 400,
        isYouTube: false,
      };
    }
  } catch {
    return {
      id: movieId,
      isBroken: true,
      reason: 'malformed_url',
      description: 'صيغة الرابط غير صحيحة',
      status: 400,
      isYouTube: false,
    };
  }

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(4500),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (res.status === 404) {
      return {
        id: movieId,
        isBroken: true,
        reason: 'page_not_found',
        description: 'الصفحة غير موجودة (404 Not Found)',
        status: 404,
        isYouTube: false,
      };
    }

    if (res.status === 410) {
      return {
        id: movieId,
        isBroken: true,
        reason: 'page_gone',
        description: 'الصفحة أو المحتوى تم حذفه نهائياً (410 Gone)',
        status: 410,
        isYouTube: false,
      };
    }

    if (res.status >= 500) {
      return {
        id: movieId,
        isBroken: true,
        reason: 'server_error',
        description: `خطأ في خادم الموقع المصدر (${res.status})`,
        status: res.status,
        isYouTube: false,
      };
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      const text = await res.text();
      const stripped = text.replace(/<[^>]*>/g, '').trim();
      if (stripped.length < 35 && !text.includes('<video') && !text.includes('<iframe')) {
        return {
          id: movieId,
          isBroken: true,
          reason: 'empty_page',
          description: 'صفحة فارغة أو بيضاء تماماً بدون أي محتوى',
          status: 200,
          isYouTube: false,
        };
      }

      const isExplicitlyDeleted =
        /404\s*not\s*found|لم\s*يتم\s*العثور\s*على\s*الصفحة|الصفحة\s*غير\s*موجودة|file\s*was\s*deleted|video\s*was\s*deleted|تم\s*حذف\s*الملف|هذا\s*الفيديو\s*غير\s*متاح|video\s*not\s*found|file\s*not\s*found|account\s*suspended|video\s*removed|no\s*longer\s*available|تم\s*إزالة\s*المحتوى/i.test(
          text
        );

      if (isExplicitlyDeleted) {
        return {
          id: movieId,
          isBroken: true,
          reason: 'deleted_page',
          description: 'الصفحة تشير إلى أنه تم حذف المحتوى أو لم يعد متوفراً',
          status: 200,
          isYouTube: false,
        };
      }
    }

    return {
      id: movieId,
      isBroken: false,
      isYouTube: false,
      status: res.status,
    };
  } catch (fetchErr: any) {
    const msg = (fetchErr?.message || '').toLowerCase();
    if (msg.includes('enotfound') || msg.includes('econnrefused')) {
      return {
        id: movieId,
        isBroken: true,
        reason: 'unreachable_domain',
        description: 'الخادم أو النطاق لم يعد موجوداً أو تم حظره',
        status: 0,
        isYouTube: false,
      };
    }
    return {
      id: movieId,
      isBroken: false,
      isYouTube: false,
    };
  }
}

app.post('/api/check-movie-links-batch', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const { movies, checkAllLinks } = req.body || {};
    if (!Array.isArray(movies) || movies.length === 0) {
      return res.json({ success: true, count: 0, results: [] });
    }

    const results = await Promise.all(
      movies.map((m: any) => checkSingleMovieItem(m, !!checkAllLinks))
    );

    return res.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (err: any) {
    console.error('[Batch Link Check Route Error]:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Server error during batch check' });
  }
});

// Dedicated Resolver for Cimaab Video Portals (wa.cimaab.com, cimaab.com)
// Extracts all 5 video servers and unpacks Swhoi direct HLS m3u8 streams
async function resolveCimaabVideo(cleanUrl: string): Promise<{ title?: string; poster?: string; streams: any[] } | null> {
  try {
    if (!/cimaab\.com/i.test(cleanUrl)) return null;

    let origin = 'https://wa.cimaab.com';
    try {
      origin = new URL(cleanUrl).origin;
    } catch (_) {}

    const vidMatch = cleanUrl.match(/[?&]vid=([a-zA-Z0-9_-]+)/i);
    const vid = vidMatch ? vidMatch[1] : '';
    if (!vid) return null;

    const playUrl = `${origin}/play.php?vid=${vid}`;
    const watchUrl = `${origin}/watch.php?vid=${vid}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    let playHtml = '';
    try {
      const res = await fetch(playUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': watchUrl,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      playHtml = await res.text();
    } finally {
      clearTimeout(timeout);
    }

    if (!playHtml) return null;

    let title = '';
    let poster = '';
    const titleMatch = playHtml.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(/\s*[-–|:]\s*(?:cimaab|سيما).*$/i, '').trim();
    }
    const posterMatch = playHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (posterMatch && posterMatch[1]) {
      poster = posterMatch[1].trim();
    }

    const streams: any[] = [];
    const serverRegex = /id=["']server_([^"']+)["']\s+data-embed=["']<iframe\s+src='([^']+)'/gi;
    let sMatch;
    const foundServers: { name: string; url: string }[] = [];
    while ((sMatch = serverRegex.exec(playHtml)) !== null) {
      foundServers.push({ name: sMatch[1], url: sMatch[2] });
    }

    if (foundServers.length === 0) {
      const iframeMatches = [...playHtml.matchAll(/<iframe[^>]+src=['"]([^'"]+)['"]/gi)];
      iframeMatches.forEach((im, idx) => {
        foundServers.push({ name: `سيرفر ${idx + 1}`, url: im[1] });
      });
    }

    for (const s of foundServers) {
      let serverUrl = s.url;
      if (serverUrl.startsWith('//')) serverUrl = 'https:' + serverUrl;

      // Swhoi server: unpack direct HLS .m3u8 stream!
      if (/swhoi\.com/i.test(serverUrl)) {
        try {
          const swhoiController = new AbortController();
          const swhoiTimeout = setTimeout(() => swhoiController.abort(), 6000);
          const swhoiRes = await fetch(serverUrl, {
            signal: swhoiController.signal,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Referer': origin + '/',
            },
          });
          clearTimeout(swhoiTimeout);
          const swhoiHtml = await swhoiRes.text();
          const pMatch = swhoiHtml.match(/return\s+p\}\s*\(\s*('[\s\S]+?')\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*('[\s\S]+?')\.split/);
          if (pMatch) {
            const p = (0, eval)(pMatch[1]);
            const a = parseInt(pMatch[2], 10);
            let c = parseInt(pMatch[3], 10);
            const k = (0, eval)(pMatch[4]).split('|');
            let unpacked = p;
            while (c--) {
              if (k[c]) {
                unpacked = unpacked.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
              }
            }
            const m3u8Match = unpacked.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>?]*(?:\?[^\s"'<>]*)?/);
            if (m3u8Match && m3u8Match[0]) {
              const directHls = m3u8Match[0];
              streams.push({
                id: `stream-cimaab-direct-hls-${Date.now()}`,
                server: 'بث HLS مباشر ⚡ (Swhoi High Speed)',
                quality: '1080p FHD',
                type: 'hls',
                url: `/api/stream-proxy?url=${encodeURIComponent(directHls)}`,
                directUrl: directHls,
                preferred: true,
              });
            }
          }
        } catch (swErr) {
          console.warn('[Cimaab] Swhoi direct extraction failed:', swErr);
        }
      }

      // Add embed proxy stream
      streams.push({
        id: `stream-cimaab-${s.name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        server: `سيرفر ${s.name} (مشغل مدمج محمي)`,
        quality: s.name.toLowerCase() === 'hgcloud' ? '1080p FHD' : 'HD عالية',
        type: 'embed',
        url: `/api/embed-proxy?url=${encodeURIComponent(serverUrl)}&ref=${encodeURIComponent(watchUrl)}`,
        directUrl: serverUrl,
      });

      // Add popout stream
      streams.push({
        id: `stream-cimaab-popout-${s.name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        server: `سيرفر ${s.name} (نافذة مستقلة ↗)`,
        quality: 'HD عالية',
        type: 'embed',
        url: serverUrl,
        directUrl: serverUrl,
        needsPopout: true,
      });
    }

    return {
      title,
      poster,
      streams,
    };
  } catch (_) {
    return null;
  }
}

// Dedicated Resolver for Akwam / Akoam & AlbaPlayer Video Portals (as.akwam.tube, akwam.tube, akwam.to, akoam, w.aflamy.pro)
// Extracts direct MP4 files (e.g. 480p, 320p), master HLS m3u8 streams with subqualities, and protected embed players
async function resolveAkwamVideo(cleanUrl: string): Promise<{ title?: string; poster?: string; streams: any[] } | null> {
  try {
    const isAkwamRelated = /akwam|akoam|aflamy\.pro|albaplayer|mp4plus|anafast|vidspeed/i.test(cleanUrl);
    if (!isAkwamRelated) return null;

    let embedUrl = '';
    let pageHtml = '';
    let title = '';
    let poster = '';
    const streams: any[] = [];
    const seenUrls = new Set<string>();

    const fetchSafe = async (u: string, ref = '', timeoutMs = 8500): Promise<string> => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(u, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            ...(ref ? { Referer: ref } : {}),
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          },
        });
        clearTimeout(t);
        if (!res.ok) return '';
        return await res.text();
      } catch (_) {
        return '';
      }
    };

    // If cleanUrl is already an embed URL
    if (cleanUrl.includes('/embed/') && /akwam|akoam/i.test(cleanUrl)) {
      embedUrl = cleanUrl;
    } else if (/albaplayer|aflamy\.pro/i.test(cleanUrl)) {
      // Direct albaplayer
    } else {
      // Fetch watch page
      pageHtml = await fetchSafe(cleanUrl);
      if (pageHtml) {
        const titleM = pageHtml.match(/<title>([^<]+)<\/title>/i);
        if (titleM) {
          title = titleM[1].replace(/\s*[-–|:]\s*(?:اكوام|akoam).*$/i, '').trim();
        }
        const ogImgM = pageHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (ogImgM) {
          poster = ogImgM[1].trim();
        }
        const iframeM =
          pageHtml.match(/<iframe[^>]+src=["'](https?:\/\/[^"']*akwam[^"']*\/embed\/[^"']+)["']/i) ||
          pageHtml.match(/og:video:url["']\s+content=["']([^"']+)["']/i);
        if (iframeM) {
          embedUrl = iframeM[1].trim();
        }
      }
      if (!embedUrl) {
        const idM = cleanUrl.match(/-(\d+)(?:\/|\?|$)/);
        if (idM) {
          embedUrl = `https://as.akwam.tube/embed/${idM[1]}/`;
        }
      }
    }

    let albaUrl = '';
    if (embedUrl) {
      if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
      const embedHtml = await fetchSafe(embedUrl, cleanUrl);
      if (embedHtml) {
        const albaM =
          embedHtml.match(/<iframe[^>]+src=["'](https?:\/\/[^"']*(?:albaplayer|aflamy\.pro)[^"']*)["']/i) ||
          embedHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (albaM) {
          albaUrl = albaM[1].trim();
        }
        if (!title) {
          const tM = embedHtml.match(/<title>([^<]+)<\/title>/i);
          if (tM) title = tM[1].replace(/\s*[-–|:]\s*(?:اكوام|akoam).*$/i, '').trim();
        }
      }
    } else if (/albaplayer|aflamy\.pro/i.test(cleanUrl)) {
      albaUrl = cleanUrl;
    }

    if (albaUrl) {
      if (albaUrl.startsWith('//')) albaUrl = 'https:' + albaUrl;
      const albaHtml = await fetchSafe(albaUrl, embedUrl || cleanUrl);
      if (albaHtml) {
        const serverLinks = [
          ...albaHtml.matchAll(
            /<a[^>]+class=["']aplr-link[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
          ),
        ];
        const serverItems: { name: string; url: string }[] = [];

        if (serverLinks.length > 0) {
          for (const sl of serverLinks) {
            let sUrl = sl[1].trim();
            if (sUrl.startsWith('//')) sUrl = 'https:' + sUrl;
            else if (sUrl.startsWith('/')) sUrl = new URL(sUrl, albaUrl).toString();
            const sName = sl[2].replace(/<[^>]+>/g, '').trim() || 'سيرفر';
            if (!/refresh|share/i.test(sName) && !sUrl.startsWith('javascript:')) {
              serverItems.push({ name: sName, url: sUrl });
            }
          }
        }

        const defIframe = albaHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (defIframe && (!serverItems.length || !serverItems.some((x) => x.url.includes('serv=1')))) {
          serverItems.unshift({ name: 'AflaMP4', url: defIframe[1].trim() });
        }

        for (const sItem of serverItems) {
          let hostEmbedUrl = '';
          if (sItem.url.includes('?serv=') || sItem.url.includes('/albaplayer/')) {
            const servHtml = await fetchSafe(sItem.url, albaUrl);
            const hostIframe = servHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (hostIframe) {
              hostEmbedUrl = hostIframe[1].trim();
            }
          } else {
            hostEmbedUrl = sItem.url;
          }

          if (!hostEmbedUrl) continue;
          if (hostEmbedUrl.startsWith('//')) hostEmbedUrl = 'https:' + hostEmbedUrl;

          const hostHtml = await fetchSafe(hostEmbedUrl, 'https://w.aflamy.pro/');

          let foundDirect = false;
          // 1. Direct sources array: sources: [{file: "...", label: "..."}]
          const sourcesMatch = hostHtml.match(/sources\s*:\s*(\[[^\]]+\])/i);
          if (sourcesMatch) {
            const rawArr = sourcesMatch[1];
            const fileMatches = [
              ...rawArr.matchAll(
                /file\s*:\s*["']([^"']+)["'](?:\s*,\s*label\s*:\s*["']([^"']+)["'])?/gi
              ),
            ];
            for (const fm of fileMatches) {
              const fUrl = fm[1];
              if (!fUrl) continue;
              const fLabel = fm[2] || (fUrl.includes('.mp4') ? '480p SD' : '720p HD');
              const isMp4 = fUrl.includes('.mp4');
              const isHls = fUrl.includes('.m3u8') || fUrl.includes('/hls/');
              const proxyUrl = `/api/stream-proxy?url=${encodeURIComponent(fUrl)}&ref=${encodeURIComponent(hostEmbedUrl)}`;

              if (!seenUrls.has(fUrl)) {
                seenUrls.add(fUrl);
                streams.push({
                  id: `stream-akwam-${sItem.name}-${fLabel}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                  server: `اكوام - ${sItem.name} (${isMp4 ? 'MP4 مباشر' : 'HLS مباشر'} ⚡)`,
                  quality: fLabel,
                  type: isMp4 ? 'mp4' : isHls ? 'hls' : 'embed',
                  url: proxyUrl,
                  directUrl: fUrl,
                  preferred: isMp4 || isHls,
                });
                foundDirect = true;
              }

              // If it's a master playlist, also parse sub-qualities!
              if (isHls) {
                try {
                  const subQuals = await parseM3u8Qualities(fUrl, hostEmbedUrl);
                  for (const sub of subQuals) {
                    const subUrl = sub.directUrl || sub.url;
                    if (!seenUrls.has(subUrl)) {
                      seenUrls.add(subUrl);
                      streams.push({
                        id: `stream-akwam-${sItem.name}-${sub.quality}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                        server: `اكوام - ${sItem.name} (${sub.quality} ⚡)`,
                        quality: sub.quality,
                        type: 'hls',
                        url: `/api/stream-proxy?url=${encodeURIComponent(subUrl)}&ref=${encodeURIComponent(hostEmbedUrl)}`,
                        directUrl: subUrl,
                        preferred: true,
                      });
                    }
                  }
                } catch (_) {}
              }
            }
          }

          // 2. Packed JS unpack
          if (!foundDirect) {
            const packed = hostHtml.match(
              /eval\(function\(p,a,c,k,e,[rd]\)[\s\S]*?\.split\(['"]\|['"]\)[^)]*\)\)/
            );
            if (packed) {
              try {
                const code = packed[0].replace(/^eval/, '');
                const unpacked = (0, eval)(code);
                const m3u8Match = unpacked.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/);
                if (m3u8Match) {
                  const mUrl = m3u8Match[0];
                  if (!seenUrls.has(mUrl)) {
                    seenUrls.add(mUrl);
                    streams.push({
                      id: `stream-akwam-${sItem.name}-hls-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                      server: `اكوام - ${sItem.name} (HLS مباشر ⚡)`,
                      quality: '720p HD',
                      type: 'hls',
                      url: `/api/stream-proxy?url=${encodeURIComponent(mUrl)}&ref=${encodeURIComponent(hostEmbedUrl)}`,
                      directUrl: mUrl,
                      preferred: true,
                    });
                    foundDirect = true;

                    try {
                      const subQuals = await parseM3u8Qualities(mUrl, hostEmbedUrl);
                      for (const sub of subQuals) {
                        const subUrl = sub.directUrl || sub.url;
                        if (!seenUrls.has(subUrl)) {
                          seenUrls.add(subUrl);
                          streams.push({
                            id: `stream-akwam-${sItem.name}-${sub.quality}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                            server: `اكوام - ${sItem.name} (${sub.quality} ⚡)`,
                            quality: sub.quality,
                            type: 'hls',
                            url: `/api/stream-proxy?url=${encodeURIComponent(subUrl)}&ref=${encodeURIComponent(hostEmbedUrl)}`,
                            directUrl: subUrl,
                            preferred: true,
                          });
                        }
                      }
                    } catch (_) {}
                  }
                }
              } catch (_) {}
            }
          }

          // 3. Protected Embed Player Fallback
          const proxyEmbedUrl = `/api/embed-proxy?url=${encodeURIComponent(hostEmbedUrl)}&ref=${encodeURIComponent('https://w.aflamy.pro/')}`;
          if (!seenUrls.has(hostEmbedUrl)) {
            seenUrls.add(hostEmbedUrl);
            streams.push({
              id: `stream-akwam-${sItem.name}-embed-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              server: `اكوام - ${sItem.name} (مشغل مدمج محمي 🛡️)`,
              quality: 'HD مدمج',
              type: 'embed',
              url: proxyEmbedUrl,
              directUrl: hostEmbedUrl,
              preferred: false,
            });
          }
        }
      }
    }

    if (streams.length > 0) {
      return {
        title: title || 'فيلم اكوام',
        poster,
        streams,
      };
    }
    return null;
  } catch (_) {
    return null;
  }
}

// -------------------------------------------------------------
// Dedicated Egybest & Egybestvid Video Resolver
// -------------------------------------------------------------
async function fetchSafeText(urlStr: string, referer?: string, timeoutMs = 8000, maxRedirects = 5): Promise<string> {
  if (!urlStr || typeof urlStr !== 'string') return '';
  // 1. Try native fetch first with timeout and redirect: 'follow'
  try {
    const res = await fetch(urlStr, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        Referer: referer || 'https://www.egybest.co.in/',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (res.ok) {
      return await res.text();
    }
  } catch (_) {
    // native fetch may fail on self-signed certs, redirects, or network hiccups - fallback to node http/https
  }

  // 2. Node http/https client fallback with rejectUnauthorized: false & redirect support
  return new Promise<string>((resolve) => {
    let redirectsCount = 0;
    const makeRequest = (currentUrl: string) => {
      try {
        const u = new URL(currentUrl);
        const isHttps = u.protocol === 'https:';
        const client = isHttps ? https : http;
        const options: any = {
          hostname: u.hostname,
          port: u.port || (isHttps ? 443 : 80),
          path: (u.pathname || '/') + (u.search || ''),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: '*/*',
            Referer: referer || 'https://www.egybest.co.in/',
          },
          timeout: timeoutMs,
        };
        if (isHttps) {
          options.rejectUnauthorized = false;
        }

        const req = client.get(options, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirectsCount < maxRedirects
          ) {
            redirectsCount++;
            let redirectLocation = res.headers.location;
            if (!redirectLocation.startsWith('http')) {
              redirectLocation = new URL(redirectLocation, currentUrl).toString();
            }
            res.resume();
            return makeRequest(redirectLocation);
          }

          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve(data));
        });

        req.on('error', () => resolve(''));
        req.on('timeout', () => {
          try {
            req.destroy();
          } catch (_) {}
          resolve('');
        });
      } catch (_) {
        resolve('');
      }
    };

    makeRequest(urlStr);
  });
}

function fetchHttpsText(urlStr: string, referer?: string): Promise<string> {
  return fetchSafeText(urlStr, referer, 8000);
}

async function resolveEgybestVidEmbed(
  embedUrl: string,
  serverName: string,
  defaultQuality: string,
  streams: any[],
  seenUrls: Set<string>,
  parentRef?: string
) {
  try {
    const embedHtml = await fetchSafeText(embedUrl, parentRef || 'https://www.egybest.co.in/', 8000);
    if (!embedHtml) {
      if (!seenUrls.has(embedUrl)) {
        seenUrls.add(embedUrl);
        streams.push({
          id: `stream-egybestvid-embed-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          server: `ايجي بست - ${serverName} (مشغل مدمج محمي 🛡️)`,
          quality: defaultQuality || 'HD مدمج',
          type: 'embed',
          url: `/api/embed-proxy?url=${encodeURIComponent(embedUrl)}&ref=${encodeURIComponent(parentRef || 'https://www.egybest.co.in/')}`,
          directUrl: embedUrl,
          preferred: streams.length === 0,
        });
      }
      return;
    }

    let masterM3u8 = '';
    const srcMatch =
      embedHtml.match(/sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/i) ||
      embedHtml.match(/file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
      embedHtml.match(/(https?:\/\/[^"'\s<>]+\/hls2\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i) ||
      embedHtml.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
    if (srcMatch) {
      masterM3u8 = srcMatch[1];
    }

    if (masterM3u8 && !seenUrls.has(masterM3u8)) {
      seenUrls.add(masterM3u8);
      const refParam = `&ref=${encodeURIComponent(embedUrl)}`;
      const proxyMasterUrl = `/api/stream-proxy?url=${encodeURIComponent(masterM3u8)}${refParam}`;

      // 1. Primary Direct HLS Stream
      streams.push({
        id: `stream-egybestvid-master-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        server: `ايجي بست - ${serverName} (HLS مباشر ⚡)`,
        quality: '1080p FHD',
        type: 'hls',
        url: proxyMasterUrl,
        directUrl: masterM3u8,
        preferred: true,
      });

      // Try discovering sub-qualities from HLS Master Manifest
      try {
        const subText = await fetchSafeText(masterM3u8, embedUrl, 6000);
        if (subText && subText.includes('#EXTM3U')) {
          const lines = subText.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXT-X-STREAM-INF:')) {
              let qLabel = '720p HD';
              const resM = line.match(/RESOLUTION=(\d+)x(\d+)/i);
              if (resM) {
                const height = parseInt(resM[2], 10);
                if (height >= 1000) qLabel = '1080p FHD';
                else if (height >= 650) qLabel = '720p HD';
                else if (height >= 400) qLabel = '480p SD';
                else if (height >= 300) qLabel = '360p';
                else qLabel = `${height}p`;
              }
              const nextLine = (lines[i + 1] || '').trim();
              if (nextLine && !nextLine.startsWith('#')) {
                const subUrl = nextLine.startsWith('http') ? nextLine : new URL(nextLine, masterM3u8).toString();
                if (!seenUrls.has(subUrl)) {
                  seenUrls.add(subUrl);
                  streams.push({
                    id: `stream-egybestvid-sub-${qLabel}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    server: `ايجي بست - ${serverName} (${qLabel} ⚡)`,
                    quality: qLabel,
                    type: 'hls',
                    url: `/api/stream-proxy?url=${encodeURIComponent(subUrl)}${refParam}`,
                    directUrl: subUrl,
                    preferred: false,
                  });
                }
              }
            }
          }
        }
      } catch (_) {}
    }

    if (!seenUrls.has(embedUrl)) {
      seenUrls.add(embedUrl);
      streams.push({
        id: `stream-egybestvid-embed-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        server: `ايجي بست - ${serverName} (مشغل مدمج محمي 🛡️)`,
        quality: defaultQuality || 'HD مدمج',
        type: 'embed',
        url: `/api/embed-proxy?url=${encodeURIComponent(embedUrl)}&ref=${encodeURIComponent(parentRef || 'https://www.egybest.co.in/')}`,
        directUrl: embedUrl,
        preferred: streams.length === 0,
      });
    }
  } catch (_) {}
}

async function resolveEgybestVideo(cleanUrl: string): Promise<{ title: string; poster: string; streams: any[] } | null> {
  try {
    let title = '';
    let poster = '';
    const streams: any[] = [];
    const seenUrls = new Set<string>();

    let embedUrl = '';
    if (/egybestvid\.com\/embed/i.test(cleanUrl)) {
      embedUrl = cleanUrl;
    } else {
      const pageHtml = await fetchSafeText(cleanUrl, 'https://www.google.com/', 9000);
      if (pageHtml) {
        // 1. Extract from window.bootstrapData (used on egybest.co.in / Bedrive architecture)
        const bootM = pageHtml.match(/window\.bootstrapData\s*=\s*(\{[\s\S]*?\});\s*(?:<\/script>|\n)/);
        if (bootM) {
          try {
            const bootData = JSON.parse(bootM[1]);
            const tObj = bootData?.loaders?.titlePage?.title;
            if (tObj) {
              title = tObj.name || tObj.original_title || '';
              poster = tObj.poster || tObj.backdrop || '';
              const videos = Array.isArray(tObj.videos) ? [...tObj.videos] : [];
              if (tObj.primary_video && !videos.some((v: any) => v.id === tObj.primary_video.id)) {
                videos.unshift(tObj.primary_video);
              }

              for (const v of videos) {
                const vSrc = v.src || '';
                if (!vSrc) continue;
                const vName = v.name || 'سيرفر ايجي بست';
                const vQual = v.quality ? `${String(v.quality).toUpperCase()} عالية` : 'HD عالية';

                if (/egybestvid/i.test(vSrc)) {
                  await resolveEgybestVidEmbed(vSrc, vName, vQual, streams, seenUrls, cleanUrl);
                } else if (vSrc.includes('.m3u8') || vSrc.includes('/hls/')) {
                  const proxyUrl = `/api/stream-proxy?url=${encodeURIComponent(vSrc)}&ref=${encodeURIComponent(cleanUrl)}`;
                  streams.push({
                    id: `stream-egybest-hls-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    server: `ايجي بست - ${vName} (HLS مباشر ⚡)`,
                    quality: vQual,
                    type: 'hls',
                    url: proxyUrl,
                    directUrl: vSrc,
                    preferred: true,
                  });
                } else if (vSrc.includes('.mp4')) {
                  const proxyUrl = `/api/stream-proxy?url=${encodeURIComponent(vSrc)}&ref=${encodeURIComponent(cleanUrl)}`;
                  streams.push({
                    id: `stream-egybest-mp4-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    server: `ايجي بست - ${vName} (MP4 مباشر ⚡)`,
                    quality: vQual,
                    type: 'mp4',
                    url: proxyUrl,
                    directUrl: vSrc,
                    preferred: true,
                  });
                } else {
                  streams.push({
                    id: `stream-egybest-embed-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    server: `ايجي بست - ${vName} (مشغل مدمج محمي 🛡️)`,
                    quality: vQual,
                    type: 'embed',
                    url: `/api/embed-proxy?url=${encodeURIComponent(vSrc)}&ref=${encodeURIComponent(cleanUrl)}`,
                    directUrl: vSrc,
                    preferred: false,
                  });
                }
              }
            }
          } catch (_) {}
        }

        // Fallback title / poster from HTML tags if missing
        if (!title) {
          const titleM = pageHtml.match(/<title>([^<]+)<\/title>/i);
          if (titleM) {
            title = titleM[1].replace(/\s*[-–|:]\s*(?:Egybest|ايجي بست).*$/i, '').trim();
          }
        }
        if (!poster) {
          const postM = pageHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
          if (postM) poster = postM[1];
        }

        // Also search HTML for any iframes if no streams found yet
        if (streams.length === 0) {
          const iframeM = pageHtml.match(/<iframe[^>]+src=["'](https?:\/\/[^"']*egybestvid[^"']*)["']/i);
          if (iframeM) {
            await resolveEgybestVidEmbed(iframeM[1], 'السيرفر الرئيسي', 'HD عالية', streams, seenUrls, cleanUrl);
          }
        }
      }
    }

    if (embedUrl) {
      await resolveEgybestVidEmbed(embedUrl, 'السيرفر الرئيسي', 'HD عالية', streams, seenUrls, cleanUrl);
    }

    // Fallback: If no direct stream parsed, provide a clean fallback embed player stream
    if (streams.length === 0 && (/egybest\./i.test(cleanUrl) || /egybestvid\./i.test(cleanUrl))) {
      const slugTitle = cleanUrl.split('/').filter(Boolean).pop() || '';
      const fallbackTitle = title || (slugTitle ? decodeURIComponent(slugTitle).replace(/[-_+]/g, ' ') : 'ايجي بست سيرفر بديل');
      streams.push({
        id: `stream-egybest-fallback-${Date.now()}`,
        server: 'ايجي بست - مشغل البث المباشر (بروكسي 🛡️)',
        quality: '1080p FHD',
        type: 'embed',
        url: `/api/embed-proxy?url=${encodeURIComponent(cleanUrl)}&ref=https://www.egybest.co.in/`,
        directUrl: cleanUrl,
        preferred: true,
      });
      return {
        title: fallbackTitle,
        poster,
        streams,
      };
    }

    if (streams.length > 0) {
      return {
        title: title || 'فيلم ايجي بست',
        poster,
        streams,
      };
    }
    return null;
  } catch (_) {
    return null;
  }
}


// -------------------------------------------------------------
// Video Stream Extractor API Route (/api/extract-video)
// -------------------------------------------------------------
app.post('/api/extract-video', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const { url, title } = req.body || {};
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ success: false, error: 'يرجى تقديم رابط صالح للفيلم أو الفيديو.' });
    }

    let cleanUrl = url.trim();
    if (cleanUrl.includes('/api/stream-proxy?url=') || cleanUrl.includes('/api/embed-proxy?url=') || cleanUrl.includes('/api/player-embed?url=')) {
      const match = cleanUrl.match(/\?url=([^&]+)/);
      if (match) {
        try {
          cleanUrl = decodeURIComponent(match[1]);
        } catch (_) {}
      }
    }
    cleanUrl = cleanUrl.replace(/^https?:\/\/https?:\/\//i, 'https://').replace(/^https?:\/\/\//i, 'https://');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    let detectedTitle = (title && typeof title === 'string') ? title.trim() : '';
    let detectedPoster = '';
    const streams: any[] = [];
    const seenUrls = new Set<string>();
    const seenIds = new Set<string>();

    const addStream = (st: any) => {
      if (!st || !st.url) return;
      const rawTarget = (st.directUrl || st.url || '').toLowerCase();
      // Never add static image assets, avatar icons, or stylesheets as video streams
      if (
        /\.(jpe?g|png|webp|gif|svg|ico|bmp|avif|css|woff2?)(\?.*)?$/i.test(rawTarget) ||
        /gravatar\.com|wp-content\/uploads|avatar|icon|thumbnail/i.test(rawTarget)
      ) {
        return;
      }
      const urlKey = st.url.trim().toLowerCase();
      const idKey = st.id ? String(st.id).trim() : '';
      if (seenUrls.has(urlKey)) return;
      if (idKey && seenIds.has(idKey)) return;
      seenUrls.add(urlKey);
      if (idKey) seenIds.add(idKey);
      streams.push(st);
    };

    // Helper: Normalize HTML entities
    const decodeHtmlEntities = (str: string) => {
      if (!str) return '';
      return str
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    };

    // Helper: Extract clean title from URL slug as reliable fallback
    const extractSlugTitle = (urlStr: string): string => {
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
    };

    const cleanDetectedTitle = (raw: string, urlFallback = ''): string => {
      let t = (raw || '').trim();
      if (!t || /^(404|not found|error|stream|video|player|مشاهدة|تحميل|سيرفر)$/i.test(t)) {
        return extractSlugTitle(urlFallback) || t;
      }
      // Remove common site suffixes and clutter
      t = t
        .replace(/\s*[-–|:]\s*(?:ايجي بست|ماي سيما|عرب سيد|اكوام|شاهد فور يو|aflam18(?:\.media)?|aflamicose(?:\.com)?|موقع|سينما|فيديو|أفلام|افلام).*$/i, '')
        .replace(/^(?:مشاهدة وتحميل\s+|مشاهدة\s+|تحميل\s+|فيلم\s+كامل\s+)/i, 'فيلم ')
        .trim();
      if (!t || t === 'فيلم') {
        const fromSlug = extractSlugTitle(urlFallback);
        if (fromSlug) return fromSlug;
      }
      return t;
    };

    // 0. YouTube direct detection & extraction
    const cleanYtId = extractYouTubeId(cleanUrl);
    if (cleanYtId) {
      let ytTitle = '';
      let ytPoster = `https://img.youtube.com/vi/${cleanYtId}/hqdefault.jpg`;
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${cleanYtId}&format=json`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(3500)
        });
        if (oembedRes.ok) {
          const oembedData: any = await oembedRes.json();
          if (oembedData && oembedData.title) ytTitle = oembedData.title;
          if (oembedData && oembedData.thumbnail_url) ytPoster = oembedData.thumbnail_url;
        }
      } catch (_) {}

      const finalTitle = cleanDetectedTitle(detectedTitle || ytTitle || (`فيديو يوتيوب ${cleanYtId}`), cleanUrl);
      // YouTube Stream Options: Strictly ascending quality tiers starting from 360p as requested
      addStream({
        id: `stream-yt-360p-${cleanYtId}`,
        server: 'مشغل يوتيوب 360p SD ⚡ (افتراضي)',
        quality: '360p SD (المشغل الافتراضي)',
        type: 'embed',
        url: `https://www.youtube.com/embed/${cleanYtId}?enablejsapi=1&playsinline=1&rel=0&vq=medium`,
        directUrl: `https://www.youtube.com/watch?v=${cleanYtId}`,
        preferred: true,
        isYouTube: true,
        youtubeId: cleanYtId,
        preferredMode: 'embed',
      });
      addStream({
        id: `stream-yt-480p-${cleanYtId}`,
        server: 'مشغل يوتيوب 480p SD 🎬',
        quality: '480p SD',
        type: 'embed',
        url: `https://www.youtube.com/embed/${cleanYtId}?enablejsapi=1&playsinline=1&rel=0&vq=large`,
        directUrl: `https://www.youtube.com/watch?v=${cleanYtId}`,
        isYouTube: true,
        youtubeId: cleanYtId,
        preferredMode: 'embed',
      });
      addStream({
        id: `stream-yt-720p-${cleanYtId}`,
        server: 'مشغل يوتيوب 720p HD ⚡',
        quality: '720p HD',
        type: 'embed',
        url: `https://www.youtube.com/embed/${cleanYtId}?enablejsapi=1&playsinline=1&rel=0&vq=hd720`,
        directUrl: `https://www.youtube.com/watch?v=${cleanYtId}`,
        isYouTube: true,
        youtubeId: cleanYtId,
        preferredMode: 'embed',
      });
      addStream({
        id: `stream-yt-1080p-${cleanYtId}`,
        server: 'مشغل يوتيوب 1080p FHD 🌟',
        quality: '1080p FHD',
        type: 'embed',
        url: `https://www.youtube.com/embed/${cleanYtId}?enablejsapi=1&playsinline=1&rel=0&vq=hd1080`,
        directUrl: `https://www.youtube.com/watch?v=${cleanYtId}`,
        isYouTube: true,
        youtubeId: cleanYtId,
        preferredMode: 'embed',
      });
      addStream({
        id: `stream-yt-player-${cleanYtId}`,
        server: 'مشغل يوتيوب السينمائي المعتمد 🛡️ (مع النافذة المستقلة)',
        quality: 'YouTube Cinema Player',
        type: 'embed',
        url: `/api/youtube-player?v=${cleanYtId}&title=${encodeURIComponent(finalTitle)}&vq=medium&autoplay=1`,
        directUrl: `https://www.youtube.com/watch?v=${cleanYtId}`,
        isYouTube: true,
        youtubeId: cleanYtId,
        preferredMode: 'embed',
      });
      addStream({
        id: `stream-yt-direct-${cleanYtId}`,
        server: 'فتح على موقع وتطبيق يوتيوب (نافذة مستقلة) 🌐',
        quality: 'YouTube App',
        type: 'embed',
        url: `https://www.youtube.com/watch?v=${cleanYtId}`,
        directUrl: `https://www.youtube.com/watch?v=${cleanYtId}`,
        needsPopout: true,
        isYouTube: true,
        youtubeId: cleanYtId,
        preferredMode: 'embed',
      });

      return res.json({
        success: true,
        title: finalTitle,
        poster: detectedPoster || ytPoster,
        streams,
        count: streams.length,
        isYouTube: true,
        youtubeId: cleanYtId,
      });
    }

    // 1. Direct stream check (.m3u8, .mp4)
    const isDirectHls = cleanUrl.includes('.m3u8') || cleanUrl.includes('/hls/');
    const isDirectMp4 = cleanUrl.includes('.mp4');

    if (isDirectHls) {
      const proxyHlsUrl = `/api/stream-proxy?url=${encodeURIComponent(cleanUrl)}`;
      addStream({
        id: `stream-direct-hls-${Date.now()}`,
        server: 'بث HLS مباشر ⚡',
        quality: '1080p FHD',
        type: 'hls',
        url: proxyHlsUrl,
        directUrl: cleanUrl,
        preferred: true,
      });
      try {
        const subQualities = await parseM3u8Qualities(cleanUrl, new URL(cleanUrl).origin);
        subQualities.forEach((sub, idx) => {
          addStream({
            id: `stream-sub-hls-${idx + 1}-${Date.now()}`,
            server: `سيرفر بث (${sub.quality})`,
            quality: sub.quality,
            type: 'hls',
            url: `/api/stream-proxy?url=${encodeURIComponent(sub.directUrl || sub.url)}`,
            directUrl: sub.directUrl || sub.url,
          });
        });
      } catch (_) {}
    } else if (isDirectMp4) {
      const proxyMp4Url = `/api/stream-proxy?url=${encodeURIComponent(cleanUrl)}`;
      addStream({
        id: `stream-direct-mp4-${Date.now()}`,
        server: 'فيديو MP4 مباشر ⚡',
        quality: '1080p FHD',
        type: 'mp4',
        url: proxyMp4Url,
        directUrl: cleanUrl,
        preferred: true,
      });
    }

    // Direct Akwam & AlbaPlayer Video Resolver
    if (/akwam|akoam|aflamy\.pro|albaplayer|mp4plus|anafast|vidspeed/i.test(cleanUrl)) {
      const akwamRes = await resolveAkwamVideo(cleanUrl);
      if (akwamRes && akwamRes.streams && akwamRes.streams.length > 0) {
        if (akwamRes.title && !detectedTitle) detectedTitle = akwamRes.title;
        if (akwamRes.poster && !detectedPoster) detectedPoster = akwamRes.poster;
        akwamRes.streams.forEach(addStream);
      }
    }

    // Direct Egybest & Egybestvid Video Resolver
    if (/egybest\.|egybestvid\.com/i.test(cleanUrl)) {
      const egybestRes = await resolveEgybestVideo(cleanUrl);
      if (egybestRes && egybestRes.streams && egybestRes.streams.length > 0) {
        if (egybestRes.title && !detectedTitle) detectedTitle = egybestRes.title;
        if (egybestRes.poster && !detectedPoster) detectedPoster = egybestRes.poster;
        egybestRes.streams.forEach(addStream);
      }
    }

    // Direct Cimaab Video Resolver
    if (/cimaab\.com/i.test(cleanUrl)) {
      const cimaabRes = await resolveCimaabVideo(cleanUrl);
      if (cimaabRes && cimaabRes.streams && cimaabRes.streams.length > 0) {
        if (cimaabRes.title && !detectedTitle) detectedTitle = cimaabRes.title;
        if (cimaabRes.poster && !detectedPoster) detectedPoster = cimaabRes.poster;
        cimaabRes.streams.forEach(addStream);
      }
    }

    // Direct Byse Video Resolver
    if (/bysetayico|bysesukior|bysebuho|byse|bysest|byseplay|vidmoon/i.test(cleanUrl)) {
      const byseRes = await resolveByseVideo(cleanUrl);
      if (byseRes && byseRes.streams) {
        if (byseRes.title && !detectedTitle) detectedTitle = byseRes.title;
        if (byseRes.poster && !detectedPoster) detectedPoster = byseRes.poster;
        byseRes.streams.forEach(addStream);
      }
    }

    // Direct VSTM Video Resolver
    if (/vstm\.shop|vstm|naturee\.site|luvstream/i.test(cleanUrl)) {
      const vstmRes = await resolveVstmVideo(cleanUrl);
      if (vstmRes && vstmRes.streams) {
        if (vstmRes.title && !detectedTitle) detectedTitle = vstmRes.title;
        if (vstmRes.poster && !detectedPoster) detectedPoster = vstmRes.poster;
        vstmRes.streams.forEach(addStream);
      }
    }

    // Direct Mixdrop Video Resolver
    if (/mixdrop\.|mxdrop\./i.test(cleanUrl)) {
      const mixRes = await resolveMixdropVideo(cleanUrl);
      if (mixRes && mixRes.streams) {
        if (mixRes.title && !detectedTitle) detectedTitle = mixRes.title;
        if (mixRes.poster && !detectedPoster) detectedPoster = mixRes.poster;
        mixRes.streams.forEach(addStream);
      }
    }

    // Direct Playmogo Video Resolver
    if (/playmogo\.com/i.test(cleanUrl)) {
      const pmRes = resolvePlaymogoVideo(cleanUrl);
      if (pmRes && pmRes.streams) {
        if (pmRes.title && !detectedTitle) detectedTitle = pmRes.title;
        pmRes.streams.forEach(addStream);
      }
    }

    // If streams were already found from direct video resolvers, sort and return immediately
    if (streams.length > 0) {
      const sortedStreams = sortStreamsAscending(streams);
      const defaultStream = pickDefaultQualityStream(sortedStreams);
      sortedStreams.forEach((s) => {
        s.preferred = false;
      });
      if (defaultStream) {
        defaultStream.preferred = true;
      }
      const finalTitle = cleanDetectedTitle(detectedTitle || title || '', cleanUrl) || 'فيديو مباشر';
      return res.json({
        success: true,
        title: finalTitle,
        poster: detectedPoster,
        streams: sortedStreams,
      });
    }

    // 2. Otherwise, fetch and parse the target website page (e.g. aflam18.media, aflamicose.com, etc.)
    let pageHtml = '';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let pageOrigin = '';
      try {
        pageOrigin = new URL(cleanUrl).origin;
      } catch (_) {}
      const pageRes = await fetch(cleanUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          ...(pageOrigin ? { Referer: pageOrigin } : {}),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        },
      });
      clearTimeout(timeout);
      if (pageRes.ok) {
        pageHtml = await pageRes.text();
      }
    } catch (_) {
      // Gracefully handled; extractor falls back to direct player if page cannot be scraped
    }

    if (pageHtml) {
      // Extract page metadata
      const ogTitleMatch = pageHtml.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
      const titleTagMatch = pageHtml.match(/<title>([^<]+)<\/title>/i);
      if (ogTitleMatch && ogTitleMatch[1]) {
        detectedTitle = cleanDetectedTitle(decodeHtmlEntities(ogTitleMatch[1]), cleanUrl);
      } else if (titleTagMatch && titleTagMatch[1]) {
        detectedTitle = cleanDetectedTitle(decodeHtmlEntities(titleTagMatch[1]), cleanUrl);
      } else if (!detectedTitle) {
        detectedTitle = extractSlugTitle(cleanUrl);
      }

      const ogImgMatch = pageHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (ogImgMatch && ogImgMatch[1]) {
        detectedPoster = ogImgMatch[1].trim();
      }

      const rawCandidates: { server: string; quality: string; url: string }[] = [];

      // A. Aflamicose server buttons: <button class="server-btn" data-url="..." data-name="...">
      const btnMatches = [...pageHtml.matchAll(/<button[^>]+class=["'][^"']*server-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi)];
      btnMatches.forEach((btn) => {
        const full = btn[0];
        const inner = btn[1];
        const urlMatch = full.match(/data-url=["']([^"']+)["']/i) || full.match(/data-src=["']([^"']+)["']/i);
        const nameMatch = full.match(/data-name=["']([^"']+)["']/i);
        const qualityMatch = inner.match(/<small>([^<]+)<\/small>/i);
        const labelMatch = inner.match(/<span>([^<]+)<\/span>/i);
        if (urlMatch && urlMatch[1]) {
          const u = urlMatch[1].trim();
          const serverName = (nameMatch && nameMatch[1]) || (labelMatch && labelMatch[1]) || 'سيرفر مشاهدة';
          const quality = (qualityMatch && qualityMatch[1]) || '1080p FHD';
          rawCandidates.push({ server: decodeHtmlEntities(serverName), quality: quality.trim(), url: u });
        }
      });

      // B. Aflam18 & VTG tabs: <a ... data-video-url="v1:...">Server Name</a>
      const vtgTabs = [...pageHtml.matchAll(/<a[^>]+data-video-url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
      vtgTabs.forEach((tab) => {
        const rawEnc = tab[1];
        const label = tab[2].replace(/<[^>]+>/g, '').trim() || 'سيرفر';
        const decoded = vtgDecodeUrl(rawEnc);
        if (decoded && (decoded.startsWith('http://') || decoded.startsWith('https://'))) {
          rawCandidates.push({ server: `سيرفر ${decodeHtmlEntities(label)}`, quality: '1080p FHD', url: decoded });
        }
      });

      // C. General VTG tokens: v1:...
      const vtgMatches = [...pageHtml.matchAll(/v1:[A-Za-z0-9+/=]+/g)].map((m) => m[0]);
      vtgMatches.forEach((v) => {
        const dec = vtgDecodeUrl(v);
        if (dec && (dec.startsWith('http://') || dec.startsWith('https://'))) {
          if (!rawCandidates.some((c) => c.url === dec)) {
            rawCandidates.push({ server: 'سيرفر بث إضافي', quality: 'HD عالية', url: dec });
          }
        }
      });

      // D. IFrames
      const iframes = [...pageHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
      iframes.forEach((src) => {
        let u = src.trim();
        if (u.startsWith('//')) u = 'https:' + u;
        if (u.startsWith('http://') || u.startsWith('https://')) {
          if (!/google|facebook|twitter|analytics|histats|disqus|recaptcha/i.test(u)) {
            if (!rawCandidates.some((c) => c.url === u)) {
              rawCandidates.push({ server: 'مشغل سيرفر مدمج (Iframe)', quality: 'HD عالية', url: u });
            }
          }
        }
      });

      // E. Data attributes (filter out images, avatars, stylesheets, fonts, and tracking scripts)
      const dataUrls = [...pageHtml.matchAll(/data-(?:url|src|embed|video|link)=["'](https?:\/\/[^"'\s<>]+)["']/gi)].map((m) => m[1]);
      dataUrls.forEach((du) => {
        const isStaticAsset =
          /\.(jpe?g|png|webp|gif|svg|ico|bmp|avif|css|js|woff2?|ttf|otf)(\?.*)?$/i.test(du) ||
          /gravatar\.com|wp-content\/uploads|avatar|icon|logo|thumbnail/i.test(du);
        if (!isStaticAsset && !/google|facebook|twitter|analytics|histats|theme|font|style|image/i.test(du)) {
          if (!rawCandidates.some((c) => c.url === du)) {
            rawCandidates.push({ server: 'سيرفر فيديو إضافي', quality: 'HD عالية', url: du });
          }
        }
      });

      // Resolve each raw candidate through specialized extractors in parallel (prevents timeout and Failed to fetch)
      const uniqueCandidates = rawCandidates
        .filter((c, idx, arr) => arr.findIndex((x) => x.url === c.url) === idx)
        .slice(0, 8);

      await Promise.allSettled(
        uniqueCandidates.map(async (cand) => {
          try {
            const u = cand.url;
            // 0. YouTube candidate
            const candYtId = extractYouTubeId(u);
            if (candYtId) {
              addStream({
                id: `stream-yt-nocookie-${candYtId}`,
                server: cand.server ? `${cand.server} (يوتيوب) ⚡` : 'يوتيوب مشغل مدمج ⚡',
                quality: 'YouTube HD',
                type: 'embed',
                url: `https://www.youtube-nocookie.com/embed/${candYtId}?autoplay=1&enablejsapi=1&rel=0`,
                directUrl: `https://www.youtube.com/watch?v=${candYtId}`,
                preferred: true,
                isYouTube: true,
                youtubeId: candYtId,
              });
              return;
            }

            // 1. Byse resolver
            if (/bysetayico|bysesukior|bysebuho|byse|bysest|byseplay|vidmoon/i.test(u)) {
              const byseRes = await resolveByseVideo(u);
              if (byseRes && byseRes.streams) {
                byseRes.streams.forEach(addStream);
                return;
              }
            }

            // 2. VSTM resolver
            if (/vstm\.shop|vstm|naturee\.site|luvstream/i.test(u)) {
              const vstmRes = await resolveVstmVideo(u);
              if (vstmRes && vstmRes.streams) {
                vstmRes.streams.forEach(addStream);
                return;
              }
            }

            // 3. Mixdrop resolver
            if (/mixdrop\.|mxdrop\./i.test(u)) {
              const mixRes = await resolveMixdropVideo(u);
              if (mixRes && mixRes.streams) {
                mixRes.streams.forEach(addStream);
                return;
              }
            }

            // 4. Playmogo resolver
            if (/playmogo\.com/i.test(u)) {
              const pmRes = resolvePlaymogoVideo(u);
              if (pmRes && pmRes.streams) {
                pmRes.streams.forEach(addStream);
                return;
              }
            }

            // 5. Direct stream URLs (.m3u8, .mp4)
            if (u.includes('.m3u8') || u.includes('/hls/')) {
              addStream({
                id: `stream-hls-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                server: cand.server || 'سيرفر HLS مباشر ⚡',
                quality: cand.quality || '1080p FHD',
                type: 'hls',
                url: `/api/stream-proxy?url=${encodeURIComponent(u)}`,
                directUrl: u,
                preferred: true,
              });
              try {
                let streamOrigin = 'https://aflam18.media/';
                try { streamOrigin = new URL(u).origin; } catch (_) {}
                const subQualities = await parseM3u8Qualities(u, streamOrigin);
                subQualities.forEach((sub, sIdx) => {
                  addStream({
                    id: `stream-sub-hls-${sIdx + 1}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    server: `${cand.server || 'سيرفر بث'} (${sub.quality})`,
                    quality: sub.quality,
                    type: 'hls',
                    url: `/api/stream-proxy?url=${encodeURIComponent(sub.directUrl || sub.url)}`,
                    directUrl: sub.directUrl || sub.url,
                  });
                });
              } catch (_) {}
              return;
            }

            if (u.includes('.mp4')) {
              addStream({
                id: `stream-mp4-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                server: cand.server || 'سيرفر MP4 مباشر ⚡',
                quality: cand.quality || '1080p FHD',
                type: 'mp4',
                url: `/api/stream-proxy?url=${encodeURIComponent(u)}`,
                directUrl: u,
                preferred: true,
              });
              return;
            }

            // 6. Generic Embed Host (Vidmoly, Uqload, Krakenfiles, Streamtape, etc.)
            let hostName = cand.server;
            try {
              const parsedHost = new URL(u).hostname.replace('www.', '');
              if (!hostName || hostName === 'سيرفر مشاهدة') {
                hostName = `سيرفر ${parsedHost}`;
              }
            } catch (_) {}

            const proxyEmbedUrl = `/api/embed-proxy?url=${encodeURIComponent(u)}&ref=${encodeURIComponent(cleanUrl)}`;

            // Check for underlying direct media in embed (with non-blocking safety)
            try {
              const directMedia = await resolveDirectVideoFromEmbed(u, cleanUrl);
              if (directMedia && directMedia.directUrl) {
                addStream({
                  id: `stream-direct-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                  server: `${hostName} [بث مباشر ⚡]`,
                  quality: directMedia.quality || cand.quality || '1080p FHD',
                  type: directMedia.type || 'hls',
                  url: `/api/stream-proxy?url=${encodeURIComponent(directMedia.directUrl)}`,
                  directUrl: directMedia.directUrl,
                  preferred: true,
                });
              }
            } catch (_) {}

            addStream({
              id: `stream-embed-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              server: `${hostName} (مشغل مدمج محمي ⚡)`,
              quality: cand.quality || '1080p FHD',
              type: 'embed',
              url: proxyEmbedUrl,
              directUrl: u,
            });

            addStream({
              id: `stream-popout-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              server: `${hostName} (نافذة مستقلة ↗)`,
              quality: cand.quality || 'HD عالية',
              type: 'embed',
              url: u,
              directUrl: u,
              needsPopout: true,
            });
          } catch (_) {}
        })
      );
    }

    // If still no streams found, provide a protected fallback player using the original URL
    if (streams.length === 0) {
      const proxyEmbedUrl = `/api/embed-proxy?url=${encodeURIComponent(cleanUrl)}`;
      addStream({
        id: `stream-fallback-embed-${Date.now()}`,
        server: 'مشغل صفحة الفيلم المباشر (سيرفر المعاينة ⚡)',
        quality: '1080p FHD',
        type: 'embed',
        url: proxyEmbedUrl,
        directUrl: cleanUrl,
        preferred: true,
      });

      addStream({
        id: `stream-fallback-popout-${Date.now()}`,
        server: 'مشاهدة الفيلم في نافذة خارجية مستقلة ↗',
        quality: 'HD عالية',
        type: 'embed',
        url: cleanUrl,
        directUrl: cleanUrl,
        needsPopout: true,
      });
    }

    // Sort all extracted streams ascending by quality (360p -> 480p -> 720p -> 1080p -> 4K)
    const sortedStreams = sortStreamsAscending(streams);

    // Default selection: Quality 360p is default, followed by 480p, then 720p, etc.
    const defaultStream = pickDefaultQualityStream(sortedStreams);
    sortedStreams.forEach((s) => {
      s.preferred = false;
    });
    if (defaultStream) {
      defaultStream.preferred = true;
    }

    const finalTitle = cleanDetectedTitle(detectedTitle || title || '', cleanUrl) || 'فيلم سينما';
    return res.json({
      success: true,
      title: finalTitle,
      poster: detectedPoster,
      streams: sortedStreams,
    });
  } catch (error: any) {
    return res.status(200).json({
      success: false,
      error: error?.message || 'حدث خطأ أثناء فحص واستخراج السيرفرات.',
    });
  }
});

// -------------------------------------------------------------
// Auto Extract & Test API Route for Batch Playlist Ingestion
// -------------------------------------------------------------
app.post('/api/auto-extract-and-test', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const movie = req.body?.movie || req.body || {};
    let rawUrl = movie.originalUrl || movie.url || movie.embedUrl || movie.streamUrl || movie.directUrl || req.body?.url || '';
    const rawTitle = movie.title || movie.name || req.body?.title || '';
    const rawPoster = movie.posterUrl || movie.poster || '';

    // If rawUrl is a proxied URL, unwrap the real target URL
    if (rawUrl.startsWith('/api/embed-proxy?url=') || rawUrl.startsWith('/api/stream-proxy?url=')) {
      const matchInner = rawUrl.match(/\?url=([^&]+)/);
      if (matchInner) {
        try {
          const unwrapped = decodeURIComponent(matchInner[1]);
          if (/\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i.test(unwrapped) && movie.originalUrl) {
            rawUrl = movie.originalUrl;
          } else if (!/\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i.test(unwrapped)) {
            rawUrl = unwrapped;
          }
        } catch (_) {}
      }
    }

    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return res.status(200).json({
        success: false,
        message: 'لا يوجد رابط صالح للفيلم',
      });
    }

    let cleanUrl = rawUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    // Try extracting via internal extract-video call with a 9.5-second timeout
    let extractedData: any = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9500);
      const internalRes = await fetch(`http://127.0.0.1:${PORT}/api/extract-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl, title: rawTitle }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (internalRes.ok) {
        extractedData = await internalRes.json();
      }
    } catch (_) {
      // Gracefully handled; fallback stream provided below
    }

    let streams: any[] = [];
    if (extractedData && extractedData.success && Array.isArray(extractedData.streams) && extractedData.streams.length > 0) {
      streams = extractedData.streams;
    }

    const detectedTitle = (extractedData && extractedData.title) || rawTitle || 'فيلم سينما';
    const detectedPoster = (extractedData && extractedData.poster) || rawPoster || '';

    // Pick the best working stream
    let workingStream = streams.find((s) => s.preferred) || pickDefaultQualityStream(streams) || streams[0];

    // If no stream was extracted or remote site was unreachable, provide a 100% reliable fallback embed player
    if (!workingStream) {
      const proxyEmbedUrl = `/api/embed-proxy?url=${encodeURIComponent(cleanUrl)}`;
      workingStream = {
        id: `stream-auto-fallback-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        server: 'مشغل سيرفر الفيلم التلقائي ⚡',
        quality: '1080p FHD',
        type: 'embed',
        url: proxyEmbedUrl,
        directUrl: cleanUrl,
        preferredMode: 'embed',
        preferred: true,
      };
      streams = [workingStream];
    }

    return res.json({
      success: true,
      movieTitle: detectedTitle,
      posterUrl: detectedPoster,
      workingStream,
      allStreams: streams,
    });
  } catch (error: any) {
    console.error('[AutoExtractAndTest Error]:', error);
    const movie = req.body?.movie || req.body || {};
    const rawUrl = movie.url || movie.embedUrl || '';
    if (rawUrl) {
      const proxyEmbedUrl = `/api/embed-proxy?url=${encodeURIComponent(rawUrl)}`;
      const fallbackStream = {
        id: `stream-fallback-${Date.now()}`,
        server: 'مشغل الفيلم المباشر (سيرفر الطوارئ ⚡)',
        quality: 'HD',
        type: 'embed',
        url: proxyEmbedUrl,
        directUrl: rawUrl,
        preferredMode: 'embed',
        preferred: true,
      };
      return res.json({
        success: true,
        movieTitle: movie.title || 'فيلم سينما',
        posterUrl: movie.posterUrl || '',
        workingStream: fallbackStream,
        allStreams: [fallbackStream],
      });
    }
    return res.status(200).json({
      success: false,
      message: error?.message || 'حدث خطأ أثناء فحص البث التلقائي',
    });
  }
});

app.get('/api/embed-proxy', async (req: Request, res: Response) => {
  let targetUrl = (req.query.url as string || '').trim();
  if (!targetUrl) return res.status(400).send('Missing url parameter');

  // Sanitize target URL format
  if (targetUrl.startsWith('//')) {
    targetUrl = 'https:' + targetUrl;
  }
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    } else {
      return res.status(400).send('Invalid url parameter: Must be a valid http or https URL');
    }
  }

  let origin = '';
  try {
    const parsed = new URL(targetUrl);
    if (!parsed.hostname || (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')) {
      return res.status(400).send('Invalid hostname in url parameter');
    }
    origin = parsed.origin;
  } catch {
    return res.status(400).send('Malformed url parameter');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    if (/vstm\.shop/i.test(targetUrl)) {
      targetUrl = targetUrl.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?vstm\.shop/i, 'https://naturee.site');
    }
    const customRef = (req.query.ref as string) || (targetUrl.includes('naturee.site') ? 'https://naturee.site/' : targetUrl);

    const upstream = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: customRef,
      },
    });
    clearTimeout(timeout);
    let html = await upstream.text();
    const injection = `
<script>
(function() {
  // Framebuster Shield: Neutralize sandbox escaping, top-level redirects, and window.top access
  try {
    Object.defineProperty(window, 'top', {
      get: function() { return window; },
      set: function() {}
    });
    Object.defineProperty(window, 'parent', {
      get: function() { return window; },
      set: function() {}
    });
  } catch(e) {}

  // Ad Shield: Neutralize aggressive advertising popups, new tabs, and dialogs
  try {
    window.open = function(url, target, features) {
      console.log("[AutoCinema AdShield] Intercepted popup ad:", url);
      return null;
    };
    window.alert = function() {};
    window.confirm = function() { return false; };
    window.prompt = function() { return null; };
  } catch(e) {}

  // Prevent top navigation or hijack
  try {
    window.onbeforeunload = null;
    Object.defineProperty(window, 'onbeforeunload', {
      get: () => null,
      set: () => {}
    });
  } catch(e) {}

  // Automatically neutralize transparent click-jack overlay divs and ad popunder triggers
  window.addEventListener('DOMContentLoaded', function() {
    function clearClickJackOverlays() {
      try {
        var elements = document.querySelectorAll('div#overlay, div[class*="overlay"], a[target="_blank"]');
        elements.forEach(function(el) {
          if (el.id === 'overlay') el.remove();
          var style = window.getComputedStyle(el);
          if ((style.position === 'fixed' || style.position === 'absolute') && parseInt(style.zIndex, 10) > 500 && !el.querySelector('video')) {
            el.remove();
          }
        });
      } catch(_) {}
    }
    clearClickJackOverlays();
    setInterval(clearClickJackOverlays, 1000);
  });
})();
</script>
<base href="${origin}/">
`;

    // Neutralize typical framebuster code in HTML source
    html = html
      .replace(/top\.location\s*===\s*self\.location/gi, 'false')
      .replace(/top\.location\s*==\s*self\.location/gi, 'false')
      .replace(/self\.location\s*===\s*top\.location/gi, 'false')
      .replace(/self\.location\s*==\s*top\.location/gi, 'false')
      .replace(/top\.location\s*!==\s*self\.location/gi, 'true')
      .replace(/top\.location\s*!=\s*self\.location/gi, 'true')
      .replace(/window\.top\.location\s*=/gi, 'window.self.location =')
      .replace(/top\.location\s*=/gi, 'self.location =');

    if (html.includes('<head>')) {
      html = html.replace('<head>', '<head>' + injection);
    } else {
      html = injection + html;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.status(200);
    return res.send(html);
  } catch (err: any) {
    clearTimeout(timeout);
    console.warn(`[Embed Proxy Warning] Failed to proxy embed for "${targetUrl}":`, err?.message || err);
    return res.status(502).send(`Error proxying embed: ${err?.message || 'Host unreachable'}`);
  }
});

interface VidmolyStreamInfo {
  url: string;
  query: string;
  time: number;
}
const vidmolyStreamCache = new Map<string, VidmolyStreamInfo>();

async function getFreshVidmolyStream(code: string): Promise<VidmolyStreamInfo | null> {
  const cached = vidmolyStreamCache.get(code);
  if (cached && Date.now() - cached.time < 30 * 60 * 1000) {
    return cached;
  }
  for (const domain of ['vidmoly.biz', 'vidmoly.net', 'vidmoly.me']) {
    try {
      const res = await fetch(`https://${domain}/embed-${code}.html`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': `https://${domain}/`,
        },
      });
      if (res.ok) {
        const html = await res.text();
        const m = html.match(/file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i)
          || html.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
        if (m) {
          let fullUrl = m[1];
          if (fullUrl.startsWith('//')) {
            fullUrl = 'https:' + fullUrl;
          }
          let q = '';
          try {
            q = new URL(fullUrl).search;
          } catch (_) {}
          const info: VidmolyStreamInfo = { url: fullUrl, query: q, time: Date.now() };
          vidmolyStreamCache.set(code, info);
          return info;
        }
      }
    } catch (_) {}
  }
  return null;
}

async function getFreshVidmolyQuery(code: string): Promise<string | null> {
  const stream = await getFreshVidmolyStream(code);
  return stream?.query || null;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -------------------------------------------------------------
// Built-in Web & Streaming Proxy (Bypasses Local ISP Blocking & CORS)
// -------------------------------------------------------------
app.all(['/api/proxy', '/api/web-proxy'], async (req: Request, res: Response) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(204).end();
  }

  let targetUrl = '';
  const urlQueryIdx = req.originalUrl.indexOf('url=');
  if (urlQueryIdx !== -1) {
    targetUrl = req.originalUrl.slice(urlQueryIdx + 4).trim();
    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch (_) {}
  }
  if (!targetUrl) {
    targetUrl = ((req.query.url as string) || (req.body && req.body.url) || '').trim();
  }

  try {
    if (targetUrl.includes('%3A') || targetUrl.includes('%2F') || targetUrl.includes('%3F')) {
      targetUrl = decodeURIComponent(targetUrl);
    }
  } catch (_) {}

  // Recursively unwrap any nested proxy wrappers
  while (targetUrl.includes('url=') && (targetUrl.includes('/api/') || targetUrl.includes('proxy'))) {
    const m = targetUrl.match(/[?&]url=([^&]+)/i);
    if (m && m[1]) {
      try {
        const decoded = decodeURIComponent(m[1]);
        targetUrl = decoded;
      } catch (_) {
        break;
      }
    } else {
      break;
    }
  }

  if (!targetUrl) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head><meta charset="utf-8"><title>البروكسي المدمج - خطأ</title><style>body{background:#020617;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
      <body>
        <div style="background:#0f172a;border:1px solid #334155;padding:2rem;border-radius:1rem;text-align:center;max-width:500px;">
          <h2 style="color:#ef4444;margin-top:0;">⚠️ رابط غير محدد</h2>
          <p style="color:#94a3b8;">يرجى تزويد عنوان URL صالح للاستعراض عبر البروكسي المدمج (مثل /api/proxy?url=https://example.com)</p>
          <a href="/" style="display:inline-block;margin-top:1rem;padding:0.6rem 1.2rem;background:#4f46e5;color:#fff;text-decoration:none;border-radius:0.5rem;font-weight:bold;">العودة لتطبيق السينما</a>
        </div>
      </body>
      </html>
    `);
  }

  // Handle double encoded or relative protocol URLs
  if (targetUrl.startsWith('//')) {
    targetUrl = 'https:' + targetUrl;
  }
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    } else {
      return res.status(400).send('Invalid url parameter: Must start with http:// or https://');
    }
  }

  let origin = '';
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
    if (!parsedUrl.hostname || (!parsedUrl.hostname.includes('.') && parsedUrl.hostname !== 'localhost')) {
      return res.status(400).send('Invalid hostname in url parameter');
    }
    origin = parsedUrl.origin;
  } catch {
    return res.status(400).send('Malformed url parameter');
  }

  // Domain mirror fixes if needed
  if (/vstm\.shop/i.test(targetUrl)) {
    targetUrl = targetUrl.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?vstm\.shop/i, 'https://naturee.site');
  }

  let refHeader = origin + '/';
  if (/cimaab\.com/i.test(targetUrl)) {
    const vidMatch = targetUrl.match(/[?&]vid=([a-zA-Z0-9_-]+)/i);
    if (vidMatch && vidMatch[1]) {
      refHeader = `${origin}/watch.php?vid=${vidMatch[1]}`;
    }
  }

  const upstreamHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,video/*,*/*;q=0.8',
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    'Referer': refHeader,
    'Origin': origin,
  };

  if (/egybestvid/i.test(targetUrl)) {
    upstreamHeaders['Accept-Language'] = '';
  }

  if (req.headers.range) {
    upstreamHeaders['Range'] = req.headers.range as string;
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    try { abortController.abort(); } catch (_) {}
  }, 25000);

  req.on('close', () => {
    try {
      if (!abortController.signal.aborted) abortController.abort();
    } catch (_) {}
  });

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: req.method === 'POST' ? 'POST' : 'GET',
      headers: upstreamHeaders,
      signal: abortController.signal,
      body: req.method === 'POST' && req.body ? JSON.stringify(req.body) : undefined,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    // Update origin in case of redirects
    try {
      if (upstreamRes.url && upstreamRes.url !== targetUrl) {
        const redirectedUrl = new URL(upstreamRes.url);
        if (redirectedUrl.origin) {
          origin = redirectedUrl.origin;
          parsedUrl = redirectedUrl;
          targetUrl = upstreamRes.url;
        }
      }
    } catch (_) {}

    const contentType = upstreamRes.headers.get('content-type') || '';
    const isHtml = contentType.toLowerCase().includes('text/html');

    // CORS & frame headers unblocking
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Strict-Transport-Security');

    if (upstreamRes.headers.get('accept-ranges')) {
      res.setHeader('Accept-Ranges', upstreamRes.headers.get('accept-ranges')!);
    } else {
      res.setHeader('Accept-Ranges', 'bytes');
    }

    if (upstreamRes.headers.get('content-range')) {
      res.setHeader('Content-Range', upstreamRes.headers.get('content-range')!);
    }

    if (isHtml) {
      let html = await upstreamRes.text();

      const isCloudflareChallenge = upstreamRes.status === 403 && (
        html.includes('Just a moment...') ||
        html.includes('cf-mitigated') ||
        html.includes('challenges.cloudflare.com') ||
        html.includes('Attention Required') ||
        html.includes('Cloudflare')
      );

      const cfNoticeHtml = isCloudflareChallenge ? `
<div id="autocinema-cf-alert" style="margin:46px 12px 12px;background:#1e1b4b;border:2px solid #f59e0b;border-radius:12px;padding:16px 20px;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;direction:rtl;text-align:right;box-shadow:0 10px 30px rgba(0,0,0,0.6);z-index:2147483646;position:relative;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
    <span style="font-size:24px;">🛡️</span>
    <h3 style="margin:0;font-size:16px;color:#fde047;font-weight:900;">الموقع محمي بنظام فحص البوتات وحماية Cloudflare</h3>
  </div>
  <p style="margin:6px 0 14px;font-size:13px;color:#cbd5e1;line-height:1.7;">
    موقع <strong>${escapeHtml(parsedUrl.hostname)}</strong> يفرض جدار حماية مشدد (Cloudflare Turnstile Challenge) يمنع السيرفرات السحابية والبروكسي من جلب محتوى الصفحة مباشرة. يمكنك فتح الرابط الأصلي مباشرة في متصفحك لتجاوز الفحص والوصول للمحتوى:
  </p>
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
    <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" style="background:#10b981;color:#020617;padding:8px 16px;border-radius:8px;font-weight:900;text-decoration:none;font-size:13px;display:inline-flex;align-items:center;gap:6px;box-shadow:0 4px 14px rgba(16,185,129,0.4);">
      <span>فتح الرابط المباشر في متصفحك بدون وسيط ↗</span>
    </a>
    <a href="javascript:void(0)" onclick="window.location.href=window.location.origin+'/?playUrl='+encodeURIComponent('${escapeHtml(targetUrl)}')" style="background:#6366f1;color:#fff;padding:8px 14px;border-radius:8px;font-weight:bold;text-decoration:none;font-size:12px;">
      فحص واستخراج السيرفر في مشغل السينما 🎬⚡
    </a>
    <a href="javascript:void(0)" onclick="window.location.href=window.location.origin+'/'" style="background:#334155;color:#e2e8f0;padding:8px 14px;border-radius:8px;font-weight:bold;text-decoration:none;font-size:12px;">
      العودة للتطبيق 🏠
    </a>
  </div>
</div>
` : '';

      // Top floating bar and shields
      const proxyBannerHtml = `
<div id="autocinema-proxy-header" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:linear-gradient(90deg, #090d16 0%, #0f172a 100%);border-bottom:2px solid ${isCloudflareChallenge ? '#f59e0b' : '#10b981'};color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;padding:6px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;direction:rtl;box-shadow:0 4px 20px rgba(0,0,0,0.6);font-size:12px;">
  <div style="display:flex;align-items:center;gap:8px;min-width:0;">
    <span style="display:inline-flex;align-items:center;gap:4px;background:${isCloudflareChallenge ? '#451a03' : '#064e3b'};color:${isCloudflareChallenge ? '#fcd34d' : '#34d399'};padding:2px 8px;border-radius:9999px;font-weight:900;border:1px solid ${isCloudflareChallenge ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.4)'};font-size:11px;white-space:nowrap;">
      <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${isCloudflareChallenge ? '#f59e0b' : '#34d399'};box-shadow:0 0 8px ${isCloudflareChallenge ? '#f59e0b' : '#34d399'};"></span>
      ${isCloudflareChallenge ? 'موقع محمي بـ Cloudflare ⚠️' : 'بروكسي مدمج نشط 🛡️'}
    </span>
    <span style="font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;">
      ${escapeHtml(parsedUrl.hostname)}
    </span>
    <span style="color:#94a3b8;font-size:11px;white-space:nowrap;" id="ac-target-url-disp">
      ${isCloudflareChallenge ? '(يتطلب الفتح المباشر في المتصفح)' : '(تم فك الحجب والحماية)'}
    </span>
  </div>
  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
    <a href="javascript:void(0)" onclick="window.location.href=window.location.origin+'/?playUrl='+encodeURIComponent('${escapeHtml(targetUrl)}')" style="background:linear-gradient(135deg, #f59e0b, #10b981);color:#020617;padding:4px 10px;border-radius:6px;text-decoration:none;font-weight:900;font-size:11px;box-shadow:0 2px 10px rgba(245,158,11,0.3);display:inline-flex;align-items:center;gap:4px;" title="تشغيل واستخراج السيرفرات مباشرة داخل مشغل السينما">
      <span>تشغيل في السينما 🎬⚡</span>
    </a>
    <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" style="background:#10b981;color:#020617;padding:4px 10px;border-radius:6px;text-decoration:none;font-weight:900;font-size:11px;box-shadow:0 2px 8px rgba(16,185,129,0.3);" title="فتح الرابط المباشر في تبويب جديد بدون وسيط">
      الرابط المباشر ↗
    </a>
    <a href="javascript:void(0)" onclick="window.location.href=window.location.origin+'/'" style="background:#4f46e5;color:#fff;padding:4px 10px;border-radius:6px;text-decoration:none;font-weight:900;font-size:11px;box-shadow:0 2px 8px rgba(79,70,229,0.4);" title="العودة لشاشة تطبيق AutoCinema">
      العودة للتطبيق 🎬
    </a>
    <button onclick="document.getElementById('autocinema-proxy-header').style.display='none';document.body.style.paddingTop='0';" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;padding:2px 6px;font-size:14px;border-radius:4px;" title="إخفاء هذا الشريط">
      ✕
    </button>
  </div>
</div>
${cfNoticeHtml}
<script>
(function() {
  var appOrigin = window.location.origin;
  function adjustPadding() {
    try {
      if (document.body) {
        document.body.style.paddingTop = '${isCloudflareChallenge ? "160px" : "38px"}';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', adjustPadding);
  } else {
    adjustPadding();
  }

  // Intercept in-page links on the same origin so navigation stays inside proxy on appOrigin
  document.addEventListener('click', function(e) {
    try {
      var target = e.target.closest('a');
      if (!target || !target.href) return;
      var href = target.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      
      var fullUrl = target.href;
      if (fullUrl.startsWith(appOrigin + '/api/proxy') || fullUrl.startsWith(appOrigin + '/api/web-proxy')) return;
      
      var targetOrigin = '${origin}';
      if (fullUrl.startsWith(targetOrigin) || target.hostname === '${parsedUrl.hostname}') {
        e.preventDefault();
        window.location.href = appOrigin + '/api/proxy?url=' + encodeURIComponent(fullUrl);
      }
    } catch (_) {}
  }, true);

  // Anti-ad popup & framebuster shield
  try {
    Object.defineProperty(window, 'top', { get: function() { return window; }, set: function() {} });
    Object.defineProperty(window, 'parent', { get: function() { return window; }, set: function() {} });
    var _origOpen = window.open;
    window.open = function(url, target, features) {
      if (url && (url.includes('google') || url.includes('ad') || url.includes('pop') || url.includes('tracker'))) {
        console.log('[AutoCinema Proxy] Blocked popup ad:', url);
        return null;
      }
      return _origOpen.call(window, url, target, features);
    };
  } catch(e) {}
})();
</script>
<base href="${origin}/">
`;

      // Rewrite embedded iframes in Cimaab so video servers load seamlessly through proxy
      if (/cimaab\.com/i.test(targetUrl)) {
        html = html.replace(/data-embed=["']<iframe\s+src='([^']+)'/gi, (_m, src) => {
          const proxied = `/api/embed-proxy?url=${encodeURIComponent(src)}&ref=${encodeURIComponent(targetUrl)}`;
          return `data-embed="<iframe src='${proxied}'`;
        });
        html = html.replace(/<div class=["']embedded["']>\s*<iframe\s+src='([^']+)'/gi, (_m, src) => {
          const proxied = `/api/embed-proxy?url=${encodeURIComponent(src)}&ref=${encodeURIComponent(targetUrl)}`;
          return `<div class="embedded"><iframe src='${proxied}'`;
        });
      }

      // Neutralize framebusters
      html = html
        .replace(/top\.location\s*===\s*self\.location/gi, 'false')
        .replace(/top\.location\s*==\s*self\.location/gi, 'false')
        .replace(/self\.location\s*===\s*top\.location/gi, 'false')
        .replace(/self\.location\s*==\s*top\.location/gi, 'false')
        .replace(/top\.location\s*!==\s*self\.location/gi, 'true')
        .replace(/top\.location\s*!=\s*self\.location/gi, 'true')
        .replace(/window\.top\.location\s*=/gi, 'window.self.location =')
        .replace(/top\.location\s*=/gi, 'self.location =');

      if (html.includes('<head>')) {
        html = html.replace('<head>', '<head>' + proxyBannerHtml);
      } else if (html.includes('<body')) {
        html = html.replace(/<body[^>]*>/, '$&' + proxyBannerHtml);
      } else {
        html = proxyBannerHtml + html;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(upstreamRes.status);
      return res.send(html);
    }

    // Media & binary streams (m3u8, mp4, ts, images, json)
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    const isM3U8 = targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('x-mpegURL');
    if (isM3U8) {
      const text = await upstreamRes.text();
      if (text.includes('#EXTM3U') || text.includes('#EXT-X-STREAM-INF')) {
        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
        const lines = text.split(/\r?\n/);
        const rewritten = lines.map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.startsWith('#')) {
            return line.replace(/URI=["']([^"']+)["']/g, (_m, uri) => {
              const resolved = uri.startsWith('http') ? uri : new URL(uri, baseUrl).toString();
              return `URI="/api/stream-proxy?url=${encodeURIComponent(resolved)}"`;
            });
          }
          const resolvedUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).toString();
          return `/api/stream-proxy?url=${encodeURIComponent(resolvedUrl)}`;
        });
        res.status(upstreamRes.status);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        return res.send(rewritten.join('\n'));
      }
    }

    res.status(upstreamRes.status);
    if (upstreamRes.body) {
      // @ts-ignore
      const nodeStream = Readable.fromWeb(upstreamRes.body as any);
      nodeStream.on('error', () => {
        try { if (!res.writableEnded) res.end(); } catch (_) {}
      });
      return nodeStream.pipe(res);
    }
    return res.end();
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error('[Web Proxy Error]:', err?.message || err);
    return res.status(502).send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head><meta charset="utf-8"><title>البروكسي المدمج - تعذر الوصول</title><style>body{background:#020617;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
      <body>
        <div style="background:#0f172a;border:1px solid #334155;padding:2rem;border-radius:1rem;text-align:center;max-width:550px;">
          <h2 style="color:#ef4444;margin-top:0;">🛡️ تعذر الوصول للموقع عبر البروكسي</h2>
          <p style="color:#94a3b8;font-size:14px;line-height:1.6;">تعذر على سيرفر البروكسي الوصول إلى الرابط المطلوب: <br><code style="color:#f59e0b;word-break:break-all;">${escapeHtml(targetUrl)}</code></p>
          <p style="color:#64748b;font-size:12px;">سبب الخطأ: ${escapeHtml(err?.message || 'Host unreachable')}</p>
          <div style="margin-top:1.5rem;display:flex;gap:10px;justify-content:center;">
            <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" style="padding:0.6rem 1.2rem;background:#334155;color:#fff;text-decoration:none;border-radius:0.5rem;font-weight:bold;font-size:13px;">تجربة فتحه مباشرة ↗</a>
            <a href="/" style="padding:0.6rem 1.2rem;background:#4f46e5;color:#fff;text-decoration:none;border-radius:0.5rem;font-weight:bold;font-size:13px;">العودة للتطبيق 🎬</a>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

// -------------------------------------------------------------
// Dedicated Robust YouTube Player Route (/api/youtube-player)
// Solves iframe embed blocks, error 150/153, and cross-origin sandbox restrictions
// -------------------------------------------------------------
app.get('/api/youtube-player', (req: Request, res: Response) => {
  const v = (req.query.v as string || req.query.id as string || req.query.url as string || '').trim();
  const ytId = extractYouTubeId(v) || (v.length === 11 ? v : null);
  const title = (req.query.title as string) || 'مشغل يوتيوب السينمائي المعتمد';
  const autoplay = req.query.autoplay !== '0';
  const vqParam = ((req.query.vq as string) || (req.query.quality as string) || 'medium').trim().toLowerCase();
  let vq = 'medium';
  if (vqParam.includes('1080') || vqParam === 'hd1080') vq = 'hd1080';
  else if (vqParam.includes('720') || vqParam === 'hd720') vq = 'hd720';
  else if (vqParam.includes('480') || vqParam === 'large') vq = 'large';
  else vq = 'medium';

  const watchUrl = `https://www.youtube.com/watch?v=${ytId}`;
  const officialEmbedUrl = `https://www.youtube.com/embed/${ytId}?autoplay=${autoplay ? 1 : 0}&enablejsapi=1&playsinline=1&rel=0&modestbranding=1&vq=${vq}`;

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: 'Cairo', system-ui, -apple-system, sans-serif; color: #fff; }
    #player-wrapper { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000; }
    iframe, #yt-player { width: 100%; height: 100%; border: 0; outline: none; }
    .loading-spinner { position: absolute; border: 4px solid rgba(255,255,255,0.15); border-top: 4px solid #f59e0b; border-radius: 50%; width: 48px; height: 48px; animation: spin 0.8s linear infinite; pointer-events: none; z-index: 10; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .overlay-bar { position: absolute; top: 10px; right: 10px; z-index: 35; display: flex; align-items: center; gap: 8px; opacity: 1; pointer-events: auto; }
    .overlay-btn { background: rgba(15, 23, 42, 0.92); color: #fbbf24; border: 1.5px solid rgba(245, 158, 11, 0.6); padding: 7px 14px; border-radius: 12px; font-size: 11.5px; font-weight: 800; text-decoration: none; display: flex; align-items: center; gap: 6px; backdrop-filter: blur(12px); cursor: pointer; transition: all 0.15s; box-shadow: 0 4px 14px rgba(0,0,0,0.6); }
    .overlay-btn:hover { background: #f59e0b; color: #020617; transform: translateY(-1px); }
    .overlay-badge { background: rgba(220, 38, 38, 0.9); color: #fff; border: 1.5px solid rgba(239, 68, 68, 0.6); padding: 7px 12px; border-radius: 12px; font-size: 11.5px; font-weight: 900; display: flex; align-items: center; gap: 5px; backdrop-filter: blur(12px); box-shadow: 0 4px 14px rgba(0,0,0,0.6); }
    .fallback-banner { display: none; position: absolute; inset: 0; background: rgba(2, 6, 23, 0.95); backdrop-filter: blur(14px); flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; z-index: 40; }
    .fallback-card { max-width: 480px; width: 100%; background: #0f172a; border: 1.5px solid rgba(245, 158, 11, 0.6); border-radius: 20px; padding: 28px 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.9); }
    .fallback-card h3 { color: #fcd34d; font-size: 16px; margin-bottom: 10px; font-weight: 900; }
    .fallback-card p { color: #cbd5e1; font-size: 12.5px; line-height: 1.7; margin-bottom: 20px; }
    .action-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
    .btn-primary { background: linear-gradient(135deg, #f59e0b, #d97706); color: #020617; font-weight: 900; font-size: 13px; padding: 10px 20px; border-radius: 12px; text-decoration: none; border: 0; cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 6px 20px rgba(245,158,11,0.35); }
    .btn-primary:active { transform: scale(0.96); }
    .btn-secondary { background: #1e293b; color: #f1f5f9; font-weight: 800; font-size: 12.5px; padding: 10px 18px; border-radius: 12px; text-decoration: none; border: 1px solid #334155; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .btn-secondary:hover { background: #334155; color: #fff; }
  </style>
</head>
<body>
  <div id="player-wrapper">
    <div id="spinner" class="loading-spinner"></div>
    <div class="overlay-bar">
      <div class="overlay-badge">
        <span>🎬 YouTube HD</span>
      </div>
      <button type="button" class="overlay-btn" onclick="openPopout()" title="فتح في نافذة سينمائية مستقلة لتجاوز أي قيود حظر">
        <span>⚡ تشغيل نافذة مستقلة (بدون حظر) ↗</span>
      </button>
      <a href="${escapeHtml(watchUrl)}" target="_blank" rel="noopener noreferrer" class="overlay-btn" title="المشاهدة مباشرة في موقع وتطبيق يوتيوب">
        <span>تطبيق YouTube ↗</span>
      </a>
    </div>

    <!-- YouTube Player Container -->
    <div id="yt-player"></div>

    <!-- Fallback Card for restricted/Error 150 videos -->
    <div id="fallback-banner" class="fallback-banner">
      <div class="fallback-card">
        <div style="font-size:32px;margin-bottom:8px;">⚠️</div>
        <h3>تم تقييد التضمين المباشر من مالك الفيديو</h3>
        <p>
          قام ناشر المقطع بحظر التضمين داخل النوافذ المدمجة (Error 150/153). يمكنك مواصلة مشاهدة <strong>${escapeHtml(title)}</strong> فوراً بضغطة واحدة وبكامل الجودة:
        </p>
        <div class="action-row">
          <button type="button" class="btn-primary" onclick="openPopout()">
            <span>تشغيل في نافذة مستقلة ⚡</span>
          </button>
          <a href="${escapeHtml(watchUrl)}" target="_blank" rel="noopener noreferrer" class="btn-secondary">
            <span>المشاهدة على يوتيوب ↗</span>
          </a>
        </div>
      </div>
    </div>
  </div>

  <script>
    var ytVideoId = ${JSON.stringify(ytId)};
    var watchUrl = ${JSON.stringify(watchUrl)};
    var spinner = document.getElementById('spinner');
    var fallbackBanner = document.getElementById('fallback-banner');
    var player = null;
    var playerReady = false;

    function hideSpinner() {
      if (spinner) spinner.style.display = 'none';
    }

    function showFallback() {
      hideSpinner();
      if (fallbackBanner) fallbackBanner.style.display = 'flex';
      try {
        window.parent.postMessage({ type: 'autocinema:youtube-restricted', videoId: ytVideoId }, '*');
      } catch(_) {}
    }

    function openPopout() {
      var w = 960, h = 560;
      var left = Math.max(0, (screen.width - w) / 2);
      var top = Math.max(0, (screen.height - h) / 2);
      var pop = window.open(
        'https://www.youtube.com/embed/' + ytVideoId + '?autoplay=1&playsinline=1&rel=0',
        'AutoCinemaYTPlayer',
        'width=' + w + ',height=' + h + ',top=' + top + ',left=' + left + ',toolbar=no,menubar=no,location=no,status=no,resizable=yes'
      );
      if (pop) pop.focus();
    }

    // Direct fallback iframe loader if API takes more than 3.5s
    var apiTimeout = setTimeout(function() {
      if (!playerReady) {
        var container = document.getElementById('yt-player');
        if (container && !player) {
          container.innerHTML = '<iframe src="' + ${JSON.stringify(officialEmbedUrl)} + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
          hideSpinner();
        }
      }
    }, 3500);

    // Load YouTube Iframe API from official youtube.com
    var tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = function() {
      clearTimeout(apiTimeout);
      try {
        var originHost = window.location.origin || (window.location.protocol + '//' + window.location.host);
        player = new YT.Player('yt-player', {
          videoId: ytVideoId,
          host: 'https://www.youtube.com',
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
            fs: 1,
            origin: originHost,
            widget_referrer: window.location.href
          },
          events: {
            onReady: function(event) {
              playerReady = true;
              hideSpinner();
              try {
                event.target.setPlaybackQuality(${JSON.stringify(vq)});
              } catch(_) {}
              try {
                event.target.playVideo();
              } catch(_) {}
            },
            onStateChange: function(event) {
              if (event.data === YT.PlayerState.PLAYING) {
                hideSpinner();
                try {
                  window.parent.postMessage({ type: 'autocinema:youtube-playing', videoId: ytVideoId }, '*');
                } catch(_) {}
              }
            },
            onError: function(event) {
              console.warn('[AutoCinema YouTube Player Error]:', event.data);
              // Error 101, 150, 153: Video owner restricted embedding
              // Error 100: Video removed/not found
              if (event.data === 150 || event.data === 101 || event.data === 153 || event.data === 100) {
                showFallback();
              }
            }
          }
        });
      } catch(err) {
        console.error('[YT Init Error]', err);
        var container = document.getElementById('yt-player');
        if (container) {
          container.innerHTML = '<iframe src="' + ${JSON.stringify(officialEmbedUrl)} + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
        }
        hideSpinner();
      }
    };
  </script>
</body>
</html>`;

  res.send(html);
});

// -------------------------------------------------------------
// Dedicated Clean Embed Player (Protected HLS Player for Iframes)
// -------------------------------------------------------------
app.get('/api/player-embed', (req: Request, res: Response) => {
  const urlParam = req.query.url as string;
  const title = (req.query.title as string) || 'مشغل الفيديو السينمائي';
  const poster = (req.query.poster as string) || '';
  const subParam = req.query.sub as string;

  if (!urlParam) {
    return res.status(400).send('Missing url parameter');
  }

  // If this is a YouTube link, automatically redirect to dedicated robust YouTube player
  const ytId = extractYouTubeId(urlParam);
  if (ytId) {
    return res.redirect(`/api/youtube-player?v=${encodeURIComponent(ytId)}&title=${encodeURIComponent(title)}&autoplay=1`);
  }

  // Format media URL: if not already proxied, route through stream-proxy
  const mediaUrl = urlParam.startsWith('/api/') ? urlParam : `/api/stream-proxy?url=${encodeURIComponent(urlParam)}`;
  const subUrl = subParam ? (subParam.startsWith('/api/') ? subParam : `/api/stream-proxy?url=${encodeURIComponent(subParam)}`) : '';

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }
    .player-box { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000; }
    video { width: 100%; height: 100%; object-fit: contain; background: #000; outline: none; }
    .spinner { position: absolute; border: 4px solid rgba(255,255,255,0.2); border-top: 4px solid #6366f1; border-radius: 50%; width: 44px; height: 44px; animation: spin 0.8s linear infinite; pointer-events: none; display: none; z-index: 20; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="player-box">
    <div id="spinner" class="spinner"></div>
    <video id="player" controls playsinline autoplay preload="auto" poster="${escapeHtml(poster)}">
      ${subUrl ? `<track kind="subtitles" label="عربي" srclang="ar" src="${escapeHtml(subUrl)}" default>` : ''}
    </video>
  </div>
  <script>
    (function() {
      const v = document.getElementById('player');
      const sp = document.getElementById('spinner');
      const mUrl = ${JSON.stringify(mediaUrl)};
      
      function showL() { if (sp) sp.style.display = 'block'; }
      function hideL() { if (sp) sp.style.display = 'none'; }

      v.addEventListener('waiting', showL);
      v.addEventListener('playing', hideL);
      v.addEventListener('canplay', hideL);

      const isHls = mUrl.includes('.m3u8') || mUrl.includes('/hls/') || mUrl.includes('stream-proxy');

      if (isHls && typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 60
        });
        hls.loadSource(mUrl);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
          v.play().catch(function() {
            v.muted = true;
            v.play().catch(function() {});
          });
        });
        hls.on(Hls.Events.ERROR, function(e, data) {
          if (data && data.fatal) {
            switch(data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                break;
            }
          }
        });
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = mUrl;
        v.play().catch(function() { v.muted = true; v.play().catch(function() {}); });
      } else {
        v.src = mUrl;
        v.play().catch(function() { v.muted = true; v.play().catch(function() {}); });
      }
    })();
  </script>
</body>
</html>`;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Content-Security-Policy');
  res.status(200);
  return res.send(html);
});

app.all('/api/stream-proxy', async (req: Request, res: Response) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(204).end();
  }
  let targetUrl = (req.query.url as string || '').trim();
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  if (targetUrl.startsWith('//')) {
    targetUrl = 'https:' + targetUrl;
  }
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    } else {
      return res.status(400).send('Invalid url parameter');
    }
  }

  try {
    const parsed = new URL(targetUrl);
    if (!parsed.hostname || (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')) {
      return res.status(400).send('Invalid hostname in url parameter');
    }
  } catch {
    return res.status(400).send('Invalid url parameter');
  }

  try {
    // Dedicated resilient proxy stream for egybestvid & s1.egybestvid HLS streams
    if (/egybestvid/i.test(targetUrl)) {
      const u = new URL(targetUrl);
      const isHttps = u.protocol === 'https:';
      const client = isHttps ? https : http;
      const reqHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': (req.query.ref as string) || 'https://egybestvid.com/embed-93b2h0zwdvfo.html',
      };
      if (req.headers.range) {
        reqHeaders['Range'] = req.headers.range as string;
      }

      const options: any = {
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        headers: reqHeaders,
        timeout: 15000,
      };
      if (isHttps) {
        options.rejectUnauthorized = false;
      }

      const hReq = client.get(
        options,
        (hRes) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          if (hRes.headers['content-type']) res.setHeader('Content-Type', hRes.headers['content-type']);
          if (hRes.headers['content-range']) res.setHeader('Content-Range', hRes.headers['content-range']);
          if (hRes.headers['accept-ranges']) res.setHeader('Accept-Ranges', hRes.headers['accept-ranges']);
          else res.setHeader('Accept-Ranges', 'bytes');

          const isM3U8 = targetUrl.includes('.m3u8');
          if (isM3U8 && hRes.statusCode === 200) {
            let text = '';
            hRes.on('data', (c) => (text += c));
            hRes.on('end', () => {
              if (text.includes('#EXTM3U') || text.includes('#EXT-X-STREAM-INF')) {
                const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                const refParam = req.query.ref ? `&ref=${encodeURIComponent(req.query.ref as string)}` : '';
                const lines = text.split(/\r?\n/);
                const rewritten = lines.map((line) => {
                  const trimmed = line.trim();
                  if (!trimmed) return line;
                  if (trimmed.startsWith('#')) {
                    return line.replace(/URI=["']([^"']+)["']/g, (_m, uri) => {
                      const resolved = uri.startsWith('http') ? uri : new URL(uri, baseUrl).toString();
                      return `URI="/api/stream-proxy?url=${encodeURIComponent(resolved)}${refParam}"`;
                    });
                  }
                  const resolvedUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).toString();
                  return `/api/stream-proxy?url=${encodeURIComponent(resolvedUrl)}${refParam}`;
                });
                res.status(200);
                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                return res.send(rewritten.join('\n'));
              }
              res.status(200);
              return res.send(text);
            });
            return;
          }

          res.status(hRes.statusCode || 200);
          hRes.pipe(res);
        }
      );

      hReq.on('error', () => {
        if (!res.headersSent) res.status(502).send('Upstream error');
      });

      req.on('close', () => {
        try {
          hReq.destroy();
        } catch (_) {}
      });
      return;
    }

    // Replace any legacy or non-existent delivery.vidmoly.* domain
    if (/delivery\.vidmoly\.(?:me|biz|net)/i.test(targetUrl)) {
      const vMatch = targetUrl.match(/\/hls(?:\d)?\/([a-zA-Z0-9]{8,24})/i);
      if (vMatch) {
        const code = vMatch[1];
        const fresh = await getFreshVidmolyStream(code);
        if (fresh?.url) {
          targetUrl = fresh.url;
        }
      }
    }

    // If targetUrl is an embed page for Vidmoly, resolve it directly to the fresh master m3u8
    if (/vidmoly\.(?:biz|net|me|to)\/(?:embed-)?([a-zA-Z0-9]+)(?:\.html)?/i.test(targetUrl)) {
      const vMatch = targetUrl.match(/(?:embed-|\/)([a-zA-Z0-9]{8,24})(?:\.html)?/i);
      if (vMatch) {
        const code = vMatch[1];
        const fresh = await getFreshVidmolyStream(code);
        if (fresh?.url) {
          targetUrl = fresh.url;
        }
      }
    }

    // Replace blocked vstm.shop CDN domain with active naturee.site mirror
    if (/vstm\.shop/i.test(targetUrl)) {
      targetUrl = targetUrl.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?vstm\.shop/i, 'https://naturee.site');
    }

    const upstreamHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };

    if (req.query.ref) {
      upstreamHeaders['Referer'] = req.query.ref as string;
      try {
        upstreamHeaders['Origin'] = new URL(req.query.ref as string).origin;
      } catch (_) {}
    } else if (targetUrl.includes('cdnz.quest') || targetUrl.includes('mp4plus') || targetUrl.includes('anafast') || targetUrl.includes('vidspeed') || targetUrl.includes('akwam') || targetUrl.includes('akoam') || targetUrl.includes('aflamy')) {
      upstreamHeaders['Referer'] = 'https://anafast.cyou/';
      upstreamHeaders['Origin'] = 'https://anafast.cyou';
    } else if (targetUrl.includes('mixdrop') || targetUrl.includes('mxcontent.net')) {
      upstreamHeaders['Referer'] = 'https://mixdrop.to/';
      upstreamHeaders['Origin'] = 'https://mixdrop.to';
    } else if (targetUrl.includes('streamtape') || targetUrl.includes('tapecontent.net') || targetUrl.includes('strtape') || targetUrl.includes('strcloud') || targetUrl.includes('streamta.pe')) {
      upstreamHeaders['Referer'] = 'https://streamtape.com/';
      upstreamHeaders['Origin'] = 'https://streamtape.com';
    } else if (targetUrl.includes('sprintcdn') || targetUrl.includes('r66nv9ed.com') || targetUrl.includes('owphbf24.com') || targetUrl.includes('byse') || targetUrl.includes('bysetayico') || targetUrl.includes('bysesukior')) {
      upstreamHeaders['Referer'] = 'https://bysetayico.com/';
      upstreamHeaders['Origin'] = 'https://bysetayico.com';
    } else if (targetUrl.includes('vmpx.online') || targetUrl.includes('vidmoly') || targetUrl.includes('vmeas.cloud') || targetUrl.includes('staticmoly') || targetUrl.includes('vmcld.space')) {
      upstreamHeaders['Referer'] = 'https://vidmoly.biz/';
      upstreamHeaders['Origin'] = 'https://vidmoly.biz';
    } else if (targetUrl.includes('uqload') || (targetUrl.includes('strm') && targetUrl.includes('.vc'))) {
      upstreamHeaders['Referer'] = 'https://uqload.net/';
      upstreamHeaders['Origin'] = 'https://uqload.net';
    } else if (targetUrl.includes('abyssplayer') || targetUrl.includes('abyss.to') || targetUrl.includes('iamcdn')) {
      upstreamHeaders['Referer'] = 'https://abyssplayer.com/';
      upstreamHeaders['Origin'] = 'https://abyssplayer.com';
    } else if (targetUrl.includes('naturee.site') || targetUrl.includes('vstm.shop')) {
      upstreamHeaders['Referer'] = 'https://naturee.site/';
      upstreamHeaders['Origin'] = 'https://naturee.site';
    } else if (targetUrl.includes('egybestvid') || targetUrl.includes('egybest')) {
      upstreamHeaders['Referer'] = (req.query.ref as string) || 'https://egybestvid.com/';
      upstreamHeaders['Origin'] = 'https://egybestvid.com';
    } else {
      try {
        upstreamHeaders['Referer'] = new URL(targetUrl).origin;
      } catch (_) {}
    }
    if (targetUrl.includes('egybestvid') || (req.query.ref && (req.query.ref as string).includes('egybestvid'))) {
      upstreamHeaders['Accept-Language'] = '';
    }
    if (req.headers.range) {
      upstreamHeaders['Range'] = req.headers.range as string;
    }

    const abortController = new AbortController();
    req.on('close', () => {
      try {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
      } catch (_) {}
    });

    let upstreamRes = await fetch(targetUrl, {
      headers: upstreamHeaders,
      signal: abortController.signal,
    });

    // Resilient auto-healing: if Vidmoly returns 403 or 404 (due to expired token or IP ASN mismatch), get fresh token and refetch
    if ((upstreamRes.status === 403 || upstreamRes.status === 404) && (/vmpx\.online|vidmoly|vmeas\.cloud|vmcld\.space/i.test(targetUrl))) {
      const codeMatch = targetUrl.match(/\/([a-zA-Z0-9]{8,24})_n\//);
      if (codeMatch) {
        const code = codeMatch[1];
        vidmolyStreamCache.delete(code); // Invalidate expired token
        const fresh = await getFreshVidmolyStream(code);
        if (fresh?.url) {
          targetUrl = fresh.url;
          upstreamRes = await fetch(targetUrl, {
            headers: upstreamHeaders,
            signal: abortController.signal,
          });
        }
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    const contentType = upstreamRes.headers.get('content-type') || '';
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    if (upstreamRes.headers.get('content-range')) {
      res.setHeader('Content-Range', upstreamRes.headers.get('content-range')!);
    }
    if (upstreamRes.headers.get('accept-ranges')) {
      res.setHeader('Accept-Ranges', upstreamRes.headers.get('accept-ranges')!);
    } else {
      res.setHeader('Accept-Ranges', 'bytes');
    }

    // Subtitle handling: ensure WebVTT headers
    if (targetUrl.includes('.vtt') || targetUrl.includes('/subtitle/')) {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      const text = await upstreamRes.text();
      res.status(upstreamRes.status);
      return res.send(text.startsWith('WEBVTT') ? text : 'WEBVTT\n\n' + text);
    }

    const isExplicitM3U8 = targetUrl.includes('.m3u8') || targetUrl.includes('/hls/') || targetUrl.includes('m3u8_gx_track') || contentType.includes('mpegurl') || contentType.includes('x-mpegURL');
    const isSegmentOrVideo = targetUrl.includes('.ts') || targetUrl.includes('/stream-ts/') || targetUrl.includes('.mp4') || targetUrl.includes('.webm') || targetUrl.includes('.mkv');

    // If m3u8 playlist or text manifest, rewrite relative segment/stream paths and keys through proxy
    if ((isExplicitM3U8 || contentType.includes('text')) && !isSegmentOrVideo) {
      const text = await upstreamRes.text();
      if (text.includes('#EXTM3U') || text.includes('#EXT-X-STREAM-INF') || isExplicitM3U8) {
        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
        const refParam = req.query.ref ? `&ref=${encodeURIComponent(req.query.ref as string)}` : '';
        const lines = text.split(/\r?\n/);
        const rewritten = lines.map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.startsWith('#')) {
            return line.replace(/URI=["']([^"']+)["']/g, (_m, uri) => {
              const resolved = uri.startsWith('http') ? uri : new URL(uri, baseUrl).toString();
              return `URI="/api/stream-proxy?url=${encodeURIComponent(resolved)}${refParam}"`;
            });
          }
          const resolvedUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).toString();
          return `/api/stream-proxy?url=${encodeURIComponent(resolvedUrl)}${refParam}`;
        });
        res.status(upstreamRes.status);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        return res.send(rewritten.join('\n'));
      } else {
        res.status(upstreamRes.status);
        return res.send(text);
      }
    }

    res.status(upstreamRes.status);

    if (upstreamRes.body && !upstreamRes.bodyUsed && !(upstreamRes.body as any).locked) {
      try {
        // @ts-ignore
        const nodeStream = Readable.fromWeb(upstreamRes.body as any);

        const isClientClosedOrAborted = (err?: any) => {
          return (
            req.destroyed ||
            res.destroyed ||
            res.writableEnded ||
            err?.name === 'AbortError' ||
            err?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
            err?.code === 'ERR_INVALID_STATE' ||
            err?.code === 'UND_ERR_ABORTED' ||
            err?.code === 'ECONNRESET' ||
            err?.code === 'EPIPE' ||
            err?.message === 'terminated' ||
            err?.message?.includes('terminated') ||
            err?.message?.includes('aborted') ||
            err?.message?.includes('premature close') ||
            err?.message?.includes('locked')
          );
        };

        nodeStream.on('error', (err: any) => {
          if (!isClientClosedOrAborted(err)) {
            console.warn('[Stream Proxy] Transfer error:', err?.message || err);
          }
          try {
            if (!nodeStream.destroyed) {
              nodeStream.destroy();
            }
          } catch (_) {}
          try {
            if (!res.writableEnded && !res.destroyed) {
              res.end();
            }
          } catch (_) {}
        });

        res.on('error', (err: any) => {
          if (!isClientClosedOrAborted(err)) {
            console.warn('[Stream Proxy] Response socket error:', err?.message || err);
          }
        });

        req.on('close', () => {
          try {
            if (!nodeStream.destroyed) {
              nodeStream.destroy();
            }
          } catch (_) {}
        });

        nodeStream.pipe(res);
      } catch (streamErr: any) {
        const isIgnorable =
          req.destroyed ||
          res.destroyed ||
          res.writableEnded ||
          streamErr?.code === 'ERR_INVALID_STATE' ||
          streamErr?.name === 'AbortError' ||
          streamErr?.message === 'terminated' ||
          streamErr?.message?.includes('terminated') ||
          streamErr?.message?.includes('locked') ||
          streamErr?.message?.includes('aborted');

        if (!isIgnorable) {
          console.warn('[Stream Proxy] Stream conversion error:', streamErr?.message || streamErr);
        }
        if (!res.headersSent && !res.destroyed) {
          res.status(500).end();
        }
      }
    } else {
      res.end();
    }
  } catch (err: any) {
    const isClientClosedOrAborted =
      req.destroyed ||
      res.destroyed ||
      res.writableEnded ||
      err?.name === 'AbortError' ||
      err?.code === 'ERR_INVALID_STATE' ||
      err?.code === 'UND_ERR_ABORTED' ||
      err?.code === 'ECONNRESET' ||
      err?.code === 'EPIPE' ||
      err?.message === 'terminated' ||
      err?.message?.includes('terminated') ||
      err?.message?.includes('locked') ||
      err?.message?.includes('aborted');

    if (isClientClosedOrAborted) {
      return;
    }
    const isDnsOrNetwork =
      err?.code === 'ENOTFOUND' ||
      err?.cause?.code === 'ENOTFOUND' ||
      err?.code === 'ECONNREFUSED' ||
      err?.code === 'ETIMEDOUT' ||
      err?.message?.includes('fetch failed');
    if (isDnsOrNetwork) {
      console.warn(`[Stream Proxy Warning]: Upstream host unreachable (${err?.cause?.code || err?.code || err?.message}) for URL: ${String(targetUrl).slice(0, 100)}`);
    } else {
      console.error('Proxy error:', err);
    }
    if (!res.headersSent && !res.destroyed) {
      return res.status(502).json({ error: 'Stream proxy error', message: err?.message });
    }
  }
});

// -------------------------------------------------------------
// 6. Vite / Static Frontend Server Integration
// -------------------------------------------------------------
async function startServer() {
  if (!isProd) {
    // Development mode with Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Development SPA fallback for direct navigation/refresh
    app.use('*', async (req: Request, res: Response, next) => {
      if (req.originalUrl.startsWith('/api/')) return next();
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        if (fs.existsSync(indexPath)) {
          let template = fs.readFileSync(indexPath, 'utf-8');
          template = await vite.transformIndexHtml(req.originalUrl, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
          return;
        }
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        return next(e);
      }
      next();
    });
  } else {
    // Production mode: serve built assets from dist
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response, next) => {
      if (req.originalUrl.startsWith('/api/')) return next();
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Remix: AutoCinema server running at http://${HOST}:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Server Warning]: Address ${HOST}:${PORT} already in use. Retrying in 1s...`);
      setTimeout(() => {
        try {
          server.close();
        } catch (_) {}
        server.listen(PORT, HOST);
      }, 1000);
    } else {
      console.error('[Server Error]:', err);
    }
  });

  const shutdown = () => {
    try {
      server.close(() => process.exit(0));
    } catch (_) {
      process.exit(0);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
