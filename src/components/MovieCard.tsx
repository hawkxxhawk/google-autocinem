import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MovieItem, ClassificationRating, FavoriteColor, FAVORITE_SECTIONS, getFavoriteSectionConfig } from '../types';
import { getDomainFromUrl, cleanMovieTitle, getFolderTextColor } from '../utils/storage';
import { CLASSIFICATION_OPTIONS, getClassificationInfo } from '../utils/classificationUtils';
import { classifyMoviesWithGemini } from '../utils/aiClassification';
import {
  Star,
  AlertTriangle,
  EyeOff,
  MoreVertical,
  Clock,
  Edit2,
  Trash2,
  Globe,
  Film,
  Copy,
  FolderPlus,
  Folder,
  Search,
  ExternalLink,
  Palette,
  Check,
  X,
  Sparkles,
  Loader2,
  Bot,
  BookOpen,
  ArrowUpDown,
} from 'lucide-react';

interface MovieCardProps {
  movie: MovieItem;
  itemIndex?: number;
  folderName?: string;
  folderColor?: string;
  isAllFavorites?: boolean;
  onOpenMovie: (movie: MovieItem) => void;
  onToggleFavorite: (id: string, color?: FavoriteColor | null) => void;
  onToggleBroken: (id: string) => void;
  onToggleHide: (id: string) => void;
  onEditMovie: (movie: MovieItem) => void;
  onDeleteMovie: (id: string) => void;
  onCopyMovieToFolder?: (movie: MovieItem, targetFolderNameOrId: string) => void;
  onSelectFolder?: (folderId: string) => void;
  onUpdateClassification?: (
    movieId: string,
    rating: ClassificationRating,
    reason?: string,
    storySummary?: string
  ) => void;
  onReorderMovie?: (movieId: string, currentPos: number) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({
  movie,
  itemIndex,
  folderName,
  folderColor,
  isAllFavorites = false,
  onOpenMovie,
  onToggleFavorite,
  onToggleBroken,
  onToggleHide,
  onEditMovie,
  onDeleteMovie,
  onCopyMovieToFolder,
  onSelectFolder,
  onUpdateClassification,
  onReorderMovie,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFavoritePicker, setShowFavoritePicker] = useState(false);
  const [isRatingHovered, setIsRatingHovered] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const badgeButtonRef = useRef<HTMLButtonElement | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [imgError, setImgError] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const domain = getDomainFromUrl(movie.url || movie.embedUrl);

  // Reset imgError if posterUrl changes due to movie edit
  useEffect(() => {
    setImgError(false);
  }, [movie.posterUrl, movie.title, movie.id]);

  const handleMouseEnterBadge = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (badgeButtonRef.current) {
      const rect = badgeButtonRef.current.getBoundingClientRect();
      const popoverWidth = Math.min(560, Math.max(350, window.innerWidth - 24));

      // Right-aligned with badge in RTL, clamped within screen
      let left = rect.right - popoverWidth;
      if (left < 12) left = 12;
      if (left + popoverWidth > window.innerWidth - 12) {
        left = window.innerWidth - popoverWidth - 12;
      }

      // Vertical position: prioritize ABOVE the badge if space allows (>= 280px), otherwise BELOW
      if (rect.top >= 280) {
        setPopoverCoords({
          bottom: window.innerHeight - rect.top + 8,
          left,
          width: popoverWidth,
        });
      } else {
        setPopoverCoords({
          top: rect.bottom + 8,
          left,
          width: popoverWidth,
        });
      }
      setIsRatingHovered(true);
    }
  };

  const handleMouseLeaveBadge = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setIsRatingHovered(false);
    }, 180);
  };

  const handleMouseEnterPopover = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsRatingHovered(true);
  };

  const handleMouseLeavePopover = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setIsRatingHovered(false);
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isRatingHovered) return;
    const handleScrollOrResize = () => {
      setIsRatingHovered(false);
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isRatingHovered]);

  useEffect(() => {
    if (!showFavoritePicker) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFavoritePicker(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFavoritePicker]);

  const handleClassifySingleWithGemini = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    if (isAiLoading || !onUpdateClassification) return;
    setIsAiLoading(true);
    try {
      const res = await classifyMoviesWithGemini([movie]);
      if (res.success && res.results && res.results[0]) {
        const result = res.results[0];
        onUpdateClassification(movie.id, result.classification, result.reason, result.storySummary);
      } else {
        alert(res.error || 'تعذر تقييم الفيلم بواسطة الذكاء الاصطناعي.');
      }
    } catch (err: any) {
      alert(err?.message || 'حدث خطأ أثناء الاتصال بـ Gemini.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const classification = getClassificationInfo(movie.classification);

  const displayTitle = cleanMovieTitle(movie.title) || movie.title || 'بدون عنوان';

  // Clean description by removing unwanted JSON feed phrase
  const cleanDescription = movie.description
    ? movie.description
        .replace(/Imported\s*via\s*JSON\s*feed/gi, '')
        .replace(/Imported\s*via\s*JSON/gi, '')
        .replace(/مستورد\s*عبر\s*تغذية\s*JSON\s*(\([^)]*\))?/gi, '')
        .replace(/\(\s*movie\s*\)/gi, '')
        .trim()
    : '';

  const handleCardClick = (e: React.MouseEvent) => {
    // If user clicked inside a button or menu, ignore
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    onOpenMovie(movie);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenMovie(movie);
    }
  };

  const handleSearchGoogle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const query = encodeURIComponent(displayTitle || movie.title);
    window.open(`https://www.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer');
  };

  const handleSearchYandex = (e: React.MouseEvent) => {
    e.stopPropagation();
    const query = encodeURIComponent(displayTitle || movie.title);
    window.open(`https://yandex.com/search/?text=${query}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className={`group relative bg-slate-850 hover:bg-slate-800 rounded-xl overflow-hidden transition-all duration-300 flex flex-col justify-between cursor-pointer focus:ring-4 focus:ring-purple-500/80 focus:border-purple-400 focus:scale-[1.015] focus:z-20 focus:outline-none ${
        classification.cardBorder
      } ${classification.cardGlow}`}
    >
      {/* Top Media / Poster Container (Wider horizontal proportion) */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onOpenMovie(movie);
        }}
        title="اضغط لفتح وتشغيل العنصر"
        className="relative aspect-[1/1.16] w-full bg-slate-900 overflow-hidden cursor-pointer"
      >
        {movie.posterUrl && !imgError ? (
          <img
            src={movie.posterUrl}
            alt={displayTitle}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950 text-slate-500 p-2">
            <Film className="w-8 h-8 mb-1 text-slate-600" />
            <span className="text-xs text-slate-400 font-medium text-center truncate max-w-[90%]">
              {movie.category || 'Cinema Entry'}
            </span>
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />

        {/* Top Badges Row */}
        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between z-10">
          {/* Index Badge & Quick Search Icons */}
          <div className="flex items-center gap-1">
            {itemIndex !== undefined && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onReorderMovie) {
                    onReorderMovie(movie.id, itemIndex);
                  }
                }}
                title={
                  onReorderMovie
                    ? `الترتيب في قسم المفضلة: #${itemIndex} (انقر لنقل الفيلم للمقدمة #1 أو لتغيير رقم الترتيب يدوياً)`
                    : `الترتيب: #${itemIndex}`
                }
                className={`px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs sm:text-sm font-black shadow-lg border border-amber-300 flex-shrink-0 tracking-tight transition-all flex items-center gap-1 ${
                  onReorderMovie
                    ? 'hover:bg-amber-300 hover:scale-105 active:scale-95 cursor-pointer ring-1 hover:ring-amber-200'
                    : 'cursor-default select-none'
                }`}
              >
                <span>#{itemIndex}</span>
                {onReorderMovie && (
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-80" />
                )}
              </button>
            )}

            {/* Quick Search on Google */}
            <button
              type="button"
              id={`btn-search-google-${movie.id}`}
              onClick={handleSearchGoogle}
              title={`بحث عن "${displayTitle}" في Google`}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-950/85 hover:bg-blue-600/90 text-blue-400 hover:text-white backdrop-blur-md border border-blue-500/40 hover:border-blue-400 text-[10px] sm:text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Search className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span>G</span>
            </button>

            {/* Quick Search on Yandex */}
            <button
              type="button"
              id={`btn-search-yandex-${movie.id}`}
              onClick={handleSearchYandex}
              title={`بحث عن "${displayTitle}" في Yandex`}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-950/85 hover:bg-red-600/90 text-red-400 hover:text-white backdrop-blur-md border border-red-500/40 hover:border-red-400 text-[10px] sm:text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Search className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span>Y</span>
            </button>
          </div>

          {/* Quick Actions (Favorite & Options) */}
          <div className="flex items-center space-x-1">
            {/* 4-Color Favorite Button */}
            {(() => {
              const isHighRating = movie.classification === 'red' || movie.classification === 'purple';
              const effectiveColor: FavoriteColor = isHighRating ? 'purple' : (movie.favoriteColor || 'yellow');
              const currentFavSection = getFavoriteSectionConfig(effectiveColor);
              let favBtnStyle = 'bg-slate-900/80 text-slate-400 hover:text-amber-400 hover:bg-slate-800';
              if (movie.isFavorite) {
                if (currentFavSection.id === 'green') {
                  favBtnStyle = 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300 scale-105';
                } else if (currentFavSection.id === 'purple') {
                  favBtnStyle = 'bg-purple-600 text-white shadow-md ring-2 ring-purple-300 scale-105';
                } else if (currentFavSection.id === 'black') {
                  favBtnStyle = 'bg-black text-amber-300 border border-slate-600 shadow-md ring-2 ring-slate-400 scale-105';
                } else {
                  favBtnStyle = 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 scale-105';
                }
              }

              return (
                <button
                  id={`btn-fav-${movie.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!movie.isFavorite && isHighRating) {
                      // Direct addition to purple section as requested
                      onToggleFavorite(movie.id, 'purple');
                    } else {
                      setShowFavoritePicker(!showFavoritePicker);
                      setShowMenu(false);
                      setShowColorPicker(false);
                    }
                  }}
                  title={
                    movie.isFavorite
                      ? `مفضلة: ${currentFavSection.name} (انقر للتعديل أو الإلغاء)`
                      : isHighRating
                      ? 'إضافة مباشرة إلى مفضلة 3 بنفسجي (تصنيف عالٍ / عالٍ جدًا)'
                      : 'إضافة إلى المفضلة (اختر من 4 ألوان)'
                  }
                  className={`p-1.5 rounded-full backdrop-blur-md transition-all cursor-pointer ${favBtnStyle}`}
                >
                  <Star className="w-4 h-4 fill-current" />
                </button>
              );
            })()}

            <button
              id={`btn-menu-${movie.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
                setShowColorPicker(false);
                setShowFavoritePicker(false);
              }}
              className="p-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 backdrop-blur-md transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4-Color Favorite Picker Modal (Portal to body so it displays completely on top of screen) */}
        {showFavoritePicker && typeof document !== 'undefined' && createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={(e) => {
              e.stopPropagation();
              setShowFavoritePicker(false);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm sm:max-w-md bg-slate-900 border-2 border-amber-500/80 rounded-2xl shadow-2xl p-4 sm:p-5 text-right dir-rtl animate-in zoom-in-95 duration-150 flex flex-col gap-3"
              style={{ direction: 'rtl' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-sm font-black text-white">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm sm:text-base font-black text-white">
                      {movie.isFavorite || isAllFavorites
                        ? 'خيارات وتعديل المفضلة'
                        : 'إضافة الفيلم إلى المفضلة'}
                    </span>
                    <span className="text-xs text-slate-400 font-medium truncate max-w-[240px] sm:max-w-[280px]" title={displayTitle}>
                      {displayTitle}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFavoritePicker(false)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
                  title="إغلاق النافذة"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Description */}
              <p className="text-xs text-slate-300 font-medium leading-relaxed">
                حدد قسم ولون المفضلة المطلوب لهذا الفيلم، أو احذفه مباشرة من المفضلة الحالية:
              </p>

              {/* 4 Favorite Sections */}
              <div className="space-y-2">
                {FAVORITE_SECTIONS.map((sec) => {
                  const isSelected = movie.isFavorite && (movie.favoriteColor || 'yellow') === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(movie.id, sec.id);
                        setShowFavoritePicker(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
                        isSelected
                          ? `${sec.buttonBg} ${sec.buttonText} shadow-lg ring-2 ${sec.ringColor} scale-[1.01]`
                          : 'bg-slate-950/80 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-4 h-4 rounded-full border border-white/60 shadow-sm flex-shrink-0"
                          style={{ backgroundColor: sec.colorHex }}
                        />
                        <span>
                          {sec.number}- {sec.colorName} ({sec.name})
                        </span>
                      </div>
                      {isSelected ? (
                        <span className="flex items-center gap-1 text-xs font-black bg-black/25 px-2 py-0.5 rounded-md">
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>القسم الحالي</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">
                          اختيار
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* إمكانية حذف الفيلم من المفضلة الحالية */}
              {(movie.isFavorite || isAllFavorites || movie.favoriteColor) && (
                <div className="pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(movie.id, null);
                      setShowFavoritePicker(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-black text-red-300 hover:text-white bg-red-950/70 hover:bg-red-600 border border-red-500/50 hover:border-red-400 transition-all cursor-pointer shadow-lg active:scale-95 group"
                    title="حذف هذا الفيلم من المفضلة الحالية وإزالته"
                  >
                    <Trash2 className="w-4 h-4 text-red-400 group-hover:text-white transition-colors" />
                    <span>حذف الفيلم من المفضلة الحالية</span>
                  </button>
                </div>
              )}

              {/* Close Button in Footer */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowFavoritePicker(false)}
                  className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Interactive Mouse Color Picker Dropdown (Triggered by the bottom classification badge or menu) */}
        {showColorPicker && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-1.5 bg-slate-950/98 backdrop-blur-2xl border-2 border-slate-700/90 rounded-xl shadow-2xl p-2.5 z-40 animate-in fade-in zoom-in-95 duration-150 text-right dir-rtl flex flex-col justify-between overflow-y-auto custom-scrollbar"
          >
            <div>
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800 text-xs font-black text-white">
                <div className="flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-indigo-400" />
                  <span>اختر لون الإطار وتصنيف الفيلم:</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowColorPicker(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1">
                {CLASSIFICATION_OPTIONS.map((opt) => {
                  const isSelected = (movie.classification || 'unverified') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onUpdateClassification) {
                          onUpdateClassification(movie.id, opt.id);
                        }
                        setShowColorPicker(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-850 border-2 border-indigo-400 text-white shadow-md'
                          : 'hover:bg-slate-850 text-slate-300 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{opt.emoji}</span>
                        {opt.level !== 'غير محدد' && (
                          <span className="font-mono font-black text-amber-300 bg-slate-900 px-1.5 py-0.5 rounded text-[11px] border border-slate-800">
                            {opt.level}
                          </span>
                        )}
                        <span className={opt.badgeText}>{opt.label}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-full border-2 border-white/50 shadow-sm"
                          style={{ backgroundColor: opt.colorHex }}
                        />
                        {isSelected && <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowColorPicker(false)}
              className="mt-2 w-full py-1 text-center text-[11px] font-bold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors"
            >
              تم
            </button>
          </div>
        )}

        {/* Card Context Menu */}
        {showMenu && (
          <div className="absolute top-9 right-1.5 w-48 max-h-52 sm:max-h-60 overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-900/98 backdrop-blur-xl border border-slate-700/90 rounded-xl shadow-2xl py-1 z-30 animate-in fade-in duration-150">
            {/* 1. تعديل العنصر (في الأعلى دائماً) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onEditMovie(movie);
              }}
              className="w-full text-left px-3 py-2 text-xs font-black text-sky-300 hover:text-white bg-sky-950/50 hover:bg-sky-600 flex items-center space-x-2 space-x-reverse transition-all border-b border-slate-800 cursor-pointer shadow-sm"
              title="تعديل بيانات هذا العنصر مباشرة"
            >
              <Edit2 className="w-3.5 h-3.5 text-sky-400 group-hover:text-white flex-shrink-0" />
              <span>تعديل العنصر</span>
            </button>

            {/* 4-Color Favorite Option */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                const isHighRating = movie.classification === 'red' || movie.classification === 'purple';
                if (!movie.isFavorite && isHighRating) {
                  onToggleFavorite(movie.id, 'purple');
                } else {
                  setShowFavoritePicker(true);
                }
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-950/60 flex items-center space-x-2 space-x-reverse transition-colors"
            >
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>
                {movie.isFavorite
                  ? `تعديل المفضلة (${getFavoriteSectionConfig((movie.classification === 'red' || movie.classification === 'purple') ? 'purple' : movie.favoriteColor).shortName})`
                  : (movie.classification === 'red' || movie.classification === 'purple')
                  ? 'إضافة مباشرة إلى مفضلة 3 بنفسجي ⭐'
                  : 'إضافة إلى المفضلة ⭐'}
              </span>
            </button>
            {/* Reorder in Favorites Option */}
            {onReorderMovie && itemIndex !== undefined && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onReorderMovie(movie.id, itemIndex);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-950/60 flex items-center space-x-2 space-x-reverse transition-colors cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
                <span>ترتيب العنصر في المفضلة (#{itemIndex})</span>
              </button>
            )}

            {/* Remove from current favorite option */}
            {(movie.isFavorite || isAllFavorites || movie.favoriteColor) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(movie.id, null);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-950/60 flex items-center space-x-2 space-x-reverse transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>حذف الفيلم من المفضلة الحالية</span>
              </button>
            )}

            {/* Color Classification Option */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                setShowColorPicker(true);
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-bold text-indigo-300 hover:bg-indigo-950/60 flex items-center space-x-2 space-x-reverse transition-colors"
            >
              <Palette className="w-3.5 h-3.5 text-indigo-400" />
              <span>لون الإطار والتصنيف ({classification.emoji})</span>
            </button>

            {/* AI Classification Option with Gemini */}
            <button
              onClick={handleClassifySingleWithGemini}
              disabled={isAiLoading}
              className="w-full text-left px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-950/60 flex items-center space-x-2 space-x-reverse transition-colors border-b border-slate-800/80 pb-1.5"
            >
              {isAiLoading ? (
                <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{isAiLoading ? 'جاري التحليل بـ Gemini...' : 'تصنيف بذكاء جيميناي 🤖'}</span>
            </button>

            {/* Direct Web Searches */}
            <div className="border-t border-slate-800/80 my-1 pt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  handleSearchGoogle(e);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-bold text-blue-300 hover:bg-blue-950/60 flex items-center space-x-2 space-x-reverse transition-colors"
              >
                <Search className="w-3.5 h-3.5 text-blue-400" />
                <span>بحث في Google</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  handleSearchYandex(e);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-950/60 flex items-center space-x-2 space-x-reverse transition-colors"
              >
                <Search className="w-3.5 h-3.5 text-red-400" />
                <span>بحث في Yandex</span>
              </button>
            </div>

            {/* Quick Copy to Fav Repositories */}
            {onCopyMovieToFolder && (
              <div className="border-t border-slate-800/80 my-1 pt-1">
                <div className="px-3 py-1 text-[10px] font-black text-amber-400 tracking-wider flex items-center gap-1">
                  <Copy className="w-3 h-3 text-amber-400" />
                  <span>نسخ إلى مستودع:</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onCopyMovieToFolder(movie, 'List 1 fav');
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-bold text-purple-200 hover:bg-purple-950/60 flex items-center space-x-2 space-x-reverse transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-purple-400" />
                  <span>List 1 fav</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onCopyMovieToFolder(movie, 'List 2 fav');
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-950/60 flex items-center space-x-2 space-x-reverse transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-sky-400" />
                  <span>List 2 fav</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onCopyMovieToFolder(movie, 'XX-fav');
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-bold text-pink-200 hover:bg-pink-950/60 flex items-center space-x-2 space-x-reverse transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-pink-400" />
                  <span>XX-fav</span>
                </button>
              </div>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onToggleBroken(movie.id);
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-slate-800 flex items-center space-x-2 space-x-reverse border-t border-slate-800/80 pt-1"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span>{movie.isBroken ? 'تحديد كرابط يعمل' : 'تحديد كرابط معطوب'}</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onToggleHide(movie.id);
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-slate-800 flex items-center space-x-2"
            >
              <EyeOff className="w-3.5 h-3.5 text-amber-400" />
              <span>إخفاء العنصر</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onDeleteMovie(movie.id);
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 flex items-center space-x-2 border-t border-slate-800 mt-1 pt-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف العنصر</span>
            </button>
          </div>
        )}

        {/* Bottom Poster Overlay Badges */}
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-xs font-bold z-10">
          {/* Domain / Link Badge */}
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-950/90 backdrop-blur-md text-xs font-bold text-sky-300 border border-sky-500/30 shadow-md">
            <Globe className="w-3.5 h-3.5" />
            <span className="truncate max-w-[120px]">{domain}</span>
          </span>

          {/* Duration Badge */}
          {movie.duration && (
            <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-900/95 text-slate-200 font-bold border border-slate-700/60 shadow-md">
              <Clock className="w-3.5 h-3.5 text-slate-300" />
              <span>{movie.duration}</span>
            </span>
          )}
        </div>
      </div>

      {/* Content Section (Bolder & Larger Typography, Clickable Title) */}
      <div className="p-2.5 flex-1 flex flex-col justify-between space-y-1.5">
        <div>
          {/* Broken Link Alert Banner */}
          {movie.isBroken && (
            <div className="mb-1.5 flex items-center space-x-1 px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <span className="truncate">رابط معطوب</span>
            </div>
          )}

          {/* Top Row: Classification/Rating and Repository Badges facing each other on one horizontal line */}
          <div className="mb-2 flex items-center justify-between gap-1.5 w-full min-w-0">
            {/* Interactive Classification / Rating Badge */}
            <div className="relative inline-flex items-center flex-shrink-0">
              <div className={`inline-flex items-center rounded-md border shadow-sm transition-all ${classification.badgeBorder} ${classification.badgeBg}`}>
                <button
                  ref={badgeButtonRef}
                  type="button"
                  onMouseEnter={handleMouseEnterBadge}
                  onMouseLeave={handleMouseLeaveBadge}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    setShowColorPicker(false);
                    if (isRatingHovered) {
                      setIsRatingHovered(false);
                    } else {
                      handleMouseEnterBadge();
                    }
                  }}
                  className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 text-[11px] sm:text-xs font-black transition-all cursor-pointer active:scale-95 ${classification.badgeText}`}
                  title="عرض قصة الفيلم وملاحظة المحتوى"
                >
                  <span>{classification.emoji}</span>
                  <span className="font-bold truncate max-w-[85px] sm:max-w-[120px]">
                    {classification.level !== 'غير محدد' ? `${classification.level} ` : ''}
                    {classification.label}
                  </span>
                  {movie.classificationReason && (
                    <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-pulse flex-shrink-0" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRatingHovered(false);
                    setShowMenu(false);
                    setShowColorPicker(!showColorPicker);
                  }}
                  className="px-1.5 py-1 hover:bg-slate-700/60 text-slate-300 hover:text-white transition-colors cursor-pointer border-r border-slate-700/60"
                  title="تغيير لون إطار الفيلم"
                >
                  <Palette className="w-3 h-3 opacity-80 hover:opacity-100" />
                </button>
              </div>

              {/* Floating Portal Card: Floats completely ABOVE movie card into document.body to avoid clipping */}
              {isRatingHovered && popoverCoords && !showColorPicker && typeof document !== 'undefined' && createPortal(
                <div
                  onMouseEnter={handleMouseEnterPopover}
                  onMouseLeave={handleMouseLeavePopover}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'fixed',
                    top: popoverCoords.top !== undefined ? `${popoverCoords.top}px` : undefined,
                    bottom: popoverCoords.bottom !== undefined ? `${popoverCoords.bottom}px` : undefined,
                    left: `${popoverCoords.left}px`,
                    width: `${popoverCoords.width}px`,
                    zIndex: 99999,
                  }}
                  className="bg-slate-950/98 border-2 border-slate-700/90 shadow-[0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl rounded-2xl p-4 text-right dir-rtl animate-in fade-in zoom-in-95 duration-150 transition-all select-text cursor-default"
                >
                  {/* Popover Header */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/90">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0 shadow-inner">
                        <BookOpen className="w-5 h-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-black text-amber-400">قصة فيلم:</span>
                          {movie.category && (
                            <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700/80 truncate max-w-[180px]">
                              {movie.category}
                            </span>
                          )}
                        </div>
                        <h4 className="text-base sm:text-lg font-black text-white truncate max-w-[320px] sm:max-w-[420px]">
                          {displayTitle}
                        </h4>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsRatingHovered(false)}
                      className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
                      title="إغلاق"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 1. PRIMARY FOCUS: Full Detailed Movie Story (المساحة الأكبر والأولوية الكاملة لقصة الفيلم) */}
                  <div className="mb-2">
                    {(movie.storySummary || cleanDescription) ? (
                      <div className="bg-gradient-to-br from-slate-900/95 via-slate-900 to-indigo-950/60 border border-amber-500/30 p-4 rounded-xl shadow-inner max-h-[380px] sm:max-h-[440px] overflow-y-auto custom-scrollbar">
                        <p className="text-sm sm:text-[15.5px] text-slate-100 leading-relaxed font-normal whitespace-pre-line tracking-wide selection:bg-amber-500/30">
                          {(movie.storySummary || cleanDescription).trim()}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-slate-900/80 border border-dashed border-slate-700/80 p-5 rounded-xl text-center">
                        <p className="text-sm text-slate-300 font-medium mb-3">
                          لم يتم تلخيص قصة هذا الفيلم بعد.
                        </p>
                        <button
                          type="button"
                          onClick={handleClassifySingleWithGemini}
                          disabled={isAiLoading}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-black transition-all cursor-pointer shadow-md disabled:opacity-50"
                        >
                          {isAiLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-amber-300" />
                          )}
                          <span>توليد قصة الفيلم بـ Gemini AI</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Content Note at bottom (ملاحظة المحتوى) */}
                  <div className="pt-2.5 mt-2 border-t border-slate-800/80">
                    <div className="flex items-start gap-2.5 text-xs bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-amber-400 text-sm flex-shrink-0 mt-0.5">🛡️</span>
                      <div className="leading-relaxed">
                        <span className="font-black text-amber-300 ml-1.5">ملاحظة المحتوى:</span>
                        <span className="text-slate-200">
                          {movie.classificationReason ||
                            (movie.classification === 'green'
                              ? 'محتوى عائلي أو عام نظيف خالٍ من المشاهد الجريئة.'
                              : movie.classification === 'yellow'
                              ? 'تصنيف عام خفيف أو حركة وإثارة معتادة وخالٍ من الجرأة الجسدية.'
                              : movie.classification === 'orange'
                              ? 'محتوى درامي أو رومانسي معتدل.'
                              : movie.classification === 'red'
                              ? 'يتضمن مشاهد جسدية جريئة أو إيحاءات حميمية واضحة (+18).'
                              : movie.classification === 'purple'
                              ? 'يحتوي على مشاهد بالغة الجرأة وموجه للكبار فقط (+18).'
                              : 'محتوى عام عادي')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>

            {/* Movie Repository Badge (Facing the Rating Badge on the same line) */}
            {folderName && (
              <span
                onClick={(e) => {
                  if (onSelectFolder && movie.parentFolderId) {
                    e.stopPropagation();
                    onSelectFolder(movie.parentFolderId);
                  }
                }}
                title={`الانتقال إلى مستودع: ${folderName}`}
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-md text-[11px] sm:text-xs font-black text-white shadow-sm border border-white/20 hover:opacity-90 hover:scale-105 transition-all cursor-pointer flex-shrink-0 max-w-[48%]"
                style={{ backgroundColor: folderColor || '#8E24AA' }}
              >
                <Folder className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/90 flex-shrink-0" />
                <span
                  className="truncate"
                  style={getFolderTextColor(folderName) ? { color: getFolderTextColor(folderName) } : undefined}
                >
                  {folderName}
                </span>
              </span>
            )}
          </div>

          {/* Title with Sequence Number Badge */}
          <div className="flex items-start gap-1.5">
            {itemIndex !== undefined && (
              <span
                title={`عنصر رقم #${itemIndex} في المستودع`}
                className="mt-0.5 px-1.5 py-0.5 rounded-lg bg-indigo-600/90 text-amber-300 text-xs font-black border border-indigo-400/40 shadow-sm flex-shrink-0"
              >
                #{itemIndex}
              </span>
            )}
            <h3
              onClick={(e) => {
                e.stopPropagation();
                onOpenMovie(movie);
              }}
              title="اضغط لفتح وتشغيل العنصر"
              className="text-lg sm:text-xl font-black text-white hover:text-indigo-300 group-hover:text-indigo-300 transition-colors line-clamp-2 leading-snug tracking-wide cursor-pointer flex-1"
            >
              {displayTitle}
            </h3>
          </div>

          {/* Description (Cleaned of JSON import phrase) */}
          {cleanDescription && (
            <p className="text-xs sm:text-sm font-semibold text-slate-300 line-clamp-2 mt-1 leading-normal">
              {cleanDescription}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
