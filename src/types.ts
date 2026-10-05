export type SortOption = 'domain' | 'title' | 'date' | 'manual';

export interface Folder {
  id: string;
  name: string;
  description: string;
  color: string; // Hex string e.g., "#1E88E5"
  sortBy: SortOption;
  isFolderHidden: boolean;
  includeInAllFavorites?: boolean; // When false, favorites in this folder are excluded from All Favorites
}

export interface FavoriteList {
  id: string;
  name: string;
  description?: string;
  color?: string; // Hex color string
  createdAt: string;
  movieIds: string[]; // List of movie IDs in this custom list
}

export type ClassificationRating =
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple'
  | 'unverified';

export type FavoriteColor = 'green' | 'yellow' | 'purple' | 'black';

export interface FavoriteSectionConfig {
  id: FavoriteColor;
  number: number;
  name: string;
  shortName: string;
  colorName: string;
  colorHex: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  buttonBg: string;
  buttonHoverBg: string;
  buttonText: string;
  buttonBorder: string;
  ringColor: string;
  iconBg: string;
  dotColor: string;
}

export const FAVORITE_SECTIONS: FavoriteSectionConfig[] = [
  {
    id: 'green',
    number: 1,
    name: 'مفضلة 1 خضراء',
    shortName: '1 خضراء',
    colorName: 'الأخضر',
    colorHex: '#10b981',
    badgeBg: 'bg-emerald-950/80',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-500/50',
    buttonBg: 'bg-emerald-600',
    buttonHoverBg: 'hover:bg-emerald-500',
    buttonText: 'text-white',
    buttonBorder: 'border-emerald-400',
    ringColor: 'ring-emerald-400',
    iconBg: 'bg-emerald-600',
    dotColor: 'bg-emerald-400',
  },
  {
    id: 'yellow',
    number: 2,
    name: 'مفضلة 2 صفراء',
    shortName: '2 صفراء',
    colorName: 'الأصفر',
    colorHex: '#f59e0b',
    badgeBg: 'bg-amber-950/80',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-500/50',
    buttonBg: 'bg-amber-500',
    buttonHoverBg: 'hover:bg-amber-400',
    buttonText: 'text-slate-950',
    buttonBorder: 'border-amber-300',
    ringColor: 'ring-amber-300',
    iconBg: 'bg-amber-500',
    dotColor: 'bg-amber-400',
  },
  {
    id: 'purple',
    number: 3,
    name: 'مفضلة 3 بنفسجي',
    shortName: '3 بنفسجي',
    colorName: 'البنفسجي',
    colorHex: '#a855f7',
    badgeBg: 'bg-purple-950/80',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-500/50',
    buttonBg: 'bg-purple-600',
    buttonHoverBg: 'hover:bg-purple-500',
    buttonText: 'text-white',
    buttonBorder: 'border-purple-400',
    ringColor: 'ring-purple-300',
    iconBg: 'bg-purple-600',
    dotColor: 'bg-purple-400',
  },
  {
    id: 'black',
    number: 4,
    name: 'مفضلة 4 أسود',
    shortName: '4 أسود',
    colorName: 'الأسود',
    colorHex: '#09090b',
    badgeBg: 'bg-slate-950/90',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-slate-700',
    buttonBg: 'bg-black',
    buttonHoverBg: 'hover:bg-slate-900',
    buttonText: 'text-amber-300',
    buttonBorder: 'border-slate-600',
    ringColor: 'ring-slate-400',
    iconBg: 'bg-black',
    dotColor: 'bg-slate-400',
  },
];

export function getFavoriteSectionConfig(color?: FavoriteColor | string): FavoriteSectionConfig {
  const found = FAVORITE_SECTIONS.find((s) => s.id === color);
  return found || FAVORITE_SECTIONS[1]; // default to yellow
}

export interface MovieItem {
  id: string;
  title: string;
  url: string;
  embedUrl: string;
  duration: string;
  useDirectPlayer: boolean;
  description: string;
  category: string;
  posterUrl: string;
  addedAt: string; // ISO date string
  isHidden: boolean;
  isBroken: boolean;
  isFavorite: boolean;
  favoriteColor?: FavoriteColor;
  parentFolderId: string; // Foreign key to Folder.id
  manualOrder?: number;
  favoriteOrder?: number; // Custom display order inside favorites sections (1, 2, 3...)
  favoriteListIds?: string[]; // IDs of custom favorite lists this movie belongs to
  classification?: ClassificationRating; // Color classification border & rating
  classificationReason?: string; // Reason or description of classification (e.g. from Gemini AI)
  storySummary?: string; // Short summary of the movie's plot/story
}

export type ViewMode = 'phone' | 'tv' | 'full';

export const ALL_FAVORITES_FOLDER_ID = 'all-favorites';

export const ALL_FAVORITES_FOLDER: Folder = {
  id: ALL_FAVORITES_FOLDER_ID,
  name: 'كل المفضلة (All Favorites)',
  description: 'المفضلة العامة والتجميعية لكافة العناصر من جميع المستودعات',
  color: '#f59e0b',
  sortBy: 'manual',
  isFolderHidden: false,
};

