import React, { useState } from 'react';
import { Folder, ALL_FAVORITES_FOLDER_ID, ALL_FAVORITES_FOLDER, MovieItem } from '../types';
import { getFolderTextColor } from '../utils/storage';
import {
  Folder as FolderIcon,
  X,
  Search,
  Plus,
  Edit2,
  EyeOff,
  Trash2,
  CheckCircle2,
  Film,
  Sparkles,
  ArrowRight,
  Database,
  Layers,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Star,
  Check,
  ArrowRightLeft,
} from 'lucide-react';

interface RepositoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  movies?: MovieItem[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string) => void;
  onEditFolder: (folder: Folder) => void;
  onHideFolder: (folderId: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  onAddFolder: () => void;
  onReorderFolders?: (reorderedFolders: Folder[]) => void;
  onToggleIncludeInAllFavorites?: (folderId: string, included: boolean) => void;
  onBulkSetIncludeInAllFavorites?: (included: boolean) => void;
  movieCounts: Record<string, number>;
  favoritesCount?: number;
  onOpenClassifierModal?: () => void;
}

export const RepositoriesModal: React.FC<RepositoriesModalProps> = ({
  isOpen,
  onClose,
  folders,
  movies = [],
  selectedFolderId,
  onSelectFolder,
  onEditFolder,
  onHideFolder,
  onDeleteFolder,
  onAddFolder,
  onReorderFolders,
  onToggleIncludeInAllFavorites,
  onBulkSetIncludeInAllFavorites,
  movieCounts,
  favoritesCount = 0,
  onOpenClassifierModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!isOpen) return null;

  const visibleFolders = folders.filter((f) => !f.isFolderHidden && f.id !== ALL_FAVORITES_FOLDER_ID);
  const includedCount = visibleFolders.filter((f) => f.includeInAllFavorites !== false).length;

  const filteredFolders = visibleFolders.filter(
    (f) =>
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleChooseRepository = (folderId: string) => {
    onSelectFolder(folderId);
    onClose();
  };

  const handleConfirmDelete = (folderId: string) => {
    if (onDeleteFolder) {
      onDeleteFolder(folderId);
    }
    setConfirmDeleteId(null);
  };

  const handleMoveFolder = (folderId: string, direction: 'up' | 'down') => {
    if (!onReorderFolders) return;
    const visibleIndex = visibleFolders.findIndex((f) => f.id === folderId);
    if (visibleIndex === -1) return;
    const targetVisibleIndex = direction === 'up' ? visibleIndex - 1 : visibleIndex + 1;
    if (targetVisibleIndex < 0 || targetVisibleIndex >= visibleFolders.length) return;

    const targetFolder = visibleFolders[targetVisibleIndex];
    const currGlobalIdx = folders.findIndex((f) => f.id === folderId);
    const targetGlobalIdx = folders.findIndex((f) => f.id === targetFolder.id);

    const newFolders = [...folders];
    const [moved] = newFolders.splice(currGlobalIdx, 1);
    newFolders.splice(targetGlobalIdx, 0, moved);
    onReorderFolders(newFolders);
  };

  const handleSetFolderPosition = (folderId: string, targetPosition: number) => {
    if (!onReorderFolders) return;
    const visibleIndex = visibleFolders.findIndex((f) => f.id === folderId);
    if (visibleIndex === -1) return;
    const targetVisibleIndex = Math.max(0, Math.min(visibleFolders.length - 1, targetPosition - 1));
    if (visibleIndex === targetVisibleIndex) return;

    const targetFolder = visibleFolders[targetVisibleIndex];
    const currGlobalIdx = folders.findIndex((f) => f.id === folderId);
    const targetGlobalIdx = folders.findIndex((f) => f.id === targetFolder.id);

    const newFolders = [...folders];
    const [moved] = newFolders.splice(currGlobalIdx, 1);
    newFolders.splice(targetGlobalIdx, 0, moved);
    onReorderFolders(newFolders);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/80 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                دليل المستودعات / Repositories Directory
              </h3>
              <p className="text-xs text-slate-400">
                اختر مستودعاً يدوياً لعرض الأفلام والمسلسلات المخزنة فيه
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          {/* Search & Add Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث عن مستودع أو مجلد..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {onOpenClassifierModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenClassifierModal();
                }}
                className="w-full sm:w-auto flex items-center justify-center space-x-1.5 space-x-reverse px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 text-xs font-bold shadow-sm transition-all flex-shrink-0 cursor-pointer"
                title="تصفية وتصنيف عناصر المستودعات بالكلمة المفتاحية ونقلها وحذفها"
              >
                <ArrowRightLeft className="w-4 h-4 text-purple-400" />
                <span>تصنيف وفرز العناصر</span>
              </button>
            )}

            <button
              id="btn-modal-add-repository"
              onClick={() => {
                onClose();
                onAddFolder();
              }}
              className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>مستودع جديد</span>
            </button>
          </div>

          {/* All Favorites inclusion summary & bulk controls */}
          <div className="p-3 bg-slate-950/80 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-sm">
            <div className="flex items-center space-x-2.5 space-x-reverse">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 flex-shrink-0">
                <Star className="w-4 h-4 fill-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-amber-300">
                    ظهور المفضلات في مجلد (كل المفضلة All Favorites):
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-slate-950">
                    {includedCount} من {visibleFolders.length} مفعّل
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  حدد المستودعات المسموح لعناصرها المفضلة بالظهور والعرض في مجلد كل المفضلة
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
              <button
                type="button"
                onClick={() => onBulkSetIncludeInAllFavorites && onBulkSetIncludeInAllFavorites(true)}
                title="السماح لجميع المستودعات بعرض مفضلاتها في كل المفضلة"
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <Check className="w-3 h-3 text-amber-400" />
                <span>تحديد الكل</span>
              </button>
              <button
                type="button"
                onClick={() => onBulkSetIncludeInAllFavorites && onBulkSetIncludeInAllFavorites(false)}
                title="استبعاد جميع المستودعات من الظهور في كل المفضلة"
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <EyeOff className="w-3 h-3 text-slate-400" />
                <span>إلغاء الكل</span>
              </button>
            </div>
          </div>

          {/* Repositories List Grid */}
          {/* Prominent All Favorites Repository Tile */}
          {(!searchTerm ||
            'كل المفضلة'.includes(searchTerm.toLowerCase()) ||
            'المفضلة'.includes(searchTerm.toLowerCase()) ||
            'all favorites'.includes(searchTerm.toLowerCase()) ||
            'favorites'.includes(searchTerm.toLowerCase())) && (
            <div
              onClick={() => handleChooseRepository(ALL_FAVORITES_FOLDER_ID)}
              style={{
                borderColor: selectedFolderId === ALL_FAVORITES_FOLDER_ID ? '#f59e0b' : 'rgba(245, 158, 11, 0.4)',
                backgroundColor: selectedFolderId === ALL_FAVORITES_FOLDER_ID ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.08)',
              }}
              className={`group relative border-2 rounded-xl p-3.5 mb-3 transition-all cursor-pointer hover:border-amber-400 flex items-center justify-between shadow-md ${
                selectedFolderId === ALL_FAVORITES_FOLDER_ID ? 'shadow-amber-500/20 ring-2 ring-amber-400' : ''
              }`}
            >
              <div className="flex items-center space-x-3 space-x-reverse min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 flex-shrink-0 shadow">
                  <Star className="w-5 h-5 fill-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-black text-amber-300 group-hover:text-yellow-200 transition-colors">
                      كل المفضلة (All Favorites)
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-xs">
                      {favoritesCount} عنصر
                    </span>
                  </div>
                  <p className="text-xs text-amber-200/70 truncate mt-0.5">
                    المفضلة العامة والتجميعية لكافة العناصر من جميع المستودعات
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 mr-2">
                {selectedFolderId === ALL_FAVORITES_FOLDER_ID ? (
                  <span className="flex items-center gap-1 text-xs font-black text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-400/50">
                    <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    <span>المعروض حالياً</span>
                  </span>
                ) : (
                  <span className="text-xs font-black text-amber-300/80 group-hover:text-white bg-slate-900/80 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-colors">
                    عرض المفضلة ←
                  </span>
                )}
              </div>
            </div>
          )}

          {filteredFolders.length === 0 ? (
            <div className="text-center py-10 bg-slate-950/50 border border-slate-800 rounded-2xl p-6">
              <Layers className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">لا يوجد مستودع مطابق للبحث</p>
              <p className="text-xs text-slate-500 mt-1">جرب إدخال اسم آخر أو أنشئ مستودعاً جديداً</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredFolders.map((folder) => {
                const isSelected = folder.id === selectedFolderId;
                const count = movieCounts[folder.id] || 0;
                const color = folder.color || '#3B82F6';

                // Calculate visible repository order index in visibleFolders array
                const visibleIndex = visibleFolders.findIndex((f) => f.id === folder.id);
                const orderNum = visibleIndex !== -1 ? visibleIndex + 1 : 1;

                return (
                  <div
                    key={folder.id}
                    onClick={() => handleChooseRepository(folder.id)}
                    style={{
                      borderColor: isSelected ? color : 'rgba(51, 65, 85, 0.6)',
                      backgroundColor: isSelected ? `${color}15` : 'rgba(15, 23, 42, 0.6)',
                    }}
                    className={`group relative border rounded-xl p-3.5 transition-all cursor-pointer hover:border-slate-500 flex flex-col justify-between ${
                      isSelected ? 'shadow-lg ring-1' : ''
                    }`}
                  >
                    <div>
                      {/* Top row: Order Number Badge + Name + Selected Indicator */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center space-x-2 space-x-reverse min-w-0 flex-1">
                          {/* Sequence Badge */}
                          <span
                            title={`ترتيب المستودع: ${orderNum}`}
                            className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-xs shadow flex-shrink-0 border border-amber-300"
                          >
                            {orderNum}
                          </span>

                          <span
                            className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm"
                            style={{ backgroundColor: color }}
                          />
                          <h4
                            className={`text-sm sm:text-base font-black truncate transition-colors ${
                              getFolderTextColor(folder.name)
                                ? ''
                                : 'text-white group-hover:text-indigo-300'
                            }`}
                            style={
                              getFolderTextColor(folder.name)
                                ? { color: getFolderTextColor(folder.name) }
                                : undefined
                            }
                          >
                            {folder.name}
                          </h4>
                        </div>

                        {isSelected && (
                          <span
                            className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>نشط الان</span>
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 line-clamp-2 mb-2.5">
                        {folder.description || 'لا يوجد وصف مخصص لهذا المستودع.'}
                      </p>

                      {/* Repository Reordering Control Bar */}
                      {onReorderFolders && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-lg p-1.5 mb-2.5"
                        >
                          <span className="text-[11px] font-bold text-indigo-300 flex items-center gap-1">
                            <ArrowUpDown className="w-3 h-3 text-indigo-400" />
                            <span>ترتيب المستودع:</span>
                          </span>

                          <div className="flex items-center gap-1">
                            {/* Move Up */}
                            <button
                              type="button"
                              onClick={() => handleMoveFolder(folder.id, 'up')}
                              disabled={visibleIndex <= 0}
                              title="رفع ترتيب المستودع للأعلى"
                              className="p-1 rounded bg-slate-900 hover:bg-indigo-600 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-900 transition-colors border border-slate-800 cursor-pointer"
                            >
                              <ChevronUp className="w-3.5 h-3.5 stroke-[3]" />
                            </button>

                            {/* Position Select Dropdown */}
                            <select
                              value={orderNum}
                              onChange={(e) => handleSetFolderPosition(folder.id, parseInt(e.target.value, 10))}
                              className="bg-slate-900 text-amber-300 border border-indigo-500/40 rounded px-1.5 py-0.5 text-xs font-black focus:outline-none cursor-pointer"
                              title="اختر الترتيب المباشر للمستودع"
                            >
                              {visibleFolders.map((_, i) => (
                                <option key={i + 1} value={i + 1} className="bg-slate-900 text-white">
                                  {i + 1}
                                </option>
                              ))}
                            </select>

                            {/* Move Down */}
                            <button
                              type="button"
                              onClick={() => handleMoveFolder(folder.id, 'down')}
                              disabled={visibleIndex >= visibleFolders.length - 1}
                              title="خفض ترتيب المستودع للأسفل"
                              className="p-1 rounded bg-slate-900 hover:bg-indigo-600 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-900 transition-colors border border-slate-800 cursor-pointer"
                            >
                              <ChevronDown className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Repository All Favorites Inclusion Toggle */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-between bg-slate-950/90 border border-slate-800 rounded-lg px-2.5 py-1.5 mb-2.5"
                      >
                        <div className="flex items-center space-x-1.5 space-x-reverse min-w-0">
                          <Star
                            className={`w-3.5 h-3.5 flex-shrink-0 ${
                              folder.includeInAllFavorites !== false
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-500'
                            }`}
                          />
                          <span className="text-[11px] font-bold text-slate-300 truncate">
                            عرض في كل المفضلة:
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const currentVal = folder.includeInAllFavorites !== false;
                            if (onToggleIncludeInAllFavorites) {
                              onToggleIncludeInAllFavorites(folder.id, !currentVal);
                            }
                          }}
                          title={
                            folder.includeInAllFavorites !== false
                              ? 'مسموح: انقر لاستبعاد مفضلات هذا المستودع من مجلد كل المفضلة'
                              : 'مستبعد: انقر للسماح بعرض مفضلات هذا المستودع في مجلد كل المفضلة'
                          }
                          className={`px-2 py-0.5 rounded-md text-[11px] font-black border transition-all flex items-center space-x-1 space-x-reverse cursor-pointer ${
                            folder.includeInAllFavorites !== false
                              ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 shadow-sm'
                              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-300 border-slate-700'
                          }`}
                        >
                          {folder.includeInAllFavorites !== false ? (
                            <>
                              <Check className="w-3 h-3 text-amber-400 stroke-[3]" />
                              <span>مسموح ⭐</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3 h-3 text-slate-400" />
                              <span>مستبعد ✕</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Bottom Metadata & Quick Actions */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-1.5 text-slate-400">
                        <Film className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="font-semibold text-slate-200">{count}</span>
                        <span>عنصر</span>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                            onEditFolder(folder);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition-colors"
                          title="تعديل المستودع"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onHideFolder(folder.id);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors"
                          title="إخفاء المستودع"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                        </button>

                        {onDeleteFolder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(folder.id);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="حذف المستودع"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleChooseRepository(folder.id)}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white transition-all text-xs font-semibold"
                        >
                          <span>عرض</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Inline Delete Confirmation Prompt */}
                    {confirmDeleteId === folder.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-3 p-2.5 bg-red-950/90 border border-red-500/40 rounded-lg text-xs animate-in fade-in duration-150"
                      >
                        <div className="flex items-center space-x-1.5 text-red-300 font-semibold mb-2">
                          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                          <span>تأكيد حذف المستودع والعناصر التابعة له؟</span>
                        </div>
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium text-[11px]"
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmDelete(folder.id)}
                            className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded font-bold text-[11px] shadow-sm"
                          >
                            نعم، احذف
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between flex-shrink-0 text-xs">
          <span className="text-slate-400">
            إجمالي المستودعات المرئية: <strong className="text-white">{visibleFolders.length}</strong>
          </span>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
