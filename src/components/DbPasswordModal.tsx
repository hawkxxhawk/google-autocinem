import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  X,
  Sparkles,
  KeyRound,
  RefreshCw,
  Folder,
  Star,
  Tv,
  Film,
  Zap,
} from 'lucide-react';
import {
  DB_MASTER_PASSWORD,
  verifyDbPassword,
  subscribeToUploadStatus,
  getUploadStatus,
  UploadStatusState,
} from '../services/firebaseDbService';

interface DbPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title?: string;
  reason?: 'settings_sync' | 'page_exit' | 'action_confirm';
  changeSummary?: string;
}

export const DbPasswordModal: React.FC<DbPasswordModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  reason = 'settings_sync',
  changeSummary,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successDetails, setSuccessDetails] = useState<any>(null);
  const [uploadState, setUploadState] = useState<UploadStatusState | null>(() => getUploadStatus());
  const inputRef = useRef<HTMLInputElement>(null);

  // Subscribe to live upload status updates while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToUploadStatus((st) => {
      setUploadState(st);
    });
    return () => unsub();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMsg(null);
      setIsSubmitting(false);
      setIsSuccess(false);
      setSuccessDetails(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setErrorMsg(null);

    const cleanPass = password.trim();
    if (!verifyDbPassword(cleanPass)) {
      setErrorMsg('كلمة المرور غير صحيحة! يرجى إدخال رمز المرور المعتمد (5555).');
      inputRef.current?.focus();
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await onConfirm();
      const latestUpload = getUploadStatus();
      setIsSuccess(true);
      setSuccessDetails(latestUpload.details || uploadState?.details || null);

      // Auto-close after 3500ms so user can view confirmation, or click button to close
      setTimeout(() => {
        setIsSubmitting(false);
        setIsSuccess(false);
        onClose();
      }, 3500);
    } catch (err: any) {
      setIsSubmitting(false);
      setIsSuccess(false);
      console.error('Password confirm error:', err);
      setErrorMsg(err?.message || 'حدث خطأ أثناء تنفيذ عملية المزامنة مع قاعدة البيانات.');
    }
  };

  const handleQuickFill = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPassword(DB_MASTER_PASSWORD);
    setErrorMsg(null);
    inputRef.current?.focus();
  };

  const isExitReason = reason === 'page_exit';

  const modalNode = (
    <div
      onClick={(e) => {
        e.stopPropagation();
        // Do NOT close on backdrop click to avoid accidental dismissals before entering password
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      dir="rtl"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-slate-900 border-2 border-amber-500/60 rounded-2xl shadow-2xl shadow-amber-950/60 overflow-hidden text-right animate-in zoom-in-95 duration-200"
      >
        {/* Glow Header */}
        <div className="bg-gradient-to-r from-amber-600/30 via-emerald-600/20 to-indigo-600/30 px-5 py-4 border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
              {isSubmitting ? (
                <RefreshCw className="w-5 h-5 animate-spin text-amber-300" />
              ) : isSuccess ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <KeyRound className="w-5 h-5 animate-pulse" />
              )}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                {title || (isExitReason ? 'حفظ التعديلات قبل إغلاق الصفحة' : 'تأكيد المزامنة مع قاعدة البيانات')}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 font-mono">
                  5555
                </span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-300">
                {isSubmitting
                  ? 'جاري حفظ ومزامنة البيانات في Firestore الآن...'
                  : isSuccess
                    ? 'تم تأكيد المزامنة والرفع بنجاح 🟢'
                    : isExitReason
                      ? 'تم رصد تعديلات جديدة تحتاج تأكيد الحفظ السحابي'
                      : 'مطلوب إدخال كلمة المرور لتأكيد حفظ ومزامنة Firestore'}
              </p>
            </div>
          </div>
          {!isSubmitting && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ============================================================== */}
        {/* VIEW 1: ACTIVE LIVE UPLOAD PROGRESS (While Submitting)         */}
        {/* ============================================================== */}
        {isSubmitting && !isSuccess && (
          <div className="p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-300">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
              <div className="space-y-1 min-w-0">
                <span className="text-xs sm:text-sm font-black text-white block">
                  مؤشر الرفع اللحظي إلى قاعدة البيانات السحابية (Firestore)
                </span>
                <p className="text-xs text-amber-300 font-medium truncate">
                  {uploadState?.message || 'جاري إرسال ومطابقة البيانات السحابية...'}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 pt-2">
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 p-0.5">
                <div
                  className="bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(uploadState?.progress || 35, 20)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>جاري معالجة وتأكيد الحفظ السحابي لجميع المتصفحات</span>
                <span className="text-amber-300 font-bold">{uploadState?.progress || 35}%</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 space-y-1">
              <span className="text-slate-400 block font-sans">
                يرجى الانتظار ثوانٍ معدودة حتى تكتمل عملية الرفع السحابي وتحديث كافة المتصفحات...
              </span>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 2: SUCCESS CELEBRATION (Completed)                        */}
        {/* ============================================================== */}
        {isSuccess && (
          <div className="p-6 space-y-4 text-center animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 border-2 border-emerald-400/60 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-950/50">
              <CheckCircle className="w-8 h-8 animate-bounce" />
            </div>

            <div className="space-y-1">
              <h4 className="text-base sm:text-lg font-black text-white">
                تمت المزامنة والرفع إلى قاعدة البيانات بنجاح! 🟢
              </h4>
              <p className="text-xs text-emerald-300">
                أصبحت كافة البيانات محدثة ومحفوظة سحابياً لجميع الأجهزة والمتصفحات فوراً
              </p>
            </div>

            {/* Stats Breakdown Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-bold">
              {successDetails?.foldersCount !== undefined && (
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center gap-1">
                  <Folder className="w-4 h-4 text-amber-400" />
                  <span className="text-white">{successDetails.foldersCount}</span>
                  <span className="text-[10px] text-slate-400">مستودع</span>
                </div>
              )}
              {successDetails?.playlistCount !== undefined && (
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center gap-1">
                  <Tv className="w-4 h-4 text-indigo-400" />
                  <span className="text-white">{successDetails.playlistCount}</span>
                  <span className="text-[10px] text-slate-400">شاشة العرض</span>
                </div>
              )}
              {successDetails?.favMoviesCount !== undefined && (
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center gap-1">
                  <Star className="w-4 h-4 text-amber-400" />
                  <span className="text-white">{successDetails.favMoviesCount}</span>
                  <span className="text-[10px] text-slate-400">مفضلة</span>
                </div>
              )}
              {successDetails?.moviesCount !== undefined && (
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center gap-1">
                  <Film className="w-4 h-4 text-purple-400" />
                  <span className="text-white">{successDetails.moviesCount}</span>
                  <span className="text-[10px] text-slate-400">أفلام مؤكدة</span>
                </div>
              )}
              {successDetails?.latencyMs !== undefined && (
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center gap-1">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300 font-mono">{successDetails.latencyMs} ms</span>
                  <span className="text-[10px] text-slate-400">زمن الاستجابة</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="mt-3 px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition-all cursor-pointer shadow-lg shadow-emerald-950/60"
            >
              تم وإغلاق النافذة
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 3: PASSWORD FORM (Normal State)                           */}
        {/* ============================================================== */}
        {!isSubmitting && !isSuccess && (
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="p-5 space-y-4"
          >
            {changeSummary && (
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-200 block">التعديلات المراد مزامنتها:</span>
                  <span>{changeSummary}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-200">
                أدخل كلمة المرور (5555) لتأكيد التحديث لجميع المتصفحات:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="أدخل 5555 هنا..."
                  className="w-full pr-10 pl-11 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 text-white font-mono tracking-widest text-center text-lg placeholder:text-slate-600 outline-none transition-all"
                  autoComplete="off"
                  maxLength={10}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPassword(!showPassword);
                  }}
                  className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Quick Fill Button */}
            <button
              type="button"
              onClick={handleQuickFill}
              className="w-full py-2.5 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
            >
              <KeyRound className="w-4 h-4" />
              <span>ملء كلمة المرور (5555) بنقرة واحدة</span>
            </button>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/50 text-xs text-red-200 flex items-start gap-2 animate-in shake duration-200">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {/* Explanatory note */}
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
              <span className="text-amber-400 font-bold">ملاحظة أمان ومزامنة:</span> عند تأكيد الباسورد، سيتم رفع وتحديث كافة المستودعات، قوائم المفضلة، قائمة شاشة العرض، وكافة الأفلام والتعديلات فوراً إلى قاعدة بيانات Firestore السحابية لكي تظهر تلقائياً لأي مستخدم على أي متصفح أو جهاز آخر.
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                {isExitReason ? 'إغلاق دون حفظ سحابي' : 'إلغاء'}
              </button>
              <button
                type="submit"
                onClick={(e) => e.stopPropagation()}
                disabled={isSubmitting || !password.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-emerald-600 to-teal-600 hover:from-amber-400 hover:to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-950/50 transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                <span>تأكيد المزامنة والحفظ السحابي</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalNode, document.body)
    : modalNode;
};
