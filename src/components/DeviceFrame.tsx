import React from 'react';
import { ViewMode } from '../types';
import { Wifi, Battery, Signal, Maximize2, Smartphone, Tv, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CornerDownLeft } from 'lucide-react';

interface DeviceFrameProps {
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  children: React.ReactNode;
}

export const DeviceFrame: React.FC<DeviceFrameProps> = ({
  viewMode,
  onToggleViewMode,
  children,
}) => {
  if (viewMode === 'full') {
    return <div className="min-h-screen bg-slate-950 text-white">{children}</div>;
  }

  const currentTime = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (viewMode === 'tv') {
    return (
      <div className="min-h-screen bg-slate-950 py-6 px-3 flex flex-col items-center justify-center font-sans">
        {/* Device Frame View Indicator Header */}
        <div className="mb-3 flex items-center justify-between w-full max-w-6xl text-xs text-slate-400">
          <span className="flex items-center gap-2 font-bold text-emerald-400">
            <Tv className="w-4 h-4 text-emerald-400" />
            <span>Android TV 9 Leanback Smart TV Display (API 28 - 1080p Widescreen)</span>
          </span>
          <div className="flex items-center space-x-3">
            <span className="text-[11px] text-slate-400 flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
              <CornerDownLeft className="w-3 h-3 text-purple-400" />
              <span>استخدم أسهم الكيبورد / الريموت للتنقل D-Pad</span>
            </span>
            <button
              onClick={onToggleViewMode}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 hover:underline"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>توسيع للشاشة الكاملة</span>
            </button>
          </div>
        </div>

        {/* Smart TV Bezel Frame */}
        <div className="relative w-full max-w-6xl bg-slate-900 border-[12px] border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col min-h-[620px] max-h-[820px] ring-1 ring-slate-700/60">
          {/* TV Top Status Bar */}
          <div className="w-full bg-slate-950 px-5 py-2 border-b border-slate-800/80 flex items-center justify-between z-40 text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-slate-200">Android TV OS 9.0</span>
            </div>
            <div className="flex items-center space-x-4 text-slate-400">
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                D-Pad Focused Mode Active
              </span>
              <span className="font-mono text-slate-300 font-bold">{currentTime}</span>
              <Wifi className="w-4 h-4 text-emerald-400" />
            </div>
          </div>

          {/* TV Display Content Viewport */}
          <div className="flex-1 overflow-y-auto bg-slate-950 flex flex-col">
            {children}
          </div>

          {/* TV Bottom Stand Frame Decoration */}
          <div className="w-full bg-slate-950/90 border-t border-slate-800 py-1.5 px-6 flex items-center justify-between text-[11px] text-slate-500 z-40">
            <span>Sony / Xiaomi / Samsung Android TV Box Compatible</span>
            <div className="flex items-center space-x-2 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">↑↓←→ للتنقل</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">OK / Enter للاختيار</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 py-6 px-2 flex flex-col items-center justify-center font-sans">
      {/* Device Frame View Indicator Header */}
      <div className="mb-3 flex items-center justify-between w-full max-w-[430px] text-xs text-slate-400">
        <span className="flex items-center gap-1.5 font-medium text-slate-300">
          <Smartphone className="w-4 h-4 text-sky-400" />
          Android 9 Pie Device Frame (API 28)
        </span>
        <button
          onClick={onToggleViewMode}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 hover:underline"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Full Browser View</span>
        </button>
      </div>

      {/* Android Device Outer Bezel */}
      <div className="relative w-full max-w-[420px] bg-slate-900 border-[8px] border-slate-800 rounded-[44px] shadow-2xl overflow-hidden flex flex-col min-h-[820px] max-h-[880px] ring-1 ring-slate-700/50">
        {/* Device Speaker Notch / Camera Bar */}
        <div className="w-full bg-slate-950 h-7 flex items-center justify-center relative px-6 z-40">
          {/* Camera lens dot */}
          <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" />
          {/* Speaker grill */}
          <div className="w-12 h-1 bg-slate-800 rounded-full mx-3" />

          {/* Android Status Bar */}
          <div className="w-full flex items-center justify-between text-[11px] font-bold text-slate-300 px-1">
            <span>{currentTime}</span>
            <div className="flex items-center space-x-1.5 text-slate-400">
              <Signal className="w-3 h-3 text-slate-300" />
              <Wifi className="w-3 h-3 text-slate-300" />
              <Battery className="w-3.5 h-3.5 text-emerald-400 fill-current" />
            </div>
          </div>
        </div>

        {/* Device Display Viewport */}
        <div className="flex-1 overflow-y-auto bg-slate-950 flex flex-col">
          {children}
        </div>

        {/* Android Navigation Bar (API 28) */}
        <div className="w-full bg-slate-950 border-t border-slate-800 py-2.5 px-12 flex items-center justify-between z-40">
          {/* Back Button */}
          <button
            title="Android Back Button"
            className="w-8 h-8 rounded-full hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <div className="w-2.5 h-2.5 border-l-2 border-b-2 border-current -rotate-45" />
          </button>

          {/* Home Pill */}
          <button
            title="Android Home Pill"
            className="w-16 h-2 rounded-full bg-slate-400 hover:bg-white transition-colors"
          />

          {/* Recents Button */}
          <button
            title="Android Recents Button"
            className="w-8 h-8 rounded-full hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <div className="w-3 h-3 border-2 border-current rounded-sm" />
          </button>
        </div>
      </div>
    </div>
  );
};

