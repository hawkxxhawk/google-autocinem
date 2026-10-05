import React, { useState, useMemo } from 'react';
import {
  Settings,
  X,
  Database,
  Star,
  Shuffle,
  FolderPlus,
  Eye,
  EyeOff,
  Film,
  ArrowRightLeft,
  Plus,
  Download,
  FileJson,
  Sparkles,
  RotateCcw,
  Smartphone,
  Type,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  CopyX,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Filter,
  Check,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  Folder as FolderType,
  MovieItem,
  FavoriteColor,
  FAVORITE_SECTIONS,
  ALL_FAVORITES_FOLDER_ID,
} from '../types';
import { consolidateBaseData } from '../utils/storage';

export type DeduplicationScopeType = 'folder' | 'favorite_section' | 'all_favorites' | 'all';

export interface DeduplicationScope {
  type: DeduplicationScopeType;
  id?: string; // folderId or favoriteColor
}

export interface DuplicateGroup {
  streamUrl: string;
  normalizedUrl: string;
  keptMovie: MovieItem;
  duplicateMovies: MovieItem[];
}

export function findDuplicatesInScope(
  movies: MovieItem[],
  scope: DeduplicationScope
): {
  targetMovies: MovieItem[];
  duplicateGroups: DuplicateGroup[];
  duplicateMovieIds: string[];
} {
  let targetMovies: MovieItem[] = [];

  if (scope.type === 'folder' && scope.id) {
    targetMovies = movies.filter((m) => m.parentFolderId === scope.id && !m.isHidden);
  } else if (scope.type === 'favorite_section' && scope.id) {
    targetMovies = movies.filter(
      (m) =>
        m.isFavorite &&
        (m.favoriteColor === scope.id || (scope.id === 'yellow' && !m.favoriteColor)) &&
        !m.isHidden
    );
  } else if (scope.type === 'all_favorites') {
    targetMovies = movies.filter((m) => m.isFavorite && !m.isHidden);
  } else {
    // all non-hidden movies
    targetMovies = movies.filter((m) => !m.isHidden);
  }

  // Normalize stream URL for comparison
  const normalize = (m: MovieItem) => {
    const raw = (m.url || m.embedUrl || '').trim().toLowerCase();
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
  };

  const groupsByUrl = new Map<string, MovieItem[]>();
  const duplicateGroups: DuplicateGroup[] = [];
  const duplicateMovieIds: string[] = [];

  targetMovies.forEach((m) => {
    const key = normalize(m);
    if (!key) return; // skip items without URL
    const list = groupsByUrl.get(key) || [];
    list.push(m);
    groupsByUrl.set(key, list);
  });

  groupsByUrl.forEach((groupMovies, normUrl) => {
    if (groupMovies.length > 1) {
      // Keep the first one, mark subsequent ones as duplicates to remove
      const kept = groupMovies[0];
      const dupes = groupMovies.slice(1);
      dupes.forEach((d) => duplicateMovieIds.push(d.id));
      duplicateGroups.push({
        streamUrl: kept.url || kept.embedUrl || '',
        normalizedUrl: normUrl,
        keptMovie: kept,
        duplicateMovies: dupes,
      });
    }
  });

  return {
    targetMovies,
    duplicateGroups,
    duplicateMovieIds,
  };
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: FolderType[];
  movies: MovieItem[];
  onDeduplicateMovies?: (deletedMovieIds: string[]) => void;
  onOpenRepositoriesModal: () => void;
  onOpenFavoritesModal: () => void;
  onOpenHiddenFoldersModal: () => void;
  onOpenFolderModal: () => void;
  onOpenMovieModal: () => void;
  onOpenJsonImportModal: () => void;
  onExportData: (targetChunkIndex?: number) => void;
  onOpenKotlinModal: () => void;
  onResetData: () => void;
  onRandomFolder: () => void;
  favoritesCount: number;
  hiddenFoldersCount: number;
  hiddenMoviesCount: number;
  fontScale: number;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
  onResetFont: () => void;
  onOpenClassifierModal?: () => void;
  onPurifyAllTitles?: () => void;
  hiddenFavoriteSections?: FavoriteColor[];
  onToggleHideFavoriteSection?: (sectionId: FavoriteColor) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  folders = [],
  movies = [],
  onDeduplicateMovies,
  onOpenRepositoriesModal,
  onOpenFavoritesModal,
  onOpenHiddenFoldersModal,
  onOpenFolderModal,
  onOpenMovieModal,
  onOpenJsonImportModal,
  onExportData,
  onOpenKotlinModal,
  onResetData,
  onRandomFolder,
  favoritesCount,
  hiddenFoldersCount,
  hiddenMoviesCount,
  fontScale,
  onIncreaseFont,
  onDecreaseFont,
  onResetFont,
  onOpenClassifierModal,
  onPurifyAllTitles,
  hiddenFavoriteSections = [],
  onToggleHideFavoriteSection,
}) => {
  // Navigation tabs in settings
  const [activeTab, setActiveTab] = useState<'all' | 'filter' | 'repositories' | 'backup' | 'display'>('all');

  // Deduplication state
  const [dedupScopeType, setDedupScopeType] = useState<DeduplicationScopeType>('folder');
  const [selectedFolderId, setSelectedFolderId] = useState<string>(() => {
    return folders.length > 0 ? folders[0].id : '';
  });
  const [selectedFavoriteSection, setSelectedFavoriteSection] = useState<FavoriteColor>('green');
  const [showDuplicatePreview, setShowDuplicatePreview] = useState(false);
  const [dedupSuccessMessage, setDedupSuccessMessage] = useState<string | null>(null);

  const totalHidden = hiddenFoldersCount + hiddenMoviesCount;

  // Compute current deduplication scope
  const currentScope: DeduplicationScope = useMemo(() => {
    if (dedupScopeType === 'folder') {
      return { type: 'folder', id: selectedFolderId || (folders[0]?.id || '') };
    }
    if (dedupScopeType === 'favorite_section') {
      return { type: 'favorite_section', id: selectedFavoriteSection };
    }
    if (dedupScopeType === 'all_favorites') {
      return { type: 'all_favorites' };
    }
    return { type: 'all' };
  }, [dedupScopeType, selectedFolderId, selectedFavoriteSection, folders]);

  // Compute duplicates in current scope
  const { targetMovies, duplicateGroups, duplicateMovieIds } = useMemo(() => {
    return findDuplicatesInScope(movies, currentScope);
  }, [movies, currentScope]);

  // Execute deduplication
  const handleExecuteDeduplication = () => {
    if (duplicateMovieIds.length === 0) return;

    let scopeLabel = '';
    if (dedupScopeType === 'folder') {
      const f = folders.find((fld) => fld.id === currentScope.id);
      scopeLabel = f ? `مستودع "${f.name}"` : 'المستودع المحدد';
    } else if (dedupScopeType === 'favorite_section') {
      const sec = FAVORITE_SECTIONS.find((s) => s.id === currentScope.id);
      scopeLabel = sec ? `قسم "${sec.name}" في All Favorites` : 'قسم المفضلة';
    } else if (dedupScopeType === 'all_favorites') {
      scopeLabel = 'مجلد المفضلة العامة (All Favorites)';
    } else {
      scopeLabel = 'كافة المستودعات';
    }

    const confirmMsg =
      `تأكيد التصفية وإزالة المكررات:\n\n` +
      `• النطاق: ${scopeLabel}\n` +
      `• عدد الأفلام المكررة المراد حذفها: ${duplicateMovieIds.length} فيلم\n` +
      `• سيتم الإبقاء على نسخة واحدة فقط لكل فيلم يشترك في نفس رابط التشغيل.\n\n` +
      `هل تريد بالتأكيد المتابعة وحذف النسخ المكررة الآن؟`;

    if (!window.confirm(confirmMsg)) return;

    if (onDeduplicateMovies) {
      onDeduplicateMovies(duplicateMovieIds);
    }

    setDedupSuccessMessage(
      `✓ تمت التصفية بنجاح! تم حذف (${duplicateMovieIds.length}) فيلم مكرر والابقاء على نسخة واحدة لكل رابط تشغيل في ${scopeLabel}.`
    );
    setShowDuplicatePreview(false);

    setTimeout(() => {
      setDedupSuccessMessage(null);
    }, 7000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-purple-500/50 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col my-auto text-right dir-rtl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/90 flex-shrink-0">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-purple-600/30 text-purple-300 flex items-center justify-center border border-purple-500/40 shadow-inner">
              <Settings className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <span>لوحة الإعدادات والأدوات الذكية</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900 text-purple-200 border border-purple-500/40 font-mono">
                  AutoCinema Hub
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-semibold">
                تنظيم المستودعات، تصفية المكررات، إدارة المفضلة، النسخ الاحتياطي، وتنسيق الواجهة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="إغلاق الإعدادات"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Navigation Filter Bar */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            🌟 كافة الإعدادات
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('filter')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'filter'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/60'
                : 'bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>قسم التصفية والمكررات</span>
            <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] text-amber-200">
              جديد
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('repositories')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'repositories'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            📁 المستودعات والمفضلة
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'backup'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            💾 النسخ الاحتياطي والبيانات
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('display')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'display'
                ? 'bg-sky-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            📱 العرض والخط
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-4 sm:p-5 space-y-6 overflow-y-auto flex-1">
          {/* SECTION: قسم التصفية والمكررات (Deduplication & Purify Tools) */}
          {(activeTab === 'all' || activeTab === 'filter') && (
            <div className="bg-gradient-to-b from-slate-950/95 via-slate-900/90 to-slate-950/95 border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <CopyX className="w-5 h-5 text-amber-400 stroke-[2.5]" />
                  </div>
                  <div>
                    <h4 className="text-base sm:text-lg font-black text-amber-300 flex items-center gap-2">
                      <span>قسم التصفية الذكية وإزالة المكررات (Deduplication)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black">
                        أداة حصرية
                      </span>
                    </h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      فحص روابط التشغيل وحذف النسخ المكررة مع الإبقاء على نسخة واحدة فقط لكل فيلم
                    </p>
                  </div>
                </div>
              </div>

              {/* Success Notification if deduplication completed */}
              {dedupSuccessMessage && (
                <div className="p-3 rounded-xl bg-emerald-950/90 border-2 border-emerald-500/60 text-emerald-200 text-xs sm:text-sm font-black flex items-center justify-between gap-3 shadow-lg animate-in fade-in duration-150">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span>{dedupSuccessMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDedupSuccessMessage(null)}
                    className="text-emerald-400 hover:text-white p-1 rounded-lg hover:bg-emerald-900/50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Scope Selection Box */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <label className="block text-xs font-black text-slate-200">
                  1. حدد نطاق التصفية المطلوب فحصه:
                </label>

                {/* Scope Type Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setDedupScopeType('folder')}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      dedupScopeType === 'folder'
                        ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-850 border border-slate-800'
                    }`}
                  >
                    <Database className="w-4 h-4 text-indigo-300" />
                    <span>مستودع معين</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDedupScopeType('favorite_section')}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      dedupScopeType === 'favorite_section'
                        ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400 font-black'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-850 border border-slate-800'
                    }`}
                  >
                    <Star className="w-4 h-4 text-amber-400 fill-current" />
                    <span>قسم بداخل All Favorites</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDedupScopeType('all_favorites')}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      dedupScopeType === 'all_favorites'
                        ? 'bg-purple-600 text-white shadow-md ring-2 ring-purple-400'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-850 border border-slate-800'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-purple-300" />
                    <span>كل المفضلة العامة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDedupScopeType('all')}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      dedupScopeType === 'all'
                        ? 'bg-sky-600 text-white shadow-md ring-2 ring-sky-400'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-850 border border-slate-800'
                    }`}
                  >
                    <Filter className="w-4 h-4 text-sky-300" />
                    <span>كافة المستودعات</span>
                  </button>
                </div>

                {/* Sub-selectors depending on Scope Type */}
                {dedupScopeType === 'folder' && (
                  <div className="pt-2 animate-in fade-in duration-150">
                    <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                      اختر المستودع المراد إزالة المكررات منه:
                    </label>
                    <select
                      value={selectedFolderId}
                      onChange={(e) => {
                        setSelectedFolderId(e.target.value);
                        setShowDuplicatePreview(false);
                      }}
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      {folders
                        .filter((f) => f.id !== ALL_FAVORITES_FOLDER_ID)
                        .map((f) => {
                          const count = movies.filter((m) => m.parentFolderId === f.id && !m.isHidden).length;
                          return (
                            <option key={f.id} value={f.id}>
                              📁 {f.name} ({count} عنصر)
                            </option>
                          );
                        })}
                    </select>
                  </div>
                )}

                {dedupScopeType === 'favorite_section' && (
                  <div className="pt-2 space-y-2 animate-in fade-in duration-150">
                    <label className="block text-[11px] font-bold text-slate-300">
                      اختر القسم الملون بداخل All Favorites:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {FAVORITE_SECTIONS.map((sec) => {
                        const count = movies.filter(
                          (m) =>
                            m.isFavorite &&
                            (m.favoriteColor === sec.id || (sec.id === 'yellow' && !m.favoriteColor)) &&
                            !m.isHidden
                        ).length;
                        const isSelected = selectedFavoriteSection === sec.id;

                        return (
                          <button
                            key={sec.id}
                            type="button"
                            onClick={() => {
                              setSelectedFavoriteSection(sec.id);
                              setShowDuplicatePreview(false);
                            }}
                            className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                              isSelected
                                ? `${sec.buttonBg} ${sec.buttonText} shadow-md ring-2 ${sec.ringColor} scale-102`
                                : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/60 flex-shrink-0"
                                style={{ backgroundColor: sec.colorHex }}
                              />
                              <span className="truncate">{sec.name}</span>
                            </div>
                            <span className="px-1.5 py-0.5 rounded-full bg-black/40 text-[10px] font-mono">
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Real-time Analysis & Deduplication Summary Bar */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold">إجمالي أفلام النطاق</div>
                    <div className="text-lg font-black text-white">{targetMovies.length}</div>
                  </div>
                  <div className="w-px h-8 bg-slate-800 hidden sm:block" />
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold">الروابط الفريدة</div>
                    <div className="text-lg font-black text-sky-400">
                      {targetMovies.length - duplicateMovieIds.length}
                    </div>
                  </div>
                  <div className="w-px h-8 bg-slate-800 hidden sm:block" />
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold">المكررات المكتشفة لنفس الرابط</div>
                    <div className={`text-lg font-black ${duplicateMovieIds.length > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {duplicateMovieIds.length}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {duplicateMovieIds.length > 0 ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-black">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>يوجد تكرار في روابط التشغيل</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black">
                      <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                      <span>النطاق نظيف (لا مكررات)</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons: Preview & Execute */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleExecuteDeduplication}
                  disabled={duplicateMovieIds.length === 0}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-black transition-all shadow-xl cursor-pointer ${
                    duplicateMovieIds.length > 0
                      ? 'bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-950/60 hover:scale-[1.02] active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>
                    {duplicateMovieIds.length > 0
                      ? `تنفيذ التصفية: إزالة (${duplicateMovieIds.length}) فيلم مكرر والابقاء على نسخة واحدة`
                      : 'لا توجد أفلام مكررة لإزالتها في هذا النطاق'}
                  </span>
                </button>

                {duplicateMovieIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDuplicatePreview((prev) => !prev)}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <span>معاينة الروابط والمكررات ({duplicateGroups.length} رابط مكرر)</span>
                    {showDuplicatePreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}
              </div>

              {/* Collapsible Duplicates Preview List */}
              {showDuplicatePreview && duplicateGroups.length > 0 && (
                <div className="pt-2 border-t border-slate-800 animate-in fade-in duration-150 space-y-3">
                  <div className="text-xs font-bold text-slate-300">
                    قائمة الروابط المشتركة والأفلام التي ستُحذف تلقائياً:
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1 border border-slate-800 rounded-xl p-2.5 bg-slate-950/80">
                    {duplicateGroups.map((group, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono truncate gap-2">
                          <span className="truncate text-sky-400 font-semibold">{group.streamUrl}</span>
                          <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-sans flex-shrink-0">
                            {group.duplicateMovies.length + 1} نسخ
                          </span>
                        </div>

                        {/* Kept Movie */}
                        <div className="flex items-center gap-2 text-emerald-300 font-semibold bg-emerald-950/30 p-1.5 rounded border border-emerald-500/30">
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500 text-slate-950 font-black flex-shrink-0">
                            نسخة محفوظة
                          </span>
                          <span className="truncate">{group.keptMovie.title}</span>
                        </div>

                        {/* Duplicate Movies to Remove */}
                        {group.duplicateMovies.map((dupe) => (
                          <div
                            key={dupe.id}
                            className="flex items-center gap-2 text-rose-300 font-medium bg-rose-950/30 p-1.5 rounded border border-rose-500/30"
                          >
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-600 text-white font-black flex-shrink-0">
                              سيتم الحذف
                            </span>
                            <span className="truncate">{dupe.title}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Purify Titles & Item Classifier Quick Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                {/* Purify Titles Button */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onPurifyAllTitles) onPurifyAllTitles();
                  }}
                  className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-all text-xs sm:text-sm font-black active:scale-95 text-right cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <div>
                      <div className="text-white font-black">تنقية أسماء الأفلام</div>
                      <div className="text-[10px] text-slate-400 font-normal">حذف رموز وأوقات العرض (HD1:30:04)</div>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-amber-300" />
                </button>

                {/* Item Classifier Button */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenClassifierModal) onOpenClassifierModal();
                  }}
                  className="flex items-center justify-between p-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 transition-all text-xs sm:text-sm font-black active:scale-95 text-right cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <ArrowRightLeft className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                    <div>
                      <div className="text-white font-black">تصنيف وفرز العناصر</div>
                      <div className="text-[10px] text-slate-400 font-normal">حذف كلمات ونقل وحذف بالجملة</div>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-indigo-300" />
                </button>
              </div>
            </div>
          )}

          {/* SECTION: دليل وإدارة المستودعات والمفضلة */}
          {(activeTab === 'all' || activeTab === 'repositories') && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <h4 className="text-base font-black text-indigo-300 flex items-center gap-2 border-b border-slate-800/80 pb-2">
                <Database className="w-5 h-5 text-indigo-400" />
                <span>إدارة ودليل المستودعات (Repositories & Folders)</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Repositories Directory */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRepositoriesModal();
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/40 text-indigo-200 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <Database className="w-5 h-5 text-indigo-400" />
                    <div>
                      <div className="text-white font-black">دليل المستودعات</div>
                      <div className="text-[11px] text-slate-400 font-normal">إعادة ترتيب وتصفح وإدارة المستودعات</div>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-indigo-300" />
                </button>

                {/* Global Favorites in Settings */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFavoritesModal();
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                    <div>
                      <div className="text-white font-black">المفضلة العامة وتخصيصها</div>
                      <div className="text-[11px] text-slate-400 font-normal">عرض واستثناء وتصفية عناصر مستودعات معينة</div>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs">
                    {favoritesCount}
                  </span>
                </button>

                {/* Shuffle / Random Folder */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRandomFolder();
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/40 text-purple-200 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <Shuffle className="w-5 h-5 text-purple-400" />
                    <div>
                      <div className="text-white font-black">مستودع عشوائي</div>
                      <div className="text-[11px] text-slate-400 font-normal">تنقل عشوائي سريع بين المستودعات</div>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-purple-300" />
                </button>

                {/* Add New Folder */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFolderModal();
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <FolderPlus className="w-5 h-5 text-sky-400" />
                    <div>
                      <div className="text-white font-black">إضافة مجلد جديد</div>
                      <div className="text-[11px] text-slate-400 font-normal">إنشاء تصنيف أو مستودع جديد</div>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-slate-400" />
                </button>

                {/* Hidden Vault */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenHiddenFoldersModal();
                  }}
                  className="sm:col-span-2 flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <Eye className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-amber-200 font-black">الخزنة المخفية</div>
                      <div className="text-[11px] text-slate-400 font-normal">عرض واستعادة العناصر والمجلدات المخفية</div>
                    </div>
                  </div>
                  {totalHidden > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs">
                      {totalHidden} مخفي
                    </span>
                  )}
                </button>
              </div>

              {/* All Favorites Sub-sections Visibility Settings */}
              <div className="mt-4 pt-3.5 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-300">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span>أقسام مجلد كل المفضلة (All Favorites) - إخفاء أو إظهار من العرض:</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">القسم المخفي يُستثنى من خيار ALL</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {FAVORITE_SECTIONS.map((sec) => {
                    const isHidden = hiddenFavoriteSections.includes(sec.id);
                    const count = movies.filter(
                      (m) =>
                        (m.favoriteColor === sec.id || (sec.id === 'yellow' && !m.favoriteColor && m.isFavorite)) &&
                        m.isFavorite &&
                        !m.isHidden
                    ).length;

                    return (
                      <div
                        key={sec.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          isHidden
                            ? 'bg-slate-900/40 border-red-500/30 opacity-70'
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/40 shadow-sm"
                            style={{ backgroundColor: sec.colorHex }}
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                              <span>{sec.name}</span>
                              {isHidden && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-red-950 text-red-300 border border-red-800">
                                  مخفي
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {count} عنصر
                            </div>
                          </div>
                        </div>

                        {onToggleHideFavoriteSection && (
                          <button
                            type="button"
                            onClick={() => onToggleHideFavoriteSection(sec.id)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer active:scale-95 ${
                              isHidden
                                ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                            }`}
                          >
                            {isHidden ? (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                <span>مخفي (إظهار)</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>ظاهر (إخفاء)</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SECTION: النسخ الاحتياطي والبيانات */}
          {(activeTab === 'all' || activeTab === 'backup') && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <h4 className="text-base font-black text-emerald-300 flex items-center gap-2 border-b border-slate-800/80 pb-2">
                <Film className="w-5 h-5 text-emerald-400" />
                <span>النسخ الاحتياطي والبيانات (Backup & Data Actions)</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Add Movie */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMovieModal();
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-200 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <Plus className="w-5 h-5 text-emerald-400" />
                    <div>
                      <div className="text-white font-black">إضافة فيلم جديد</div>
                      <div className="text-[11px] text-slate-400 font-normal">إدخال رابط وتفاصيل يدوياً</div>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-emerald-300" />
                </button>

                {/* Export JSON */}
                {/* Export Updates & New Additions (initialData2.json) - RECOMMENDED */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onExportData(2);
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm group"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="text-amber-300 font-black flex items-center gap-1.5">
                        <span>تصدير ملف التحديثات والإضافات فقط (initialData2.json)</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500 text-slate-950 font-black">موصى به</span>
                      </div>
                      <div className="text-[11px] text-amber-200/80 font-normal">
                        الملف الوحيد المطلوب نسخه ونقله لمجلد public عند عمل إضافات أو تعديلات جديدة
                      </div>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-amber-400" />
                </button>

                {/* Export Base Dataset (initialData.json) */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onExportData(1);
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm group"
                >
                  <div className="flex items-center gap-2.5">
                    <Database className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="text-white font-black">تصدير الملف الأساسي الشامل (initialData.json)</div>
                      <div className="text-[11px] text-slate-400 font-normal">
                        يحتوي على كافة العناصر الحالية (22,815+ عنصر) - يُنسخ لـ public مرة واحدة فقط
                      </div>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-slate-400" />
                </button>

                {/* Consolidate All into Base initialData.json */}
                <button
                  type="button"
                  onClick={async () => {
                    const ok = window.confirm(
                      'هل تريد تثبيت ودمج كافة العناصر والتعديلات الحالية داخل الملف الأساسي (initialData.json) وتصفير ملف التحديثات؟\n\n' +
                      'بعد ذلك سيصبح الملف الأساسي شاملاً لكل شيء كبداية جديدة نظيفة.'
                    );
                    if (ok) {
                      const res = await consolidateBaseData();
                      alert(res.message);
                    }
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-sky-950/30 hover:bg-sky-900/40 border border-sky-500/30 text-sky-200 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm group"
                >
                  <div className="flex items-center gap-2.5">
                    <Layers className="w-5 h-5 text-sky-400 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="text-sky-300 font-black">تثبيت الكل داخل الملف الأساسي (Consolidate into Base)</div>
                      <div className="text-[11px] text-sky-200/70 font-normal">
                        دمج كافة العناصر الحالية والتعديلات نهائياً في initialData.json وتصفير ملف التحديثات
                      </div>
                    </div>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-sky-400" />
                </button>

                {/* Import JSON */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenJsonImportModal();
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/40 text-purple-200 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <FileJson className="w-5 h-5 text-purple-400" />
                    <div>
                      <div className="text-white font-black">استيراد وتغذية JSON</div>
                      <div className="text-[11px] text-slate-400 font-normal">استيراد قوائم ومستودعات جاهزة ومدمجة</div>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-purple-300" />
                </button>

                {/* Reset Initial Data */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onResetData();
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-red-950/30 hover:bg-red-950/50 border border-red-500/30 text-red-300 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <RotateCcw className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-amber-300 font-black">استعادة الوضع الافتراضي</div>
                      <div className="text-[11px] text-slate-400 font-normal">إعادة ضبط البيانات من initialData.json الأصلي</div>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-amber-400" />
                </button>
              </div>
            </div>
          )}

          {/* SECTION: تنسيق العرض والخط */}
          {(activeTab === 'all' || activeTab === 'display') && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <h4 className="text-base font-black text-sky-300 flex items-center gap-2 border-b border-slate-800/80 pb-2">
                <Smartphone className="w-5 h-5 text-sky-400" />
                <span>تنسيق العرض والخط (Display & Appearance)</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Font Scale Controls in Settings */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm font-black shadow-sm">
                  <div className="flex items-center gap-2">
                    <Type className="w-5 h-5 text-indigo-400" />
                    <span>حجم الخط التفاعلي:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onDecreaseFont}
                      disabled={fontScale <= 0.8}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm transition-all ${
                        fontScale <= 0.8
                          ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                          : 'bg-slate-800 hover:bg-slate-700 text-white cursor-pointer active:scale-95'
                      }`}
                      title="تصغير الخط"
                    >
                      A-
                    </button>
                    <span className="w-12 text-center text-xs font-mono text-indigo-300 font-bold bg-slate-950 py-1 rounded border border-slate-800">
                      {Math.round(fontScale * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={onIncreaseFont}
                      disabled={fontScale >= 1.4}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm transition-all ${
                        fontScale >= 1.4
                          ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                          : 'bg-slate-800 hover:bg-slate-700 text-white cursor-pointer active:scale-95'
                      }`}
                      title="تكبير الخط"
                    >
                      A+
                    </button>
                    {fontScale !== 1 && (
                      <button
                        type="button"
                        onClick={onResetFont}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-medium"
                        title="إعادة ضبط حجم الخط"
                      >
                        افتراضي
                      </button>
                    )}
                  </div>
                </div>

                {/* Android Native Kotlin */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenKotlinModal();
                  }}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-sky-600/20 hover:bg-sky-600/35 border border-sky-500/30 text-sky-200 transition-all text-sm font-black active:scale-95 text-right cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-5 h-5 text-sky-400" />
                    <div>
                      <div className="text-white font-black">Android Native (Kotlin)</div>
                      <div className="text-[11px] text-slate-400 font-normal">استخراج واستعراض كود Jetpack Compose الأصلي</div>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-sky-300" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
          <span className="font-bold text-slate-400">AutoCinema Settings Hub v3.0</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
