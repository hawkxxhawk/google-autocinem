import React, { useState } from "react";
import * as LucideIcons from "lucide-react";

const TrashIcon = (LucideIcons as any)["Trash2"] || LucideIcons.CircleHelp || LucideIcons.HelpCircle;
const SlidersIcon = (LucideIcons as any)["SlidersHorizontal"] || LucideIcons.CircleHelp || LucideIcons.HelpCircle;
const CloseIcon = (LucideIcons as any)["X"] || LucideIcons.CircleHelp || LucideIcons.HelpCircle;
const CheckIcon = (LucideIcons as any)["Check"] || LucideIcons.CircleHelp || LucideIcons.HelpCircle;
const StarIcon = (LucideIcons as any)["Star"] || LucideIcons.CircleHelp || LucideIcons.HelpCircle;
const FolderIcon = (LucideIcons as any)["FolderInput"] || (LucideIcons as any)["Folder"] || LucideIcons.CircleHelp;
const TvIcon = (LucideIcons as any)["Tv"] || LucideIcons.CircleHelp || LucideIcons.HelpCircle;
const AlertIcon = (LucideIcons as any)["TriangleAlert"] || (LucideIcons as any)["CircleAlert"] || LucideIcons.CircleHelp;
const TagIcon = (LucideIcons as any)["Tag"] || LucideIcons.CircleHelp || LucideIcons.HelpCircle;
const EyeOffIcon = (LucideIcons as any)["EyeOff"] || LucideIcons.CircleHelp || LucideIcons.HelpCircle;
const EyeIcon = (LucideIcons as any)["Eye"] || LucideIcons.CircleHelp || LucideIcons.HelpCircle;
const FilmIcon = (LucideIcons as any)["Film"] || LucideIcons.CircleHelp || LucideIcons.HelpCircle;

export interface MovieItem {
  id: string;
  title: string;
  url?: string;
  embedUrl?: string;
  posterUrl?: string;
  category?: string;
  parentFolderId?: string;
  isFavorite?: boolean;
  favoriteColor?: string;
  isBroken?: boolean;
  isHidden?: boolean;
  [key: string]: any;
}

export interface FolderItem {
  id: string;
  name: string;
  color?: string;
  zone?: string;
  [key: string]: any;
}

interface BatchActionModalProps {
  isOpen: boolean;
  mode: "delete" | "edit";
  selectedMovies: MovieItem[];
  folders: FolderItem[];
  cinemaPlaylists?: any[];
  onClose: () => void;
  onConfirmDelete: (movieIds: string[]) => void;
  onBatchMove: (movieIds: string[], targetFolderId: string) => void;
  onBatchChangeCategory: (movieIds: string[], newCategory: string) => void;
  onBatchSetFavorite: (movieIds: string[], favoriteColor: string | null) => void;
  onBatchAddToPlaylist: (movieIds: string[], targetPlaylistId?: string) => void;
  onBatchToggleBroken: (movieIds: string[], isBroken: boolean) => void;
  onBatchToggleHide: (movieIds: string[], isHidden: boolean) => void;
}

const FAVORITE_COLORS = [
  { id: "green", name: "1- الأخضر (مفضلة 1)", colorHex: "#10b981", badgeBg: "bg-emerald-600" },
  { id: "yellow", name: "2- الأصفر (مفضلة 2)", colorHex: "#f59e0b", badgeBg: "bg-amber-500" },
  { id: "purple", name: "3- البنفسجي (مفضلة 3)", colorHex: "#a855f7", badgeBg: "bg-purple-600" },
  { id: "black", name: "4- الأسود (مفضلة 4)", colorHex: "#1e293b", badgeBg: "bg-slate-900 border border-slate-700" },
];

const PRESET_CATEGORIES = [
  "أكشن",
  "دراما",
  "كوميدي",
  "رعب",
  "إثارة",
  "خيال علمي",
  "أنمي",
  "عائلي",
  "رومانسي",
  "مغامرة",
  "وثائقي",
  "سينما",
];

export const BatchActionModal: React.FC<BatchActionModalProps> = ({
  isOpen,
  mode,
  selectedMovies,
  folders,
  cinemaPlaylists = [],
  onClose,
  onConfirmDelete,
  onBatchMove,
  onBatchChangeCategory,
  onBatchSetFavorite,
  onBatchAddToPlaylist,
  onBatchToggleBroken,
  onBatchToggleHide,
}) => {
  const [activeTab, setActiveTab] = useState<"move" | "category" | "favorites" | "playlist" | "status">("move");
  const [targetFolderId, setTargetFolderId] = useState<string>(() => folders[0]?.id || "");
  const [categoryInput, setCategoryInput] = useState<string>("");
  const [targetPlaylistId, setTargetPlaylistId] = useState<string>(() => cinemaPlaylists[0]?.id || "playlist-default");
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  if (!isOpen || selectedMovies.length === 0) return null;

  const movieIds = selectedMovies.map((m) => m.id);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage(null);
      onClose();
    }, 1200);
  };

  const handleDelete = () => {
    setIsProcessing(true);
    try {
      onConfirmDelete(movieIds);
      showFeedback(`✓ تم حذف (${movieIds.length}) أفلام بنجاح!`);
    } catch (err: any) {
      alert("حدث خطأ أثناء الحذف: " + (err?.message || ""));
      setIsProcessing(false);
    }
  };

  const handleMove = () => {
    if (!targetFolderId) return;
    setIsProcessing(true);
    const targetFolder = folders.find((f) => f.id === targetFolderId);
    onBatchMove(movieIds, targetFolderId);
    showFeedback(`✓ تم نقل (${movieIds.length}) أفلام إلى مستودع [${targetFolder?.name || targetFolderId}] بنجاح!`);
  };

  const handleCategory = (cat?: string) => {
    const val = (cat || categoryInput || "").trim();
    if (!val) return;
    setIsProcessing(true);
    onBatchChangeCategory(movieIds, val);
    showFeedback(`✓ تم تطبيق تصنيف [${val}] على (${movieIds.length}) أفلام بنجاح!`);
  };

  const handleFavorite = (color: string | null) => {
    setIsProcessing(true);
    onBatchSetFavorite(movieIds, color);
    if (color) {
      const colObj = FAVORITE_COLORS.find((c) => c.id === color);
      showFeedback(`✓ تمت إضافة (${movieIds.length}) أفلام إلى [${colObj?.name || color}] بنجاح!`);
    } else {
      showFeedback(`✓ تم إلغاء المفضلة لـ (${movieIds.length}) أفلام بنجاح!`);
    }
  };

  const handleAddToPlaylist = () => {
    setIsProcessing(true);
    onBatchAddToPlaylist(movieIds, targetPlaylistId);
    const plObj = cinemaPlaylists.find((p) => p.id === targetPlaylistId);
    showFeedback(`✓ تمت إضافة (${movieIds.length}) أفلام إلى قائمة [${plObj?.name || "السينما"}] بنجاح! 🎬`);
  };

  const handleBroken = (isBroken: boolean) => {
    setIsProcessing(true);
    onBatchToggleBroken(movieIds, isBroken);
    showFeedback(isBroken ? `✓ تم تعيين (${movieIds.length}) أفلام كروابط معطوبة` : `✓ تم تعيين (${movieIds.length}) أفلام كروابط تعمل بنجاح`);
  };

  const handleHide = (isHidden: boolean) => {
    setIsProcessing(true);
    onBatchToggleHide(movieIds, isHidden);
    showFeedback(isHidden ? `✓ تم إخفاء (${movieIds.length}) أفلام بنجاح` : `✓ تم إظهار (${movieIds.length}) أفلام بنجاح`);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150 dir-rtl text-right"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-slate-900 border-2 border-amber-500/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className={`p-4 sm:p-5 flex items-center justify-between border-b ${mode === "delete" ? "bg-gradient-to-r from-red-950 via-rose-950 to-slate-900 border-red-500/40" : "bg-gradient-to-r from-amber-950/80 via-slate-900 to-indigo-950 border-amber-500/40"}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl flex items-center justify-center shadow-inner ${mode === "delete" ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-amber-500/20 text-amber-400 border border-amber-500/40"}`}>
              {mode === "delete" ? <TrashIcon className="w-6 h-6 animate-pulse" /> : <SlidersIcon className="w-6 h-6 text-amber-300" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white">
                  {mode === "delete" ? "تأكيد الحذف الجماعي للأفلام" : "التعديل والإجراءات الجماعية"}
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black shadow-sm ${mode === "delete" ? "bg-rose-600 text-white" : "bg-amber-500 text-slate-950"}`}>
                  {selectedMovies.length} عناصر محددة
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {mode === "delete"
                  ? "سيتم تنفيذ حذف جماعي لكافة العناصر المختارة دفعة واحدة."
                  : "اختر الإجراء المطلوب لتطبيقه على كافة الأفلام المحددة في الصفحة دفعة واحدة."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback message banner if active */}
        {feedbackMessage && (
          <div className="bg-emerald-600 text-white text-xs sm:text-sm font-black px-4 py-3 flex items-center gap-2 animate-in fade-in duration-150">
            <CheckIcon className="w-5 h-5 stroke-[3]" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* Content Body */}
        {mode === "delete" ? (
          /* Delete Confirmation View */
          <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs sm:text-sm space-y-2">
              <div className="flex items-center gap-2 font-black text-red-300">
                <AlertIcon className="w-5 h-5 text-red-400 flex-shrink-0" />
                <span>تحذير: هل أنت متأكد من رغبتك في حذف ({selectedMovies.length}) أفلام نهائياً دفعة واحدة؟</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed pr-7">
                سيتم حذف هذه الأفلام من هذا المستودع ومن قاعدة البيانات السحابية والتخزين المحلي فورياً دون إمكانية التراجع.
              </p>
            </div>

            {/* Selected items preview list */}
            <div className="space-y-1.5">
              <span className="text-xs font-black text-slate-400 px-1">قائمة الأفلام التي سيتم حذفها:</span>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/70 p-2 space-y-1.5 custom-scrollbar">
                {selectedMovies.map((m, idx) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-900/80 hover:bg-slate-850 border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-mono font-bold flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      {m.posterUrl ? (
                        <img
                          src={m.posterUrl}
                          alt=""
                          className="w-7 h-9 rounded object-cover flex-shrink-0 bg-slate-950 border border-slate-700"
                        />
                      ) : (
                        <div className="w-7 h-9 rounded bg-slate-800 flex items-center justify-center text-slate-500 flex-shrink-0">
                          <FilmIcon className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-slate-100 font-bold block truncate max-w-sm sm:max-w-md">
                          {m.title || "فيلم بدون عنوان"}
                        </span>
                        {m.category && <span className="text-[10px] text-amber-400 font-medium">{m.category}</span>}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">{m.id}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Delete Actions */}
            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-bold transition-all cursor-pointer active:scale-95 text-center"
              >
                إلغاء الأمر
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isProcessing}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-500 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-red-950/60 border border-red-400/50 transition-all cursor-pointer active:scale-95"
              >
                <TrashIcon className="w-4 h-4 stroke-[2.5]" />
                <span>تأكيد الحذف النهائي ({selectedMovies.length}) أفلام دفعة واحدة 🗑️</span>
              </button>
            </div>
          </div>
        ) : (
          /* Batch Edit View */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center gap-1 p-2 bg-slate-950 border-b border-slate-800 overflow-x-auto custom-scrollbar flex-nowrap">
              <button
                type="button"
                onClick={() => setActiveTab("move")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 ${activeTab === "move" ? "bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400/60" : "bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-850"}`}
              >
                <FolderIcon className="w-3.5 h-3.5" />
                <span>نقل لمستودع آخر</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("category")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 ${activeTab === "category" ? "bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300" : "bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-850"}`}
              >
                <TagIcon className="w-3.5 h-3.5" />
                <span>تغيير التصنيف</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("favorites")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 ${activeTab === "favorites" ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300" : "bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-850"}`}
              >
                <StarIcon className="w-3.5 h-3.5" />
                <span>تلوين / تخصيص المفضلة</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("playlist")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 ${activeTab === "playlist" ? "bg-purple-600 text-white shadow-md ring-2 ring-purple-300" : "bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-850"}`}
              >
                <TvIcon className="w-3.5 h-3.5" />
                <span>شاشة العرض (Playlist)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("status")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 ${activeTab === "status" ? "bg-sky-600 text-white shadow-md ring-2 ring-sky-300" : "bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-850"}`}
              >
                <AlertIcon className="w-3.5 h-3.5" />
                <span>الحالة والإخفاء</span>
              </button>
            </div>

            {/* Tab Panels */}
            <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
              {activeTab === "move" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-200">اختر المستودع الوجهة لنقل ({selectedMovies.length}) أفلام إليه:</label>
                    <select
                      value={targetFolderId}
                      onChange={(e) => setTargetFolderId(e.target.value)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm font-bold text-amber-300 focus:outline-none focus:border-indigo-400"
                    >
                      {folders.map((f) => (
                        <option key={f.id} value={f.id} className="bg-slate-900 text-white">
                          📁 {f.name} ({f.zone || "قسم"})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleMove}
                    disabled={isProcessing || !targetFolderId}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm shadow-md transition-all cursor-pointer active:scale-95"
                  >
                    <FolderIcon className="w-4 h-4" />
                    <span>نقل الأفلام المحددة إلى هذا المستودع الآن ➔</span>
                  </button>
                </div>
              )}

              {activeTab === "category" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-200">اكتب أو اختر التصنيف الجديد لـ ({selectedMovies.length}) أفلام:</label>
                    <input
                      type="text"
                      value={categoryInput}
                      onChange={(e) => setCategoryInput(e.target.value)}
                      placeholder="مثال: أكشن، دراما، سينما 2026..."
                      className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400">تصنيفات سريعة مقترحة (انقر للتطبيق فوراً):</span>
                    <div className="flex items-center flex-wrap gap-1.5">
                      {PRESET_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => handleCategory(cat)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-xs font-bold transition-all cursor-pointer border border-slate-700 hover:border-amber-400 active:scale-95"
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCategory()}
                    disabled={isProcessing || !categoryInput.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-md transition-all cursor-pointer active:scale-95"
                  >
                    <TagIcon className="w-4 h-4" />
                    <span>تطبيق التصنيف المكتوب على كافة الأفلام المحددة</span>
                  </button>
                </div>
              )}

              {activeTab === "favorites" && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    حدد قسم ولون المفضلة المطلوب لإضافة أو نقل ({selectedMovies.length}) أفلام إليها، أو يمكنك إزالتها من المفضلة:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FAVORITE_COLORS.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => handleFavorite(col.id)}
                        disabled={isProcessing}
                        className={`flex items-center justify-between p-3 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer border border-slate-700/80 hover:scale-[1.02] active:scale-95 bg-slate-950/80 hover:bg-slate-800 text-white`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-4 h-4 rounded-full border border-white/60 shadow-sm flex-shrink-0"
                            style={{ backgroundColor: col.colorHex }}
                          />
                          <span>{col.name}</span>
                        </div>
                        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">إضافة للمفضلة</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFavorite(null)}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-850 hover:bg-red-950/60 text-red-300 hover:text-red-200 border border-slate-700 hover:border-red-500/50 font-bold text-xs transition-all cursor-pointer active:scale-95"
                  >
                    <TrashIcon className="w-4 h-4 text-red-400" />
                    <span>حذف كافة الأفلام المحددة ({selectedMovies.length}) من المفضلة</span>
                  </button>
                </div>
              )}

              {activeTab === "playlist" && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    إضافة كافة الأفلام المحددة ({selectedMovies.length}) دفعة واحدة إلى قائمة تشغيل شاشة العرض والسينما (Cinema Screen Queue):
                  </p>
                  {cinemaPlaylists.length > 1 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-200">اختر قائمة تشغيل شاشة العرض:</label>
                      <select
                        value={targetPlaylistId}
                        onChange={(e) => setTargetPlaylistId(e.target.value)}
                        className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm font-bold text-amber-300 focus:outline-none focus:border-indigo-400"
                      >
                        {cinemaPlaylists.map((pl: any) => (
                          <option key={pl.id} value={pl.id} className="bg-slate-900 text-white">
                            🎬 {pl.name || "قائمة التشغيل"} ({pl.items?.length || 0} عنصر)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleAddToPlaylist}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
                  >
                    <TvIcon className="w-4 h-4 text-amber-300" />
                    <span>إضافة ({selectedMovies.length}) أفلام إلى شاشة العرض فوراً 🎬</span>
                  </button>
                </div>
              )}

              {activeTab === "status" && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    تعديل حالة الصلاحية أو ظهور ({selectedMovies.length}) أفلام دفعة واحدة:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleBroken(false)}
                      disabled={isProcessing}
                      className="p-3 rounded-xl bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                    >
                      <CheckIcon className="w-4 h-4 text-emerald-400 stroke-[3]" />
                      <span>تعيين كروابط سليمة وتعمل ✔️</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBroken(true)}
                      disabled={isProcessing}
                      className="p-3 rounded-xl bg-red-950/70 hover:bg-red-900 border border-red-500/40 text-red-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                    >
                      <AlertIcon className="w-4 h-4 text-red-400" />
                      <span>تعيين كروابط تالفة أو معطوبة ⚠️</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHide(true)}
                      disabled={isProcessing}
                      className="p-3 rounded-xl bg-amber-950/70 hover:bg-amber-900 border border-amber-500/40 text-amber-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                    >
                      <EyeOffIcon className="w-4 h-4 text-amber-400" />
                      <span>إخفاء الأفلام المحددة من العرض 👁️‍🗨️</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHide(false)}
                      disabled={isProcessing}
                      className="p-3 rounded-xl bg-sky-950/70 hover:bg-sky-900 border border-sky-500/40 text-sky-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                    >
                      <EyeIcon className="w-4 h-4 text-sky-400" />
                      <span>إلغاء الإخفاء وإظهارها في المستودع 👁️</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
