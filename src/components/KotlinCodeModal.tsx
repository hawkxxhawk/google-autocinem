import React, { useState } from 'react';
import {
  X,
  Code2,
  Copy,
  Check,
  FileCode,
  Database,
  Layers,
  Smartphone,
  Cpu,
  Layout,
  FileSpreadsheet,
} from 'lucide-react';
import {
  KOTLIN_MAIN_ACTIVITY,
  KOTLIN_VIEWMODEL,
  KOTLIN_COMPOSE_UI,
  KOTLIN_ANDROID_MANIFEST,
  KOTLIN_GRADLE_BUILD,
  KOTLIN_FOLDER_ENTITY,
  KOTLIN_MOVIE_ENTITY,
  KOTLIN_DAO,
  KOTLIN_DATABASE,
} from '../utils/kotlinCodeGenerator';

interface KotlinCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType =
  | 'autoseed'
  | 'activity'
  | 'viewmodel'
  | 'compose'
  | 'folder'
  | 'movie'
  | 'dao'
  | 'db'
  | 'manifest'
  | 'gradle';

export const KotlinCodeModal: React.FC<KotlinCodeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('autoseed');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const AUTO_SEED_WALKTHROUGH = `====================================================================
  منظومة البذر التلقائي وتجزئة البيانات (Multi-Chunk Auto-Seeding) - AutoCinema
====================================================================

1. تجزئة البيانات الذكية (2000 عنصر لكل ملف):
----------------------------------------------
يقوم التطبيق بتقسيم البيانات تلقائياً على ملفات كل منها بحد أقصى 2000 عنصر:
• الملف الأول (initialData.json): العناصر من 1 إلى 2000 (البيانات الأساسية).
• الملف الثاني (initialData2.json): العناصر من 2001 إلى 4000 (البيانات الحديثة والجديدة).
• الملفات التالية (initialData3.json...): كل 2000 عنصر إضافي في ملف مستقل.

2. الميزة الكبرى لتقليل النسخ المتكرر:
--------------------------------------
البيانات الحديثة أو الجديدة تُحفظ وتُصدّر في الملف الثاني (initialData2.json)، 
مما يعني أنك عند إضافة أفلام جديدة لا تحتاج لإعادة نسخ كلا الملفين! 
يكفيك فقط نسخ الملف الثاني المحدث (initialData2.json) إلى مجلد public أو أصول الأندرويد.

3. آلية التحميل والبذر التلقائي المدمج:
--------------------------------------
يقوم التطبيق عند الإقلاع أو الضغط على "استعادة initialData.json" بالبحث التلقائي 
عن initialData.json ثم initialData2.json و initialData3.json... بداخل مجلد الأصول (public / assets)
ودمج كافة العناصر والمستودعات تلقائياً بدون أي تكرار.

4. خطوات النقل والتطبيق خطوة بخطوة:
-----------------------------------
[الخطوة 1]: قم بالضغط على "تصدير نسخة احتياطية" أو "تحميل initialData2.json".
[الخطوة 2]: ضع الملفات (initialData.json و initialData2.json...) بداخل مجلد /public في مشروع الويب (Vite).
[الخطوة 3]: قم ببناء مشروع الويب عبر تنفيذ الأمر:
            npm run build
            (سيولد مجلد dist وبداخله كافة ملفات initialData تلقائياً).
[الخطوة 4]: انسخ محتويات مجلد dist إلى مجلد أصول تطبيق الأندرويد:
            app/src/main/assets/www/
[الخطوة 5]: عند تشغيل تطبيق الأندرويد، يقوم كود التهيئة ببذر وتحميل جميع الأجزاء والملفات تلقائياً!
`;

  const getCode = () => {
    switch (activeTab) {
      case 'autoseed':
        return AUTO_SEED_WALKTHROUGH;
      case 'activity':
        return KOTLIN_MAIN_ACTIVITY;
      case 'viewmodel':
        return KOTLIN_VIEWMODEL;
      case 'compose':
        return KOTLIN_COMPOSE_UI;
      case 'folder':
        return KOTLIN_FOLDER_ENTITY;
      case 'movie':
        return KOTLIN_MOVIE_ENTITY;
      case 'dao':
        return KOTLIN_DAO;
      case 'db':
        return KOTLIN_DATABASE;
      case 'manifest':
        return KOTLIN_ANDROID_MANIFEST;
      case 'gradle':
        return KOTLIN_GRADLE_BUILD;
      default:
        return AUTO_SEED_WALKTHROUGH;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>مشروع تطبيق أندرويد بلغة Kotlin & Jetpack Compose</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] border border-emerald-500/30 font-semibold">
                  Android Native
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                كود المصدر الكامل لتطبيق الأندرويد الأصلي (Jetpack Compose + Room Database + Material 3)
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

        {/* File Tabs */}
        <div className="flex items-center space-x-1.5 px-4 py-2.5 bg-slate-950 border-b border-slate-800 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('autoseed')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              activeTab === 'autoseed'
                ? 'bg-purple-600 text-white shadow ring-2 ring-purple-400/50'
                : 'bg-purple-950/40 text-purple-300 border border-purple-800/50 hover:bg-purple-900/60'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-purple-300" />
            <span>منظومة البذر التلقائي Auto-Seeding</span>
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              activeTab === 'activity'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>MainActivity.kt</span>
          </button>

          <button
            onClick={() => setActiveTab('viewmodel')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              activeTab === 'viewmodel'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>AutoCinemaViewModel.kt</span>
          </button>

          <button
            onClick={() => setActiveTab('compose')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              activeTab === 'compose'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            <span>ComposeUI.kt</span>
          </button>

          <button
            onClick={() => setActiveTab('folder')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              activeTab === 'folder'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Folder.kt</span>
          </button>

          <button
            onClick={() => setActiveTab('movie')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              activeTab === 'movie'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>MovieItem.kt</span>
          </button>

          <button
            onClick={() => setActiveTab('dao')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              activeTab === 'dao'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>AutoCinemaDao.kt</span>
          </button>

          <button
            onClick={() => setActiveTab('db')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              activeTab === 'db'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>AppDatabase.kt</span>
          </button>

          <button
            onClick={() => setActiveTab('manifest')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              activeTab === 'manifest'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>AndroidManifest.xml</span>
          </button>

          <button
            onClick={() => setActiveTab('gradle')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              activeTab === 'gradle'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>build.gradle.kts</span>
          </button>

          <button
            onClick={handleCopy}
            className="ml-auto flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-bold border border-emerald-500/30 transition-colors flex-shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>تم النسخ!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الكود</span>
              </>
            )}
          </button>
        </div>

        {/* Code Content View */}
        <div className="p-4 overflow-y-auto bg-slate-950 font-mono text-xs text-slate-300 leading-relaxed flex-1 min-h-[280px]">
          <pre className="whitespace-pre-wrap select-all">{getCode()}</pre>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            يمكنك لصق هذه الملفات مباشرة في Android Studio واستخراج ملف APK للتطبيق.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

