import React, { useState, useRef, useEffect } from 'react';
import {
  Film,
  Shuffle,
  Eye,
  Plus,
  Code2,
  Smartphone,
  Tv,
  Maximize2,
  RotateCcw,
  FolderPlus,
  FileJson,
  Download,
  Database,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  EyeOff,
  Folder,
  Star,
  ChevronLeft,
  ChevronRight,
  Type,
  ZoomIn,
  ZoomOut,
  Settings,
  X,
  Sparkles,
  Layers,
  ArrowRightLeft,
} from 'lucide-react';
import { ViewMode, Folder as FolderType, MovieItem, ALL_FAVORITES_FOLDER, FavoriteColor, FAVORITE_SECTIONS } from '../types';
import { SettingsModal } from './SettingsModal';

interface NavbarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onRandomFolder: () => void;
  onOpenRepositoriesModal: () => void;
  onOpenFavoritesModal: () => void;
  onOpenHiddenFoldersModal: () => void;
  onOpenFolderModal: () => void;
  onOpenMovieModal: () => void;
  onOpenJsonImportModal: () => void;
  onExportData: () => void;
  onOpenKotlinModal: () => void;
  onResetData: () => void;
  hiddenFoldersCount: number;
  hiddenMoviesCount: number;
  favoritesCount: number;
  fontScale: number;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
  onResetFont: () => void;
  folders?: FolderType[];
  movies?: MovieItem[];
  onOpenClassifierModal?: () => void;
  onPurifyAllTitles?: () => void;
  hiddenFavoriteSections?: FavoriteColor[];
  onToggleHideFavoriteSection?: (sectionId: FavoriteColor) => void;
  onDeduplicateMovies?: (deletedMovieIds: string[]) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  viewMode,
  setViewMode,
  onRandomFolder,
  onOpenRepositoriesModal,
  onOpenFavoritesModal,
  onOpenHiddenFoldersModal,
  onOpenFolderModal,
  onOpenMovieModal,
  onOpenJsonImportModal,
  onExportData,
  onOpenKotlinModal,
  onResetData,
  hiddenFoldersCount,
  hiddenMoviesCount,
  favoritesCount,
  fontScale,
  onIncreaseFont,
  onDecreaseFont,
  onResetFont,
  folders = [],
  movies = [],
  onOpenClassifierModal,
  onPurifyAllTitles,
  hiddenFavoriteSections = [],
  onToggleHideFavoriteSection,
  onDeduplicateMovies,
}) => {
  const [isMenuCollapsed, setIsMenuCollapsed] = useState(() => {
    const saved = localStorage.getItem('autocinema_menu_collapsed');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('autocinema_menu_collapsed', String(isMenuCollapsed));
  }, [isMenuCollapsed]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const totalHidden = hiddenFoldersCount + hiddenMoviesCount;

  // Horizontal Drag-to-scroll Refs & State
  const mainRowRef = useRef<HTMLDivElement>(null);
  const toolsRowRef = useRef<HTMLDivElement>(null);

  const [isDragMain, setIsDragMain] = useState(false);
  const [startMainX, setStartMainX] = useState(0);
  const [scrollMainLeft, setScrollMainLeft] = useState(0);

  const [isDragTools, setIsDragTools] = useState(false);
  const [startToolsX, setStartToolsX] = useState(0);
  const [scrollToolsLeft, setScrollToolsLeft] = useState(0);

  // Main Row Drag Handlers
  const handleMainMouseDown = (e: React.MouseEvent) => {
    if (!mainRowRef.current) return;
    setIsDragMain(true);
    setStartMainX(e.pageX - mainRowRef.current.offsetLeft);
    setScrollMainLeft(mainRowRef.current.scrollLeft);
  };
  const handleMainMouseLeaveOrUp = () => setIsDragMain(false);
  const handleMainMouseMove = (e: React.MouseEvent) => {
    if (!isDragMain || !mainRowRef.current) return;
    e.preventDefault();
    const x = e.pageX - mainRowRef.current.offsetLeft;
    const walk = (x - startMainX) * 1.5;
    mainRowRef.current.scrollLeft = scrollMainLeft - walk;
  };

  // Tools Row Drag Handlers
  const handleToolsMouseDown = (e: React.MouseEvent) => {
    if (!toolsRowRef.current) return;
    setIsDragTools(true);
    setStartToolsX(e.pageX - toolsRowRef.current.offsetLeft);
    setScrollToolsLeft(toolsRowRef.current.scrollLeft);
  };
  const handleToolsMouseLeaveOrUp = () => setIsDragTools(false);
  const handleToolsMouseMove = (e: React.MouseEvent) => {
    if (!isDragTools || !toolsRowRef.current) return;
    e.preventDefault();
    const x = e.pageX - toolsRowRef.current.offsetLeft;
    const walk = (x - startToolsX) * 1.5;
    toolsRowRef.current.scrollLeft = scrollToolsLeft - walk;
  };

  // Scroll helper buttons
  const scrollContainer = (ref: React.RefObject<HTMLDivElement>, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = direction === 'left' ? -260 : 260;
      ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white px-2 sm:px-4 py-2 sticky top-0 z-30 shadow-md w-full">
      <div className="w-full mx-auto flex flex-col gap-2">
        {/* Main Brand & Quick Access Scrollable Container */}
        <div className="relative group/mainrow flex items-center w-full">
          {/* Scroll Left Arrow */}
          <button
            type="button"
            onClick={() => scrollContainer(mainRowRef, 'left')}
            className="hidden sm:flex items-center justify-center w-6 h-6 rounded-full bg-slate-800/90 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 shadow-md absolute -left-2 z-20 transition-all opacity-80 group-hover/mainrow:opacity-100"
            title="تحريك شريط العنوان لليسار"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div
            ref={mainRowRef}
            onMouseDown={handleMainMouseDown}
            onMouseLeave={handleMainMouseLeaveOrUp}
            onMouseUp={handleMainMouseLeaveOrUp}
            onMouseMove={handleMainMouseMove}
            className={`flex items-center justify-between gap-3 overflow-x-auto w-full pb-1 pt-0.5 scroll-smooth select-none cursor-grab active:cursor-grabbing scrollbar-thin scrollbar-thumb-indigo-500/60 scrollbar-track-slate-900/60 hover:scrollbar-thumb-indigo-400 ${
              isDragMain ? 'cursor-grabbing' : ''
            }`}
          >
            {/* App Title & Brand */}
            <div className="flex items-center space-x-3 flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-red-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
                <Film className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent whitespace-nowrap">
                    AutoCinema
                  </h1>
                  <span className="px-1.5 py-0.2 text-[10px] font-semibold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 whitespace-nowrap">
                    Android API 28
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden md:block whitespace-nowrap">
                  Smart Cinema Directory & Repository Manager
                </p>
              </div>
            </div>

            {/* Persistent Quick Action Bar */}
            <div className="flex items-center space-x-2.5 space-x-reverse flex-shrink-0">
              {/* Main Settings Menu Button (قائمة الإعدادات) */}
              <button
                id="btn-open-settings"
                onClick={() => setIsSettingsOpen(true)}
                title="فتح قائمة الإعدادات والأدوات الشاملة"
                className="flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white text-base sm:text-lg font-black transition-all shadow-md shadow-purple-600/20 border border-purple-400/40 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide ring-2 ring-purple-500/30"
              >
                <Settings className="w-5 h-5 text-amber-300 stroke-[2.5]" />
                <span>الإعدادات</span>
              </button>

              {/* Reset Initial Data Button (شريط التطبيق العلوي) */}
              <button
                id="btn-reset-data-top"
                onClick={onResetData}
                title="إعادة ضبط واستعادة البيانات من ملف initialData.json"
                className="flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-slate-100 text-base sm:text-lg font-black transition-all shadow-md border border-slate-700 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide"
              >
                <RotateCcw className="w-5 h-5 text-amber-400 stroke-[2.5]" />
                <span>استعادة initialData.json</span>
              </button>

              {/* Font Size Scaling Control - Main Bar */}
              <div
                id="font-size-control-main"
                className="flex items-center bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-1 space-x-2 space-x-reverse shadow-sm whitespace-nowrap flex-shrink-0"
              >
                <span className="text-sm sm:text-base font-black text-slate-200 px-1 hidden lg:flex items-center gap-1">
                  <Type className="w-4.5 h-4.5 text-indigo-400" />
                  <span>الخط</span>
                </span>

                {/* Decrease -10% */}
                <button
                  type="button"
                  id="btn-font-decrease-main"
                  onClick={onDecreaseFont}
                  disabled={fontScale <= 50}
                  title="تصغير الخط بمقدار 10% (الحد الأدنى 50%)"
                  className="w-8.5 h-8.5 rounded-lg bg-slate-900 hover:bg-indigo-600 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-200 hover:text-white flex items-center justify-center font-black text-base transition-all border border-slate-700/60 active:scale-95 cursor-pointer"
                >
                  <ZoomOut className="w-4.5 h-4.5 stroke-[2.5]" />
                </button>

                {/* Scale Percentage & Reset to 100% */}
                <button
                  type="button"
                  id="btn-font-reset-main"
                  onClick={onResetFont}
                  title="إعادة ضبط حجم الخط إلى 100%"
                  className="px-2.5 py-1 rounded-md bg-indigo-950/90 hover:bg-indigo-900 text-amber-300 font-black text-sm sm:text-base border border-indigo-500/40 transition-all cursor-pointer min-w-[52px] text-center"
                >
                  {fontScale}%
                </button>

                {/* Increase +10% */}
                <button
                  type="button"
                  id="btn-font-increase-main"
                  onClick={onIncreaseFont}
                  disabled={fontScale >= 200}
                  title="تكبير الخط بمقدار 10% (الحد الأقصى 200%)"
                  className="w-8.5 h-8.5 rounded-lg bg-slate-900 hover:bg-indigo-600 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-200 hover:text-white flex items-center justify-center font-black text-base transition-all border border-slate-700/60 active:scale-95 cursor-pointer"
                >
                  <ZoomIn className="w-4.5 h-4.5 stroke-[2.5]" />
                </button>
              </div>

              {/* Toggle Collapse/Hide Action Buttons Menu */}
              <button
                id="btn-toggle-menu-collapse"
                onClick={() => setIsMenuCollapsed(!isMenuCollapsed)}
                title={isMenuCollapsed ? 'عرض جميع أدوات التحكم' : 'إخفاء الأزرار والأدوات'}
                className={`flex items-center space-x-2 space-x-reverse px-3.5 py-2 rounded-xl border text-base sm:text-lg font-black transition-all whitespace-nowrap cursor-pointer active:scale-95 tracking-wide ${
                  isMenuCollapsed
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <SlidersHorizontal className="w-5 h-5" />
                <span>
                  {isMenuCollapsed ? 'إظهار الأدوات' : 'إخفاء الأزرار'}
                </span>
                {isMenuCollapsed ? (
                  <ChevronDown className="w-4 h-4 text-amber-300 stroke-[3]" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-slate-400 stroke-[3]" />
                )}
              </button>
            </div>
          </div>

          {/* Scroll Right Arrow */}
          <button
            type="button"
            onClick={() => scrollContainer(mainRowRef, 'right')}
            className="hidden sm:flex items-center justify-center w-6 h-6 rounded-full bg-slate-800/90 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 shadow-md absolute -right-2 z-20 transition-all opacity-80 group-hover/mainrow:opacity-100"
            title="تحريك شريط العنوان لليمين"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Collapsible Action Buttons Panel - Scrollable & Draggable */}
        {!isMenuCollapsed && (
          <div className="relative group/toolsrow pt-1.5 border-t border-slate-800/80 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Scroll Left Arrow */}
            <button
              type="button"
              onClick={() => scrollContainer(toolsRowRef, 'left')}
              className="hidden sm:flex items-center justify-center w-6 h-6 rounded-full bg-slate-800/90 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 shadow-md absolute -left-2 top-3 z-20 transition-all opacity-80 group-hover/toolsrow:opacity-100"
              title="تحريك الأزرار لليسار"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div
              ref={toolsRowRef}
              onMouseDown={handleToolsMouseDown}
              onMouseLeave={handleToolsMouseLeaveOrUp}
              onMouseUp={handleToolsMouseLeaveOrUp}
              onMouseMove={handleToolsMouseMove}
              className={`flex items-center gap-2.5 overflow-x-auto pb-1.5 pt-0.5 scroll-smooth select-none cursor-grab active:cursor-grabbing w-full px-0.5 scrollbar-thin scrollbar-thumb-indigo-500/60 scrollbar-track-slate-900/60 hover:scrollbar-thumb-indigo-400 ${
                isDragTools ? 'cursor-grabbing' : ''
              }`}
            >
              {/* Shuffle / Random Folder */}
              <button
                id="btn-random-folder"
                onClick={onRandomFolder}
                title="Randomized Startup Selection: Query Room DB for visible folder"
                className="flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-base sm:text-lg font-black transition-all shadow-sm flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide"
              >
                <Shuffle className="w-5 h-5 stroke-[2.5]" />
                <span>Random Folder</span>
              </button>

              {/* Eye Icon for Hidden Vault */}
              <button
                id="btn-hidden-vault"
                onClick={onOpenHiddenFoldersModal}
                title="Hidden Folders & Items Vault"
                className={`relative flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl text-base sm:text-lg font-black transition-all flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide ${
                  totalHidden > 0
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Eye className="w-5 h-5 text-amber-400 stroke-[2.5]" />
                <span>Hidden Vault</span>
                {totalHidden > 0 && (
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center mr-1">
                    {totalHidden}
                  </span>
                )}
              </button>

              {/* New Folder */}
              <button
                id="btn-add-folder"
                onClick={onOpenFolderModal}
                className="flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-base sm:text-lg font-black transition-all flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide"
              >
                <FolderPlus className="w-5 h-5 text-indigo-400 stroke-[2.5]" />
                <span>Folder</span>
              </button>

              {/* Export App Data JSON */}
              <button
                id="btn-export-json"
                onClick={onExportData}
                title="تصدير كافة بيانات التطبيق بصيغة JSON"
                className="flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white text-base sm:text-lg font-black transition-all shadow-sm flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide"
              >
                <Download className="w-5 h-5 text-emerald-200 stroke-[2.5]" />
                <span>تصدير JSON</span>
              </button>

              {/* Import JSON Repository / Backup File */}
              <button
                id="btn-import-json"
                onClick={onOpenJsonImportModal}
                title="استيراد وتغذية بيانات التطبيق أو قوائم أفلام بصيغة JSON"
                className="flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl bg-purple-600/90 hover:bg-purple-500 text-white text-base sm:text-lg font-black transition-all shadow-sm flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide"
              >
                <FileJson className="w-5 h-5 text-purple-200 stroke-[2.5]" />
                <span>استيراد JSON</span>
              </button>

              {/* New Movie Item */}
              <button
                id="btn-add-movie"
                onClick={onOpenMovieModal}
                className="flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-base sm:text-lg font-black transition-all shadow-sm flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
                <span>Add Movie</span>
              </button>

              {/* Android Native Kotlin Code Exporter */}
              <button
                id="btn-kotlin-code"
                onClick={onOpenKotlinModal}
                title="عرض واستخراج كود الأندرويد الأصلي (Kotlin & Jetpack Compose)"
                className="flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-base sm:text-lg font-black transition-all flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide"
              >
                <Smartphone className="w-5 h-5 text-sky-400 stroke-[2.5]" />
                <span>Android Native (Kotlin)</span>
              </button>

              {/* Phone Frame Toggle */}
              <button
                id="btn-toggle-phone"
                onClick={() => setViewMode(viewMode === 'phone' ? 'full' : 'phone')}
                title={viewMode === 'phone' ? 'توسيع للعرض الكامل' : 'عرض محاكي هاتف الأندرويد'}
                className={`flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl border text-base sm:text-lg font-black transition-all flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide ${
                  viewMode === 'phone'
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow'
                    : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/30'
                }`}
              >
                <Smartphone className="w-5 h-5 stroke-[2.5]" />
                <span>هاتف</span>
              </button>

              {/* Android TV 9 Leanback Frame Toggle */}
              <button
                id="btn-toggle-tv"
                onClick={() => setViewMode(viewMode === 'tv' ? 'full' : 'tv')}
                title={viewMode === 'tv' ? 'توسيع للعرض الكامل' : 'عرض محاكي شاشات أندرويد TV (اصدار 9)'}
                className={`flex items-center space-x-2 space-x-reverse px-4 py-2 rounded-xl border text-base sm:text-lg font-black transition-all flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide ${
                  viewMode === 'tv'
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                    : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/30'
                }`}
              >
                <Tv className="w-5 h-5 stroke-[2.5]" />
                <span>أندرويد TV 9</span>
              </button>

              {/* Reset Initial Data */}
              <button
                id="btn-reset-data"
                onClick={onResetData}
                title="إعادة ضبط واستعادة البيانات من ملف initialData.json"
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-base sm:text-lg font-black transition-all ml-auto flex items-center gap-2 flex-shrink-0 whitespace-nowrap cursor-pointer active:scale-95 tracking-wide"
              >
                <RotateCcw className="w-5 h-5 text-amber-400 stroke-[2.5]" />
                <span>استعادة initialData.json</span>
              </button>
            </div>

            {/* Scroll Right Arrow */}
            <button
              type="button"
              onClick={() => scrollContainer(toolsRowRef, 'right')}
              className="hidden sm:flex items-center justify-center w-6 h-6 rounded-full bg-slate-800/90 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 shadow-md absolute -right-2 top-3 z-20 transition-all opacity-80 group-hover/toolsrow:opacity-100"
              title="تحريك الأزرار لليمين"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Comprehensive Settings Modal / Hub */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        folders={folders}
        movies={movies}
        onDeduplicateMovies={onDeduplicateMovies}
        onOpenRepositoriesModal={onOpenRepositoriesModal}
        onOpenFavoritesModal={onOpenFavoritesModal}
        onOpenHiddenFoldersModal={onOpenHiddenFoldersModal}
        onOpenFolderModal={onOpenFolderModal}
        onOpenMovieModal={onOpenMovieModal}
        onOpenJsonImportModal={onOpenJsonImportModal}
        onExportData={onExportData}
        onOpenKotlinModal={onOpenKotlinModal}
        onResetData={onResetData}
        onRandomFolder={onRandomFolder}
        favoritesCount={favoritesCount}
        hiddenFoldersCount={hiddenFoldersCount}
        hiddenMoviesCount={hiddenMoviesCount}
        fontScale={fontScale}
        onIncreaseFont={onIncreaseFont}
        onDecreaseFont={onDecreaseFont}
        onResetFont={onResetFont}
        onOpenClassifierModal={onOpenClassifierModal}
        onPurifyAllTitles={onPurifyAllTitles}
        hiddenFavoriteSections={hiddenFavoriteSections}
        onToggleHideFavoriteSection={onToggleHideFavoriteSection}
      />
    </header>
  );
};


