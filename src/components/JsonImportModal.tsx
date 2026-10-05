import React, { useState, useMemo } from 'react';
import { Folder, MovieItem, FavoriteList, FavoriteColor } from '../types';
import {
  parseAndValidateFullAppData,
  getFolderTextColor,
  prepareAppDataChunks,
  downloadChunkFile,
  downloadAllChunkFiles,
  CHUNK_SIZE,
  AppDataChunk,
} from '../utils/storage';
import {
  X,
  Upload,
  FileJson,
  CheckCircle2,
  AlertCircle,
  FolderPlus,
  Film,
  Download,
  ArrowRight,
  Database,
  Layers,
  Files,
  Zap,
} from 'lucide-react';

interface JsonImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  movies: MovieItem[];
  activeFolderId: string | null;
  onImportMovies: (movies: Partial<MovieItem>[], targetFolderId: string) => void;
  onCreateFolderAndImport: (folderName: string, folderColor: string, movies: Partial<MovieItem>[]) => void;
  onImportFullAppData: (
    folders: Folder[],
    movies: MovieItem[],
    favoriteLists?: FavoriteList[],
    hiddenFavoriteSections?: FavoriteColor[]
  ) => void;
  onExportFullAppData: (targetChunkIndex?: number) => void;
}

interface ParsedMoviePreview {
  title: string;
  url: string;
  posterUrl: string;
  category: string;
}

export const JsonImportModal: React.FC<JsonImportModalProps> = ({
  isOpen,
  onClose,
  folders,
  movies,
  activeFolderId,
  onImportMovies,
  onCreateFolderAndImport,
  onImportFullAppData,
  onExportFullAppData,
}) => {
  const [activeTab, setActiveTab] = useState<'full' | 'feed'>('full');

  // Full backup state
  const [fullJsonText, setFullJsonText] = useState('');
  const [fullParseError, setFullParseError] = useState<string | null>(null);
  const [parsedFullData, setParsedFullData] = useState<{ folders: Folder[]; movies: MovieItem[]; favoriteLists?: FavoriteList[] } | null>(null);

  // Feed items state
  const [rawJsonText, setRawJsonText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedMoviePreview[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importTargetMode, setImportTargetMode] = useState<'existing' | 'new'>('new');
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    activeFolderId || (folders.length > 0 ? folders[0].id : '')
  );
  const [newFolderName, setNewFolderName] = useState('مستودع مستورد جديد');
  const [newFolderColor, setNewFolderNameColor] = useState('#8E24AA');
  const [isDragOver, setIsDragOver] = useState(false);
  const [multiFileSummary, setMultiFileSummary] = useState<string | null>(null);

  // Compute multi-chunk data: up to 2000 items per file
  const chunks = useMemo(() => {
    return prepareAppDataChunks(folders, movies);
  }, [folders, movies]);

  if (!isOpen) return null;

  // Validate Full App Backup JSON
  const handleProcessFullJson = (jsonString: string) => {
    setFullJsonText(jsonString);
    setMultiFileSummary(null);
    if (!jsonString.trim()) {
      setParsedFullData(null);
      setFullParseError(null);
      return;
    }
    try {
      const result = parseAndValidateFullAppData(jsonString);
      setParsedFullData(result);
      setFullParseError(null);
    } catch (e: any) {
      setFullParseError(e.message || 'صيغة JSON غير صحيحة.');
      setParsedFullData(null);
    }
  };

  // Support reading multiple chunk files simultaneously (e.g. initialData.json + initialData2.json)
  const handleMultipleFullFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    if (fileArray.length === 1 && activeTab === 'feed') {
      handleFullFileUpload(fileArray[0]);
      return;
    }

    try {
      const readPromises = fileArray.map(
        (f) =>
          new Promise<{ name: string; content: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve({ name: f.name, content: (e.target?.result as string) || '' });
            reader.onerror = reject;
            reader.readAsText(f);
          })
      );

      const loadedFiles = await Promise.all(readPromises);

      let mergedMovies: MovieItem[] = [];
      let mergedFolders: Folder[] = [];
      let mergedFavLists: FavoriteList[] = [];
      const seenMovieIds = new Set<string>();
      const seenFolderIds = new Set<string>();
      const seenFavIds = new Set<string>();

      for (const fileObj of loadedFiles) {
        if (!fileObj.content.trim()) continue;
        const parsed = parseAndValidateFullAppData(fileObj.content);

        for (const m of parsed.movies) {
          if (m && m.id && !seenMovieIds.has(m.id)) {
            seenMovieIds.add(m.id);
            mergedMovies.push(m);
          }
        }

        for (const f of parsed.folders) {
          if (f && f.id && !seenFolderIds.has(f.id)) {
            seenFolderIds.add(f.id);
            mergedFolders.push(f);
          }
        }

        if (parsed.favoriteLists) {
          for (const l of parsed.favoriteLists) {
            if (l && l.id && !seenFavIds.has(l.id)) {
              seenFavIds.add(l.id);
              mergedFavLists.push(l);
            }
          }
        }
      }

      if (mergedMovies.length === 0 && mergedFolders.length === 0) {
        setFullParseError('الملفات المحددة لا تحتوي على بيانات مجلدات أو أفلام صالحة.');
        setParsedFullData(null);
        setMultiFileSummary(null);
        return;
      }

      setParsedFullData({
        folders: mergedFolders,
        movies: mergedMovies,
        favoriteLists: mergedFavLists,
      });
      setFullParseError(null);
      setMultiFileSummary(
        `تم فحص ودمج ${loadedFiles.length} ملفات بنجاح (${loadedFiles.map((f) => f.name).join(' + ')}) بإجمالي ${mergedMovies.length} عنصر و ${mergedFolders.length} مستودع جاهزة للتطبيق!`
      );
    } catch (err: any) {
      setFullParseError(`خطأ أثناء معالجة الملفات: ${err?.message || err}`);
      setParsedFullData(null);
      setMultiFileSummary(null);
    }
  };

  const handleFullFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        if (activeTab === 'full') {
          handleProcessFullJson(content);
        } else {
          processAndValidateFeedJson(content);
        }
      }
    };
    reader.readAsText(file);
  };

  // Smart Parser for Feed JSON format
  const processAndValidateFeedJson = (jsonString: string) => {
    setRawJsonText(jsonString);
    if (!jsonString.trim()) {
      setParsedItems([]);
      setParseError(null);
      return;
    }

    try {
      const parsed = JSON.parse(jsonString);
      let itemsArray: any[] = [];

      if (Array.isArray(parsed)) {
        itemsArray = parsed;
      } else if (typeof parsed === 'object' && parsed !== null) {
        const possibleArray = Object.values(parsed).find((val) => Array.isArray(val));
        if (Array.isArray(possibleArray)) {
          itemsArray = possibleArray;
        } else {
          itemsArray = [parsed];
        }
      }

      if (itemsArray.length === 0) {
        setParseError('نص الـ JSON لا يحتوي على مصفوفة عناصر أفلام صالحة.');
        setParsedItems([]);
        return;
      }

      const mapped: ParsedMoviePreview[] = itemsArray
        .map((item: any) => {
          const title =
            item.title ||
            item.movies_name ||
            item.series_name ||
            item.name ||
            'عنوان غير معروف';

          const url =
            item.link ||
            item.movies_href ||
            item.series_href ||
            item.url ||
            item.embedUrl ||
            '';

          const posterUrl =
            item.image ||
            item.imageUrl ||
            item.movies_img ||
            item.series_img ||
            item.posterUrl ||
            '';

          const category =
            item.type ||
            (item.series_name || item.series_href ? 'مسلسل' : 'فيلم');

          return { title, url, posterUrl, category };
        })
        .filter((item) => item.title && (item.url || item.posterUrl));

      if (mapped.length === 0) {
        setParseError('تعذر العثور على عناصر تحتوي على عناوين وروابط وصور صالحة.');
        setParsedItems([]);
      } else {
        setParseError(null);
        setParsedItems(mapped);
      }
    } catch (e: any) {
      setParseError(`خطأ في معالجة الـ JSON: ${e.message}`);
      setParsedItems([]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (activeTab === 'full') {
        handleMultipleFullFiles(e.dataTransfer.files);
      } else {
        handleFullFileUpload(e.dataTransfer.files[0]);
      }
    }
  };

  const handleFeedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedItems.length === 0) return;

    const movieItems: Partial<MovieItem>[] = parsedItems.map((item) => ({
      title: item.title,
      url: item.url,
      embedUrl: item.url,
      posterUrl: item.posterUrl,
      category: item.category || 'عام',
      description: '',
      useDirectPlayer: true,
      addedAt: new Date().toISOString(),
      isFavorite: false,
      isBroken: false,
      isHidden: false,
    }));

    if (importTargetMode === 'new') {
      onCreateFolderAndImport(
        newFolderName.trim() || 'مستودع مستورد جديد',
        newFolderColor,
        movieItems
      );
    } else {
      if (!selectedFolderId) return;
      onImportMovies(movieItems, selectedFolderId);
    }

    onClose();
  };

  const handleFullImportSubmit = () => {
    if (!parsedFullData) return;
    if (window.confirm('هل أنت متأكد من استيراد هذه البيانات الكاملة؟ سيتم تحديث المستودعات والأفلام الحالية.')) {
      onImportFullAppData(
        parsedFullData.folders,
        parsedFullData.movies,
        parsedFullData.favoriteLists,
        parsedFullData.hiddenFavoriteSections
      );
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/80 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
              <FileJson className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">إدارة واستيراد بيانات التطبيق بصيغة JSON</h3>
              <p className="text-xs text-slate-400">
                تصدير واستيراد النسخة الاحتياطية الكاملة للتطبيق أو تغذية المستودعات
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 p-2 gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('full')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
              activeTab === 'full'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>استيراد / تصدير البيانات الكاملة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('feed')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
              activeTab === 'feed'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>استيراد قائمة أفلام لمستودع</span>
          </button>
        </div>

        {/* Tab 1: Full Backup Export & Import */}
        {activeTab === 'full' && (
          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            {/* Multi-Chunk Export Box (2000 items per file) */}
            <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3.5 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-800/80 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>تصدير نسخة احتياطية ذكية (Multi-Chunk Auto-Seeding)</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-mono font-bold border border-emerald-500/30">
                      {chunks.length} {chunks.length > 1 ? 'ملفات' : 'ملف'} ({movies.length} عنصر)
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    يتم تقسيم البيانات تلقائياً على ملفات كل منها حتى <strong>2000 عنصر</strong>. تم تخصيص الملف الثاني (<code className="text-amber-300 font-mono bg-slate-900 px-1 py-0.5 rounded text-[11px]">initialData2.json</code>) للمحتوى الحديث والجديد لتفادي إعادة نسخ كلا الملفين في كل مرة!
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  {chunks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onExportFullAppData(2)}
                      title="تحميل الملف الثاني فقط الذي يحتوي على الإضافات الحديثة والجديدة"
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>تحميل initialData2.json (الجديد فقط)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onExportFullAppData()}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{chunks.length > 1 ? `تحميل كافة الملفات معاً (${chunks.length})` : 'تصدير initialData.json'}</span>
                  </button>
                </div>
              </div>

              {/* Chunks Cards List */}
              {chunks.length > 1 && (
                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                    <span>قائمة ملفات البيانات المجهزة للوضع في مجلد public:</span>
                    <span className="text-slate-500 text-[10px]">الحد الأقصى لكل ملف: 2000 عنصر</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {chunks.map((chunk) => (
                      <div
                        key={chunk.fileName}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                          chunk.chunkIndex === 2
                            ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                            : chunk.chunkIndex === 1
                            ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                            : 'bg-slate-900 border-slate-700/70 text-slate-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-white truncate">{chunk.fileName}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                                chunk.chunkIndex === 2
                                  ? 'bg-amber-500/30 text-amber-300'
                                  : chunk.chunkIndex === 1
                                  ? 'bg-emerald-500/30 text-emerald-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {chunk.chunkIndex === 1 ? 'أساسية' : chunk.chunkIndex === 2 ? 'حديثة وجديدة' : `دفعة ${chunk.chunkIndex}`}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>العناصر: {chunk.startItemIndex} - {chunk.endItemIndex}</span>
                            <span>•</span>
                            <span className="font-mono text-slate-300">{chunk.totalItemsCount} عنصر</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => downloadChunkFile(chunk)}
                          className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer flex-shrink-0 active:scale-95 ${
                            chunk.chunkIndex === 2
                              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-white'
                          }`}
                          title={`تحميل ملف ${chunk.fileName}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="text-[11px]">تحميل</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Import Full App Data Section */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-2 flex items-center justify-between">
                <span>استيراد ملفات بيانات التطبيق (.json)</span>
                <span className="text-slate-400 text-[11px] font-normal">يمكنك تحديد ملف واحد أو سحب عدة ملفات معاً</span>
              </label>

              {/* Drag & Drop Box with Multi-file support */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all ${
                  isDragOver
                    ? 'border-purple-500 bg-purple-500/10 scale-[1.01]'
                    : 'border-slate-700 bg-slate-950/60 hover:border-slate-600'
                }`}
              >
                <Upload className="w-8 h-8 text-purple-400 mx-auto mb-2 animate-bounce" />
                <p className="text-xs font-semibold text-white">
                  اسحب ملف (أو ملفات) النسخة الاحتياطية هنا (مثل initialData.json و initialData2.json)، أو{' '}
                  <label className="text-purple-400 hover:underline cursor-pointer">
                    تصفح الملفات
                    <input
                      type="file"
                      multiple
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleMultipleFullFiles(e.target.files);
                        }
                      }}
                    />
                  </label>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  يدعم الاستيراد المدمج التلقائي لعدة أجزاء ومطابقتها دون تكرار
                </p>
              </div>
            </div>

            {/* Paste Raw Full JSON */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-300">
                  أو ألصق نص كود الـ JSON الكامل هنا:
                </span>
                {fullJsonText && (
                  <button
                    type="button"
                    onClick={() => handleProcessFullJson('')}
                    className="text-[11px] text-slate-400 hover:text-white"
                  >
                    مسح النص
                  </button>
                )}
              </div>
              <textarea
                rows={4}
                value={fullJsonText}
                onChange={(e) => handleProcessFullJson(e.target.value)}
                placeholder='{ "folders": [...], "movies": [...] }'
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 leading-relaxed"
              />
            </div>

            {/* Parse Error or Success Notice */}
            {fullParseError && (
              <div className="flex items-start space-x-2 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <span>{fullParseError}</span>
              </div>
            )}

            {parsedFullData && (
              <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs space-y-1">
                <div className="flex items-center space-x-2 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>تم فحص وتحليل ملفات البيانات بنجاح! جاهزة للاستيراد الكامل:</span>
                </div>
                {multiFileSummary && (
                  <p className="text-[11px] text-emerald-300 font-semibold pr-6">
                    {multiFileSummary}
                  </p>
                )}
                <div className="text-[11px] text-emerald-200 pr-6 space-y-0.5">
                  <p>• إجمالي المستودعات/المجلدات: {parsedFullData.folders.length}</p>
                  <p>• إجمالي عناصر الأفلام والمسلسلات: {parsedFullData.movies.length}</p>
                  {parsedFullData.movies.some((m) => m.isFavorite) && (
                    <p>
                      • عناصر المفضلة: {parsedFullData.movies.filter((m) => m.isFavorite).length} (
                      أخضر: {parsedFullData.movies.filter((m) => m.favoriteColor === 'green').length} | 
                      أصفر: {parsedFullData.movies.filter((m) => m.favoriteColor === 'yellow' || (!m.favoriteColor && m.isFavorite)).length} | 
                      بنفسجي: {parsedFullData.movies.filter((m) => m.favoriteColor === 'purple').length} | 
                      أسود: {parsedFullData.movies.filter((m) => m.favoriteColor === 'black').length}
                      )
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Movie Feed Items Import */}
        {activeTab === 'feed' && (
          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            {/* Drag & Drop Section */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                1. رفع ملف JSON يحتوي على عناصر أفلام أو مسلسلات
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all ${
                  isDragOver
                    ? 'border-purple-500 bg-purple-500/10 scale-[1.01]'
                    : 'border-slate-700 bg-slate-950/60 hover:border-slate-600'
                }`}
              >
                <Upload className="w-8 h-8 text-purple-400 mx-auto mb-2 animate-bounce" />
                <p className="text-xs font-semibold text-white">
                  اسحب الملف هنا، أو{' '}
                  <label className="text-purple-400 hover:underline cursor-pointer">
                    اختر ملف
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFullFileUpload(e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  يدعم الصيغ القياسية ومصفوفات العناوين (title, link, image, movies_name...)
                </p>
              </div>
            </div>

            {/* Raw JSON Code Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-300">
                  أو ألصق مصفوفة الـ JSON هنا:
                </span>
                {rawJsonText && (
                  <button
                    type="button"
                    onClick={() => processAndValidateFeedJson('')}
                    className="text-[11px] text-slate-400 hover:text-white"
                  >
                    مسح النص
                  </button>
                )}
              </div>
              <textarea
                rows={4}
                value={rawJsonText}
                onChange={(e) => processAndValidateFeedJson(e.target.value)}
                placeholder='[ { "title": "اسم الفيلم 2026", "link": "https://...", "image": "https://..." } ]'
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 leading-relaxed"
              />
            </div>

            {/* Feed Validation Feedback */}
            {parseError && (
              <div className="flex items-start space-x-2 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}

            {parsedItems.length > 0 && (
              <div className="flex items-center space-x-2 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="font-semibold">
                  تم تحليل {parsedItems.length} عنصر بنجاح وجاهزة للإضافة!
                </span>
              </div>
            )}

            {/* Target Folder Configuration */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                2. اختيار المستودع المستهدف
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setImportTargetMode('new')}
                  className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all flex items-center space-x-2 ${
                    importTargetMode === 'new'
                      ? 'bg-purple-600/20 border-purple-500 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FolderPlus className="w-4 h-4 text-purple-400" />
                  <span>إنشاء مستودع/مجلد جديد لهذه القائمة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setImportTargetMode('existing')}
                  className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all flex items-center space-x-2 ${
                    importTargetMode === 'existing'
                      ? 'bg-purple-600/20 border-purple-500 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Film className="w-4 h-4 text-sky-400" />
                  <span>إضافة إلى مستودع حالي</span>
                </button>
              </div>

              {importTargetMode === 'new' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      اسم المستودع الجديد
                    </label>
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="اسم المجلد"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      لون التمييز
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={newFolderColor}
                        onChange={(e) => setNewFolderNameColor(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs text-slate-300 font-mono">
                        {newFolderColor}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    اختر المجلد المستهدف
                  </label>
                  <select
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    {folders.map((f) => {
                      const textColor = getFolderTextColor(f.name);
                      return (
                        <option
                          key={f.id}
                          value={f.id}
                          style={{ color: textColor || '#ffffff' }}
                          className="bg-slate-900 font-bold"
                        >
                          {f.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            {/* Parsed Items Preview List */}
            {parsedItems.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    معاينة العناصر ({parsedItems.length})
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950 divide-y divide-slate-800/60 p-1">
                  {parsedItems.map((item, index) => (
                    <div
                      key={index}
                      className="p-2 flex items-center space-x-3 text-xs hover:bg-slate-900/60 transition-colors"
                    >
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt=""
                          className="w-8 h-12 object-cover rounded bg-slate-900 flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-8 h-12 rounded bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-600">
                          <Film className="w-4 h-4" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-white truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {item.url || 'بدون رابط مباشر'}
                        </p>
                      </div>

                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex-shrink-0">
                        {item.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-slate-400">
            {activeTab === 'full'
              ? parsedFullData
                ? `جاهز لاستيراد ${parsedFullData.folders.length} مجلد و ${parsedFullData.movies.length} عنصر`
                : 'في انتظار تحديد ملف أو إلصاق الكود'
              : parsedItems.length > 0
              ? `${parsedItems.length} عنصر جاهز`
              : 'لم يتم تحميل عناصر بعد'}
          </span>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              إلغاء
            </button>

            {activeTab === 'full' ? (
              <button
                type="button"
                disabled={!parsedFullData}
                onClick={handleFullImportSubmit}
                className={`flex items-center space-x-1.5 px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all ${
                  parsedFullData
                    ? 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                <span>استيراد واستبدال البيانات بالكامل</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={parsedItems.length === 0}
                onClick={handleFeedSubmit}
                className={`flex items-center space-x-1.5 px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all ${
                  parsedItems.length > 0
                    ? 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                <span>إضافة {parsedItems.length} عنصر لمستودع</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
