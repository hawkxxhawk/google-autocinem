import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Search,
  Filter,
  FolderInput,
  Trash2,
  CheckSquare,
  Square,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Film,
  Sparkles,
  Scissors,
  Eraser,
  Plus,
  Tag,
  RefreshCw,
  Check,
  Undo2,
} from 'lucide-react';
import { Folder, MovieItem, ALL_FAVORITES_FOLDER_ID } from '../types';

// Preset suggested words that users often want to remove from titles
const POPULAR_WORDS_TO_REMOVE = [
  'مترجم',
  'مدبلج',
  'فيلم',
  'مسلسل',
  'كامل',
  'حلقة',
  '1080p',
  '720p',
  '4K',
  'HD',
  'FHD',
  'WEB-DL',
  'BluRay',
  'WEBRip',
  'عرب سيد',
  'ايجي بست',
  'EgyBest',
  'FaselHD',
  'Akwaam',
];

// Helper to strip words from title
export const stripWordsFromTitle = (
  title: string,
  words: string[],
  options?: {
    cleanBracketsAndPunctuation?: boolean;
    caseSensitive?: boolean;
    cleanTimestamps?: boolean;
  }
): string => {
  if (!title) return '';
  let cleaned = title;

  // 1. Remove bracketed or parenthesized duration stamps like (HD1:30:04), (1:30:04), [HD 1:45:20]
  if (options?.cleanTimestamps !== false) {
    cleaned = cleaned.replace(
      /[([{\uFF08]\s*(?:HD|FHD|SD|4K|QHD)?\s*(?:جديد)?\s*\d{1,2}:\d{2}(?::\d{2})?\s*[)}\]\uFF09]/gi,
      ' '
    );

    cleaned = cleaned.replace(
      /(?:HD|FHD|SD|4K|QHD)?\s*جديد\s*\d{1,2}:\d{2}(?::\d{2})?/gi,
      ' '
    );
    cleaned = cleaned.replace(
      /(?:HD|FHD|SD|4K|QHD)\s*\d{1,2}:\d{2}(?::\d{2})?/gi,
      ' '
    );

    cleaned = cleaned.replace(/(?:^|[\s\-_.:/|\\])\d{1,2}:\d{2}:\d{2}(?=[\s\-_.:/|\\]|$)/g, ' ');
  }

  // 2. Custom words removal
  if (words && words.length > 0) {
    const sortedWords = [...words]
      .map((w) => w.trim())
      .filter((w) => w.length > 0)
      .sort((a, b) => b.length - a.length);

    for (const word of sortedWords) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = options?.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(escaped, flags);
      cleaned = cleaned.replace(regex, ' ');
    }
  }

  if (options?.cleanBracketsAndPunctuation !== false) {
    // Remove empty brackets / parentheses
    cleaned = cleaned
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/\{\s*\}/g, '')
      .replace(/（\s*）/g, '');

    // Collapse repeated dashes, underscores, dots with spaces around them
    cleaned = cleaned
      .replace(/[\-_.]\s*[\-_.]+/g, ' ')
      .replace(/\s+[\-_.]+\s+/g, ' ');
  }

  // Collapse multiple whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Strip leading/trailing dangling punctuation
  cleaned = cleaned.replace(/^[\s\-_.:/|\\]+|[\s\-_.:/|\\]+$/g, '').trim();

  return cleaned.length > 0 ? cleaned : title;
};

interface ItemClassifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  movies: MovieItem[];
  onBulkMoveMovies: (movieIds: string[], targetFolderId: string) => void;
  onBulkDeleteMovies: (movieIds: string[]) => void;
  onBulkRenameMovies?: (updates: Array<{ id: string; newTitle: string }>) => void;
  onMoveMovie?: (movieId: string, targetFolderId: string) => void;
  onDeleteMovie?: (movieId: string) => void;
  onOpenMovie?: (movie: MovieItem) => void;
}

export const ItemClassifierModal: React.FC<ItemClassifierModalProps> = ({
  isOpen,
  onClose,
  folders,
  movies,
  onBulkMoveMovies,
  onBulkDeleteMovies,
  onBulkRenameMovies,
  onMoveMovie,
  onDeleteMovie,
  onOpenMovie,
}) => {
  // Search keyword state
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedFolderScope, setSelectedFolderScope] = useState<string>('all');
  const [activeViewTab, setActiveViewTab] = useState<'unified' | 'grouped'>('unified');

  // Selected item IDs for bulk operations
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Move target repository
  const [targetFolderId, setTargetFolderId] = useState<string>('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Expanded folders in 'grouped' view
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  // Word Remover Tool state
  const [isWordRemoverOpen, setIsWordRemoverOpen] = useState(false);
  const [wordsToRemove, setWordsToRemove] = useState<string[]>([]);
  const [wordInput, setWordInput] = useState('');
  const [wordRemovalScope, setWordRemovalScope] = useState<'selected' | 'matched' | 'all_in_scope'>('matched');
  const [cleanBracketsAndPunctuation, setCleanBracketsAndPunctuation] = useState(true);
  const [cleanTimestamps, setCleanTimestamps] = useState(true);
  const [caseSensitiveWordRemoval, setCaseSensitiveWordRemoval] = useState(false);
  const [wordPreviewPage, setWordPreviewPage] = useState(1);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'move' | 'delete' | 'rename';
    itemCount: number;
    targetFolderName?: string;
    onConfirm: () => void;
  } | null>(null);

  // Success message toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter out hidden folders for moving
  const availableTargetFolders = useMemo(() => {
    return folders.filter((f) => !f.isFolderHidden && f.id !== ALL_FAVORITES_FOLDER_ID);
  }, [folders]);

  // Set default target folder once available
  useEffect(() => {
    if (availableTargetFolders.length > 0 && !targetFolderId) {
      setTargetFolderId(availableTargetFolders[0].id);
    }
  }, [availableTargetFolders, targetFolderId]);

  // Folder lookup map
  const folderMap = useMemo(() => {
    const map = new Map<string, Folder>();
    folders.forEach((f) => map.set(f.id, f));
    return map;
  }, [folders]);

  // Clean and prepare query
  const cleanQuery = searchKeyword.trim().toLowerCase();

  // Matched movies filtered by search keyword in title
  const matchedMovies = useMemo(() => {
    if (!cleanQuery) return [];

    return movies.filter((m) => {
      // Must not be hidden
      if (m.isHidden) return false;

      // Filter by folder scope if selected
      if (selectedFolderScope !== 'all' && m.parentFolderId !== selectedFolderScope) {
        return false;
      }

      // Check title contains the search keyword
      const titleMatch = m.title.toLowerCase().includes(cleanQuery);
      return titleMatch;
    });
  }, [movies, cleanQuery, selectedFolderScope]);

  // Reset pagination when search keyword or folder scope changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedItemIds(new Set());
  }, [searchKeyword, selectedFolderScope]);

  // Count matches per repository across ALL repositories (to show in selector/summary)
  const matchesPerFolder = useMemo(() => {
    if (!cleanQuery) return new Map<string, number>();

    const counts = new Map<string, number>();
    for (const m of movies) {
      if (m.isHidden) continue;
      if (m.title.toLowerCase().includes(cleanQuery)) {
        counts.set(m.parentFolderId, (counts.get(m.parentFolderId) || 0) + 1);
      }
    }
    return counts;
  }, [movies, cleanQuery]);

  // Grouped matches by repository
  const groupedMatches = useMemo(() => {
    if (!cleanQuery) return [];

    const map = new Map<string, MovieItem[]>();
    for (const m of matchedMovies) {
      const list = map.get(m.parentFolderId) || [];
      list.push(m);
      map.set(m.parentFolderId, list);
    }

    // Convert to sorted array of folders
    return folders
      .filter((f) => map.has(f.id))
      .map((f) => ({
        folder: f,
        items: map.get(f.id) || [],
      }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [folders, matchedMovies, cleanQuery]);

  // Auto-expand all grouped folders by default when search changes
  useEffect(() => {
    if (groupedMatches.length > 0) {
      setExpandedFolderIds(new Set(groupedMatches.map((g) => g.folder.id)));
    }
  }, [groupedMatches]);

  // Number of folders with matches
  const foldersWithMatchesCount = useMemo(() => {
    let count = 0;
    matchesPerFolder.forEach((c) => {
      if (c > 0) count++;
    });
    return count;
  }, [matchesPerFolder]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(matchedMovies.length / itemsPerPage));
  const paginatedMovies = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return matchedMovies.slice(start, start + itemsPerPage);
  }, [matchedMovies, currentPage, itemsPerPage]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllCurrentPage = () => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      paginatedMovies.forEach((m) => next.add(m.id));
      return next;
    });
  };

  const handleSelectAllMatched = () => {
    setSelectedItemIds(new Set(matchedMovies.map((m) => m.id)));
  };

  const handleDeselectAll = () => {
    setSelectedItemIds(new Set());
  };

  const handleSelectFolderItems = (folderItemIds: string[]) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      const allSelected = folderItemIds.every((id) => next.has(id));
      if (allSelected) {
        folderItemIds.forEach((id) => next.delete(id));
      } else {
        folderItemIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Toast handler
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Bulk Move Trigger
  const handleTriggerBulkMove = () => {
    if (selectedItemIds.size === 0) return;
    const targetFolder = folderMap.get(targetFolderId);
    if (!targetFolder) return;

    setConfirmDialog({
      isOpen: true,
      type: 'move',
      itemCount: selectedItemIds.size,
      targetFolderName: targetFolder.name,
      onConfirm: () => {
        const ids = Array.from(selectedItemIds);
        onBulkMoveMovies(ids, targetFolderId);
        showToast(`تم بنجاح نقل ${ids.length} عنصر إلى مستودع "${targetFolder.name}"`);
        setSelectedItemIds(new Set());
        setConfirmDialog(null);
      },
    });
  };

  // Bulk Delete Trigger
  const handleTriggerBulkDelete = () => {
    if (selectedItemIds.size === 0) return;

    setConfirmDialog({
      isOpen: true,
      type: 'delete',
      itemCount: selectedItemIds.size,
      onConfirm: () => {
        const ids = Array.from(selectedItemIds);
        onBulkDeleteMovies(ids);
        showToast(`تم حذف ${ids.length} عنصر بنجاح`);
        setSelectedItemIds(new Set());
        setConfirmDialog(null);
      },
    });
  };

  // Single Move Trigger
  const handleSingleMove = (movieId: string, newFolderId: string) => {
    const targetFolder = folderMap.get(newFolderId);
    if (!targetFolder) return;
    if (onMoveMovie) {
      onMoveMovie(movieId, newFolderId);
    } else {
      onBulkMoveMovies([movieId], newFolderId);
    }
    showToast(`تم نقل العنصر إلى مستودع "${targetFolder.name}"`);
  };

  // Single Delete Trigger
  const handleSingleDelete = (movieId: string, movieTitle: string) => {
    if (window.confirm(`هل أنت متأكد من حذف "${movieTitle}" نهائياً؟`)) {
      if (onDeleteMovie) {
        onDeleteMovie(movieId);
      } else {
        onBulkDeleteMovies([movieId]);
      }
      showToast(`تم حذف "${movieTitle}"`);
    }
  };

  // Word Removal Handlers and Computations
  const handleAddWord = (rawWord?: string) => {
    const input = (rawWord !== undefined ? rawWord : wordInput).trim();
    if (!input) return;

    // Support comma or newline separated values
    const parts = input
      .split(/[,،\n]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    setWordsToRemove((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (!next.some((w) => w.toLowerCase() === p.toLowerCase())) {
          next.push(p);
        }
      }
      return next;
    });

    if (rawWord === undefined) {
      setWordInput('');
    }
  };

  const handleTogglePresetWord = (word: string) => {
    setWordsToRemove((prev) => {
      const exists = prev.some((w) => w.toLowerCase() === word.toLowerCase());
      if (exists) {
        return prev.filter((w) => w.toLowerCase() !== word.toLowerCase());
      } else {
        return [...prev, word];
      }
    });
  };

  const handleRemoveWord = (wordToRemove: string) => {
    setWordsToRemove((prev) =>
      prev.filter((w) => w.toLowerCase() !== wordToRemove.toLowerCase())
    );
  };

  const handleClearAllWords = () => {
    setWordsToRemove([]);
  };

  // Determine which movies are eligible for word removal based on wordRemovalScope
  const targetMoviesForRemoval = useMemo(() => {
    if (wordRemovalScope === 'selected') {
      return movies.filter((m) => selectedItemIds.has(m.id) && !m.isHidden);
    }
    if (wordRemovalScope === 'matched' && cleanQuery) {
      return matchedMovies;
    }
    return movies.filter(
      (m) =>
        !m.isHidden &&
        (selectedFolderScope === 'all' || m.parentFolderId === selectedFolderScope)
    );
  }, [movies, selectedItemIds, wordRemovalScope, cleanQuery, matchedMovies, selectedFolderScope]);

  // Compute affected movies with new titles
  const affectedMovies = useMemo(() => {
    if (wordsToRemove.length === 0 && !cleanTimestamps) return [];
    const results: Array<{ item: MovieItem; originalTitle: string; newTitle: string }> = [];

    for (const item of targetMoviesForRemoval) {
      const newTitle = stripWordsFromTitle(item.title, wordsToRemove, {
        cleanBracketsAndPunctuation,
        caseSensitive: caseSensitiveWordRemoval,
        cleanTimestamps,
      });

      if (newTitle !== item.title) {
        results.push({
          item,
          originalTitle: item.title,
          newTitle,
        });
      }
    }
    return results;
  }, [
    targetMoviesForRemoval,
    wordsToRemove,
    cleanBracketsAndPunctuation,
    caseSensitiveWordRemoval,
    cleanTimestamps,
  ]);

  // Count occurrence of each word among target movies
  const wordFrequencyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of wordsToRemove) {
      const escaped = w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, caseSensitiveWordRemoval ? 'g' : 'gi');
      let count = 0;
      for (const m of targetMoviesForRemoval) {
        if (regex.test(m.title)) {
          count++;
        }
      }
      map.set(w, count);
    }
    return map;
  }, [wordsToRemove, targetMoviesForRemoval, caseSensitiveWordRemoval]);

  // Trigger Bulk Title Update (Word Stripper Execution)
  const handleTriggerBulkWordRemoval = () => {
    if (affectedMovies.length === 0) return;

    setConfirmDialog({
      isOpen: true,
      type: 'rename',
      itemCount: affectedMovies.length,
      onConfirm: () => {
        const updates = affectedMovies.map((a) => ({
          id: a.item.id,
          newTitle: a.newTitle,
        }));
        if (onBulkRenameMovies) {
          onBulkRenameMovies(updates);
        }
        showToast(`تم بنجاح تنقية وحذف الرموز وتحديث عناوين (${updates.length}) عنصر!`);
        setConfirmDialog(null);
      },
    });
  };

  // Helper to highlight removed words & timestamps in original title for live preview
  const highlightWordsToBeRemoved = (title: string, words: string[]) => {
    const regexParts: string[] = [];

    if (cleanTimestamps) {
      regexParts.push('[([{\\uFF08]\\s*(?:HD|FHD|SD|4K|QHD)?\\s*(?:جديد)?\\s*\\d{1,2}:\\d{2}(?::\\d{2})?\\s*[)}\\uFF09]');
      regexParts.push('(?:HD|FHD|SD|4K|QHD)?\\s*جديد\\s*\\d{1,2}:\\d{2}(?::\\d{2})?');
      regexParts.push('(?:HD|FHD|SD|4K|QHD)\\s*\\d{1,2}:\\d{2}(?::\d{2})?');
      regexParts.push('(?:^|[\\s\\-_.:/|\\\\])\\d{1,2}:\\d{2}:\\d{2}(?=[\\s\\-_.:/|\\\\]|$)');
    }

    const sortedWords = [...words]
      .map((w) => w.trim())
      .filter((w) => w.length > 0)
      .sort((a, b) => b.length - a.length);

    if (sortedWords.length > 0) {
      const escaped = sortedWords
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      regexParts.push(escaped);
    }

    if (regexParts.length === 0) return title;

    const regex = new RegExp(`(${regexParts.join('|')})`, caseSensitiveWordRemoval ? 'g' : 'gi');
    const parts = title.split(regex);

    return (
      <>
        {parts.map((part, idx) => {
          if (!part) return null;
          const isMatched =
            (cleanTimestamps && (
              /(?:HD|FHD|SD|4K|QHD)?\s*(?:جديد)?\s*\d{1,2}:\d{2}/i.test(part) ||
              /\d{1,2}:\d{2}:\d{2}/.test(part)
            )) ||
            sortedWords.some((w) =>
              caseSensitiveWordRemoval
                ? w === part
                : w.toLowerCase() === part.toLowerCase()
            );

          return isMatched ? (
            <span
              key={idx}
              className="bg-red-500/25 text-red-300 line-through px-1 rounded font-bold mx-0.5"
            >
              {part}
            </span>
          ) : (
            part
          );
        })}
      </>
    );
  };

  // Highlight matched keyword in text
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-amber-400 text-slate-950 font-black px-1 rounded mx-0.5">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md">
      <div
        className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg text-white">
              <ArrowRightLeft className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-white">
                  تصنيف وفرز عناصر المستودعات
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                  بحث ونقل وحذف إجمالي
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                تصفية العناصر داخل المستودعات بالكلمة المفتاحية في العنوان مع عرض إجمالي وإمكانية النقل والحذف الجماعي
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Scope Controls */}
        <div className="p-4 sm:p-5 bg-slate-950/40 border-b border-slate-800 space-y-3.5 flex-shrink-0">
          {/* Search Input Bar */}
          <div className="relative">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-indigo-400">
              <Search className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="اكتب كلمة للبحث عنها في أسماء العناصر (مثال: أكشن، 2024، الجزء، مدبلج، حلقة...)"
              className="w-full pl-10 pr-11 py-3 bg-slate-900 border-2 border-indigo-500/40 focus:border-indigo-500 rounded-xl text-white placeholder-slate-500 text-sm sm:text-base font-bold outline-none shadow-inner transition-all"
              autoFocus
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 hover:text-white cursor-pointer"
                title="مسح البحث"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Keywords Chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-bold ml-1">كلمات سريعة شائعة:</span>
            {['فيلم', 'مسلسل', '2024', '2023', 'الجزء', 'مدبلج', 'مترجم', '1080p', 'HD'].map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => setSearchKeyword(word)}
                className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                  searchKeyword === word
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-750'
                }`}
              >
                {word}
              </button>
            ))}
          </div>

          {/* Scope Selector: All Repositories or Specific Repository */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 flex-shrink-0">
                <Filter className="w-3.5 h-3.5 text-indigo-400" />
                <span>نطاق المستودعات المستهدفة:</span>
              </span>

              <select
                value={selectedFolderScope}
                onChange={(e) => setSelectedFolderScope(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">
                  جميع المستودعات ({cleanQuery ? matchedMovies.length : movies.length} عنصر)
                </option>
                {folders
                  .filter((f) => !f.isFolderHidden && f.id !== ALL_FAVORITES_FOLDER_ID)
                  .map((f) => {
                    const matchCount = matchesPerFolder.get(f.id) || 0;
                    return (
                      <option key={f.id} value={f.id}>
                        {f.name} {cleanQuery ? `(${matchCount} مطابق)` : ''}
                      </option>
                    );
                  })}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
              {/* Word Stripper Tool Toggle */}
              <button
                type="button"
                onClick={() => setIsWordRemoverOpen((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border shadow-sm ${
                  isWordRemoverOpen
                    ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-400/40 font-black'
                    : 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border-amber-500/40'
                }`}
                title="فتح أو إخفاء أداة حذف كلمات معينة من أسماء الأفلام"
              >
                <Scissors className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>حذف كلمات من الأسماء</span>
                {wordsToRemove.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      isWordRemoverOpen
                        ? 'bg-slate-950 text-amber-300'
                        : 'bg-amber-400 text-slate-950'
                    }`}
                  >
                    {wordsToRemove.length}
                  </span>
                )}
              </button>

              {/* View Switcher: Unified vs Grouped */}
              {cleanQuery && matchedMovies.length > 0 && (
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveViewTab('unified')}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      activeViewTab === 'unified'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    عرض مجمع شامل
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveViewTab('grouped')}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      activeViewTab === 'grouped'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    مقسم حسب المستودعات ({groupedMatches.length})
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Word Remover Tool Panel (أداة حذف كلمات من أسماء الأفلام) */}
        {isWordRemoverOpen && (
          <div className="p-4 sm:p-5 bg-gradient-to-b from-amber-950/30 via-slate-900/90 to-slate-950 border-b-2 border-amber-500/50 space-y-4 animate-in slide-in-from-top-3 duration-200 flex-shrink-0">
            {/* Panel Title & Close */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <Scissors className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-black text-amber-300 flex items-center gap-2">
                    <span>أداة حذف كلمات وعبارات معينة من أسماء الأفلام</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black">
                      تنظيف وتطهير العناوين
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    اكتب أو اختر الكلمات التي ترغب في إزالتها تلقائياً من عناوين الأفلام (مثل الجودات، وسوم المواقع، أو أي كلمة زائدة)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsWordRemoverOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer text-xs flex items-center gap-1"
              >
                <span>إخفاء الأداة</span>
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            {/* Input field + Add button */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-amber-400">
                  <Eraser className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={wordInput}
                  onChange={(e) => setWordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddWord();
                    }
                  }}
                  placeholder="اكتب كلمة أو كلمات مفصولة بفاصلة واضغط إضافة (مثال: مترجم، 1080p، كامل، فيلم)"
                  className="w-full pl-3 pr-9 py-2.5 bg-slate-950 border border-amber-500/40 focus:border-amber-400 rounded-xl text-white placeholder-slate-500 text-xs sm:text-sm font-bold outline-none shadow-inner"
                />
              </div>

              <button
                type="button"
                onClick={() => handleAddWord()}
                disabled={!wordInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-950 font-black text-xs sm:text-sm transition-all cursor-pointer shadow flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>إضافة للحذف</span>
              </button>

              {wordsToRemove.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllWords}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer"
                >
                  مسح الكل
                </button>
              )}
            </div>

            {/* Active Words Chips */}
            {wordsToRemove.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-950/70 rounded-xl border border-slate-800">
                <span className="text-xs font-black text-amber-300 ml-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" />
                  <span>الكلمات المحددة للحذف ({wordsToRemove.length}):</span>
                </span>

                {wordsToRemove.map((word) => {
                  const freq = wordFrequencyMap.get(word) || 0;
                  return (
                    <span
                      key={word}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-xs font-bold shadow-sm"
                    >
                      <span>{word}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-950/80 text-red-300 font-mono font-bold">
                        {freq} موجود
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveWord(word)}
                        className="hover:text-white text-red-400 p-0.5 rounded cursor-pointer"
                        title="إزالة الكلمة من القائمة"
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Suggested Quick Words */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-400">
                كلمات شائعة مقترحة (انقر للإضافة السريعة إلى قائمة الحذف):
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {POPULAR_WORDS_TO_REMOVE.map((preset) => {
                  const isSelected = wordsToRemove.some(
                    (w) => w.toLowerCase() === preset.toLowerCase()
                  );
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleTogglePresetWord(preset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-red-600 text-white border-red-500 shadow'
                          : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-750 hover:text-white'
                      }`}
                    >
                      {isSelected ? `✓ ${preset}` : `+ ${preset}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scope & Settings Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
              {/* Scope radio options */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-300 block">
                  نطاق تطبيق عملية الحذف:
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Selected items scope */}
                  <button
                    type="button"
                    onClick={() => setWordRemovalScope('selected')}
                    disabled={selectedItemIds.size === 0}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      wordRemovalScope === 'selected'
                        ? 'bg-amber-400 text-slate-950 border-amber-300 font-black shadow'
                        : selectedItemIds.size === 0
                        ? 'opacity-40 bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                    }`}
                  >
                    العناصر المحددة فقط ({selectedItemIds.size})
                  </button>

                  {/* Matched items scope */}
                  {cleanQuery && (
                    <button
                      type="button"
                      onClick={() => setWordRemovalScope('matched')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        wordRemovalScope === 'matched'
                          ? 'bg-amber-400 text-slate-950 border-amber-300 font-black shadow'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      نتائج البحث الحالية ({matchedMovies.length})
                    </button>
                  )}

                  {/* All in scope */}
                  <button
                    type="button"
                    onClick={() => setWordRemovalScope('all_in_scope')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      wordRemovalScope === 'all_in_scope'
                        ? 'bg-amber-400 text-slate-950 border-amber-300 font-black shadow'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                    }`}
                  >
                    {selectedFolderScope === 'all'
                      ? `جميع عناصر كافة المستودعات (${movies.filter((m) => !m.isHidden).length})`
                      : `كافة عناصر المستودع الحالي (${
                          movies.filter(
                            (m) => !m.isHidden && m.parentFolderId === selectedFolderScope
                          ).length
                        })`}
                  </button>
                </div>
              </div>

              {/* Advanced Toggles */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-300 block">
                  خيارات التنظيف الإضافية:
                </label>
                <div className="flex flex-col gap-1.5 text-xs text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-300">
                    <input
                      type="checkbox"
                      checked={cleanTimestamps}
                      onChange={(e) => setCleanTimestamps(e.target.checked)}
                      className="accent-amber-400 rounded w-4 h-4 cursor-pointer"
                    />
                    <span>تنقية وحذف أوقات العرض والرموز مثل (HD1:30:04) و HD2:23:57 تلقائياً</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cleanBracketsAndPunctuation}
                      onChange={(e) => setCleanBracketsAndPunctuation(e.target.checked)}
                      className="accent-amber-400 rounded w-4 h-4 cursor-pointer"
                    />
                    <span>تنظيف الأقواس الفارغة () و [] والشرطات الزائدة (- _ .) تلقائياً</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={caseSensitiveWordRemoval}
                      onChange={(e) => setCaseSensitiveWordRemoval(e.target.checked)}
                      className="accent-amber-400 rounded w-4 h-4 cursor-pointer"
                    />
                    <span>حساس لحالة الأحرف الإنجليزية (Case Sensitive)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Live Preview Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-black text-white">
                    المعاينة الحية للنتائج قبل التطبيق:
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">العناصر المتأثرة بالتعديل:</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-mono font-black ${
                      affectedMovies.length > 0
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {affectedMovies.length} من أصل {targetMoviesForRemoval.length} عنصر
                  </span>
                </div>
              </div>

              {wordsToRemove.length === 0 ? (
                <div className="text-center py-4 text-slate-500 text-xs">
                  اكتب كلمة أو اختر من الكلمات المقترحة أعلاه لمشاهدة المعاينة الحية للعناوين بعد التنظيف.
                </div>
              ) : affectedMovies.length === 0 ? (
                <div className="text-center py-4 text-amber-400/80 text-xs font-bold">
                  لم يتم العثور على أي من هذه الكلمات في عناوين العناصر ضمن النطاق المختار.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>نماذج من العناوين قبل وبعد التعديل (عرض أول 30 عنصر):</span>
                    <span className="text-emerald-400 font-bold">
                      سيتم تطهير {affectedMovies.length} عنوان
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/80 rounded-lg bg-slate-900 border border-slate-800 p-2 custom-scrollbar">
                    {affectedMovies.slice(0, 30).map(({ item, originalTitle, newTitle }) => {
                      const parentFolder = folderMap.get(item.parentFolderId);
                      return (
                        <div key={item.id} className="py-2 px-1.5 flex flex-col gap-1 text-xs">
                          {/* Before */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-950/80 text-red-300 font-bold border border-red-500/30 flex-shrink-0">
                              قبل
                            </span>
                            <span className="text-slate-300 truncate">
                              {highlightWordsToBeRemoved(originalTitle, wordsToRemove)}
                            </span>
                            {parentFolder && (
                              <span
                                className="text-[9px] px-1.5 py-0.2 rounded-full border mr-auto flex-shrink-0"
                                style={{
                                  backgroundColor: `${parentFolder.color}15`,
                                  borderColor: `${parentFolder.color}35`,
                                  color: parentFolder.color,
                                }}
                              >
                                {parentFolder.name}
                              </span>
                            )}
                          </div>

                          {/* After */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 font-bold border border-emerald-500/30 flex-shrink-0">
                              بعد
                            </span>
                            <span className="text-emerald-300 font-black truncate">
                              {newTitle}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {affectedMovies.length > 30 && (
                    <div className="text-center text-[10px] text-slate-400">
                      ... وهناك {affectedMovies.length - 30} عنصر إضافي سيتم تعديلهم
                    </div>
                  )}
                </div>
              )}

              {/* Action Execution Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <div className="text-xs text-slate-400">
                  {affectedMovies.length > 0
                    ? `جاهز لتحديث (${affectedMovies.length}) عنصر وحفظها فورياً`
                    : 'حدد كلمات تؤثر في العناوين لتمكين زر التطبيق'}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleTriggerBulkWordRemoval}
                    disabled={affectedMovies.length === 0}
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:hover:from-emerald-600 disabled:hover:to-teal-600 text-white font-black text-xs sm:text-sm transition-all cursor-pointer shadow-lg active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>
                      تطبيق وحفظ تعديل ({affectedMovies.length}) عنوان فيلم
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toastMessage && (
          <div className="bg-emerald-600/90 text-white px-4 py-2 text-xs font-black flex items-center justify-between shadow-md animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-emerald-200 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Aggregate Results Summary Banner */}
        {cleanQuery && (
          <div className="px-4 py-2.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs flex-shrink-0">
            <div className="flex items-center flex-wrap gap-2.5 sm:gap-4">
              <div className="flex items-center gap-1.5 font-bold">
                <span className="text-slate-400">إجمالي النتائج المطابقة:</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-black border border-indigo-500/30">
                  {matchedMovies.length} عنصر
                </span>
              </div>

              {selectedFolderScope === 'all' && (
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-slate-400">في:</span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-black border border-purple-500/30">
                    {foldersWithMatchesCount} مستودع
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1.5 font-bold">
                <span className="text-slate-400">المحدد للعمليات:</span>
                <span
                  className={`px-2 py-0.5 rounded-full font-mono font-black ${
                    selectedItemIds.size > 0
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {selectedItemIds.size} عنصر
                </span>
              </div>
            </div>

            {/* Quick Selection Buttons */}
            {matchedMovies.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAllMatched}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-[11px] font-bold cursor-pointer transition-all"
                  title="تحديد كافة العناصر المطابقة عبر كل الصفحات"
                >
                  تحديد الكل ({matchedMovies.length})
                </button>
                {selectedItemIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border border-slate-700 text-[11px] font-bold cursor-pointer transition-all"
                  >
                    إلغاء التحديد
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bulk Action Controls Bar (Active when items are selected) */}
        {selectedItemIds.size > 0 && (
          <div className="p-3 bg-gradient-to-r from-indigo-950/90 via-slate-900 to-purple-950/90 border-b border-indigo-500/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-shrink-0 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              <span className="text-xs font-black text-amber-300">
                إجراءات جماعية على ({selectedItemIds.size}) عنصر محدد:
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Target Folder Selector for Moving */}
              <div className="flex items-center gap-1.5 bg-slate-950/80 border border-indigo-500/40 rounded-xl p-1">
                <span className="text-[11px] font-bold text-slate-300 pr-1.5 flex items-center gap-1">
                  <FolderInput className="w-3.5 h-3.5 text-indigo-400" />
                  <span>نقل إلى:</span>
                </span>
                <select
                  value={targetFolderId}
                  onChange={(e) => setTargetFolderId(e.target.value)}
                  className="bg-slate-900 text-white text-xs font-bold rounded-lg px-2 py-1 border border-slate-700 outline-none cursor-pointer max-w-[180px] truncate"
                >
                  {availableTargetFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleTriggerBulkMove}
                  className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>تأكيد النقل</span>
                </button>
              </div>

              {/* Word Removal from Selected Button */}
              <button
                type="button"
                onClick={() => {
                  setIsWordRemoverOpen(true);
                  setWordRemovalScope('selected');
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/40 text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5"
                title="حذف كلمات معينة من أسماء العناصر المحددة"
              >
                <Scissors className="w-3.5 h-3.5 text-amber-400" />
                <span>حذف كلمات من أسماء المحدد</span>
              </button>

              {/* Bulk Delete Button */}
              <button
                type="button"
                onClick={handleTriggerBulkDelete}
                className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 hover:text-red-200 border border-red-500/40 text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5 mr-auto sm:mr-0"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>حذف المحدد ({selectedItemIds.size})</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
          {/* Case 1: Empty search input */}
          {!cleanQuery ? (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8" />
              </div>
              <h4 className="text-base font-black text-slate-200">
                ابدأ بإدخال كلمة للبحث في أسماء العناصر
              </h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                اكتب أي كلمة أو رقم أو تصنيف موجود في عناوين الأفلام أو العناصر، وسيتم تجميع النتائج وعرض إحصائياتها الإجمالية عبر كافة المستودعات مع إمكانية تحديدها ونقلها أو حذفها دفعة واحدة.
              </p>
            </div>
          ) : matchedMovies.length === 0 ? (
            /* Case 2: No matches */
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700 text-slate-500 flex items-center justify-center mx-auto mb-4">
                <Layers className="w-8 h-8" />
              </div>
              <h4 className="text-base font-black text-slate-300">
                لا توجد عناصر مطابقة لكلمة "{searchKeyword}"
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                تأكد من صحة الكلمة أو جرب تغيير نطاق المستودعات المستهدفة.
              </p>
            </div>
          ) : activeViewTab === 'unified' ? (
            /* Case 3: Unified List View */
            <div className="space-y-3">
              {/* Sub-header with page select and pagination controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllCurrentPage}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer flex items-center gap-1"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>تحديد الصفحة الحالية ({paginatedMovies.length})</span>
                  </button>
                  <span>•</span>
                  <span>
                    عرض {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, matchedMovies.length)} من {matchedMovies.length}
                  </span>
                </div>

                {/* Items per page selector */}
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <span>عناصر الصفحة:</span>
                  {[25, 50, 100].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setItemsPerPage(size);
                        setCurrentPage(1);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        itemsPerPage === size
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items List */}
              <div className="divide-y divide-slate-800/60 rounded-xl bg-slate-950/60 border border-slate-800 overflow-hidden">
                {paginatedMovies.map((movie) => {
                  const isSelected = selectedItemIds.has(movie.id);
                  const parentFolder = folderMap.get(movie.parentFolderId);

                  return (
                    <div
                      key={movie.id}
                      className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                        isSelected
                          ? 'bg-indigo-950/40 hover:bg-indigo-950/60'
                          : 'hover:bg-slate-850/50'
                      }`}
                    >
                      {/* Checkbox & Item Info */}
                      <div className="flex items-center space-x-3 space-x-reverse min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(movie.id)}
                          className="p-1 text-slate-400 hover:text-indigo-400 cursor-pointer flex-shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-amber-400" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-600" />
                          )}
                        </button>

                        {/* Thumbnail / Icon */}
                        <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                          {movie.thumbnail ? (
                            <img
                              src={movie.thumbnail}
                              alt={movie.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Film className="w-5 h-5 text-slate-500" />
                          )}
                        </div>

                        {/* Title and details */}
                        <div className="min-w-0 flex-1">
                          <h5 className="text-sm font-bold text-white truncate">
                            {highlightMatch(movie.title, cleanQuery)}
                          </h5>

                          <div className="flex items-center flex-wrap gap-2 mt-1">
                            {/* Source Repository Badge */}
                            {parentFolder && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                                style={{
                                  backgroundColor: `${parentFolder.color}20`,
                                  borderColor: `${parentFolder.color}40`,
                                  color: parentFolder.color,
                                }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: parentFolder.color }}
                                />
                                {parentFolder.name}
                              </span>
                            )}

                            {movie.category && (
                              <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                                {movie.category}
                              </span>
                            )}

                            {movie.classification && (
                              <span className="text-[10px] text-amber-300 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                {movie.classification}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Inline Quick Action Controls */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Quick Single Move Dropdown */}
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleSingleMove(movie.id, e.target.value);
                            }
                          }}
                          className="bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold rounded-lg px-2 py-1 outline-none cursor-pointer max-w-[110px]"
                          title="نقل سريع إلى مستودع آخر"
                        >
                          <option value="">نقل إلى...</option>
                          {availableTargetFolders
                            .filter((f) => f.id !== movie.parentFolderId)
                            .map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                        </select>

                        {/* Open external link if available */}
                        {(movie.url || movie.embedUrl) && (
                          <button
                            type="button"
                            onClick={() => onOpenMovie && onOpenMovie(movie)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="فتح الرابط"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}

                        {/* Single Delete */}
                        <button
                          type="button"
                          onClick={() => handleSingleDelete(movie.id, movie.title)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                          title="حذف العنصر"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs">
                  <div className="text-slate-400 font-bold">
                    الصفحة {currentPage} من {totalPages}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 cursor-pointer"
                      title="الصفحة السابقة"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    {/* Page Numbers */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = currentPage;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-7 h-7 rounded-lg font-bold text-xs ${
                            currentPage === pageNum
                              ? 'bg-indigo-600 text-white shadow'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 cursor-pointer"
                      title="الصفحة التالية"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Case 4: Grouped View (By Repository) */
            <div className="space-y-4">
              {groupedMatches.map(({ folder, items }) => {
                const isExpanded = expandedFolderIds.has(folder.id);
                const folderItemIds = items.map((m) => m.id);
                const allSelected = folderItemIds.length > 0 && folderItemIds.every((id) => selectedItemIds.has(id));
                const someSelected = folderItemIds.some((id) => selectedItemIds.has(id));

                return (
                  <div
                    key={folder.id}
                    className="rounded-2xl bg-slate-950/70 border border-slate-800 overflow-hidden shadow-sm"
                  >
                    {/* Repository Group Header */}
                    <div
                      onClick={() => {
                        setExpandedFolderIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(folder.id)) next.delete(folder.id);
                          else next.add(folder.id);
                          return next;
                        });
                      }}
                      className="p-3.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between cursor-pointer hover:bg-slate-850 transition-colors"
                    >
                      <div className="flex items-center space-x-3 space-x-reverse min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectFolderItems(folderItemIds);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-400 cursor-pointer"
                        >
                          {allSelected ? (
                            <CheckSquare className="w-5 h-5 text-amber-400" />
                          ) : someSelected ? (
                            <div className="w-5 h-5 rounded border-2 border-amber-400 flex items-center justify-center bg-amber-400/20 text-amber-400 text-xs font-bold">
                              -
                            </div>
                          ) : (
                            <Square className="w-5 h-5 text-slate-600" />
                          )}
                        </button>

                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: folder.color || '#6366f1' }}
                          />
                          <h4 className="text-sm sm:text-base font-black text-white truncate">
                            {folder.name}
                          </h4>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold border border-indigo-500/30">
                            {items.length} عنصر مطابق
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400 font-bold hidden sm:inline">
                          {isExpanded ? 'طي القائمة' : 'توسيع القائمة'}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Repository Items (When Expanded) */}
                    {isExpanded && (
                      <div className="divide-y divide-slate-800/50">
                        {items.map((movie) => {
                          const isSelected = selectedItemIds.has(movie.id);

                          return (
                            <div
                              key={movie.id}
                              className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                                isSelected ? 'bg-indigo-950/40' : 'hover:bg-slate-900/50'
                              }`}
                            >
                              <div className="flex items-center space-x-3 space-x-reverse min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => handleToggleSelect(movie.id)}
                                  className="p-1 text-slate-400 hover:text-indigo-400 cursor-pointer flex-shrink-0"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-5 h-5 text-amber-400" />
                                  ) : (
                                    <Square className="w-5 h-5 text-slate-600" />
                                  )}
                                </button>

                                <div className="min-w-0 flex-1">
                                  <h5 className="text-sm font-bold text-white truncate">
                                    {highlightMatch(movie.title, cleanQuery)}
                                  </h5>
                                  {movie.category && (
                                    <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800 mt-1 inline-block">
                                      {movie.category}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Quick Single Move Dropdown */}
                                <select
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      handleSingleMove(movie.id, e.target.value);
                                    }
                                  }}
                                  className="bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold rounded-lg px-2 py-1 outline-none cursor-pointer max-w-[110px]"
                                  title="نقل سريع إلى مستودع آخر"
                                >
                                  <option value="">نقل إلى...</option>
                                  {availableTargetFolders
                                    .filter((f) => f.id !== folder.id)
                                    .map((f) => (
                                      <option key={f.id} value={f.id}>
                                        {f.name}
                                      </option>
                                    ))}
                                </select>

                                {/* Single Delete */}
                                <button
                                  type="button"
                                  onClick={() => handleSingleDelete(movie.id, movie.title)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                                  title="حذف العنصر"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between flex-shrink-0 text-xs">
          <div className="text-slate-400 font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>نظام الفرز والتصنيف الذكي للمستودعات</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center space-x-3 space-x-reverse">
              {confirmDialog.type === 'delete' ? (
                <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
                </div>
              ) : confirmDialog.type === 'rename' ? (
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                  <Scissors className="w-5 h-5 stroke-[2.5]" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                  <ArrowRightLeft className="w-5 h-5 stroke-[2.5]" />
                </div>
              )}

              <div>
                <h4 className="text-base font-black text-white">
                  {confirmDialog.type === 'delete'
                    ? 'تأكيد الحذف الجماعي'
                    : confirmDialog.type === 'rename'
                    ? 'تأكيد حذف الكلمات وتحديث العناوين'
                    : 'تأكيد النقل الجماعي'}
                </h4>
                <p className="text-xs text-slate-400">
                  {confirmDialog.type === 'delete'
                    ? `هل أنت متأكد تماماً من رغبتك في حذف (${confirmDialog.itemCount}) عنصر نهائياً؟`
                    : confirmDialog.type === 'rename'
                    ? `هل تريد تطبيق حذف الكلمات وتحديث عناوين (${confirmDialog.itemCount}) عنصر وحفظ التغييرات؟`
                    : `هل أنت متأكد من نقل (${confirmDialog.itemCount}) عنصر إلى مستودع "${confirmDialog.targetFolderName}"؟`}
                </p>
              </div>
            </div>

            {confirmDialog.type === 'delete' && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300">
                ⚠️ تحذير: لا يمكن التراجع عن هذه العملية بعد تأكيد الحذف.
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-2 rounded-xl text-xs font-black text-white cursor-pointer shadow-md ${
                  confirmDialog.type === 'delete'
                    ? 'bg-red-600 hover:bg-red-500'
                    : confirmDialog.type === 'rename'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {confirmDialog.type === 'delete'
                  ? 'نعم، احذف نهائياً'
                  : confirmDialog.type === 'rename'
                  ? 'نعم، طبق تعديل العناوين'
                  : 'نعم، أنقل العناصر'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
