import React, { useState, useEffect, useMemo } from 'react';
import {
  Folder,
  MovieItem,
  SortOption,
  ALL_FAVORITES_FOLDER_ID,
  ALL_FAVORITES_FOLDER,
  ClassificationRating,
  FavoriteColor,
  FAVORITE_SECTIONS,
} from '../types';
import { MovieCard } from './MovieCard';
import { Pagination } from './Pagination';
import { sortMovies, getFolderTextColor } from '../utils/storage';
import { classifyMoviesWithGemini } from '../utils/aiClassification';
import { CLASSIFICATION_OPTIONS } from '../utils/classificationUtils';
import { ReorderItemModal } from './ReorderItemModal';
import {
  Search,
  SlidersHorizontal,
  RefreshCw,
  Film,
  Plus,
  Star,
  FolderOpen,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Globe,
  Link as LinkIcon,
  Check,
  Settings,
  X,
  ExternalLink,
  Sparkles,
  Bot,
  Loader2,
  AlertCircle,
  CheckSquare,
  Square,
  Layers,
  CheckCircle2,
} from 'lucide-react';

interface MovieGridProps {
  currentFolder: Folder | null;
  folders?: Folder[];
  onSelectFolder?: (folderId: string) => void;
  onUpdateFolder?: (folderData: Partial<Folder>) => void;
  movies: MovieItem[];
  onOpenMovie: (movie: MovieItem) => void;
  onToggleFavorite: (id: string, color?: FavoriteColor | null) => void;
  onToggleBroken: (id: string) => void;
  onToggleHide: (id: string) => void;
  onEditMovie: (movie: MovieItem) => void;
  onDeleteMovie: (id: string) => void;
  onAddMovie: () => void;
  onDropLink?: (url: string) => void;
  onRefreshData: () => void;
  isRefreshing: boolean;
  onCopyMovieToFolder?: (movie: MovieItem, targetFolderNameOrId: string) => void;
  onOpenFavoritesModal?: () => void;
  favoritesCount?: number;
  hiddenFavoriteSections?: FavoriteColor[];
  onToggleHideFavoriteSection?: (sectionId: FavoriteColor) => void;
  onUpdateClassification?: (
    movieId: string,
    rating: ClassificationRating,
    reason?: string,
    storySummary?: string
  ) => void;
  onBatchUpdateClassification?: (
    updates: Array<{ id: string; classification: ClassificationRating; reason?: string; storySummary?: string }>
  ) => void;
  onBulkAddToFavorite?: (movieIds: string[], color: FavoriteColor) => void;
  onReorderFavoriteMovie?: (movieId: string, newPosition: number, targetSection?: FavoriteColor | 'all') => void;
}

export const MovieGrid: React.FC<MovieGridProps> = ({
  currentFolder,
  folders = [],
  onSelectFolder,
  onUpdateFolder,
  movies,
  onOpenMovie,
  onToggleFavorite,
  onBulkAddToFavorite,
  onToggleBroken,
  onToggleHide,
  onEditMovie,
  onDeleteMovie,
  onAddMovie,
  onDropLink,
  onRefreshData,
  isRefreshing,
  onCopyMovieToFolder,
  onOpenFavoritesModal,
  favoritesCount,
  hiddenFavoriteSections = [],
  onToggleHideFavoriteSection,
  onUpdateClassification,
  onBatchUpdateClassification,
  onReorderFavoriteMovie,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'folder' | 'all'>('folder');
  const [activeSort, setActiveSort] = useState<SortOption | null>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selectedFavoriteSubFilter, setSelectedFavoriteSubFilter] = useState<'all' | FavoriteColor>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [reorderTarget, setReorderTarget] = useState<{
    movie: MovieItem;
    currentIndex: number;
  } | null>(null);

  // AI Classification states
  const [isAiClassifying, setIsAiClassifying] = useState(false);
  const [aiResultSummary, setAiResultSummary] = useState<{
    message: string;
    total: number;
    counts: Record<string, number>;
    pageMovieIds: string[];
    results: Array<{ id: string; classification: ClassificationRating; reason?: string }>;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Bulk add to favorites from AI classification states
  const [selectedClassificationForFav, setSelectedClassificationForFav] = useState<ClassificationRating | 'all'>('green');
  const [targetFavoriteSection, setTargetFavoriteSection] = useState<FavoriteColor>('green');
  const [bulkFavSuccessMessage, setBulkFavSuccessMessage] = useState<string | null>(null);
  const [showBulkListPreview, setShowBulkListPreview] = useState(false);
  const [excludedMovieIds, setExcludedMovieIds] = useState<Set<string>>(new Set());

  // Candidate movies for bulk favorites from the AI classified page (declared at top level to satisfy Rules of Hooks)
  const candidateFavMovies = useMemo(() => {
    if (!aiResultSummary) return [];
    const pageMovies = movies.filter((m) => aiResultSummary.pageMovieIds.includes(m.id));
    if (selectedClassificationForFav === 'all') {
      return pageMovies;
    }
    return pageMovies.filter((m) => m.classification === selectedClassificationForFav);
  }, [movies, aiResultSummary, selectedClassificationForFav]);

  const activeSelectedFavMovies = useMemo(() => {
    return candidateFavMovies.filter((m) => !excludedMovieIds.has(m.id));
  }, [candidateFavMovies, excludedMovieIds]);

  const ITEMS_PER_PAGE = 50;

  // Build folder map for fast lookup
  const folderMap = new Map<string, Folder>();
  folders.forEach((f) => folderMap.set(f.id, f));

  // Drag and drop handlers for link drop onto repository
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    let droppedText =
      e.dataTransfer.getData('URL') ||
      e.dataTransfer.getData('text/uri-list') ||
      e.dataTransfer.getData('text/plain');

    if (droppedText) {
      droppedText = droppedText.trim();
      const lines = droppedText.split('\n').map((l) => l.trim()).filter(Boolean);
      const urlCandidate =
        lines.find((l) => l.startsWith('http://') || l.startsWith('https://') || l.startsWith('www.')) ||
        lines[0];

      if (urlCandidate && onDropLink) {
        const formattedUrl = urlCandidate.startsWith('www.') ? `https://${urlCandidate}` : urlCandidate;
        onDropLink(formattedUrl);
      }
    }
  };

  // Reset page to 1 on folder switch, scope change, or filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [currentFolder?.id, searchQuery, searchScope, onlyFavorites, activeSort, selectedFavoriteSubFilter]);

  // Navigation for previous and next repository/folder (including All Favorites)
  const visibleFolders = folders.filter((f) => !f.isFolderHidden && f.id !== ALL_FAVORITES_FOLDER_ID);
  const allNavFolders = [ALL_FAVORITES_FOLDER, ...visibleFolders];
  const currentFolderIndex = currentFolder
    ? allNavFolders.findIndex((f) => f.id === currentFolder.id)
    : -1;

  const handlePrevFolder = () => {
    if (!onSelectFolder || allNavFolders.length <= 1 || currentFolderIndex === -1) return;
    const prevIdx = (currentFolderIndex - 1 + allNavFolders.length) % allNavFolders.length;
    onSelectFolder(allNavFolders[prevIdx].id);
  };

  const handleNextFolder = () => {
    if (!onSelectFolder || allNavFolders.length <= 1 || currentFolderIndex === -1) return;
    const nextIdx = (currentFolderIndex + 1) % allNavFolders.length;
    onSelectFolder(allNavFolders[nextIdx].id);
  };

  const prevFolderObj =
    allNavFolders.length > 0 && currentFolderIndex !== -1
      ? allNavFolders[(currentFolderIndex - 1 + allNavFolders.length) % allNavFolders.length]
      : null;
  const nextFolderObj =
    allNavFolders.length > 0 && currentFolderIndex !== -1
      ? allNavFolders[(currentFolderIndex + 1) % allNavFolders.length]
      : null;

  // Pre-calculate favorite movies across visible folders
  const allFavMoviesList = movies.filter((m) => {
    const parentFolder = folderMap.get(m.parentFolderId);
    return (
      (m.isFavorite || (m.favoriteListIds && m.favoriteListIds.length > 0)) &&
      !m.isHidden &&
      !parentFolder?.isFolderHidden &&
      parentFolder?.includeInAllFavorites !== false
    );
  });

  const getEffectiveFavColor = (m: MovieItem): FavoriteColor => {
    if (m.classification === 'red' || m.classification === 'purple') return 'purple';
    return m.favoriteColor || 'yellow';
  };

  const favSectionCounts = {
    green: allFavMoviesList.filter((m) => getEffectiveFavColor(m) === 'green').length,
    yellow: allFavMoviesList.filter((m) => getEffectiveFavColor(m) === 'yellow').length,
    purple: allFavMoviesList.filter((m) => getEffectiveFavColor(m) === 'purple').length,
    black: allFavMoviesList.filter((m) => getEffectiveFavColor(m) === 'black').length,
  };

  const allNonHiddenFavCount = allFavMoviesList.filter((m) => {
    const color: FavoriteColor = getEffectiveFavColor(m);
    return !hiddenFavoriteSections.includes(color);
  }).length;

  if (!currentFolder) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 min-h-[300px]">
        <FolderOpen className="w-16 h-16 text-slate-600 mb-3 animate-pulse" />
        <h2 className="text-lg font-bold text-white mb-1">No Folder Selected</h2>
        <p className="text-xs text-slate-400">Select a directory folder above to view its cinema items.</p>
      </div>
    );
  }

  // Filter items:
  // 1. searchScope 'all' searches across all non-hidden movies in all non-hidden folders
  // 2. ALL_FAVORITES_FOLDER_ID collects all favorite movies, filtered by 4 color sub-sections or ALL
  // 3. Normal folder filters by parentFolderId
  let folderMovies = searchScope === 'all'
    ? movies.filter((m) => {
        const parentFolder = folderMap.get(m.parentFolderId);
        return !m.isHidden && !parentFolder?.isFolderHidden;
      })
    : currentFolder.id === ALL_FAVORITES_FOLDER_ID
    ? allFavMoviesList.filter((m) => {
        const color: FavoriteColor = getEffectiveFavColor(m);
        if (selectedFavoriteSubFilter === 'all') {
          return !hiddenFavoriteSections.includes(color);
        }
        return color === selectedFavoriteSubFilter;
      })
    : movies.filter((m) => m.parentFolderId === currentFolder.id && !m.isHidden);

  // Search filter matching character by character across title, category, description, url, and folder name
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    folderMovies = folderMovies.filter((m) => {
      const parentFolder = folderMap.get(m.parentFolderId);
      const folderNameMatch = parentFolder ? parentFolder.name.toLowerCase().includes(query) : false;
      return (
        m.title.toLowerCase().includes(query) ||
        (m.category && m.category.toLowerCase().includes(query)) ||
        (m.description && m.description.toLowerCase().includes(query)) ||
        (m.url && m.url.toLowerCase().includes(query)) ||
        (m.embedUrl && m.embedUrl.toLowerCase().includes(query)) ||
        folderNameMatch
      );
    });
  }

  // Favorites filter
  if (onlyFavorites) {
    folderMovies = folderMovies.filter((m) => m.isFavorite);
  }

  // Apply sorting (use folder.sortBy by default, or activeSort if user manually picked one)
  const effectiveSort = activeSort || currentFolder.sortBy;
  const sortedMovies = sortMovies(folderMovies, effectiveSort);

  // Pagination calculation
  const totalPages = Math.ceil(sortedMovies.length / ITEMS_PER_PAGE);
  const paginatedMovies = sortedMovies.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      setCurrentPage(newPage);
      
      // Scroll to top of window and scrollable container
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const mainContainers = document.querySelectorAll('.overflow-y-auto, .no-scrollbar');
      mainContainers.forEach((container) => {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  };

  const handleToggleExcludeMovie = (id: string) => {
    setExcludedMovieIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllCandidates = () => {
    setExcludedMovieIds(new Set());
  };

  const handleDeselectAllCandidates = () => {
    setExcludedMovieIds(new Set(candidateFavMovies.map((m) => m.id)));
  };

  const handleExecuteBulkAddToFavorites = () => {
    if (activeSelectedFavMovies.length === 0) return;
    const targetMovieIds = activeSelectedFavMovies.map((m) => m.id);

    if (onBulkAddToFavorite) {
      onBulkAddToFavorite(targetMovieIds, targetFavoriteSection);
    } else {
      targetMovieIds.forEach((id) => onToggleFavorite(id, targetFavoriteSection));
    }

    const secConfig = FAVORITE_SECTIONS.find((s) => s.id === targetFavoriteSection) || FAVORITE_SECTIONS[0];
    const catOpt = CLASSIFICATION_OPTIONS.find((c) => c.id === selectedClassificationForFav);
    const catLabel = selectedClassificationForFav === 'all'
      ? 'جميع أفلام الصفحة'
      : (catOpt ? `${catOpt.emoji} ${catOpt.level} ${catOpt.label}` : selectedClassificationForFav);

    setBulkFavSuccessMessage(
      `✓ تمت بنجاح إضافة ${targetMovieIds.length} عنصر مصنف كـ [${catLabel}] إلى [${secConfig.name} - ${secConfig.colorName}] في All Favorites!`
    );

    setTimeout(() => {
      setBulkFavSuccessMessage(null);
    }, 6000);
  };

  const handleClassifyCurrentPage = async () => {
    if (paginatedMovies.length === 0 || isAiClassifying) return;
    setIsAiClassifying(true);
    setAiError(null);
    setAiResultSummary(null);
    setBulkFavSuccessMessage(null);

    try {
      const res = await classifyMoviesWithGemini(paginatedMovies);
      if (res.success && res.results) {
        if (onBatchUpdateClassification) {
          onBatchUpdateClassification(res.results);
        }

        const counts: Record<string, number> = {};
        res.results.forEach((r) => {
          counts[r.classification] = (counts[r.classification] || 0) + 1;
        });

        // Determine sensible initial selection for bulk favorite addition
        const firstCategoryWithCount = (['green', 'yellow', 'orange', 'red', 'purple'] as ClassificationRating[])
          .find((cat) => (counts[cat] || 0) > 0) || 'green';

        setSelectedClassificationForFav(firstCategoryWithCount);
        if (firstCategoryWithCount === 'green') setTargetFavoriteSection('green');
        else if (firstCategoryWithCount === 'yellow' || firstCategoryWithCount === 'orange') setTargetFavoriteSection('yellow');
        else if (firstCategoryWithCount === 'red') setTargetFavoriteSection('purple');
        else if (firstCategoryWithCount === 'purple') setTargetFavoriteSection('black');

        setExcludedMovieIds(new Set());

        setAiResultSummary({
          message: `تم تقييم وتصنيف وتلوين إطارات ${res.results.length} فيلم في هذه الصفحة بنجاح وفق درجة المحتوى الحميمي والجرأة الجسدية بواسطة Gemini AI!`,
          total: res.results.length,
          counts,
          pageMovieIds: paginatedMovies.map((m) => m.id),
          results: res.results,
        });
      } else {
        setAiError(res.error || 'تعذر تصنيف أفلام الصفحة بالذكاء الاصطناعي.');
      }
    } catch (err: any) {
      setAiError(err?.message || 'حدث خطأ غير متوقع أثناء الاتصال بالذكاء الاصطناعي.');
    } finally {
      setIsAiClassifying(false);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="w-full px-1.5 sm:px-3 md:px-4 py-2 sm:py-3 space-y-2.5 relative min-h-[400px]"
    >
      {/* Visual Overlay when dragging a link over repository */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-40 bg-indigo-950/85 backdrop-blur-md border-2 border-dashed border-indigo-400 rounded-3xl flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-150 pointer-events-none shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/30 border border-indigo-400/50 flex items-center justify-center mb-3 shadow-lg text-indigo-300 animate-bounce">
            <LinkIcon className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-white mb-1">ألقِ الرابط هنا لإضافته إلى المستودع</h3>
          <p className="text-sm font-medium text-indigo-200">
            سيتم إضافة الرابط كعنصر وتحديد اسمه تلقائياً وتظليله لتعديله بسهولة
          </p>
        </div>
      )}

      {/* Global Search Banner Indicator */}
      {searchScope === 'all' && (
        <div className="bg-gradient-to-r from-amber-500/20 via-indigo-900/60 to-purple-900/50 border-2 border-amber-500/40 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-300">
              <Globe className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-amber-300">
                  البحث الشامل في كافة المستودعات
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-black">
                  {folders.length} مستودعات
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {searchQuery.trim() ? (
                  <>
                    نتائج البحث للعبارة: <span className="font-extrabold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-700">"{searchQuery}"</span> — تم العثور على <span className="font-bold text-amber-300">{sortedMovies.length}</span> عنصر مطابق
                  </>
                ) : (
                  'يتم الآن عرض جميع العناصر في كامل المستودعات معاً وفقاً للحروف المدخلة'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSearchScope('folder');
              setSearchQuery('');
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-xs font-extrabold text-slate-200 hover:text-white border border-slate-700 transition-all shadow-sm cursor-pointer"
          >
            إلغاء البحث الشامل
          </button>
        </div>
      )}

      {/* Folder Header Info & Bar */}
      <div className="bg-slate-900/90 border-2 border-indigo-500/40 rounded-xl p-2.5 sm:p-3 flex flex-col md:flex-row md:items-center justify-between gap-2 shadow-xl">
        <div>
          <div className="flex items-center flex-wrap gap-2">
            <span
              className="w-4 h-4 rounded-full shadow-md flex-shrink-0 ring-2 ring-white/20"
              style={{ backgroundColor: currentFolder.color }}
            />
            {/* Interactive Repository Selector Dropdown embedded in Title Header */}
            <div className="relative inline-block max-w-xs sm:max-w-md">
              <select
                id="select-folder-grid-header"
                value={currentFolder.id}
                onChange={(e) => onSelectFolder && onSelectFolder(e.target.value)}
                style={
                  getFolderTextColor(currentFolder.name)
                    ? { color: getFolderTextColor(currentFolder.name) }
                    : currentFolder.id === ALL_FAVORITES_FOLDER_ID
                    ? { color: '#fde047' }
                    : undefined
                }
                className="w-full bg-indigo-950/90 text-amber-300 font-black text-lg sm:text-xl md:text-2xl border-2 border-indigo-500/70 rounded-lg px-2.5 py-1 focus:ring-4 focus:ring-purple-500 focus:outline-none cursor-pointer hover:bg-indigo-900 transition-all shadow-lg appearance-none pr-8 text-right tracking-wide leading-tight"
                title="انقر هنا لاختيار أو تغيير المستودع"
              >
                {/* Special All Favorites Option */}
                <option
                  key={ALL_FAVORITES_FOLDER_ID}
                  value={ALL_FAVORITES_FOLDER_ID}
                  style={{ color: '#fde047' }}
                  className={`bg-amber-950/95 text-amber-300 font-black py-2 ${
                    currentFolder.id === ALL_FAVORITES_FOLDER_ID ? 'bg-amber-900 text-yellow-200' : ''
                  }`}
                >
                  {currentFolder.id === ALL_FAVORITES_FOLDER_ID ? '✓ ' : '⭐ '} كل المفضلة (All Favorites) ({favoritesCount !== undefined ? favoritesCount : movies.filter((m) => {
                    const parentFolder = folderMap.get(m.parentFolderId);
                    return (
                      (m.isFavorite || (m.favoriteListIds && m.favoriteListIds.length > 0)) &&
                      !m.isHidden &&
                      !parentFolder?.isFolderHidden &&
                      parentFolder?.includeInAllFavorites !== false
                    );
                  }).length} عنصر)
                </option>

                {visibleFolders.map((f) => {
                  const isCurr = f.id === currentFolder.id;
                  const count = movies.filter((m) => m.parentFolderId === f.id && !m.isHidden).length;
                  const visibleIdx = visibleFolders.findIndex((fold) => fold.id === f.id);
                  const numStr = visibleIdx !== -1 ? `${visibleIdx + 1}` : '';
                  const folderTextColor = getFolderTextColor(f.name);
                  return (
                    <option
                      key={f.id}
                      value={f.id}
                      style={{ color: folderTextColor || (isCurr ? '#fde047' : '#ffffff') }}
                      className={`bg-slate-900 text-base font-black py-1.5 ${
                        isCurr ? 'bg-indigo-900' : ''
                      }`}
                    >
                      {numStr} {isCurr ? '✓ ' : '📁 '} {f.name} ({count} عنصر)
                    </option>
                  );
                })}
              </select>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-1.5 text-amber-300">
                <ChevronDown className="w-4 h-4 stroke-[3]" />
              </div>
            </div>

            {/* When All Favorites is opened: Show 4-Color Section Icons + ALL icon in front of the select box */}
            {currentFolder.id === ALL_FAVORITES_FOLDER_ID && (
              <div className="flex items-center flex-wrap gap-1 sm:gap-1.5 p-1 bg-slate-950/95 border-2 border-amber-500/60 rounded-xl shadow-lg">
                {/* ALL Button */}
                <button
                  type="button"
                  id="btn-fav-filter-all"
                  onClick={() => setSelectedFavoriteSubFilter('all')}
                  title="عرض كافة عناصر المفضلة (باستثناء ما تم اختيار إخفاؤه من الإعدادات)"
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    selectedFavoriteSubFilter === 'all'
                      ? 'bg-gradient-to-r from-amber-500 to-indigo-600 text-white shadow-md ring-2 ring-amber-300 scale-105'
                      : 'bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-850 border border-slate-700'
                  }`}
                >
                  <Star className="w-3.5 h-3.5 fill-current text-amber-300" />
                  <span className="tracking-wide">ALL</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-black/50 text-[11px] font-mono font-bold text-amber-300">
                    {allNonHiddenFavCount}
                  </span>
                </button>

                {/* The 4 Color Section Icons */}
                {FAVORITE_SECTIONS.map((sec) => {
                  const isHiddenInSettings = hiddenFavoriteSections.includes(sec.id);
                  const isSelected = selectedFavoriteSubFilter === sec.id;
                  const count = favSectionCounts[sec.id] || 0;

                  return (
                    <button
                      key={sec.id}
                      type="button"
                      id={`btn-fav-filter-${sec.id}`}
                      onClick={() => setSelectedFavoriteSubFilter(sec.id)}
                      title={`${sec.name}: ${count} عنصر ${isHiddenInSettings ? '(مخفي من العرض العام في الإعدادات)' : ''}`}
                      className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                        isSelected
                          ? `${sec.buttonBg} ${sec.buttonText} shadow-md ring-2 ${sec.ringColor} scale-105`
                          : `bg-slate-900 ${sec.badgeText} hover:bg-slate-850 border border-slate-700/80`
                      } ${isHiddenInSettings ? 'border-dashed border-red-500/50' : ''}`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/50 shadow-sm flex-shrink-0"
                        style={{ backgroundColor: sec.colorHex }}
                      />
                      <span>{sec.shortName}</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-black/50 text-[11px] font-mono font-bold">
                        {count}
                      </span>
                      {isHiddenInSettings && (
                        <span title="مخفي من العرض العام في الإعدادات" className="text-[10px] text-red-400">👁️‍🗨️</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Previous & Next Repository Navigation Arrows */}
            {onSelectFolder && visibleFolders.length > 1 && (
              <div className="flex items-center gap-1 bg-indigo-950/90 border-2 border-indigo-500/60 rounded-lg px-1.5 py-0.5 shadow-md">
                <button
                  type="button"
                  id="btn-prev-folder"
                  onClick={handlePrevFolder}
                  title={prevFolderObj ? `المستودع السابق: ${prevFolderObj.name}` : 'المستودع السابق'}
                  className="px-2 py-1 rounded-md bg-indigo-900/80 hover:bg-indigo-600 active:bg-indigo-700 text-indigo-100 hover:text-white transition-all border border-indigo-400/50 flex items-center gap-1 text-xs sm:text-sm font-black cursor-pointer shadow-sm active:scale-95"
                >
                  <ChevronRight className="w-4 h-4 text-amber-300 stroke-[2.5]" />
                  <span>السابق</span>
                </button>

                {currentFolderIndex !== -1 && (
                  <span className="text-xs sm:text-sm font-mono font-black text-amber-300 px-1 select-none">
                    {currentFolderIndex + 1}/{visibleFolders.length}
                  </span>
                )}

                <button
                  type="button"
                  id="btn-next-folder"
                  onClick={handleNextFolder}
                  title={nextFolderObj ? `المستودع التالي: ${nextFolderObj.name}` : 'المستودع التالي'}
                  className="px-2 py-1 rounded-md bg-indigo-900/80 hover:bg-indigo-600 active:bg-indigo-700 text-indigo-100 hover:text-white transition-all border border-indigo-400/50 flex items-center gap-1 text-xs sm:text-sm font-black cursor-pointer shadow-sm active:scale-95"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-4 h-4 text-amber-300 stroke-[2.5]" />
                </button>
              </div>
            )}

            <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 shadow-sm flex items-center gap-1.5">
              <span>{sortedMovies.length} عنصر</span>
              <span className="text-red-500 font-extrabold font-mono text-sm" title="العدد الإجمالي للعناصر في التطبيق إجمالاً">
                ({movies.length})
              </span>
            </span>
          </div>
          {currentFolder.description && (
            <p className="text-xs text-slate-400 mt-0.5 leading-tight">
              {currentFolder.description}
            </p>
          )}
        </div>

        {/* Filter Controls Bar */}
        <div className="flex items-center flex-wrap gap-1.5">
          {/* Search Bar with Scope Switch */}
          <div className="flex items-center gap-1.5 flex-1 sm:w-auto">
            <div className="relative flex-1 min-w-[180px] sm:w-72">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchScope === 'all' ? 'بحث في كامل المستودعات...' : 'بحث في المستودع الحالي...'}
                className="w-full pl-8 pr-7 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-sm sm:text-base font-bold text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold px-1 py-0.5"
                  title="مسح النص"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Search Scope Toggle */}
            <button
              type="button"
              onClick={() => setSearchScope(searchScope === 'all' ? 'folder' : 'all')}
              className={`px-2.5 py-1.5 rounded-lg border text-xs sm:text-sm font-black transition-all flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                searchScope === 'all'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-md shadow-amber-500/20'
                  : 'bg-slate-950 border-slate-700 text-slate-300 hover:text-white hover:border-slate-600'
              }`}
              title={searchScope === 'all' ? 'البحث في كافة المستودعات مفعل' : 'التحويل للبحث في كامل مستودعات التطبيق'}
            >
              <Globe className={`w-3.5 h-3.5 ${searchScope === 'all' ? 'text-slate-950' : 'text-indigo-400'}`} />
              <span>{searchScope === 'all' ? 'كامل المستودعات' : 'هذا المستودع'}</span>
            </button>
          </div>

          {/* Sort Selector Dropdown */}
          <div className="flex items-center space-x-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={effectiveSort}
              onChange={(e) => setActiveSort(e.target.value as SortOption)}
              className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
            >
              <option value="domain" className="bg-slate-900 text-white">Sort: Domain</option>
              <option value="title" className="bg-slate-900 text-white">Sort: Title A-Z</option>
              <option value="date" className="bg-slate-900 text-white">Sort: Date Added</option>
              <option value="manual" className="bg-slate-900 text-white">Sort: Manual</option>
            </select>
          </div>

          {/* Favorites Only Toggle */}
          <button
            id="btn-favorites-toggle"
            type="button"
            onClick={() => setOnlyFavorites(!onlyFavorites)}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer active:scale-95 whitespace-nowrap ${
              onlyFavorites
                ? 'bg-yellow-400 text-slate-950 font-black border-[2.5px] border-yellow-200 shadow-[0_0_20px_rgba(250,204,21,0.85)] ring-2 ring-yellow-400'
                : 'bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-400 border border-yellow-400/40 hover:border-yellow-400/70 shadow-sm'
            }`}
            title={onlyFavorites ? 'إلغاء تصفية المفضلة (عرض الكل)' : 'عرض العناصر المفضلة فقط'}
          >
            <Star
              className={`w-4 h-4 ${
                onlyFavorites
                  ? 'fill-slate-950 text-slate-950 stroke-[2.5]'
                  : 'fill-emerald-400 text-emerald-400'
              }`}
            />
            <span
              className={`text-sm sm:text-base font-black ${
                onlyFavorites ? 'text-slate-950' : 'text-emerald-400'
              }`}
            >
              favorites
            </span>
          </button>

          {/* AI Page Classifier Button (Gemini AI Agent) */}
          <button
            id="btn-ai-classify-page"
            type="button"
            onClick={handleClassifyCurrentPage}
            disabled={isAiClassifying || paginatedMovies.length === 0}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all duration-200 cursor-pointer active:scale-95 shadow-md ${
              isAiClassifying
                ? 'bg-purple-950/90 text-purple-200 border-2 border-purple-500/80 animate-pulse'
                : 'bg-gradient-to-r from-purple-700 via-indigo-600 to-pink-600 hover:from-purple-600 hover:to-pink-500 text-white border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.35)]'
            }`}
            title="تقييم وتصنيف أفلام هذه الصفحة المعروضة وتلوين إطاراتها بذكاء اصطناعي (Gemini) حسب درجة المحتوى والجرأة الجسدية"
          >
            {isAiClassifying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-300" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            )}
            <span className="font-extrabold whitespace-nowrap">
              {isAiClassifying ? 'جاري تصنيف الصفحة بـ Gemini...' : 'تصنيف الصفحة بـ Gemini 🤖'}
            </span>
            <span className="text-[10px] bg-slate-950/70 px-1.5 py-0.5 rounded-full font-mono text-purple-200">
              {paginatedMovies.length}
            </span>
          </button>

          {/* Refresh Action Trigger */}
          <button
            id="btn-refresh-grid"
            onClick={onRefreshData}
            disabled={isRefreshing}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-all ${
              isRefreshing ? 'opacity-70 cursor-wait' : ''
            }`}
            title="Pull to Refresh link status"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* AI Classification Summary Result & Bulk Favorites Action Panel */}
      {aiResultSummary && (
        <div className="bg-slate-900/98 border-2 border-purple-500/70 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 animate-in fade-in duration-200 text-right dir-rtl">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-pink-600 text-white shadow-lg shadow-purple-950/50 flex-shrink-0">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                  <span>تم تصنيف أفلام الصفحة بـ Gemini AI بنجاح 🤖</span>
                  <span className="text-xs bg-purple-950 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full font-mono">
                    {aiResultSummary.total} فيلم
                  </span>
                </h4>
                <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                  {aiResultSummary.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setAiResultSummary(null);
                setBulkFavSuccessMessage(null);
              }}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
              title="إغلاق لوحة التصنيف"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Inline Success Toast if bulk operation executed */}
          {bulkFavSuccessMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/80 border-2 border-emerald-500/60 text-emerald-200 text-xs sm:text-sm font-black flex items-center justify-between gap-3 shadow-lg animate-in fade-in duration-150">
              <div className="flex items-center gap-2.5">
                <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 stroke-[3]" />
                <span>{bulkFavSuccessMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setBulkFavSuccessMessage(null)}
                className="text-emerald-400 hover:text-white p-1 rounded-lg hover:bg-emerald-900/50 transition-colors cursor-pointer"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Bulk Favorite Workflow Container */}
          <div className="bg-slate-950/85 border border-purple-500/40 rounded-xl p-3.5 sm:p-4 space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                <span className="text-xs sm:text-sm font-black text-amber-300">
                  إضافة تصنيف معين بالجملة إلى قسم في All Favorites:
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                اختر التصنيف أولاً، ثم حدد قسم المفضلة المستهدف واضغط زر الإضافة بالجملة
              </span>
            </div>

            {/* Step 1: Select Classification Pill */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-2">
                1. اختر التصنيف المراد إضافته بالجملة ({candidateFavMovies.length} فيلم متاح):
              </label>
              <div className="flex items-center flex-wrap gap-2">
                {CLASSIFICATION_OPTIONS.filter((opt) => opt.id !== 'unverified').map((opt) => {
                  const count = aiResultSummary.counts[opt.id] || 0;
                  const isSelected = selectedClassificationForFav === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSelectedClassificationForFav(opt.id);
                        setExcludedMovieIds(new Set());
                        setBulkFavSuccessMessage(null);
                        // Sensible auto-target section
                        if (opt.id === 'green') setTargetFavoriteSection('green');
                        else if (opt.id === 'yellow' || opt.id === 'orange') setTargetFavoriteSection('yellow');
                        else if (opt.id === 'red') setTargetFavoriteSection('purple');
                        else if (opt.id === 'purple') setTargetFavoriteSection('black');
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        isSelected
                          ? `${opt.badgeBg} ${opt.badgeText} ring-2 ring-white/70 shadow-lg scale-105 border-2 ${opt.badgeBorder}`
                          : count > 0
                          ? 'bg-slate-900 text-slate-200 hover:text-white border border-slate-700 hover:border-slate-500'
                          : 'bg-slate-900/40 text-slate-500 border border-slate-800 opacity-60'
                      }`}
                    >
                      <span className="text-sm">{opt.emoji}</span>
                      <span>{opt.level} {opt.label}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          isSelected ? 'bg-black/50 text-white' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}

                {/* Option for All page items */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClassificationForFav('all');
                    setExcludedMovieIds(new Set());
                    setBulkFavSuccessMessage(null);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    selectedClassificationForFav === 'all'
                      ? 'bg-indigo-600 text-white ring-2 ring-indigo-300 shadow-lg scale-105 border-2 border-indigo-400'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <span>✨</span>
                  <span>جميع أفلام الصفحة</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      selectedClassificationForFav === 'all' ? 'bg-black/50 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {aiResultSummary.total}
                  </span>
                </button>
              </div>
            </div>

            {/* Step 2: Select Favorite Section */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-2">
                2. اختر قسم المفضلة المستهدف في All Favorites:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FAVORITE_SECTIONS.map((sec) => {
                  const isSelected = targetFavoriteSection === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        setTargetFavoriteSection(sec.id);
                        setBulkFavSuccessMessage(null);
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        isSelected
                          ? `${sec.buttonBg} ${sec.buttonText} shadow-lg ring-2 ${sec.ringColor} scale-[1.02]`
                          : 'bg-slate-900/90 hover:bg-slate-850 text-slate-200 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/60 flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: sec.colorHex }}
                        />
                        <span className="truncate">
                          {sec.number}- {sec.colorName} ({sec.name})
                        </span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 stroke-[3] flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Execute Action & Preview Toggle */}
            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleExecuteBulkAddToFavorites}
                disabled={activeSelectedFavMovies.length === 0}
                className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all shadow-xl cursor-pointer ${
                  activeSelectedFavMovies.length > 0
                    ? 'bg-gradient-to-r from-amber-500 via-emerald-600 to-teal-500 hover:from-amber-400 hover:to-emerald-400 text-white shadow-emerald-950/60 hover:scale-[1.02] active:scale-95'
                    : 'bg-slate-850 text-slate-500 cursor-not-allowed border border-slate-800'
                }`}
              >
                <Star className="w-4 h-4 fill-current text-amber-300 animate-pulse" />
                <span>
                  إضافة ({activeSelectedFavMovies.length}) فيلم مصنف كـ [
                  {selectedClassificationForFav === 'all'
                    ? 'جميع أفلام الصفحة'
                    : CLASSIFICATION_OPTIONS.find((c) => c.id === selectedClassificationForFav)?.label || selectedClassificationForFav}
                  ] إلى {FAVORITE_SECTIONS.find((s) => s.id === targetFavoriteSection)?.name} في All Favorites ★
                </span>
              </button>

              {candidateFavMovies.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBulkListPreview((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>معاينة / استثناء أفلام محددة ({activeSelectedFavMovies.length} من {candidateFavMovies.length})</span>
                  {showBulkListPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {/* Expandable Movie Preview with Checkboxes */}
            {showBulkListPreview && candidateFavMovies.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 animate-in fade-in duration-150 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold text-slate-300">
                    قائمة الأفلام المحددة للإضافة (يمكنك إلغاء تحديد أي فيلم بالضغط عليه):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllCandidates}
                      className="text-xs text-sky-400 hover:underline cursor-pointer"
                    >
                      تحديد الكل
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllCandidates}
                      className="text-xs text-rose-400 hover:underline cursor-pointer"
                    >
                      إلغاء تحديد الكل
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-slate-800 rounded-xl p-2 bg-slate-900/60">
                  {candidateFavMovies.map((m) => {
                    const isChecked = !excludedMovieIds.has(m.id);
                    return (
                      <div
                        key={m.id}
                        onClick={() => handleToggleExcludeMovie(m.id)}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-slate-850 hover:bg-slate-800 text-white border border-slate-700/60'
                            : 'bg-slate-950/40 text-slate-500 border border-slate-900 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600 flex-shrink-0" />
                          )}
                          <span className="truncate font-semibold">{m.title}</span>
                        </div>
                        {m.isFavorite && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            مفضل حالياً ({FAVORITE_SECTIONS.find((s) => s.id === m.favoriteColor)?.name || m.favoriteColor})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Error Banner */}
      {aiError && (
        <div className="bg-red-950/80 border border-red-500/50 rounded-xl p-3 text-red-200 text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{aiError}</span>
          </div>
          <button
            type="button"
            onClick={() => setAiError(null)}
            className="text-red-400 hover:text-white p-1 rounded-lg hover:bg-red-900/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pull to Refresh Visual Indicator */}
      {isRefreshing && (
        <div className="w-full flex items-center justify-center space-x-2 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-300 text-xs animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Re-verifying URLs and syncing Room database...</span>
        </div>
      )}

      {/* TOP PAGINATION CONTROLS */}
      {sortedMovies.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedMovies.length}
          pageSize={ITEMS_PER_PAGE}
          onPageChange={handlePageChange}
        />
      )}

      {/* Movie Cards Grid - Minimal gap for contiguous appearance and fluid full-width reflow */}
      {sortedMovies.length > 0 ? (
        <div
          className="grid gap-1 sm:gap-1.5 transition-all duration-300 w-full"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 252px), 1fr))',
          }}
        >
          {paginatedMovies.map((movie, index) => {
            const itemIndex = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
            const parentFolder = folderMap.get(movie.parentFolderId);
            const folderDisplayName = parentFolder?.name || currentFolder?.name;
            const folderDisplayColor = parentFolder?.color || currentFolder?.color;

            return (
              <MovieCard
                key={movie.id}
                movie={movie}
                itemIndex={itemIndex}
                folderName={folderDisplayName}
                folderColor={folderDisplayColor}
                isAllFavorites={currentFolder?.id === ALL_FAVORITES_FOLDER_ID}
                onSelectFolder={onSelectFolder}
                onOpenMovie={onOpenMovie}
                onToggleFavorite={onToggleFavorite}
                onToggleBroken={onToggleBroken}
                onToggleHide={onToggleHide}
                onEditMovie={onEditMovie}
                onDeleteMovie={onDeleteMovie}
                onCopyMovieToFolder={onCopyMovieToFolder}
                onUpdateClassification={onUpdateClassification}
                onReorderMovie={
                  currentFolder?.id === ALL_FAVORITES_FOLDER_ID && onReorderFavoriteMovie
                    ? (movieId, currentPos) => {
                        const m = sortedMovies.find((x) => x.id === movieId) || movie;
                        setReorderTarget({ movie: m, currentIndex: currentPos });
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center p-12 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl text-center space-y-3 min-h-[250px]">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">لا توجد نتائج مطابقة</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              {searchQuery || onlyFavorites
                ? searchScope === 'all'
                  ? `لم يتم العثور على أي عناصر تطابق البحث "${searchQuery}" في كافة المستودعات.`
                  : `لا توجد عناصر تطابق البحث في مستودع "${currentFolder.name}". يمكنك تجربة "كامل المستودعات".`
                : currentFolder.id === ALL_FAVORITES_FOLDER_ID
                ? selectedFavoriteSubFilter !== 'all'
                  ? `لا توجد عناصر مضافة إلى "${FAVORITE_SECTIONS.find((s) => s.id === selectedFavoriteSubFilter)?.name}" حالياً.`
                  : 'لا توجد عناصر مضافة إلى المفضلة حالياً. اضغط على أيقونة المفضلة ★ لأي فيلم لاختيار لونه وإضافته هنا!'
                : 'هذا المستودع فارغ حالياً. أضف عناصر سينمائية لبدء العرض.'}
            </p>
          </div>
          {searchScope !== 'all' && searchQuery && (
            <button
              onClick={() => setSearchScope('all')}
              className="flex items-center space-x-1.5 space-x-reverse px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-md transition-all cursor-pointer"
            >
              <Globe className="w-4 h-4" />
              <span>البحث في كامل مستودعات التطبيق</span>
            </button>
          )}
          {!searchQuery && (
            <button
              onClick={onAddMovie}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة عنصر إلى {currentFolder.name}</span>
            </button>
          )}
        </div>
      )}

      {/* BOTTOM PAGINATION CONTROLS */}
      {sortedMovies.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sortedMovies.length}
          pageSize={ITEMS_PER_PAGE}
          onPageChange={handlePageChange}
        />
      )}

      {/* REORDER ITEM MODAL IN FAVORITES */}
      {reorderTarget && (
        <ReorderItemModal
          isOpen={!!reorderTarget}
          onClose={() => setReorderTarget(null)}
          movie={reorderTarget.movie}
          currentIndex={reorderTarget.currentIndex}
          totalItems={sortedMovies.length}
          sectionName={
            selectedFavoriteSubFilter === 'all'
              ? 'كل المفضلة العامة'
              : FAVORITE_SECTIONS.find((s) => s.id === selectedFavoriteSubFilter)?.name || 'أقسام المفضلة'
          }
          onReorder={(id, newPos) => {
            if (onReorderFavoriteMovie) {
              onReorderFavoriteMovie(id, newPos, selectedFavoriteSubFilter);
            }
          }}
        />
      )}
    </div>
  );
};
