import React, { useState, useEffect } from 'react';
import { MovieItem, FavoriteColor, FAVORITE_SECTIONS } from '../types';
import { cleanMovieTitle } from '../utils/storage';
import {
  ArrowUpDown,
  ChevronsUp,
  X,
  Check,
  Film,
  Sparkles,
  Hash,
  MoveUp,
} from 'lucide-react';

interface ReorderItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  movie: MovieItem | null;
  currentIndex: number;
  totalItems: number;
  sectionName?: string;
  onReorder: (movieId: string, newPosition: number) => void;
}

export const ReorderItemModal: React.FC<ReorderItemModalProps> = ({
  isOpen,
  onClose,
  movie,
  currentIndex,
  totalItems,
  sectionName,
  onReorder,
}) => {
  const [targetPosition, setTargetPosition] = useState<number>(currentIndex);
  const [inputVal, setInputVal] = useState<string>(String(currentIndex));

  useEffect(() => {
    if (isOpen) {
      setTargetPosition(currentIndex);
      setInputVal(String(currentIndex));
    }
  }, [isOpen, currentIndex]);

  if (!isOpen || !movie) return null;

  const displayTitle = cleanMovieTitle(movie.title) || movie.title;
  const maxPosition = Math.max(1, totalItems);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputVal(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= maxPosition) {
      setTargetPosition(parsed);
    }
  };

  const handleStep = (step: number) => {
    const next = Math.max(1, Math.min(maxPosition, targetPosition + step));
    setTargetPosition(next);
    setInputVal(String(next));
  };

  const handleApplyPreset = (pos: number) => {
    const clamped = Math.max(1, Math.min(maxPosition, pos));
    setTargetPosition(clamped);
    setInputVal(String(clamped));
  };

  const handleMoveToTop = () => {
    onReorder(movie.id, 1);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(inputVal, 10);
    const finalPos = !isNaN(parsed) && parsed >= 1 ? Math.min(maxPosition, parsed) : targetPosition;
    onReorder(movie.id, finalPos);
    onClose();
  };

  // Quick preset positions to jump to
  const presets = [
    { label: '#1 (المقدمة)', pos: 1 },
    { label: '#2', pos: 2 },
    { label: '#3', pos: 3 },
    { label: '#5', pos: 5 },
    { label: '#10', pos: 10 },
    { label: `الأخير (#${maxPosition})`, pos: maxPosition },
  ].filter((p, idx, arr) => p.pos <= maxPosition && arr.findIndex((x) => x.pos === p.pos) === idx);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-slate-900 border-2 border-amber-500/80 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.95)] p-5 text-right dir-rtl animate-in zoom-in-95 duration-150 flex flex-col gap-4 my-auto select-none"
        style={{ direction: 'rtl' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0 shadow-inner">
              <ArrowUpDown className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                <span>ترتيب العنصر في قسم المفضلة</span>
              </h3>
              <p className="text-xs text-amber-400/90 font-medium truncate">
                {sectionName ? `القسم: ${sectionName}` : 'أقسام المفضلة العامة'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Movie Info Card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/90 border border-slate-800 shadow-inner">
          <div className="w-12 h-16 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0 relative">
            {movie.posterUrl ? (
              <img
                src={movie.posterUrl}
                alt={displayTitle}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600">
                <Film className="w-5 h-5" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-black text-white truncate max-w-[280px]" title={displayTitle}>
              {displayTitle}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-black shadow-sm">
                <Hash className="w-3 h-3 stroke-[3]" />
                <span>الترتيب الحالي: #{currentIndex}</span>
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                (من أصل {maxPosition} عنصر)
              </span>
            </div>
          </div>
        </div>

        {/* Primary Action 1: Move to Top (#1) Immediately */}
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={handleMoveToTop}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-amber-500/25 transition-all cursor-pointer active:scale-95 border border-amber-300"
          >
            <ChevronsUp className="w-5 h-5 stroke-[2.5] animate-bounce" />
            <span>نقل إلى مقدمة الترتيب (#1) فوراً</span>
          </button>
          <p className="text-[11px] text-slate-400 text-center font-medium">
            💡 سيتم وضع هذا الفيلم في أول القائمة (#1) ونقل باقي العناصر للأسفل تلقائياً.
          </p>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <span className="relative px-3 bg-slate-900 text-xs font-bold text-slate-400">
            أو تحديد رقم الترتيب يدوياً
          </span>
        </div>

        {/* Action 2: Manual Position Input */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center justify-center gap-2">
            {/* Decrement Button */}
            <button
              type="button"
              onClick={() => handleStep(-1)}
              disabled={targetPosition <= 1}
              className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-black text-xl flex items-center justify-center border border-slate-700 transition-all cursor-pointer disabled:cursor-not-allowed active:scale-95"
              title="تقديم خطوة"
            >
              -
            </button>

            {/* Position Display / Input */}
            <div className="relative flex-1 max-w-[150px]">
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">
                #
              </span>
              <input
                type="number"
                min={1}
                max={maxPosition}
                value={inputVal}
                onChange={handleInputChange}
                className="w-full text-center py-2.5 px-7 rounded-xl bg-slate-950 border-2 border-amber-500/70 focus:border-amber-400 text-white font-mono font-black text-xl sm:text-2xl shadow-inner focus:outline-none focus:ring-2 focus:ring-amber-400/40"
              />
            </div>

            {/* Increment Button */}
            <button
              type="button"
              onClick={() => handleStep(1)}
              disabled={targetPosition >= maxPosition}
              className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-black text-xl flex items-center justify-center border border-slate-700 transition-all cursor-pointer disabled:cursor-not-allowed active:scale-95"
              title="تأخير خطوة"
            >
              +
            </button>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            {presets.map((preset) => (
              <button
                key={preset.pos}
                type="button"
                onClick={() => handleApplyPreset(preset.pos)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  targetPosition === preset.pos
                    ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Save Button */}
          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm shadow-md shadow-indigo-600/20 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 border border-indigo-400/40"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>حفظ الترتيب الجديد (المركز #{targetPosition})</span>
          </button>
        </form>
      </div>
    </div>
  );
};
