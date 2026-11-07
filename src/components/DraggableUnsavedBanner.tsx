import React, { useState, useEffect, useRef } from 'react';
import {
  GripVertical,
  CloudUpload,
  Minimize2,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Sparkles,
} from 'lucide-react';

interface DraggableUnsavedBannerProps {
  onSaveClick: () => void;
  onDismiss?: () => void;
}

type DisplayMode = 'floating' | 'side' | 'dismissed_until_exit';

export const DraggableUnsavedBanner: React.FC<DraggableUnsavedBannerProps> = ({
  onSaveClick,
  onDismiss,
}) => {
  // Coordinates in pixels for floating mode
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Display mode: 'floating' | 'side' (docked to screen edge) | 'dismissed_until_exit'
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedMode = sessionStorage.getItem('unsaved_banner_mode');
        if (savedMode === 'side' || savedMode === 'dismissed_until_exit' || savedMode === 'floating') {
          return savedMode as DisplayMode;
        }
      } catch (_) {}
    }
    return 'floating';
  });

  const [sideDrawerOpen, setSideDrawerOpen] = useState(false);

  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
  });
  const bannerRef = useRef<HTMLDivElement>(null);

  const updateDisplayMode = (mode: DisplayMode) => {
    setDisplayMode(mode);
    try {
      sessionStorage.setItem('unsaved_banner_mode', mode);
    } catch (_) {}
  };

  // Initialize position at bottom-left on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = sessionStorage.getItem('unsaved_banner_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          const maxX = Math.max(10, window.innerWidth - 360);
          const maxY = Math.max(10, window.innerHeight - 80);
          setPosition({
            x: Math.min(Math.max(16, parsed.x), maxX),
            y: Math.min(Math.max(16, parsed.y), maxY),
          });
          return;
        }
      }
    } catch (_) {}

    // Default: bottom left
    const defaultX = 20;
    const defaultY = Math.max(20, window.innerHeight - 100);
    setPosition({ x: defaultX, y: defaultY });
  }, []);

  // Update bounds on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        if (!prev) return null;
        const banner = bannerRef.current;
        const width = banner ? banner.offsetWidth : 360;
        const height = banner ? banner.offsetHeight : 70;
        const maxX = Math.max(10, window.innerWidth - width - 10);
        const maxY = Math.max(10, window.innerHeight - height - 10);
        return {
          x: Math.min(Math.max(10, prev.x), maxX),
          y: Math.min(Math.max(10, prev.y), maxY),
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }

    if (!bannerRef.current || !position) return;

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}

    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;

    const banner = bannerRef.current;
    const width = banner ? banner.offsetWidth : 320;
    const height = banner ? banner.offsetHeight : 60;

    const newX = dragStartRef.current.posX + deltaX;
    const newY = dragStartRef.current.posY + deltaY;

    const clampedX = Math.min(Math.max(8, newX), window.innerWidth - width - 8);
    const clampedY = Math.min(Math.max(8, newY), window.innerHeight - height - 8);

    setPosition({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (position) {
      try {
        sessionStorage.setItem('unsaved_banner_pos', JSON.stringify(position));
      } catch (_) {}
    }
  };

  // 1. If dismissed until exit: show a microscopic subtle side pill so the user can easily re-open or save without taking browsing space
  if (displayMode === 'dismissed_until_exit') {
    return (
      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-[9999] select-none font-sans" dir="rtl">
        <button
          type="button"
          onClick={() => updateDisplayMode('side')}
          className="group flex items-center gap-1.5 px-2.5 py-3 rounded-l-2xl bg-slate-900/90 hover:bg-slate-800 border-y border-l border-amber-500/60 shadow-xl backdrop-blur-md text-amber-400 text-xs font-bold transition-all cursor-pointer hover:pl-3"
          title="توجد تعديلات بانتظار التأكيد السحابي (5555) - انقر لعرض الخيارات"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          <CloudUpload className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          <span className="hidden group-hover:inline-block text-[11px] text-slate-200 whitespace-nowrap">
            تعديلات معلقة
          </span>
        </button>
      </div>
    );
  }

  // 2. Docked Side Button Mode (Sleek edge tab that doesn't obstruct browsing)
  if (displayMode === 'side') {
    return (
      <div
        className="fixed right-0 top-1/2 -translate-y-1/2 z-[9999] select-none font-sans"
        dir="rtl"
      >
        <div className="flex items-center">
          {/* Expanded Drawer on Hover/Click */}
          {sideDrawerOpen && (
            <div className="flex items-center gap-2.5 p-2 px-3 rounded-r-none rounded-l-2xl bg-slate-900/95 border-y-2 border-l-2 border-amber-500 shadow-2xl backdrop-blur-md text-amber-300 text-xs font-bold animate-in slide-in-from-right-3 duration-200">
              <div className="flex flex-col text-right pr-1">
                <span className="text-white font-black text-xs leading-tight flex items-center gap-1.5">
                  <CloudUpload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>تعديلات سحابية معلقة</span>
                </span>
                <span className="text-[10px] text-slate-300 leading-tight mt-0.5">
                  رمز الحفظ: 5555
                </span>
              </div>

              <button
                type="button"
                onClick={onSaveClick}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 font-black cursor-pointer shadow-md text-xs flex items-center gap-1 whitespace-nowrap transition-transform active:scale-95"
                title="تأكيد وحفظ التعديلات سحابياً"
              >
                <span>حفظ الآن (5555)</span>
              </button>

              <button
                type="button"
                onClick={() => updateDisplayMode('floating')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="توسيع كنافذة عائمة قابلة للسحب"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setSideDrawerOpen(false);
                  updateDisplayMode('dismissed_until_exit');
                  if (onDismiss) onDismiss();
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                title="إخفاء أثناء التصفح (تنبيه عند إغلاق الصفحة فقط)"
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Main Docked Edge Tab */}
          <button
            type="button"
            onClick={() => setSideDrawerOpen(!sideDrawerOpen)}
            className="flex items-center gap-2 px-3 py-3 rounded-l-2xl bg-gradient-to-b from-slate-900 to-slate-950 border-y-2 border-l-2 border-amber-500 shadow-2xl shadow-amber-950/80 backdrop-blur-md text-amber-300 text-xs font-bold transition-all cursor-pointer hover:bg-slate-800 hover:border-amber-400 group"
            title="زر جانبي: توجد تعديلات جديدة بانتظار التأكيد السحابي (5555)"
          >
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>

            <CloudUpload className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />

            <div className="flex flex-col items-start text-right">
              <span className="text-white font-black text-xs leading-tight">
                تعديلات سحابية
              </span>
              <span className="text-[10px] text-amber-400 leading-tight">
                (5555)
              </span>
            </div>

            {sideDrawerOpen ? (
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-white" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // 3. Floating Mode (Draggable with easy Dock-to-Side and Dismiss options)
  if (!position) return null;

  return (
    <div
      ref={bannerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        touchAction: 'none',
      }}
      className={`fixed top-0 left-0 z-[9999] select-none transition-shadow font-sans ${
        isDragging ? 'cursor-grabbing shadow-2xl scale-[1.02]' : 'cursor-grab'
      }`}
      dir="rtl"
    >
      {isMinimized ? (
        // Minimized floating badge
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-slate-900/95 border-2 border-amber-500/80 shadow-2xl shadow-amber-950/80 backdrop-blur-md text-amber-300 text-xs font-bold animate-in zoom-in-95 duration-200">
          <div
            className="p-1 rounded-lg text-slate-400 hover:text-amber-300 transition-colors cursor-grab"
            title="اسحب لتحريك الإشعار"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
          </span>
          <span className="text-white font-bold text-xs">تعديلات معلقة</span>
          <button
            type="button"
            onClick={onSaveClick}
            className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 font-black cursor-pointer shadow-sm text-[11px] transition-all active:scale-95"
            title="حفظ الآن سحابياً"
          >
            حفظ (5555)
          </button>
          <button
            type="button"
            onClick={() => updateDisplayMode('side')}
            className="p-1 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
            title="تحويل لزر جانبي مثبت بحافة الشاشة"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="تكبير الإشعار"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        // Full expanded floating banner
        <div className="flex items-center gap-3 p-3 px-4 rounded-2xl bg-slate-900/95 border-2 border-amber-500 shadow-2xl shadow-amber-950/90 backdrop-blur-md text-amber-300 text-xs font-bold animate-in slide-in-from-bottom-2 duration-300 group">
          {/* Drag grip handle */}
          <div
            className="flex items-center justify-center p-1.5 -mr-1 rounded-xl bg-slate-800/80 text-amber-400/80 hover:text-amber-300 hover:bg-slate-700/80 transition-colors cursor-grab active:cursor-grabbing"
            title="اسحب في أي مكان لنقل الإشعار بعيداً عن الشاشات"
          >
            <GripVertical className="w-4 h-4" />
          </div>

          {/* Glowing indicator */}
          <span className="relative flex h-3 w-3 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
          </span>

          {/* Texts */}
          <div className="flex flex-col text-right">
            <span className="text-white font-black leading-tight flex items-center gap-1.5">
              <span>توجد تعديلات جديدة بانتظار التأكيد السحابي</span>
            </span>
            <span className="text-[11px] text-slate-300 leading-tight mt-0.5">
              سيتم طلب الرمز 5555 لحفظها لجميع المتصفحات • اسحب لنقل الشريط
            </span>
          </div>

          {/* Action Button */}
          <button
            type="button"
            onClick={onSaveClick}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 font-black cursor-pointer shadow-md transition-all active:scale-95 text-xs flex items-center gap-1 whitespace-nowrap"
          >
            <CloudUpload className="w-3.5 h-3.5" />
            <span>حفظ الآن (5555)</span>
          </button>

          {/* Convert to Side Docked Button */}
          <button
            type="button"
            onClick={() => updateDisplayMode('side')}
            className="p-1.5 px-2 rounded-xl bg-slate-800/80 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
            title="تحويل لزر جانبي على حافة الشاشة أثناء التصفح"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            <span>زر جانبي</span>
          </button>

          {/* Minimize / Collapse Button */}
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
            title="تصغير الإشعار"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>

          {/* Hide during browsing (notify on page close only) */}
          <button
            type="button"
            onClick={() => {
              updateDisplayMode('dismissed_until_exit');
              if (onDismiss) onDismiss();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors cursor-pointer"
            title="إخفاء أثناء التصفح (تنبيه عند إغلاق الصفحة فقط)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
