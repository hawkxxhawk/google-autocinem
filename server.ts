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

  // Candidate Gemini models (prioritizing high-availability flash models for text & narrative generation)
  const CANDIDATE_MODELS = [
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
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
    const cleanDesc = (movie.description || '')
      .replace(/Imported\s*via\s*JSON\s*feed/gi, '')
      .replace(/Imported\s*via\s*JSON/gi, '')
      .replace(/مستورد\s*عبر\s*تغذية\s*JSON\s*(\([^)]*\))?/gi, '')
      .trim();
    const baseStory = cleanDesc || `فيلم "${movie.title}" - عمل سينمائي من تصنيف ${movie.category || 'عام'}.`;

    if (/erotic|porn|xxx|sex|إباحي|إيروتيك|للكبار فقط|\+18|18\+|nc-17/.test(text)) {
      return {
        id: String(movie.id),
        classification: 'purple' as const,
        reason: 'تقييم فوري: مؤشرات محتوى بالغ الجرأة وللكبار فقط.',
        storySummary: baseStory,
      };
    }
    if (/nude|nudity|intimacy|affair|تعري|علاقة جسدية|إغراء|سحاق|خيانة زوجية/.test(text)) {
      return {
        id: String(movie.id),
        classification: 'red' as const,
        reason: 'تقييم فوري: يتضمن مشاهد جسدية جريئة أو إيحاءات حميمية واضحة.',
        storySummary: baseStory,
      };
    }
    if (/romance|romantic|passion|kiss|رومانسي|حب وعشق|قبلات|عاطفي/.test(text)) {
      return {
        id: String(movie.id),
        classification: 'orange' as const,
        reason: 'تقييم فوري: محتوى درامي أو رومانسي معتدل.',
        storySummary: baseStory,
      };
    }
    if (/comedy|drama|thriller|action|crime|مغامرات|كوميدي|أكشن|جريمة/.test(text)) {
      return {
        id: String(movie.id),
        classification: 'yellow' as const,
        reason: 'تقييم فوري: تصنيف عام خفيف أو حركة وإثارة معتادة.',
        storySummary: baseStory,
      };
    }
    return {
      id: String(movie.id),
      classification: 'green' as const,
      reason: 'تقييم فوري: محتوى عائلي أو عام نظيف خالٍ من المشاهد الجريئة.',
      storySummary: baseStory,
    };
  }

  // System instruction for direct, clear storytelling (No brevity, no rhetorical filler words)
  const STORY_SYSTEM_INSTRUCTION = `أنت راوٍ سينمائي دقيق، وموضوعي، ومباشر.
مهمتك: كتابة قصة الفيلم بوضوح تام، مع الالتزام الحرفي بالقواعد الصارمة التالية:
1. الوضوح التام والمباشر:
   - ابدأ فوراً بسرد وقائع القصة الحقيقية.
   - وضّح بدقة: من هو بطل الفيلم؟ أين يعيش أو ما هو عمله؟ ما الحدث المفصلي أو الأزمة التي تقع في بداية الأحداث وتغير مجرى حياته؟ ما الصراع الرئيسي والتحديات الحقيقية التي يواجهها الأبطال؟ وكيف تتوالى الأحداث؟
2. بدون اختصار مخل:
   - اعرض القصة بتفصيل وافٍ وواضح يمنح القارئ فهماً شاملاً لحبكة الفيلم ومساره الدرامي دون اختصار متعجل في سطرين.
   - اكتب سرداً مترابطاً ومكتملاً للقصة والأحداث، مع تجنب حرق النهاية أو كشف الحل النهائي للغز.
3. منع الكلمات الإنشائية والعبارات البلاغية منعاً باتاً وقطعياً:
   - يُمنع منعاً باتاً استخدام أي عبارات ترويجية أو ديباجات إنشائية مستهلكة مثل:
     * "في إطار درامي مشوق ومثير..."
     * "في قالب مليء بالإثارة والغموض..."
     * "تأخذنا هذه التحفة السينمائية في رحلة لا تُنسى..."
     * "تدور الأحداث في مزيج ساحر..."
     * "يحبس الأنفاس..."
     * "يسلط الضوء على صراع إنساني عميق..."
     * "تتشابك الخيوط الدرامية بطريقة مذهلة..."
     * "عمل سينمائي مميز يعكس..."
   - لا تبدأ بأي تمهيد أو جمل إنشائية؛ ادخل فوراً في صلب القصة بأسلوب سردي نقي ومباشر يركز فقط على الشخصيات والوقائع.`;

  // Dedicated API endpoint: Generate clear, detailed movie story with Gemini (No brevity, zero rhetorical filler)
  app.post('/api/ai/generate-story', async (req, res) => {
    try {
      const { movie } = req.body;
      if (!movie || !movie.title) {
        return res.status(400).json({ error: 'بيانات الفيلم وعنوانه مطلوبة.' });
      }

      const cleanTitle = String(movie.title)
        .replace(/\b(19\d\d|20\d\d)\b/g, '')
        .replace(/\[.*?\]|\(.*?\)/g, '')
        .trim() || movie.title;

      let generatedStory = '';
      let generatedRating: any = movie.classification || 'yellow';
      let generatedReason = movie.classificationReason || '';

      if (process.env.GEMINI_API_KEY) {
        const prompt = `اكتب قصة فيلم "${cleanTitle}" بوضوح تام وبدون اختصار، وبدون أي كلمات أو ديباجات إنشائية:
- تصنيف الفيلم: ${movie.category || 'عام'}
- بيانات مسبقة إن وُجدت: ${(movie.description || '').slice(0, 300) || 'لا يوجد'}

الشروط الإلزامية:
1. قصة الفيلم بوضوح تام وبسرد مباشر للأحداث والشخصيات والصراع الأساسي.
2. بدون اختصار مخل: سرد مفصل ومفهوم يوضح الحبكة دون حرق النهاية.
3. بدون أي كلمات أو عبارات إنشائية نهائياً.

أعد كائن JSON فقط بالصيغة:
{
  "story": "سرد قصة الفيلم بوضوح وتفصيل وافٍ دون اختصار ودون كلمات إنشائية",
  "classification": "green|yellow|orange|red|purple",
  "reason": "سبب تصنيف المحتوى الحميمي بجملة موجزة"
}`;

        for (const model of CANDIDATE_MODELS) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                systemInstruction: STORY_SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
              },
            });

            const responseText = response.text?.trim() || '{}';
            let parsed: any = {};
            try {
              parsed = JSON.parse(responseText);
            } catch {
              const match = responseText.match(/\{[\s\S]*\}/);
              if (match) parsed = JSON.parse(match[0]);
            }

            if (parsed && parsed.story && typeof parsed.story === 'string' && parsed.story.trim().length > 20) {
              generatedStory = parsed.story.trim();
              if (parsed.classification) generatedRating = normalizeRating(parsed.classification);
              if (parsed.reason) generatedReason = String(parsed.reason).trim();
              break;
            }
          } catch (modelErr: any) {
            console.warn(`[AI Story] Model ${model} failed:`, modelErr.message?.slice(0, 80));
          }
        }
      }

      if (!generatedStory) {
        const fallback = fallbackClassifyMovie(movie);
        generatedStory = fallback.storySummary;
        generatedRating = fallback.classification;
        generatedReason = fallback.reason;
      }

      return res.json({
        success: true,
        story: generatedStory,
        classification: generatedRating,
        reason: generatedReason,
      });
    } catch (err: any) {
      console.error('[API] Generate story error:', err);
      return res.status(500).json({ error: 'حدث خطأ أثناء توليد قصة الفيلم.' });
    }
  });

  // API endpoint for Gemini Movie Classification with automatic fallback & cascade
  app.post('/api/ai/classify-movies', async (req, res) => {
    try {
      const { movies } = req.body;
      if (!Array.isArray(movies) || movies.length === 0) {
        return res.status(400).json({ error: 'مصفوفة الأفلام مطلوبة (movies array is required).' });
      }

      // Limit to 60 items max per call for performance
      const moviesToProcess = movies.slice(0, 60);

      // System instruction for intimacy / parental rating + clear detailed story summary
      const systemInstruction = `أنت خبير ونقاد سينمائي متخصص في تقييم محتوى الأفلام وسرد قصصها بوضوح وموضوعية تامة.
مهمتك لكل فيلم:
1. تقييم درجة المحتوى الجنسي والعلاقات الجسدية الحميمية والجرأة، واختيار أحد التصنيفات الخمسة بدقة:
   - "green" (1/5 - نظيف / عائلي): خالٍ تماماً من المشاهد الجريئة أو التعري، مناسب للمشاهدة العائلية والعامة (G / PG).
   - "yellow" (2/5 - منخفض / خفيف): مشاهد رومانسية خفيفة وقبلات بريئة عادية دون أي تفاصيل حميمية جريئة (PG / mild PG-13).
   - "orange" (3/5 - متوسط): رومانسية معتدلة، قبلات حارة، إيحاءات أو مشاهد حميمية غير مفرطة (PG-13 / mild R).
   - "red" (4/5 - عالٍ / جريء): مشاهد جسدية صريحة، تعري جزئي أو كلي، جرأة جنسية واضحة وتصنيف للكبار (R / TV-MA / 18+).
   - "purple" (5/5 - عالٍ جداً / شديد الجرأة): محتوى إيروتيكي أو علاقات جسدية بالغة الجرأة، تعري مكثف أو تصنيف للكبار فقط (NC-17 / Unrated erotica).
2. كتابة سبب التقييم (reason) بجملة عربية موجزة ومباشرة تشرح سبب اختيار هذه الدرجة.
3. كتابة قصة الفيلم (storySummary) بوضوح تام، وسرد مباشر للأحداث والشخصيات والصراع الأساسي، مع الالتزام الحاسم:
   - بدون اختصار مخل: شرح واضح ومترابط للحبكة ومسار الأحداث دون حرق النهاية.
   - بدون أي كلمات إنشائية نهائياً: يُمنع منعاً باتاً دمج عبارات بلاغية مثل "في إطار درامي مشوق"، "تحفة سينمائية"، "رحلة لا تُنسى"، "يحبس الأنفاس"، "قالب من الإثارة". ابدأ فوراً بسرد وقائع القصة بوضوح تام.`;

      const allResults: Array<{ id: string; classification: 'green' | 'yellow' | 'orange' | 'red' | 'purple'; reason: string; storySummary: string }> = [];

      // Process in smaller chunks of 15 movies for optimal prompt adherence and detailed stories
      const CHUNK_SIZE = 15;
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
          const prompt = `قيم وصنف هذه الأفلام واكتب قصة كل فيلم بوضوح تام ودون اختصار ودون أي كلمات إنشائية:
${JSON.stringify(chunk, null, 2)}

أعد مصفوفة JSON فقط تحتوي على كائنات بها: { "id": "...", "classification": "green|yellow|orange|red|purple", "reason": "سبب التقييم بالعربية بوضوح", "storySummary": "قصة الفيلم بوضوح تام وسرد مباشر للأحداث والشخصيات دون اختصار مخل ودون أي كلمات أو ديباجات إنشائية" }`;

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

  // Dedicated API endpoint to fetch favorites data (fav.json)
  app.get('/api/get-fav-data', (_req, res) => {
    try {
      const publicDir = path.join(process.cwd(), 'public');
      const rootDir = process.cwd();

      const candidatePaths = [
        path.join(publicDir, 'fav.json'),
        path.join(rootDir, 'fav.json'),
        path.join(publicDir, 'Fav.json'),
        path.join(rootDir, 'Fav.json'),
      ];

      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          const content = JSON.parse(fs.readFileSync(p, 'utf-8'));
          return res.json(content);
        }
      }

      return res.status(404).json({ error: 'fav.json not found' });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Failed to read fav.json' });
    }
  });

  // Dedicated API endpoint to sync/update favorites data (fav.json)
  app.post('/api/update-fav-data', (req, res) => {
    try {
      const publicDir = path.join(process.cwd(), 'public');
      const rootDir = process.cwd();
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }

      const favData = req.body;
      const targetPath = path.join(publicDir, 'fav.json');
      const rootTargetPath = path.join(rootDir, 'fav.json');

      const jsonStr = JSON.stringify(favData, null, 2);
      fs.writeFileSync(targetPath, jsonStr, 'utf-8');
      fs.writeFileSync(rootTargetPath, jsonStr, 'utf-8');

      const count =
        favData.allFavorites?.totalFavoritesCount ||
        favData.allFavorites?.movies?.length ||
        favData.movieIds?.length ||
        0;

      console.log(`[API] Saved fav.json (${count} favorites) to public/fav.json`);
      return res.json({ success: true, count, path: '/fav.json' });
    } catch (err: any) {
      console.error('[API] Error saving fav.json:', err);
      return res.status(500).json({ error: err?.message || 'Failed to write fav.json' });
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

  // ==========================================
  // Video Stream Extractor & Cinema Screen API
  // ==========================================
  function vtgDecodeUrl(v: string): string {
    if (!v || typeof v !== 'string' || !v.startsWith('v1:')) return v;
    try {
      const b = Buffer.from(v.slice(3), 'base64').toString('binary');
      const k = 'vTg2026#kx';
      let o = '';
      for (let i = 0; i < b.length; i++) {
        o += String.fromCharCode(b.charCodeAt(i) ^ k.charCodeAt(i % k.length));
      }
      return decodeURIComponent(escape(o));
    } catch {
      return v;
    }
  }

  function detectQuality(str: string): string {
    if (/4k|2160p/i.test(str)) return '4K Ultra HD';
    if (/1080p|fhd/i.test(str)) return '1080p FHD';
    if (/720p|hd/i.test(str)) return '720p HD';
    if (/480p|sd/i.test(str)) return '480p SD';
    if (/360p/i.test(str)) return '360p';
    if (/cam|camrip/i.test(str)) return 'CAMRip';
    return 'HD عالية';
  }

  function detectStreamType(url: string): 'hls' | 'mp4' | 'embed' {
    if (/\.m3u8($|\?)/i.test(url)) return 'hls';
    if (/\.mp4($|\?)/i.test(url)) return 'mp4';
    return 'embed';
  }

  async function quickResolveStream(embedUrl: string): Promise<{ directUrl: string; type: 'hls' | 'mp4' } | null> {
    try {
      if (/\.(m3u8|mp4)($|\?)/i.test(embedUrl)) {
        return { directUrl: embedUrl, type: embedUrl.includes('.m3u8') ? 'hls' : 'mp4' };
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': embedUrl,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();

      let videoMatch = text.match(/https?:\/\/[^\s"']+\.(?:m3u8|mp4)[^\s"']*/i);

      if (!videoMatch) {
        const pMatch = text.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/);
        if (pMatch) {
          try {
            const unpacked = eval('(' + pMatch[0].replace('eval(', '(') + ')');
            videoMatch = unpacked.match(/https?:\/\/[^\s"']+\.(?:m3u8|mp4)[^\s"']*/i);
          } catch {}
        }
      }

      if (videoMatch) {
        const directUrl = videoMatch[0];
        return {
          directUrl,
          type: directUrl.includes('.m3u8') ? 'hls' : 'mp4',
        };
      }
    } catch {}
    return null;
  }

  // API to extract streaming links and qualities from a movie page URL
  app.post('/api/extract-video', async (req, res) => {
    try {
      const { url, title } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'الرجاء إدخال رابط الفيلم أو الصفحة.' });
      }

      const cleanUrl = url.trim();
      const fetchUrl = cleanUrl.split('#')[0]; // strip hash for fetching

      console.log(`[Video Extractor] Fetching page: ${cleanUrl}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).json({
          error: `فشل الاتصال بصفحة الفيلم (${response.status} ${response.statusText})`,
        });
      }

      const html = await response.text();

      // Page Title extraction
      let pageTitle = title || '';
      if (!pageTitle) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          pageTitle = titleMatch[1].replace(/&#[0-9]+;/g, ' ').replace(/- (مشاهدة|افلام|ايجي بست|ماي سيما).*/i, '').trim();
        }
      }

      // Poster extraction
      let poster = '';
      const posterMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                          html.match(/<img[^>]+class=["'][^"']*(?:poster|thumb|attachment)[^"']*["'][^>]+src=["']([^"']+)["']/i);
      if (posterMatch) {
        poster = posterMatch[1];
      }

      const rawStreams: Array<{
        server: string;
        url: string;
        quality: string;
        type: 'hls' | 'mp4' | 'embed';
        directUrl?: string;
      }> = [];

      const seenUrls = new Set<string>();

      // 1. Check aflam18 / VTG (Video Tabs Generator) tabs
      const vtgTabs = [...html.matchAll(/<li[^>]*class=["'][^"']*vtg-tab[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)];
      for (const tab of vtgTabs) {
        const serverName = tab[1].replace(/<[^>]+>/g, '').trim() || 'سيرفر مشاهدة';
        const dataUrlMatch = tab[1].match(/data-video-url=["']([^"']+)["']/i);
        if (dataUrlMatch) {
          const rawUrl = dataUrlMatch[1];
          const decoded = vtgDecodeUrl(rawUrl);
          if (decoded && !seenUrls.has(decoded)) {
            seenUrls.add(decoded);
            rawStreams.push({
              server: serverName,
              url: decoded,
              quality: detectQuality(serverName + ' ' + decoded),
              type: detectStreamType(decoded),
            });
          }
        }
      }

      // Also check VTG JSON array if present
      const vtgScriptMatch = html.match(/<script[^>]+class=["']vtg-video-urls["'][^>]*>([\s\S]*?)<\/script>/i);
      if (vtgScriptMatch) {
        try {
          const vtgList = JSON.parse(vtgScriptMatch[1]);
          if (Array.isArray(vtgList)) {
            vtgList.forEach((rawItem: string, idx: number) => {
              const dec = vtgDecodeUrl(rawItem);
              if (dec && !seenUrls.has(dec)) {
                seenUrls.add(dec);
                rawStreams.push({
                  server: `سيرفر بديل ${idx + 1}`,
                  url: dec,
                  quality: detectQuality(dec),
                  type: detectStreamType(dec),
                });
              }
            });
          }
        } catch {}
      }

      // 2. Check aflamicose / player-box / servers
      const serverBtns = [...html.matchAll(/<button[^>]+class=["'][^"']*server-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi)];
      for (const btn of serverBtns) {
        const fullTag = btn[0];
        const urlMatch = fullTag.match(/data-url=["']([^"']+)["']/i);
        const nameMatch = fullTag.match(/data-name=["']([^"']+)["']/i) || fullTag.match(/<span>([^<]+)<\/span>/i);
        const qualityMatch = fullTag.match(/<small>([^<]+)<\/small>/i);

        if (urlMatch) {
          const streamUrl = urlMatch[1];
          if (streamUrl && !seenUrls.has(streamUrl)) {
            seenUrls.add(streamUrl);
            const serverName = (nameMatch ? nameMatch[1].trim() : 'سيرفر مشاهدة') || 'سيرفر مشاهدة';
            const quality = qualityMatch ? qualityMatch[1].trim() : detectQuality(streamUrl);
            rawStreams.push({
              server: serverName,
              url: streamUrl,
              quality: quality || 'HD',
              type: detectStreamType(streamUrl),
            });
          }
        }
      }

      // 3. DooPlay and standard WordPress movie themes
      const dooplayTabs = [...html.matchAll(/<li[^>]+id=["']player-option-[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)];
      for (const li of dooplayTabs) {
        const fullTag = li[0];
        const titleMatch = fullTag.match(/<span[^>]*class=["']title["'][^>]*>([^<]+)<\/span>/i);
        const serverName = titleMatch ? titleMatch[1].trim() : 'سيرفر مشاهدة';
        const postMatch = fullTag.match(/data-post=["']([^"']+)["']/i);
        const numeMatch = fullTag.match(/data-nume=["']([^"']+)["']/i);
        const typeMatch = fullTag.match(/data-type=["']([^"']+)["']/i);

        // If direct data-src is present
        const srcMatch = fullTag.match(/data-src=["']([^"']+)["']/i);
        if (srcMatch && !seenUrls.has(srcMatch[1])) {
          seenUrls.add(srcMatch[1]);
          rawStreams.push({
            server: serverName,
            url: srcMatch[1],
            quality: detectQuality(serverName + ' ' + srcMatch[1]),
            type: detectStreamType(srcMatch[1]),
          });
        }
      }

      // 4. Check all elements with data-url, data-src, data-player, data-stream, data-embed
      const generalDataElements = [...html.matchAll(/<(?:a|button|div|li|span)[^>]+(data-(?:url|src|video-url|stream|embed|player))=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:a|button|div|li|span)>/gi)];
      for (const el of generalDataElements) {
        const attrVal = el[2];
        const decoded = vtgDecodeUrl(attrVal);
        if (
          decoded &&
          !seenUrls.has(decoded) &&
          !decoded.includes('.css') &&
          !decoded.includes('.js') &&
          !decoded.startsWith('#') &&
          (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('//'))
        ) {
          const finalUrl = decoded.startsWith('//') ? 'https:' + decoded : decoded;
          seenUrls.add(finalUrl);
          const rawText = el[3].replace(/<[^>]+>/g, '').trim();
          const serverName = rawText && rawText.length < 35 ? rawText : 'سيرفر بث خارجي';
          rawStreams.push({
            server: serverName,
            url: finalUrl,
            quality: detectQuality(serverName + ' ' + finalUrl),
            type: detectStreamType(finalUrl),
          });
        }
      }

      // 5. Check iframe embeds directly on page
      const iframes = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi)];
      for (const ifr of iframes) {
        const src = ifr[1];
        if (
          src &&
          !src.includes('google') &&
          !src.includes('facebook') &&
          !src.includes('analytics') &&
          !src.includes('doubleclick') &&
          !src.includes('twitter') &&
          !seenUrls.has(src)
        ) {
          seenUrls.add(src);
          rawStreams.push({
            server: 'مشغل مباشر (Iframe)',
            url: src,
            quality: 'تلقائي',
            type: 'embed',
          });
        }
      }

      // 6. Direct video or source tags
      const videoTags = [...html.matchAll(/<(?:video|source)[^>]+src=["']([^"']+)["'][^>]*>/gi)];
      for (const vTag of videoTags) {
        const vSrc = vTag[1];
        if (vSrc && !seenUrls.has(vSrc)) {
          seenUrls.add(vSrc);
          rawStreams.push({
            server: 'ملف فيديو مباشر',
            url: vSrc,
            quality: detectQuality(vSrc),
            type: vSrc.includes('.m3u8') ? 'hls' : 'mp4',
            directUrl: vSrc,
          });
        }
      }

      // If no servers found yet, check if the input URL itself is a video or embed
      if (rawStreams.length === 0) {
        if (/\.(m3u8|mp4)($|\?)/i.test(cleanUrl)) {
          rawStreams.push({
            server: 'ملف الفيديو المباشر',
            url: cleanUrl,
            quality: detectQuality(cleanUrl),
            type: cleanUrl.includes('.m3u8') ? 'hls' : 'mp4',
            directUrl: cleanUrl,
          });
        } else {
          // Check common embed patterns (e.g. /e/, /embed, /v/)
          rawStreams.push({
            server: 'رابط المشاهدة المكتشف',
            url: cleanUrl,
            quality: detectQuality(cleanUrl),
            type: 'embed',
          });
        }
      }

      // Attempt parallel resolution of direct streams for each embed server (up to 6)
      const resolvedStreams = await Promise.all(
        rawStreams.slice(0, 10).map(async (st, index) => {
          const streamId = `stream-${index + 1}-${Date.now()}`;
          if (st.directUrl) {
            return {
              id: streamId,
              ...st,
            };
          }

          const resStream = await quickResolveStream(st.url);
          if (resStream) {
            return {
              id: streamId,
              ...st,
              directUrl: resStream.directUrl,
              type: resStream.type,
            };
          }

          return {
            id: streamId,
            ...st,
          };
        })
      );

      console.log(`[Video Extractor] Successfully extracted ${resolvedStreams.length} stream(s) for "${pageTitle}"`);

      return res.json({
        success: true,
        title: pageTitle,
        poster,
        originalUrl: cleanUrl,
        serversCount: resolvedStreams.length,
        streams: resolvedStreams,
      });
    } catch (err: any) {
      console.error('[Video Extractor] Error:', err);
      return res.status(500).json({
        error: err?.message || 'حدث خطأ أثناء فحص واستخراج روابط الفيديو من الصفحة.',
      });
    }
  });

  // Streaming proxy endpoint for CORS restricted streams (HLS / m3u8 / mp4)
  app.get('/api/stream-proxy', async (req, res) => {
    try {
      const streamUrl = req.query.url as string;
      if (!streamUrl) {
        return res.status(400).send('Missing stream URL');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(streamUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': streamUrl,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

      if (response.headers.get('content-type')) {
        res.setHeader('Content-Type', response.headers.get('content-type')!);
      }
      if (response.headers.get('content-length')) {
        res.setHeader('Content-Length', response.headers.get('content-length')!);
      }

      if (response.body) {
        // @ts-ignore
        const nodeReadable = response.body;
        // Pipe web stream to express response
        const reader = nodeReadable.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        await pump();
      } else {
        res.end();
      }
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(502).send(`Proxy streaming error: ${err?.message}`);
      }
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
