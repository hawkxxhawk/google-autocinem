import React, { useState, useEffect } from 'react';
import {
  CloudUpload,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  X,
  Layers,
  Folder,
  Star,
  Tv,
  Film,
  Zap,
} from 'lucide-react';
import {
  UploadStatusState,
  subscribeToUploadStatus,
  dismissUploadStatus,
} from '../services/firebaseDbService';

export const CloudUploadIndicator: React.FC = () => {
  const [state, setState] = useState<UploadStatusState>({
    isUploading: false,
    operationName: '',
    progress: 0,
    status: 'idle',
    message: '',
    error: null,
  });

  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToUploadStatus((newState) => {
      setState(newState);
      if (newState.status === 'running') {
        setIsDismissed(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Auto-dismiss after 8 seconds of success
  useEffect(() => {
    if (state.status === 'success') {
      const timer = setTimeout(() => {
        setIsDismissed(true);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [state.status]);

  if (state.status === 'idle' || isDismissed) {
    return null;
  }

  const isRunning = state.status === 'running';
  const isSuccess = state.status === 'success';
  const isError = state.status === 'error';

  return (
    <div
      dir="rtl"
      className="fixed bottom-5 right-5 z-[100001] max-w-sm sm:max-w-md w-full px-3 sm:px-0 animate-in slide-in-from-bottom-5 duration-300 pointer-events-auto"
    >
      <div
        className={`p-3.5 sm:p-4 rounded-2xl shadow-2xl backdrop-blur-xl border transition-all duration-300 ${
          isRunning
            ? 'bg-slate-900/98 border-amber-500/80 shadow-amber-950/70'
            : isSuccess
              ? 'bg-slate-900/98 border-emerald-500/80 shadow-emerald-950/70 ring-1 ring-emerald-500/30'
              : 'bg-slate-900/98 border-rose-500/80 shadow-rose-950/70'
        }`}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl flex items-center justify-center shrink-0 ${
                isRunning
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                  : isSuccess
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}
            >
              {isRunning ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
              ) : isSuccess ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs sm:text-sm font-black text-white">
                  {isRunning
                    ? (state.operationName || 'مؤشر التحديث والمزامنة السحابية')
                    : isSuccess
                      ? (state.operationName?.includes('تحديث') || state.message?.includes('تحديث') ? 'تم التحديث السحابي بنجاح 🟢' : 'تم الرفع السحابي بنجاح 🟢')
                      : 'تنبيه في المزامنة السحابية'}
                </span>
                {isRunning && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold animate-pulse">
                    {state.progress}%
                  </span>
                )}
                {isSuccess && state.details?.latencyMs && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                    ⚡ {state.details.latencyMs}ms
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 truncate mt-0.5 font-medium">
                {state.message}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsDismissed(true);
              dismissUploadStatus();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="إغلاق الإشعار"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar (Visible while running) */}
        {isRunning && (
          <div className="space-y-1.5 py-1">
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${state.progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>{state.operationName?.includes('تحديث') ? 'البيانات المحلية معروضة • جاري التحديث في الخلفية...' : 'جاري المعالجة والمزامنة السحابية...'}</span>
              <span className="font-mono">{state.progress}%</span>
            </div>
          </div>
        )}

        {/* Detailed Stats Badge (Visible upon success) */}
        {isSuccess && state.details && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 text-center text-[10px] font-bold">
            {state.details.foldersCount !== undefined && (
              <div className="bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 flex items-center justify-center gap-1 text-slate-300">
                <Folder className="w-3 h-3 text-amber-400 shrink-0" />
                <span>{state.details.foldersCount} مستودع</span>
              </div>
            )}
            {state.details.favMoviesCount !== undefined && (
              <div className="bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 flex items-center justify-center gap-1 text-slate-300">
                <Star className="w-3 h-3 text-amber-400 shrink-0" />
                <span>{state.details.favMoviesCount} مفضلة</span>
              </div>
            )}
            {state.details.favListsCount !== undefined && (
              <div className="bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 flex items-center justify-center gap-1 text-slate-300">
                <Layers className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>{state.details.favListsCount} قائمة</span>
              </div>
            )}
            {state.details.playlistCount !== undefined && (
              <div className="bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 flex items-center justify-center gap-1 text-slate-300">
                <Tv className="w-3 h-3 text-indigo-400 shrink-0" />
                <span>{state.details.playlistCount} شاشة عرض</span>
              </div>
            )}
            {state.details.moviesCount !== undefined && (
              <div className="bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 flex items-center justify-center gap-1 text-slate-300">
                <Film className="w-3 h-3 text-purple-400 shrink-0" />
                <span>{state.details.moviesCount} فيلم مؤكد</span>
              </div>
            )}
            {state.details.count !== undefined && (
              <div className="bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 flex items-center justify-center gap-1 text-slate-300">
                <Zap className="w-3 h-3 text-cyan-400 shrink-0" />
                <span>{state.details.count} تفضيل</span>
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {isError && state.error && (
          <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-500/40 text-xs text-rose-200 mt-1 font-mono break-words">
            {state.error}
          </div>
        )}
      </div>
    </div>
  );
};
