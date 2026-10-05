import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Google GenAI
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Body parser with 50mb limit for large initialData JSON
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Candidate Gemini models to cascade through in case of 503 / high demand spikes
  const CANDIDATE_MODELS = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
  ];

  function normalizeRating(val: any): 'green' | 'yellow' | 'orange' | 'red' | 'purple' {
    const s = String(val || '').toLowerCase().trim();
    if (s === 'purple' || s === '5' || /\b(nc-17|18\+|erotic|erotica)\b/.test(s)) return 'purple';
    if (s === 'red' || s === '4' || /\b(r|tv-ma|mature|adult)\b/.test(s)) return 'red';
    if (s === 'orange' || s === '3' || /\b(pg-13|moderate)\b/.test(s)) return 'orange';
    if (s === 'yellow' || s === '2' || /\b(pg|mild)\b/.test(s)) return 'yellow';
    if (s === 'green' || s === '1' || /\b(g|family|all)\b/.test(s)) return 'green';
    return 'green';
  }

  function fallbackClassifyMovie(movie: { id: string; title: string; category?: string; description?: string }) {
    const text = `${movie.title} ${movie.category || ''} ${movie.description || ''}`.toLowerCase();
    const baseStory = movie.description?.trim() || `فيلم "${movie.title}" - عمل سينمائي من تصنيف ${movie.category || 'عام'}.`;

    if (/erotic|porn|xxx|sex|إباحي|إيروتيك|للكبار فقط|\+18|18\+|nc-17/.test(text)) {
      return {
        id: String(movie.id),
        classification: 'purple' as const,
        reason: 'تم التقييم التلقائي: يحتوي على مؤشرات محتوى بالغ الجرأة وللكبار فقط.',
        storySummary: baseStory,
      };
    }
    if (/nude|nudity|intimacy|affair|تعري|علاقة جسدية|إغراء|سحاق|خيانة زوجية/.test(text)) {
      return {
        id: String(movie.id),
        classification: 'red' as const,
        reason: 'تم التقييم التلقائي: يتضمن مشاهد جسدية جريئة أو إيحاءات حميمية واضحة.',
        storySummary: baseStory,
      };
    }
    if (/romance|romantic|passion|kiss|رومانسي|حب وعشق|قبلات|عاطفي/.test(text)) {
      return {
        id: String(movie.id),
        classification: 'orange' as const,
        reason: 'تم التقييم التلقائي: محتوى درامي أو رومانسي معتدل.',
        storySummary: baseStory,
      };
    }
    if (/comedy|drama|thriller|action|crime|مغامرات|كوميدي|أكشن|جريمة/.test(text)) {
      return {
        id: String(movie.id),
        classification: 'yellow' as const,
        reason: 'تم التقييم التلقائي: تصنيف عام خفيف أو حركة وإثارة معتادة.',
        storySummary: baseStory,
      };
    }
    return {
      id: String(movie.id),
      classification: 'green' as const,
      reason: 'تم التقييم التلقائي: محتوى عائلي أو عام نظيف خالٍ من المشاهد الجريئة.',
      storySummary: baseStory,
    };
  }

  // API endpoint for Gemini Movie Classification with automatic fallback & cascade
  app.post('/api/ai/classify-movies', async (req, res) => {
    try {
      const { movies } = req.body;
      if (!Array.isArray(movies) || movies.length === 0) {
        return res.status(400).json({ error: 'مصفوفة الأفلام مطلوبة (movies array is required).' });
      }

      // Limit to 60 items max per call for performance
      const moviesToProcess = movies.slice(0, 60);

      // System instruction for intimacy / parental rating + detailed story summary
      const systemInstruction = `أنت خبير ونقاد سينمائي متخصص في تصنيف الأفلام وسرد قصصها وحبكاتها الدرامية بأسلوب جذاب.
مهمتك لكل فيلم:
1. تقييم درجة المحتوى الجنسي والعلاقات الجسدية الحميمية والجرأة، واختيار أحد التصنيفات الخمسة التالية بدقة:
   - "green" (1/5 - نظيف / عائلي): خالٍ تماماً من المشاهد الجريئة أو التعري، مناسب للمشاهدة العائلية والعامة (G / PG).
   - "yellow" (2/5 - منخفض / خفيف): مشاهد رومانسية خفيفة وقبلات بريئة عادية دون أي تفاصيل حميمية جريئة (PG / mild PG-13).
   - "orange" (3/5 - متوسط): رومانسية معتدلة، قبلات حارة، إيحاءات أو مشاهد حميمية غير مفرطة (PG-13 / mild R).
   - "red" (4/5 - عالٍ / جريء): مشاهد جسدية صريحة، تعري جزئي أو كلي، جرأة جنسية واضحة وتصنيف للكبار (R / TV-MA / 18+).
   - "purple" (5/5 - عالٍ جداً / شديد الجرأة): محتوى إيروتيكي أو علاقات جسدية بالغة الجرأة، تعري مكثف أو تصنيف للكبار فقط (NC-17 / Unrated erotica).
2. كتابة سبب التقييم (reason) بجملة عربية موجزة تشرح سبب اختيار هذه الدرجة.
3. كتابة قصة الفيلم (storySummary) بتفصيل وافٍ وشائق بالعربية (في 3 إلى 5 جمل غنية بالتفاصيل)، توضح خلفية القصة، أبطالها، نقطة البداية، الصراع والمغامرة المحورية، دون حرق النهاية.`;

      const allResults: Array<{ id: string; classification: 'green' | 'yellow' | 'orange' | 'red' | 'purple'; reason: string; storySummary: string }> = [];

      // Process in smaller chunks of 20 movies to keep latency low and avoid 503 / payload issues
      const CHUNK_SIZE = 20;
      for (let i = 0; i < moviesToProcess.length; i += CHUNK_SIZE) {
        const chunk = moviesToProcess.slice(i, i + CHUNK_SIZE).map((m: any, idx: number) => ({
          id: String(m.id),
          index: i + idx + 1,
          title: String(m.title || ''),
          category: String(m.category || ''),
          description: String(m.description || '').slice(0, 200),
        }));

        let chunkSuccess = false;

        if (process.env.GEMINI_API_KEY) {
          const prompt = `قيم وصنف هذه الأفلام واكتب قصة مفصلة وشائقة لكل منها:
${JSON.stringify(chunk, null, 2)}

أعد مصفوفة JSON فقط تحتوي على كائنات بها: { "id": "...", "classification": "green|yellow|orange|red|purple", "reason": "سبب التقييم بالعربية", "storySummary": "قصة الفيلم المفصلة والشائقة بالعربية في 3 إلى 5 جمل" }`;

          // Cascade through candidate models until one succeeds
          for (const model of CANDIDATE_MODELS) {
            try {
              const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                  systemInstruction,
                  responseMimeType: 'application/json',
                },
              });

              const responseText = response.text?.trim() || '[]';
              let parsedResults: any[] = [];
              try {
                parsedResults = JSON.parse(responseText);
              } catch {
                // If wrapped in markdown codeblock, extract json
                const match = responseText.match(/\[[\s\S]*\]/);
                if (match) parsedResults = JSON.parse(match[0]);
              }

              if (Array.isArray(parsedResults) && parsedResults.length > 0) {
                const parsedMap = new Map(
                  parsedResults.map((item) => [String(item.id), item])
                );

                for (const item of chunk) {
                  const found = parsedMap.get(item.id);
                  if (found) {
                    allResults.push({
                      id: item.id,
                      classification: normalizeRating(found.classification),
                      reason: String(found.reason || 'تم التقييم بواسطة الذكاء الاصطناعي Gemini.'),
                      storySummary: String(found.storySummary || item.description || `فيلم "${item.title}"`),
                    });
                  } else {
                    allResults.push(fallbackClassifyMovie(item));
                  }
                }

                chunkSuccess = true;
                break; // Break out of model cascade on success
              }
            } catch (modelErr: any) {
              console.warn(`[AI Classifier] Model ${model} failed (status: ${modelErr.status || modelErr.message?.slice(0, 80)}). Trying next candidate...`);
              // Continue to next model in cascade
            }
          }
        }

        // If all AI models failed or no API key, use the intelligent fallback classifier
        if (!chunkSuccess) {
          console.info(`[AI Classifier] Chunk ${i / CHUNK_SIZE + 1}: Using intelligent fallback heuristic.`);
          for (const item of chunk) {
            allResults.push(fallbackClassifyMovie(item));
          }
        }
      }

      return res.json({
        success: true,
        count: allResults.length,
        results: allResults,
      });
    } catch (err: any) {
      console.error('[API] Gemini classification critical error:', err);
      // Fallback for safety even in top-level try/catch
      const safeResults = (req.body?.movies || []).slice(0, 50).map((m: any) => fallbackClassifyMovie(m));
      return res.json({
        success: true,
        count: safeResults.length,
        results: safeResults,
        fallback: true,
      });
    }
  });

  // API endpoint to fetch initial data (supporting multi-chunk initialData.json, initialData2.json, etc.)
  app.get('/api/get-initial-data', (_req, res) => {
    try {
      const publicDir = path.join(process.cwd(), 'public');
      const rootDir = process.cwd();

      // Look for a file in publicDir or rootDir (case-insensitive fallback)
      const findFile = (fileName: string): string | null => {
        const p1 = path.join(publicDir, fileName);
        if (fs.existsSync(p1)) return p1;
        const p2 = path.join(rootDir, fileName);
        if (fs.existsSync(p2)) return p2;

        const lower = fileName.toLowerCase();
        for (const dir of [publicDir, rootDir]) {
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            const found = files.find((f) => f.toLowerCase() === lower);
            if (found) return path.join(dir, found);
          }
        }
        return null;
      };

      // Priority 1: Base initialData.json + Delta update initialData2.json
      const primaryFile = findFile('initialData.json');
      if (primaryFile) {
        const primaryContent = JSON.parse(fs.readFileSync(primaryFile, 'utf-8'));
        const loadedChunks: string[] = [path.basename(primaryFile)];

        let allMovies: any[] = Array.isArray(primaryContent.movies) ? [...primaryContent.movies] : [];
        let allFolders: any[] = Array.isArray(primaryContent.folders) ? [...primaryContent.folders] : [];
        let allFavoriteLists: any[] = Array.isArray(primaryContent.favoriteLists) ? [...primaryContent.favoriteLists] : [];
        const seenMovieIds = new Set(allMovies.map((m) => m.id));
        const seenFolderIds = new Set(allFolders.map((f) => f.id));
        const seenFavListIds = new Set(allFavoriteLists.map((l) => l.id));

        // Scan for update chunk: initialData2.json (and any subsequent chunks if present)
        let chunkIndex = 2;
        while (chunkIndex <= 50) {
          const chunkFileName = `initialData${chunkIndex}.json`;
          const chunkPath = findFile(chunkFileName);
          if (!chunkPath) {
            const nextExists = findFile(`initialData${chunkIndex + 1}.json`);
            if (!nextExists) break;
            chunkIndex++;
            continue;
          }

          try {
            const chunkContent = JSON.parse(fs.readFileSync(chunkPath, 'utf-8'));
            loadedChunks.push(path.basename(chunkPath));

            // 1. Handle deleted movie IDs from base if specified
            if (Array.isArray(chunkContent.deletedMovieIds) && chunkContent.deletedMovieIds.length > 0) {
              const delSet = new Set(chunkContent.deletedMovieIds);
              allMovies = allMovies.filter((m) => !delSet.has(m.id));
              delSet.forEach((id) => seenMovieIds.delete(id));
            }

            // 2. Handle modified & new movies
            if (Array.isArray(chunkContent.movies)) {
              const movieMap = new Map(allMovies.map((m, idx) => [m.id, idx]));
              for (const m of chunkContent.movies) {
                if (!m || !m.id) continue;
                if (movieMap.has(m.id)) {
                  // Existing movie modified in update file -> merge/update it!
                  const idx = movieMap.get(m.id)!;
                  allMovies[idx] = { ...allMovies[idx], ...m };
                } else {
                  // New movie added in update file -> prepend it!
                  seenMovieIds.add(m.id);
                  allMovies.unshift(m);
                  movieMap.set(m.id, 0);
                }
              }
            }

            // 3. Handle folders
            if (Array.isArray(chunkContent.folders)) {
              for (const f of chunkContent.folders) {
                if (f && f.id && !seenFolderIds.has(f.id)) {
                  seenFolderIds.add(f.id);
                  allFolders.push(f);
                }
              }
            }

            // 4. Handle favorite lists
            if (Array.isArray(chunkContent.favoriteLists)) {
              for (const l of chunkContent.favoriteLists) {
                if (l && l.id && !seenFavListIds.has(l.id)) {
                  seenFavListIds.add(l.id);
                  allFavoriteLists.push(l);
                }
              }
            }
          } catch (chunkErr) {
            console.warn(`[API] Failed to parse chunk file ${chunkFileName}:`, chunkErr);
          }
          chunkIndex++;
        }

        // Recompute allFavorites across all items
        const favMovies = allMovies.filter(
          (m: any) => (m.isFavorite || (m.favoriteListIds && m.favoriteListIds.length > 0)) && !m.isHidden
        );
        const getEffectiveFavColor = (m: any): string => {
          if (m.classification === 'red' || m.classification === 'purple') return 'purple';
          return m.favoriteColor || 'yellow';
        };
        const greenFavs = favMovies.filter((m: any) => getEffectiveFavColor(m) === 'green');
        const yellowFavs = favMovies.filter((m: any) => getEffectiveFavColor(m) === 'yellow');
        const purpleFavs = favMovies.filter((m: any) => getEffectiveFavColor(m) === 'purple');
        const blackFavs = favMovies.filter((m: any) => getEffectiveFavColor(m) === 'black');

        return res.json({
          ...primaryContent,
          isBaseData: true,
          totalItemsCount: allMovies.length,
          totalItemsNotice: `إجمالي عدد العناصر المسترجعة: ${allMovies.length} عنصر (الملف الأساسي initialData.json${loadedChunks.length > 1 ? ' + ملف التحديثات ' + loadedChunks.slice(1).join(', ') : ''})`,
          loadedChunks,
          folders: allFolders,
          movies: allMovies,
          favoriteLists: allFavoriteLists,
          allFavorites: {
            repository: primaryContent.allFavorites?.repository || {
              id: 'all-favorites',
              name: 'كل المفضلة (All Favorites)',
              description: 'المفضلة العامة والتجميعية لكافة العناصر من جميع المستودعات',
              color: '#f59e0b',
              sortBy: 'date',
              isFolderHidden: false,
            },
            totalFavoritesCount: favMovies.length,
            notice: `إجمالي عدد عناصر المفضلة العامة المدمجة: ${favMovies.length} عنصر من جميع المستودعات`,
            movieIds: favMovies.map((m: any) => m.id),
            movies: favMovies,
            sections: {
              green: greenFavs.map((m: any) => m.id),
              yellow: yellowFavs.map((m: any) => m.id),
              purple: purpleFavs.map((m: any) => m.id),
              black: blackFavs.map((m: any) => m.id),
            },
            sectionsCount: {
              green: greenFavs.length,
              yellow: yellowFavs.length,
              purple: purpleFavs.length,
              black: blackFavs.length,
            },
          },
        });
      }

      // Priority 2: Any initialdata.<count>.json with highest item count
      const files = fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : [];
      const dynamicFiles = files
        .filter((f) => /^initialdata\.\d+\.json$/i.test(f))
        .sort((a, b) => {
          const countA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
          const countB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
          return countB - countA;
        });

      if (dynamicFiles.length > 0) {
        const content = fs.readFileSync(path.join(publicDir, dynamicFiles[0]), 'utf-8');
        return res.json(JSON.parse(content));
      }

      return res.status(404).json({ error: 'initialData file not found' });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to read initialData' });
    }
  });

  // API endpoint to sync/update initialData chunks on disk (2000 items per chunk)
  app.post('/api/update-initial-data', (req, res) => {
    try {
      const { folders, movies, favoriteLists, appName, version, allFavorites, hiddenFavoriteSections } = req.body;
      if (!Array.isArray(folders) || !Array.isArray(movies)) {
        return res.status(400).json({ error: 'Invalid data format: folders and movies must be arrays.' });
      }

      const publicDir = path.join(process.cwd(), 'public');
      const rootDir = process.cwd();
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }

      // Guard against accidental wipes: check existing movie count across public
      const primaryPath = path.join(publicDir, 'initialData.json');
      if (fs.existsSync(primaryPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(primaryPath, 'utf-8'));
          if (Array.isArray(existing.movies) && existing.movies.length > movies.length && movies.length < 50) {
            console.warn(`[API] Guard: Rejecting attempt to overwrite existing larger dataset with ${movies.length} movies.`);
            return res.json({ success: true, message: 'Existing larger dataset preserved.', count: existing.movies.length });
          }
        } catch (_) {}
      }

      const exportedAt = new Date().toISOString();
      const rootPrimaryPath = path.join(rootDir, 'initialData.json');
      const updatePath = path.join(publicDir, 'initialData2.json');
      const rootUpdatePath = path.join(rootDir, 'initialData2.json');

      const isConsolidate = req.body.consolidateBase === true || !fs.existsSync(primaryPath);

      if (isConsolidate) {
        // Mode 1: Consolidate everything into base initialData.json
        const chunkFavMovies = movies.filter(
          (m: any) => (m.isFavorite || (m.favoriteListIds && m.favoriteListIds.length > 0)) && !m.isHidden
        );
        const baseData = {
          isBaseData: true,
          chunkIndex: 1,
          totalChunks: 1,
          totalItemsCount: movies.length,
          totalItemsNotice: `الملف الأساسي الشامل لكافة العناصر الحالية (${movies.length} عنصر) - يُنسخ لـ public مرة واحدة فقط ولا تحتاج لإعادة نسخه في كل مرة`,
          appName: appName || 'AutoCinema',
          version: version || '2.0',
          exportedAt,
          folders,
          movies,
          favoriteLists: Array.isArray(favoriteLists) ? favoriteLists : [],
        };
        const baseJsonStr = JSON.stringify(baseData, null, 2);
        fs.writeFileSync(primaryPath, baseJsonStr, 'utf-8');
        fs.writeFileSync(rootPrimaryPath, baseJsonStr, 'utf-8');

        // Reset delta update file (initialData2.json)
        const emptyUpdateData = {
          isDeltaUpdate: true,
          notice: 'ملف التحديثات والإضافات الجديدة (initialData2.json) - هذا هو الملف الوحيد المطلوب نسخه عند عمل إضافات أو تعديلات على الوضع الحالي',
          baseExportedAt: exportedAt,
          exportedAt,
          newItemsCount: 0,
          modifiedItemsCount: 0,
          deletedItemsCount: 0,
          totalUpdatesCount: 0,
          folders,
          movies: [],
          favoriteLists: Array.isArray(favoriteLists) ? favoriteLists : [],
          deletedMovieIds: [],
        };
        const updateJsonStr = JSON.stringify(emptyUpdateData, null, 2);
        fs.writeFileSync(updatePath, updateJsonStr, 'utf-8');
        fs.writeFileSync(rootUpdatePath, updateJsonStr, 'utf-8');

        // Clean up orphan chunks 3..50
        for (let i = 3; i <= 50; i++) {
          for (const dir of [publicDir, rootDir]) {
            const f = path.join(dir, `initialData${i}.json`);
            if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (_) {}
          }
        }

        console.log(`[API] Base consolidated into initialData.json (${movies.length} movies).`);
        return res.json({
          success: true,
          mode: 'consolidate',
          baseCount: movies.length,
          newMoviesCount: 0,
          modifiedMoviesCount: 0,
          message: `تم تثبيت وحفظ كافة العناصر (${movies.length} عنصر) في الملف الأساسي (initialData.json) بنجاح!`,
        });
      }

      // Mode 2: Incremental Delta Update -> Save ONLY new additions & modifications to initialData2.json!
      // Read base movies from initialData.json
      let baseMovies: any[] = [];
      try {
        const baseJson = JSON.parse(fs.readFileSync(primaryPath, 'utf-8'));
        if (Array.isArray(baseJson.movies)) {
          baseMovies = baseJson.movies;
        }
      } catch (err) {
        console.warn('[API] Could not read base initialData.json:', err);
      }

      const baseMovieMap = new Map<string, any>(baseMovies.map((m) => [m.id, m]));
      const newMovies: any[] = [];
      const modifiedMovies: any[] = [];

      for (const m of movies) {
        if (!m || !m.id) continue;
        if (!baseMovieMap.has(m.id)) {
          // New movie added
          newMovies.push(m);
        } else {
          // Check if modified compared to base
          const baseM = baseMovieMap.get(m.id)!;
          const isModified =
            baseM.title !== m.title ||
            baseM.url !== m.url ||
            baseM.embedUrl !== m.embedUrl ||
            baseM.posterUrl !== m.posterUrl ||
            baseM.classification !== m.classification ||
            baseM.classificationReason !== m.classificationReason ||
            baseM.storySummary !== m.storySummary ||
            baseM.isFavorite !== m.isFavorite ||
            baseM.favoriteColor !== m.favoriteColor ||
            baseM.favoriteOrder !== m.favoriteOrder ||
            baseM.parentFolderId !== m.parentFolderId ||
            baseM.isHidden !== m.isHidden ||
            baseM.isBroken !== m.isBroken;

          if (isModified) {
            modifiedMovies.push(m);
          }
        }
      }

      // Check deletions
      const currentMovieIds = new Set(movies.map((m) => m.id));
      const deletedMovieIds = baseMovies.filter((bm) => !currentMovieIds.has(bm.id)).map((bm) => bm.id);

      const deltaMovies = [...newMovies, ...modifiedMovies];
      const deltaData = {
        isDeltaUpdate: true,
        chunkIndex: 2,
        totalChunks: 2,
        notice: 'ملف التحديثات والإضافات الجديدة (initialData2.json) - هذا هو الملف الوحيد المطلوب نسخه عند عمل إضافات أو تعديلات على الوضع الحالي',
        exportedAt,
        baseItemsCount: baseMovies.length,
        newItemsCount: newMovies.length,
        modifiedItemsCount: modifiedMovies.length,
        deletedItemsCount: deletedMovieIds.length,
        totalUpdatesCount: deltaMovies.length,
        folders,
        movies: deltaMovies,
        newMovies,
        modifiedMovies,
        deletedMovieIds,
        favoriteLists: Array.isArray(favoriteLists) ? favoriteLists : [],
      };

      const deltaJsonStr = JSON.stringify(deltaData, null, 2);
      fs.writeFileSync(updatePath, deltaJsonStr, 'utf-8');
      fs.writeFileSync(rootUpdatePath, deltaJsonStr, 'utf-8');

      // Clean up orphan chunks 3..50
      for (let i = 3; i <= 50; i++) {
        for (const dir of [publicDir, rootDir]) {
          const f = path.join(dir, `initialData${i}.json`);
          if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (_) {}
        }
      }

      console.log(`[API] Saved initialData2.json updates (${newMovies.length} new, ${modifiedMovies.length} modified, ${deletedMovieIds.length} deleted). Base initialData.json preserved untouched.`);

      return res.json({
        success: true,
        mode: 'delta',
        baseCount: baseMovies.length,
        newMoviesCount: newMovies.length,
        modifiedMoviesCount: modifiedMovies.length,
        deletedMoviesCount: deletedMovieIds.length,
        totalUpdatesCount: deltaMovies.length,
        updatesFile: 'initialData2.json',
        message: `تم حفظ ملف التحديثات (initialData2.json) بنجاح (${newMovies.length} جديد، ${modifiedMovies.length} معدل). الملف الأساسي (initialData.json) محفوظ كما هو دون الحاجة لإعادة نسخه!`,
      });
    } catch (err: any) {
      console.error('[API] Error updating initialData chunks:', err);
      return res.status(500).json({ error: err?.message || 'Failed to update initialData chunks.' });
    }
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
