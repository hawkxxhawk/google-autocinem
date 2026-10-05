import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, MovieItem, FavoriteList, FavoriteColor, FAVORITE_SECTIONS, getFavoriteSectionConfig } from '../types';
import { getFolderTextColor } from '../utils/storage';
import {
  Star,
  X,
  ExternalLink,
  Plus,
  Trash2,
  Folder as FolderIcon,
  Search,
  ListPlus,
  Globe,
  Film,
  Check,
  Eye,
  EyeOff,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  MoreVertical,
  ArrowUpDown,
} from 'lucide-react';
import { getDomainFromUrl, cleanMovieTitle } from '../utils/storage';
import { ReorderItemModal } from './ReorderItemModal';

interface FavoritesModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  movies: MovieItem[];
  favoriteLists: FavoriteList[];
  onToggleFavorite: (id: string, color?: FavoriteColor | null) => void;
  onOpenMovie: (movie: MovieItem) => void;
  onCreateFavoriteList: (name: string, description: string, color: string) => void;
  onDeleteFavoriteList: (id: string) => void;
  onToggleMovieInFavoriteList: (movieId: string, listId: string) => void;
  hiddenFavoriteSections?: FavoriteColor[];
  onToggleHideFavoriteSection?: (sectionId: FavoriteColor) => void;
  onReorderFavoriteMovie?: (movieId: string, newPosition: number, targetSection?: FavoriteColor | 'all') => void;
}

export const FavoritesModal: React.FC<FavoritesModalProps> = ({
  isOpen,
  onClose,
  folders,
  movies,
  favoriteLists,
  onToggleFavorite,
  onOpenMovie,
  onCreateFavoriteList,
  onDeleteFavoriteList,
  onToggleMovieInFavoriteList,
  hiddenFavoriteSections = [],
  onToggleHideFavoriteSection,
  onReorderFavoriteMovie,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'custom'>('all');
  const [reorderTarget, setReorderTarget] = useState<{
    movie: MovieItem;
    currentIndex: number;
  } | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [selectedFavoriteSubFilter, setSelectedFavoriteSubFilter] = useState<'all' | FavoriteColor>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFolderFilter, setShowFolderFilter] = useState(false);
  const [openMenuMovieId, setOpenMenuMovieId] = useState<string | null>(null);
  const [openFavPickerMovieId, setOpenFavPickerMovieId] = useState<string | null>(null);

  // Excluded repository IDs state (Persisted in localStorage)
  const [excludedFolderIds, setExcludedFolderIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('favorites_excluded_folder_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Create Custom List Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [newListColor, setNewListColor] = useState('#f59e0b');

  if (!isOpen) return null;

  // Folder lookup map
  const folderMap = new Map<string, Folder>();
  folders.forEach((f) => folderMap.set(f.id, f));

  // All favorited items across any repositories
  const rawFavoriteMovies = movies.filter((m) => {
    return (
      (m.isFavorite || (m.favoriteListIds && m.favoriteListIds.length > 0)) &&
      !m.isHidden
    );
  });

  // Folders that are visible and contain at least one favorite movie
  const foldersWithFavorites = folders.filter(
    (f) =>
      !f.isFolderHidden &&
      f.includeInAllFavorites !== false &&
      rawFavoriteMovies.some((m) => m.parentFolderId === f.id)
  );

  // Filter out movies belonging to excluded/hidden repositories
  const allFavoriteMovies = rawFavoriteMovies.filter((m) => {
    const parentFolder = folderMap.get(m.parentFolderId);
    return (
      parentFolder?.includeInAllFavorites !== false &&
      !parentFolder?.isFolderHidden &&
      !excludedFolderIds.includes(m.parentFolderId)
    );
  });

  const getEffectiveFavColor = (m: MovieItem): FavoriteColor => {
    if (m.classification === 'red' || m.classification === 'purple') return 'purple';
    return m.favoriteColor || 'yellow';
  };

  const favSectionCounts = {
    green: allFavoriteMovies.filter((m) => getEffectiveFavColor(m) === 'green').length,
    yellow: allFavoriteMovies.filter((m) => getEffectiveFavColor(m) === 'yellow').length,
    purple: allFavoriteMovies.filter((m) => getEffectiveFavColor(m) === 'purple').length,
    black: allFavoriteMovies.filter((m) => getEffectiveFavColor(m) === 'black').length,
  };

  const allNonHiddenFavCount = allFavoriteMovies.filter((m) => {
    const color: FavoriteColor = getEffectiveFavColor(m);
    return !hiddenFavoriteSections.includes(color);
  }).length;

  // Toggle hiding a repository from Global Favorites
  const toggleExcludeFolder = (folderId: string) => {
    setExcludedFolderIds((prev) => {
      const next = prev.includes(folderId)
        ? prev.filter((id) => id !== folderId)
        : [...prev, folderId];
      try {
        localStorage.setItem('favorites_excluded_folder_ids', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  const clearExcludedFolders = () => {
    setExcludedFolderIds([]);
    try {
      localStorage.setItem('favorites_excluded_folder_ids', JSON.stringify([]));
    } catch (e) {
      console.error(e);
    }
  };

  // Filter movies based on selected tab / custom list / 4-color favorite sections
  let displayedMovies = allFavoriteMovies;
  if (activeTab === 'custom' && selectedListId) {
    const list = favoriteLists.find((l) => l.id === selectedListId);
    if (list) {
      displayedMovies = allFavoriteMovies.filter(
        (m) => list.movieIds.includes(m.id) || (m.favoriteListIds && m.favoriteListIds.includes(list.id))
      );
    }
  } else if (activeTab === 'all') {
    if (selectedFavoriteSubFilter === 'all') {
      displayedMovies = allFavoriteMovies.filter((m) => {
        const color: FavoriteColor = getEffectiveFavColor(m);
        return !hiddenFavoriteSections.includes(color);
      });
    } else {
      displayedMovies = allFavoriteMovies.filter((m) => {
        const color: FavoriteColor = getEffectiveFavColor(m);
        return color === selectedFavoriteSubFilter;
      });
    }
  }

  // Sort displayedMovies by custom favoriteOrder ?? manualOrder ?? 999999, then date
  displayedMovies = [...displayedMovies].sort((a, b) => {
    const orderA = a.favoriteOrder ?? a.manualOrder ?? 999999;
    const orderB = b.favoriteOrder ?? b.manualOrder ?? 999999;
    const diff = orderA - orderB;
    if (diff !== 0) return diff;
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  });

  // Filter by search query
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    displayedMovies = displayedMovies.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    onCreateFavoriteList(newListName.trim(), newListDesc.trim(), newListColor);
    setNewListName('');
    setNewListDesc('');
    setShowCreateForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md overflow-y-auto w-full min-h-screen p-3 sm:p-6 lg:p-8 animate-in fade-in duration-200">
      <div className="max-w-7xl mx-auto space-y-4 w-full min-h-[calc(100vh-3rem)] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-slate-900 to-indigo-500/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Star className="w-5 h-5 text-slate-950 fill-current" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>all favorites (المفضلة العامة والتجميعية)</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {allFavoriteMovies.length} عنصر
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                تجميع وتصفح كل العناصر المفضلة من كافة المستودعات مع إمكانية إنشاء قوائم مخصصة
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-850 text-slate-200 hover:text-white text-xs sm:text-sm font-black transition-all border border-slate-700 cursor-pointer shadow-md"
            title="إغلاق والعودة للمستودع"
          >
            <span>العودة للمستودع</span>
            <X className="w-5 h-5 text-amber-400" />
          </button>
        </div>

        {/* Tab & Search & Repository Filter Control Bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center space-x-2 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 w-full sm:w-auto">
            <button
              onClick={() => {
                setActiveTab('all');
                setSelectedListId(null);
              }}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>كل المفضلة ({allFavoriteMovies.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('custom')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'custom'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <ListPlus className="w-3.5 h-3.5" />
              <span>قوائم مخصصة ({favoriteLists.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Repository Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setShowFolderFilter(!showFolderFilter)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                excludedFolderIds.length > 0 || showFolderFilter
                  ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-750'
              }`}
              title="اختيار مستودع معين وإخفاء عناصره من المفضلة العامة"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-300" />
              <span>تصفية المستودعات</span>
              {excludedFolderIds.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white font-extrabold text-[10px]">
                  {excludedFolderIds.length} مخفي
                </span>
              )}
            </button>

            {/* Search Box */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="بحث في المفضلة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* All Favorites Sub-sections Bar (ALL + 1 Green + 2 Yellow + 3 Purple + 4 Black) */}
        {activeTab === 'all' && (
          <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-950/80 flex items-center flex-wrap gap-1.5 sm:gap-2">
            <span className="text-xs font-black text-amber-300 ml-1 flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>أقسام المفضلة:</span>
            </span>

            {/* ALL button */}
            <button
              type="button"
              id="modal-btn-fav-filter-all"
              onClick={() => setSelectedFavoriteSubFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                selectedFavoriteSubFilter === 'all'
                  ? 'bg-gradient-to-r from-amber-500 to-indigo-600 text-white shadow-md ring-2 ring-amber-300 scale-105'
                  : 'bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-850 border border-slate-700'
              }`}
              title="عرض جميع عناصر المفضلة (باستثناء ما تم اختيار إخفاؤه من الإعدادات)"
            >
              <Star className="w-3.5 h-3.5 fill-current text-amber-300" />
              <span>ALL</span>
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
                  id={`modal-btn-fav-filter-${sec.id}`}
                  onClick={() => setSelectedFavoriteSubFilter(sec.id)}
                  title={`${sec.name}: ${count} عنصر ${isHiddenInSettings ? '(مخفي من العرض العام في الإعدادات)' : ''}`}
                  className={`px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    isSelected
                      ? `${sec.buttonBg} ${sec.buttonText} shadow-md ring-2 ${sec.ringColor} scale-105`
                      : `bg-slate-900 ${sec.badgeText} hover:bg-slate-850 border border-slate-700/80`
                  } ${isHiddenInSettings ? 'border-dashed border-red-500/50' : ''}`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-white/50 shadow-sm flex-shrink-0"
                    style={{ backgroundColor: sec.colorHex }}
                  />
                  <span>{sec.name}</span>
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

        {/* Repository Filter Drawer (تحديد مستودع معين وإخفاء عناصره) */}
        {showFolderFilter && (
          <div className="p-4 bg-slate-950/90 border-b border-purple-500/30 animate-in slide-in-from-top duration-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs sm:text-sm font-black text-purple-200">
                  اختر مستودع معين لإخفاء عناصره من العرض بداخل المفضلة العامة:
                </h3>
              </div>

              {excludedFolderIds.length > 0 && (
                <button
                  type="button"
                  onClick={clearExcludedFolders}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-xs font-bold transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>إظهار كافة المستودعات</span>
                </button>
              )}
            </div>

            {foldersWithFavorites.length === 0 ? (
              <p className="text-xs text-slate-400">لا توجد عناصر مفضلة في أي مستودع حالياً.</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1 max-h-40 overflow-y-auto">
                {foldersWithFavorites.map((folder) => {
                  const isExcluded = excludedFolderIds.includes(folder.id);
                  const favCountInFolder = rawFavoriteMovies.filter(
                    (m) => m.parentFolderId === folder.id
                  ).length;
                  const folderColor = folder.color || '#3B82F6';

                  return (
                    <button
                      type="button"
                      key={folder.id}
                      onClick={() => toggleExcludeFolder(folder.id)}
                      style={{
                        borderColor: isExcluded ? 'rgba(239, 68, 68, 0.5)' : folderColor,
                        backgroundColor: isExcluded ? 'rgba(239, 68, 68, 0.15)' : 'rgba(30, 41, 59, 0.8)',
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                        isExcluded
                          ? 'text-red-300 line-through opacity-75 hover:opacity-100 shadow-inner'
                          : 'text-white hover:border-amber-400 shadow-sm'
                      }`}
                      title={
                        isExcluded
                          ? `اضغط لإظهار عناصر مستودع "${folder.name}" في المفضلة العامة`
                          : `اضغط لإخفاء عناصر مستودع "${folder.name}" من المفضلة العامة`
                      }
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: isExcluded ? '#ef4444' : folderColor }}
                      />
                      <span style={getFolderTextColor(folder.name) ? { color: getFolderTextColor(folder.name) } : undefined}>
                        {folder.name}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isExcluded ? 'bg-red-900/60 text-red-200' : 'bg-slate-800 text-amber-300'
                      }`}>
                        {favCountInFolder} عنصر
                      </span>
                      {isExcluded ? (
                        <EyeOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Hidden Repositories Alert Bar */}
        {excludedFolderIds.length > 0 && !showFolderFilter && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <EyeOff className="w-4 h-4 text-amber-400" />
              <span>
                تنبيه: تم إخفاء عناصر ({excludedFolderIds.length}) مستودع(ات) من العرض بداخل المفضلة العامة.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFolderFilter(true)}
                className="text-indigo-300 hover:underline font-bold cursor-pointer"
              >
                تعديل
              </button>
              <button
                type="button"
                onClick={clearExcludedFolders}
                className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/40 font-black cursor-pointer"
              >
                إظهار الكل
              </button>
            </div>
          </div>
        )}

        {/* Custom Favorite Lists Pill Sub-Bar (When Custom Tab Active) */}
        {activeTab === 'custom' && (
          <div className="p-3 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center space-x-2 overflow-x-auto py-1">
              <button
                onClick={() => setSelectedListId(null)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                  selectedListId === null
                    ? 'bg-indigo-600 text-white border-indigo-400'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                جميع القوائم المخصصة
              </button>

              {favoriteLists.map((list) => {
                const isSelected = selectedListId === list.id;
                const count = list.movieIds.length;
                return (
                  <div key={list.id} className="flex items-center space-x-1 flex-shrink-0">
                    <button
                      onClick={() => setSelectedListId(list.id)}
                      style={{
                        borderColor: list.color || '#f59e0b',
                        backgroundColor: isSelected ? `${list.color || '#f59e0b'}33` : 'rgba(30,41,59,0.7)',
                      }}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                        isSelected ? 'text-white' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: list.color || '#f59e0b' }}
                      />
                      <span>{list.name}</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-bold">
                        {count}
                      </span>
                    </button>

                    {favoriteLists.length > 1 && (
                      <button
                        onClick={() => onDeleteFavoriteList(list.id)}
                        className="p-1 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800"
                        title="حذف القائمة المخصصة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center space-x-1 px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs whitespace-nowrap shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إنشاء قائمة جديدة</span>
            </button>
          </div>
        )}

        {/* Create Custom List Form */}
        {showCreateForm && (
          <form onSubmit={handleCreateSubmit} className="p-4 bg-slate-800/90 border-b border-slate-700 animate-in slide-in-from-top duration-150 space-y-3">
            <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <ListPlus className="w-4 h-4" />
              <span>إنشاء قائمة مفضلة مخصصة جديدة</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="اسم القائمة (مثال: مفضلة الأكشن)"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                required
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />

              <input
                type="text"
                placeholder="وصف مختصر (اختياري)"
                value={newListDesc}
                onChange={(e) => setNewListDesc(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />

              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">اللون:</span>
                {['#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#3b82f6', '#ef4444'].map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setNewListColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      newListColor === c ? 'border-white scale-110' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-3 py-1 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                إلغاء
              </button>

              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md"
              >
                حفظ القائمة
              </button>
            </div>
          </form>
        )}

        {/* Modal Main Content Area (Items Grid) */}
        <div className="flex-1 p-4 sm:p-6 min-h-[400px]">
          {displayedMovies.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <Star className="w-12 h-12 mx-auto text-slate-700 stroke-1" />
              <p className="text-sm font-semibold text-slate-400">لا توجد عناصر في هذه القائمة المفضلة</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                قم بالضغط على نجمة المفضلة ★ لأي فيلم أو رابط في أي مستودع لجمعه هنا تلقائياً!
              </p>
            </div>
          ) : (
            <div
              className="grid gap-1 sm:gap-1.5 transition-all duration-300 w-full"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 252px), 1fr))',
              }}
            >
              {displayedMovies.map((movie, index) => {
                const folder = folderMap.get(movie.parentFolderId);
                const domain = getDomainFromUrl(movie.url || movie.embedUrl);
                const cleanDescription = movie.description
                  ? movie.description
                      .replace(/Imported\s*via\s*JSON\s*feed/gi, '')
                      .replace(/Imported\s*via\s*JSON/gi, '')
                      .replace(/مستورد\s*عبر\s*تغذية\s*JSON\s*(\([^)]*\))?/gi, '')
                      .replace(/\(\s*movie\s*\)/gi, '')
                      .trim()
                  : '';

                const isMenuOpen = openMenuMovieId === movie.id;
                const movieCustomLists = favoriteLists.filter(
                  (list) =>
                    list.movieIds.includes(movie.id) ||
                    (movie.favoriteListIds && movie.favoriteListIds.includes(list.id))
                );

                const itemIndex = index + 1;

                return (
                  <div
                    key={movie.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => onOpenMovie(movie)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenMovie(movie);
                      }
                    }}
                    className="group bg-slate-850 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-400/70 rounded-lg overflow-hidden shadow-sm hover:shadow-lg hover:shadow-amber-500/10 transition-all flex flex-col justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 relative"
                    title="اضغط لتشغيل وفتح العنصر"
                  >
                    {/* Media / Poster Banner */}
                    <div className="relative aspect-[1/1.23] w-full bg-slate-900 overflow-hidden">
                      {movie.posterUrl ? (
                        <img
                          src={movie.posterUrl}
                          alt={movie.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-amber-950/40 text-slate-500 p-2">
                          <Film className="w-8 h-8 mb-1 text-amber-500/40" />
                          <span className="text-xs text-slate-400 font-bold">{movie.category || 'Cinema'}</span>
                        </div>
                      )}

                      {/* Top Badges */}
                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
                        {/* Parent Folder Badge & Order Number Button */}
                        <div className="flex items-center gap-1 max-w-[65%]">
                          {/* Order Index Badge Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReorderTarget({ movie, currentIndex: itemIndex });
                            }}
                            title={`الترتيب في المفضلة: #${itemIndex} (انقر لنقل الفيلم للمقدمة #1 أو لتغيير رقم الترتيب يدوياً)`}
                            className="px-2 py-0.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black shadow-md border border-amber-300 flex-shrink-0 tracking-tight transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                          >
                            <span>#{itemIndex}</span>
                            <ArrowUpDown className="w-2.5 h-2.5 opacity-80" />
                          </button>

                          {folder && (
                          <div className="flex items-center gap-1 max-w-[60%]">
                            <span
                              style={{
                                backgroundColor: `${folder.color || '#1e88e5'}dd`,
                              }}
                              className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-black text-white shadow-md truncate"
                            >
                              <FolderIcon className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate max-w-[80px]">{folder.name}</span>
                            </span>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExcludeFolder(folder.id);
                              }}
                              className="p-1 rounded-full bg-slate-950/85 hover:bg-red-600 text-slate-300 hover:text-white transition-colors border border-slate-700/60 shadow-md cursor-pointer"
                              title={`إخفاء كافة عناصر مستودع "${folder.name}" من المفضلة العامة`}
                            >
                              <EyeOff className="w-3 h-3 text-red-300" />
                            </button>
                          </div>
                        )}
                        </div>

                        {/* Top Right Actions: Google/Yandex + 3 Dots Menu + Favorite Star */}
                        <div className="flex items-center gap-1 relative">
                          {/* Quick Search on Google */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const query = encodeURIComponent(cleanMovieTitle(movie.title) || movie.title);
                              window.open(`https://www.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer');
                            }}
                            title={`بحث عن "${cleanMovieTitle(movie.title) || movie.title}" في Google`}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-950/85 hover:bg-blue-600/90 text-blue-400 hover:text-white backdrop-blur-md border border-blue-500/40 hover:border-blue-400 text-[10px] font-black transition-all shadow-md active:scale-95 cursor-pointer"
                          >
                            <Search className="w-2.5 h-2.5" />
                            <span>G</span>
                          </button>

                          {/* Quick Search on Yandex */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const query = encodeURIComponent(cleanMovieTitle(movie.title) || movie.title);
                              window.open(`https://yandex.com/search/?text=${query}`, '_blank', 'noopener,noreferrer');
                            }}
                            title={`بحث عن "${cleanMovieTitle(movie.title) || movie.title}" في Yandex`}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-950/85 hover:bg-red-600/90 text-red-400 hover:text-white backdrop-blur-md border border-red-500/40 hover:border-red-400 text-[10px] font-black transition-all shadow-md active:scale-95 cursor-pointer"
                          >
                            <Search className="w-2.5 h-2.5" />
                            <span>Y</span>
                          </button>

                          {/* 3 Dots Menu Button for Custom Lists */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuMovieId(isMenuOpen ? null : movie.id);
                            }}
                            className="p-1.5 rounded-full bg-slate-950/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/70 shadow-md transition-colors cursor-pointer"
                            title="إضافة إلى قائمة مخصصة"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* 4-Color Favorite Button */}
                          {(() => {
                            const effectiveColor = getEffectiveFavColor(movie);
                            const currentFavSection = getFavoriteSectionConfig(effectiveColor);
                            const isFavPickerOpen = openFavPickerMovieId === movie.id;
                            let favBtnStyle = 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300';
                            if (currentFavSection.id === 'green') {
                              favBtnStyle = 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300';
                            } else if (currentFavSection.id === 'purple') {
                              favBtnStyle = 'bg-purple-600 text-white shadow-md ring-2 ring-purple-300';
                            } else if (currentFavSection.id === 'black') {
                              favBtnStyle = 'bg-black text-amber-300 border border-slate-600 shadow-md ring-2 ring-slate-400';
                            }

                            return (
                              <div className="relative inline-block">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenFavPickerMovieId(isFavPickerOpen ? null : movie.id);
                                    setOpenMenuMovieId(null);
                                  }}
                                  className={`p-1.5 rounded-full font-bold shadow-md hover:scale-110 transition-transform cursor-pointer ${favBtnStyle}`}
                                  title={`مفضلة: ${currentFavSection.name} (انقر للتغيير أو الإلغاء)`}
                                >
                                  <Star className="w-4 h-4 fill-current" />
                                </button>

                                {isFavPickerOpen && typeof document !== "undefined" && createPortal(
                                  <div
                                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenFavPickerMovieId(null);
                                    }}
                                  >
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full max-w-sm sm:max-w-md bg-slate-900 border-2 border-amber-500/80 rounded-2xl shadow-2xl p-4 sm:p-5 text-right dir-rtl animate-in zoom-in-95 duration-150 flex flex-col gap-3"
                                      style={{ direction: "rtl" }}
                                    >
                                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-xs font-black text-white">
                                        <div className="flex items-center gap-1.5">
                                          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                          <span>قسم المفضلة:</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setOpenFavPickerMovieId(null)}
                                          className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 cursor-pointer"
                                          title="إغلاق"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>

                                      <div className="space-y-1">
                                        {FAVORITE_SECTIONS.map((sec) => {
                                          const isSelected = effectiveColor === sec.id;
                                          return (
                                            <button
                                              key={sec.id}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleFavorite(movie.id, sec.id);
                                                setOpenFavPickerMovieId(null);
                                              }}
                                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                                isSelected
                                                  ? `${sec.buttonBg} ${sec.buttonText} shadow-md ring-2 ${sec.ringColor}`
                                                  : 'hover:bg-slate-850 text-slate-200 border border-slate-800'
                                              }`}
                                            >
                                              <div className="flex items-center gap-2">
                                                <span
                                                  className="w-3.5 h-3.5 rounded-full border border-white/50 shadow-sm flex-shrink-0"
                                                  style={{ backgroundColor: sec.colorHex }}
                                                />
                                                <span>{sec.number}- {sec.name}</span>
                                              </div>
                                              {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                                            </button>
                                          );
                                        })}
                                      </div>

                                      <div className="pt-2 mt-0.5 border-t border-slate-800">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onToggleFavorite(movie.id, null);
                                            setOpenFavPickerMovieId(null);
                                          }}
                                          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-black text-red-300 hover:text-white bg-red-950/70 hover:bg-red-600 border border-red-500/50 hover:border-red-400 transition-all cursor-pointer shadow-md active:scale-95 group"
                                          title="حذف هذا الفيلم من المفضلة الحالية وإزالته"
                                        >
                                          <Trash2 className="w-4 h-4 text-red-400 group-hover:text-white transition-colors" />
                                          <span>حذف الفيلم من المفضلة الحالية</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>,
                                  document.body
                                )}
                              </div>
                            );
                          })()}

                          {/* 3-Dots Dropdown Menu for Custom Lists */}
                          {isMenuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute top-9 left-0 w-60 bg-slate-900/98 backdrop-blur-xl border border-slate-700 rounded-xl shadow-2xl p-2.5 z-30 animate-in fade-in duration-150 text-right"
                            >
                              <div className="px-1.5 py-1 text-xs font-black text-amber-400 border-b border-slate-800 pb-1.5 mb-1.5 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <ListPlus className="w-4 h-4 text-amber-400" />
                                  <span>إضافة إلى قائمة مخصصة</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setOpenMenuMovieId(null)}
                                  className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {favoriteLists.length > 0 ? (
                                <div className="space-y-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                  {favoriteLists.map((list) => {
                                    const inList =
                                      list.movieIds.includes(movie.id) ||
                                      (movie.favoriteListIds && movie.favoriteListIds.includes(list.id));
                                    return (
                                      <button
                                        key={list.id}
                                        type="button"
                                        onClick={() => {
                                          onToggleMovieInFavoriteList(movie.id, list.id);
                                        }}
                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                          inList
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 truncate">
                                          <span
                                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: list.color || '#f59e0b' }}
                                          />
                                          <span className="truncate">{list.name}</span>
                                        </div>
                                        {inList && <Check className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mr-1" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="px-2 py-3 text-center text-slate-400 text-xs space-y-2">
                                  <p>لا توجد قوائم مخصصة بعد</p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuMovieId(null);
                                      setActiveTab('custom');
                                      setShowCreateForm(true);
                                    }}
                                    className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/40 font-bold text-xs inline-block cursor-pointer"
                                  >
                                    + إنشاء قائمة جديدة
                                  </button>
                                </div>
                              )}

                              {/* Reorder Button inside Menu */}
                              <div className="pt-1.5 mt-1.5 border-t border-slate-800">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuMovieId(null);
                                    setReorderTarget({ movie, currentIndex: itemIndex });
                                  }}
                                  className="w-full text-right px-2 py-1.5 rounded-lg text-xs font-bold text-amber-300 hover:bg-slate-800 flex items-center justify-between transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
                                    <span>ترتيب العنصر في المفضلة</span>
                                  </div>
                                  <span className="font-mono text-amber-400">#{itemIndex}</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Domain Overlay */}
                      <div className="absolute bottom-2 left-2 z-10">
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-950/85 text-xs font-bold text-sky-300 border border-sky-500/30 flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5" />
                          <span>{domain}</span>
                        </span>
                      </div>
                    </div>

                    {/* Content Section */}
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <h3 className="text-base sm:text-lg font-black text-white group-hover:text-amber-300 transition-colors line-clamp-2 leading-snug tracking-wide">
                          {cleanMovieTitle(movie.title) || movie.title}
                        </h3>
                        {cleanDescription && (
                          <p className="text-xs sm:text-sm font-semibold text-slate-300 line-clamp-2 mt-1 leading-normal">
                            {cleanDescription}
                          </p>
                        )}
                        {/* Custom Lists chips if any */}
                        {movieCustomLists.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap mt-2">
                            {movieCustomLists.map((list) => (
                              <span
                                key={list.id}
                                style={{
                                  borderColor: `${list.color || '#f59e0b'}80`,
                                  backgroundColor: `${list.color || '#f59e0b'}25`,
                                }}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-300 border truncate max-w-[90px]"
                                title={`مدرج في قائمة: ${list.name}`}
                              >
                                {list.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            يتم حفظ ونقل قوائم المفضلة تلقائياً عند تصدير واستيراد ملفات البيانات (initialData.json)
          </span>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>

      {/* Reorder Modal */}
      {reorderTarget && (
        <ReorderItemModal
          isOpen={!!reorderTarget}
          onClose={() => setReorderTarget(null)}
          movie={reorderTarget.movie}
          currentIndex={reorderTarget.currentIndex}
          totalItems={displayedMovies.length}
          sectionName={
            activeTab === 'all'
              ? selectedFavoriteSubFilter === 'all'
                ? 'كل المفضلة العامة'
                : FAVORITE_SECTIONS.find((s) => s.id === selectedFavoriteSubFilter)?.name || 'أقسام المفضلة'
              : 'القوائم المخصصة'
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
