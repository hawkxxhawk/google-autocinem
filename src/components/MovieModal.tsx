import React, { useState, useEffect, useRef } from 'react';
import { Folder, MovieItem, ClassificationRating, FavoriteColor, FAVORITE_SECTIONS } from '../types';
import { cleanMovieTitle, getFolderTextColor } from '../utils/storage';
import { CLASSIFICATION_OPTIONS } from '../utils/classificationUtils';
import { X, Plus, Film, Link as LinkIcon, Star, AlertTriangle, EyeOff, Sparkles, Palette } from 'lucide-react';

interface MovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (movie: Partial<MovieItem>) => void;
  folders: Folder[];
  activeFolderId: string | null;
  movieToEdit?: MovieItem | null;
  initialMovieData?: Partial<MovieItem> | null;
  existingMovies?: MovieItem[];
}

const SAMPLE_POSTERS = [
  { label: 'Cinema Hall', url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80' },
  { label: 'Sci-Fi Space', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80' },
  { label: 'Neon Cyberpunk', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80' },
  { label: 'Nature Doc', url: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=800&q=80' },
  { label: 'Indie Film', url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=80' },
];

export const MovieModal: React.FC<MovieModalProps> = ({
  isOpen,
  onClose,
  onSave,
  folders,
  activeFolderId,
  movieToEdit,
  initialMovieData,
  existingMovies = [],
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [duration, setDuration] = useState('');
  const [category, setCategory] = useState('General');
  const [posterUrl, setPosterUrl] = useState('');
  const [description, setDescription] = useState('');
  const [parentFolderId, setParentFolderId] = useState('');
  const [useDirectPlayer, setUseDirectPlayer] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteColor, setFavoriteColor] = useState<FavoriteColor>('yellow');
  const [isBroken, setIsBroken] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [classification, setClassification] = useState<ClassificationRating>('unverified');

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Check duplicate movie in the selected parentFolderId (only when adding a new movie in the same repository)
  const isDuplicate =
    !movieToEdit &&
    existingMovies.some((m) => {
      // ONLY check duplicates inside the currently selected repository
      if (m.parentFolderId !== parentFolderId) return false;

      const targetTitle = title.trim().toLowerCase();
      const targetUrl = url.trim().toLowerCase();
      const targetEmbedUrl = (embedUrl || '').trim().toLowerCase();

      const mTitle = m.title.trim().toLowerCase();
      const mUrl = m.url.trim().toLowerCase();
      const mEmbedUrl = (m.embedUrl || '').trim().toLowerCase();

      const sameTitle = targetTitle !== '' && mTitle !== '' && targetTitle === mTitle;
      const sameUrl =
        (targetUrl !== '' && (mUrl === targetUrl || (mEmbedUrl !== '' && mEmbedUrl === targetUrl))) ||
        (targetEmbedUrl !== '' && (mUrl === targetEmbedUrl || (mEmbedUrl !== '' && mEmbedUrl === targetEmbedUrl)));

      return sameTitle || sameUrl;
    });

  useEffect(() => {
    if (movieToEdit) {
      setTitle(cleanMovieTitle(movieToEdit.title) || movieToEdit.title);
      setUrl(movieToEdit.url);
      setEmbedUrl(movieToEdit.embedUrl || '');
      setDuration(movieToEdit.duration || '');
      setCategory(movieToEdit.category || 'General');
      setPosterUrl(movieToEdit.posterUrl || '');
      setDescription(movieToEdit.description || '');
      setParentFolderId(movieToEdit.parentFolderId);
      setUseDirectPlayer(movieToEdit.useDirectPlayer || false);
      setIsFavorite(movieToEdit.isFavorite || false);
      setFavoriteColor(movieToEdit.favoriteColor || 'yellow');
      setIsBroken(movieToEdit.isBroken || false);
      setIsHidden(movieToEdit.isHidden || false);
      setClassification(movieToEdit.classification || 'unverified');
    } else if (initialMovieData) {
      const defaultUrl = initialMovieData.url || '';
      const rawTitle = initialMovieData.title || defaultUrl;
      const cleaned = cleanMovieTitle(rawTitle) || rawTitle;
      setTitle(cleaned);
      setUrl(defaultUrl);
      setEmbedUrl(initialMovieData.embedUrl || defaultUrl);
      setDuration(initialMovieData.duration || '');
      setCategory(initialMovieData.category || 'General');
      setPosterUrl(initialMovieData.posterUrl || SAMPLE_POSTERS[0].url);
      setDescription(initialMovieData.description || '');
      setParentFolderId(
        initialMovieData.parentFolderId || activeFolderId || (folders.length > 0 ? folders[0].id : '')
      );
      setUseDirectPlayer(false);
      setIsFavorite(false);
      setIsBroken(false);
      setIsHidden(false);
      setClassification(initialMovieData.classification || 'unverified');
    } else {
      setTitle('');
      setUrl('');
      setEmbedUrl('');
      setDuration('');
      setCategory('General');
      setPosterUrl(SAMPLE_POSTERS[0].url);
      setDescription('');
      setParentFolderId(activeFolderId || (folders.length > 0 ? folders[0].id : ''));
      setUseDirectPlayer(false);
      setIsFavorite(false);
      setIsBroken(false);
      setIsHidden(false);
      setClassification('unverified');
    }
  }, [movieToEdit, initialMovieData, isOpen, activeFolderId, folders]);

  // Focus and highlight/select title text when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
          titleInputRef.current.select();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleAutoSelect = (
    e:
      | React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
      | React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    e.currentTarget.select();
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim() || !parentFolderId) return;

    if (!movieToEdit && isDuplicate) {
      alert('تنبيه: هذا الفيلم موجود بالفعل في هذا المستودع! تم منع التكرار داخل نفس المستودع (يمكنك إضافته في مستودع آخر إن أردت).');
      return;
    }

    const cleanedTitle = cleanMovieTitle(title.trim()) || title.trim();

    onSave({
      id: movieToEdit ? movieToEdit.id : undefined,
      title: cleanedTitle,
      url: url.trim(),
      embedUrl: embedUrl.trim() || url.trim(),
      duration: duration.trim(),
      category: category.trim(),
      posterUrl: posterUrl.trim(),
      description: description.trim() || (movieToEdit?.description || ''),
      parentFolderId,
      useDirectPlayer,
      isFavorite,
      favoriteColor: isFavorite ? ((classification === 'red' || classification === 'purple') ? 'purple' : favoriteColor) : undefined,
      isBroken,
      isHidden,
      classification,
      addedAt: movieToEdit ? movieToEdit.addedAt : new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Film className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">
              {movieToEdit ? 'تعديل بيانات العنصر' : 'إضافة فيلم إلى المستودع'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Duplicate Movie Alert Banner */}
          {isDuplicate && (
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <span>
                <strong>تنبيه تكرار:</strong> هذا الفيلم موجود بالفعل في هذا المستودع المحدد! يتم منع التكرار داخل نفس المستودع فقط، ويمكنك إضافته إلى أي مستودع آخر بحرية.
              </span>
            </div>
          )}

          {/* Target Folder Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Parent Folder <span className="text-red-400">*</span>
            </label>
            <select
              required
              value={parentFolderId}
              onChange={(e) => setParentFolderId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
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
                    {f.name} {f.isFolderHidden ? '(Hidden Folder)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Title Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Movie Title <span className="text-red-400">*</span>
            </label>
            <input
              ref={titleInputRef}
              type="text"
              required
              value={title}
              onFocus={handleAutoSelect}
              onClick={handleAutoSelect}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Interstellar, Free Solo"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-semibold"
            />
          </div>

          {/* Primary Link URL Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <LinkIcon className="w-3.5 h-3.5 text-sky-400" />
              <span>رابط تشغيل العنصر (Primary Link URL)</span>
              <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              required
              value={url}
              onFocus={handleAutoSelect}
              onClick={handleAutoSelect}
              onChange={(e) => {
                setUrl(e.target.value);
                setEmbedUrl(e.target.value);
              }}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* Duration & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Runtime Duration
              </label>
              <input
                type="text"
                value={duration}
                onFocus={handleAutoSelect}
                onClick={handleAutoSelect}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 2h 14m or 124 min"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Category / Genre
              </label>
              <input
                type="text"
                value={category}
                onFocus={handleAutoSelect}
                onClick={handleAutoSelect}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Sci-Fi, Indie, Drama"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Poster Image URL with Quick Save Button */}
          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <label className="block text-xs font-semibold text-slate-300">
                Poster Image URL
              </label>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md hover:scale-[1.02] active:scale-95 transition-all cursor-pointer border border-emerald-400/40"
                title="حفظ وتحديث البيانات مباشرة"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>حفظ وتحديث البيانات مباشرة</span>
              </button>
            </div>
            <input
              type="text"
              value={posterUrl}
              onFocus={handleAutoSelect}
              onClick={handleAutoSelect}
              onChange={(e) => setPosterUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-2 font-mono"
            />
            {/* Quick Sample Poster presets */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1">
              <span className="text-[10px] text-slate-400 flex-shrink-0">Sample Posters:</span>
              {SAMPLE_POSTERS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPosterUrl(p.url)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 flex-shrink-0"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Classification Rating & Card Border Color */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold">
                <Palette className="w-3.5 h-3.5 text-indigo-400" />
                <span>لون الإطار وتصنيف الفيلم</span>
              </span>
              <span className="text-[10px] text-slate-400">مفتاح الألوان للاختيار</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CLASSIFICATION_OPTIONS.map((opt) => {
                const isSelected = classification === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setClassification(opt.id);
                      if (opt.id === 'red' || opt.id === 'purple') {
                        setFavoriteColor('purple');
                      }
                    }}
                    className={`flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 border-indigo-400 text-white shadow-md ring-1 ring-indigo-400'
                        : `${opt.badgeBg} ${opt.badgeText} ${opt.badgeBorder} hover:scale-[1.02]`
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span>{opt.emoji}</span>
                      <span className="truncate">{opt.fullLabel}</span>
                    </div>
                    <span
                      className="w-3 h-3 rounded-full border border-white/50 flex-shrink-0"
                      style={{ backgroundColor: opt.colorHex }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggles Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <label className="flex items-center space-x-2 p-2.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
              <Star className="w-4 h-4 text-amber-400 fill-current" />
              <span className="text-xs text-white font-medium">Favorite</span>
              <input
                type="checkbox"
                checked={isFavorite}
                onChange={(e) => setIsFavorite(e.target.checked)}
                className="ml-auto w-4 h-4 text-amber-500 rounded bg-slate-900 border-slate-700"
              />
            </label>

            {isFavorite && (
              <div className="col-span-full p-2.5 bg-slate-950 border border-amber-500/40 rounded-xl space-y-1.5 text-right dir-rtl">
                <div className="text-xs font-bold text-amber-300">
                  اختر قسم ولون المفضلة:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {FAVORITE_SECTIONS.map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setFavoriteColor(sec.id)}
                      className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                        favoriteColor === sec.id
                          ? `${sec.buttonBg} ${sec.buttonText} shadow-md ring-2 ${sec.ringColor}`
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-850'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-white/40"
                        style={{ backgroundColor: sec.colorHex }}
                      />
                      <span>{sec.shortName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-center space-x-2 p-2.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-white font-medium">Broken Link</span>
              <input
                type="checkbox"
                checked={isBroken}
                onChange={(e) => setIsBroken(e.target.checked)}
                className="ml-auto w-4 h-4 text-red-500 rounded bg-slate-900 border-slate-700"
              />
            </label>

            <label className="flex items-center space-x-2 p-2.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
              <EyeOff className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-white font-medium">Hidden</span>
              <input
                type="checkbox"
                checked={isHidden}
                onChange={(e) => setIsHidden(e.target.checked)}
                className="ml-auto w-4 h-4 text-slate-500 rounded bg-slate-900 border-slate-700"
              />
            </label>
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-end space-x-2 space-x-reverse pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              {movieToEdit ? 'حفظ وتحديث البيانات مباشرة' : 'إضافة الفيلم'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
