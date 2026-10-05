import { ClassificationRating } from '../types';

export interface ClassificationOption {
  id: ClassificationRating;
  level: string; // "1/5", "2/5", etc.
  label: string; // "منخفض جدًا", etc.
  emoji: string; // "🟢", "🟡", etc.
  fullLabel: string; // "🟢 1/5 منخفض جدًا"
  colorName: string; // "أخضر", "أصفر", etc.
  colorHex: string; // "#10b981", etc.
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  cardBorder: string;
  cardGlow: string;
  dotBg: string;
}

export const CLASSIFICATION_OPTIONS: ClassificationOption[] = [
  {
    id: 'green',
    level: '1/5',
    label: 'منخفض جدًا',
    emoji: '🟢',
    fullLabel: '🟢 1/5 منخفض جدًا',
    colorName: 'أخضر',
    colorHex: '#10b981',
    badgeBg: 'bg-emerald-950/90 hover:bg-emerald-900/90',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-500/60',
    cardBorder: 'border-[3px] border-emerald-500 ring-1 ring-emerald-400/60',
    cardGlow: 'shadow-[0_0_18px_rgba(16,185,129,0.38)]',
    dotBg: 'bg-emerald-500',
  },
  {
    id: 'yellow',
    level: '2/5',
    label: 'منخفض',
    emoji: '🟡',
    fullLabel: '🟡 2/5 منخفض',
    colorName: 'أصفر',
    colorHex: '#facc15',
    badgeBg: 'bg-yellow-950/90 hover:bg-yellow-900/90',
    badgeText: 'text-yellow-400',
    badgeBorder: 'border-yellow-400/60',
    cardBorder: 'border-[3px] border-yellow-400 ring-1 ring-yellow-400/60',
    cardGlow: 'shadow-[0_0_18px_rgba(250,204,21,0.38)]',
    dotBg: 'bg-yellow-400',
  },
  {
    id: 'orange',
    level: '3/5',
    label: 'متوسط',
    emoji: '🟠',
    fullLabel: '🟠 3/5 متوسط',
    colorName: 'برتقالي',
    colorHex: '#f97316',
    badgeBg: 'bg-orange-950/90 hover:bg-orange-900/90',
    badgeText: 'text-orange-400',
    badgeBorder: 'border-orange-500/60',
    cardBorder: 'border-[3px] border-orange-500 ring-1 ring-orange-400/60',
    cardGlow: 'shadow-[0_0_18px_rgba(249,115,22,0.38)]',
    dotBg: 'bg-orange-500',
  },
  {
    id: 'red',
    level: '4/5',
    label: 'عالٍ',
    emoji: '🔴',
    fullLabel: '🔴 4/5 عالٍ',
    colorName: 'أحمر',
    colorHex: '#ef4444',
    badgeBg: 'bg-red-950/90 hover:bg-red-900/90',
    badgeText: 'text-red-400',
    badgeBorder: 'border-red-500/60',
    cardBorder: 'border-[3px] border-red-500 ring-1 ring-red-400/60',
    cardGlow: 'shadow-[0_0_18px_rgba(239,68,68,0.42)]',
    dotBg: 'bg-red-500',
  },
  {
    id: 'purple',
    level: '5/5',
    label: 'عالٍ جدًا',
    emoji: '🟣',
    fullLabel: '🟣 5/5 عالٍ جدًا',
    colorName: 'بنفسجي',
    colorHex: '#a855f7',
    badgeBg: 'bg-purple-950/90 hover:bg-purple-900/90',
    badgeText: 'text-purple-400',
    badgeBorder: 'border-purple-500/60',
    cardBorder: 'border-[3px] border-purple-500 ring-1 ring-purple-400/60',
    cardGlow: 'shadow-[0_0_18px_rgba(168,85,247,0.42)]',
    dotBg: 'bg-purple-500',
  },
  {
    id: 'unverified',
    level: 'غير محدد',
    label: 'غير متحقق',
    emoji: '⚪',
    fullLabel: '⚪ غير متحقق',
    colorName: 'أبيض / محايد',
    colorHex: '#e2e8f0',
    badgeBg: 'bg-slate-900/90 hover:bg-slate-800',
    badgeText: 'text-slate-300',
    badgeBorder: 'border-slate-500/60',
    cardBorder: 'border-2 border-slate-300/85',
    cardGlow: 'shadow-[0_0_12px_rgba(255,255,255,0.2)]',
    dotBg: 'bg-slate-200',
  },
];

export function getClassificationInfo(rating?: ClassificationRating): ClassificationOption {
  if (!rating) {
    return CLASSIFICATION_OPTIONS.find((o) => o.id === 'unverified')!;
  }
  return (
    CLASSIFICATION_OPTIONS.find((o) => o.id === rating) ||
    CLASSIFICATION_OPTIONS.find((o) => o.id === 'unverified')!
  );
}
