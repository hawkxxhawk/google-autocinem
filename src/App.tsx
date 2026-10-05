import React, { useState, useEffect, useCallback } from 'react';
import { Folder, MovieItem, FavoriteList, ViewMode, ALL_FAVORITES_FOLDER_ID, ALL_FAVORITES_FOLDER, ClassificationRating, FavoriteColor } from './types';
import { INITIAL_FOLDERS, INITIAL_MOVIES } from './data/initialData';
import {
  initStorageAsync,
  loadFolders,
  saveFolders,
  loadMovies,
  saveMovies,
  loadFavoriteLists,
  saveFavoriteLists,
  syncInitialDataFile,
  getRandomFolderId,
  resetToDefaults,
  resetToDefaultsFromInitialJson,
  exportFullAppData,
  checkAndAutoSeedData,
  fetchInitialDataJson,
  mergeAppData,
  parseAndValidateFullAppData,
  cleanMovieTitle,
  cleanMovieItem,
  cleanAllMovieItems,
} from './utils/storage';
import { Navbar } from './components/Navbar';
import { MovieGrid } from './components/MovieGrid';
import { FolderModal } from './components/FolderModal';
import { MovieModal } from './components/MovieModal';
import { JsonImportModal } from './components/JsonImportModal';
import { RepositoriesModal } from './components/RepositoriesModal';
import { HiddenFoldersModal } from './components/HiddenFoldersModal';
import { FavoritesModal } from './components/FavoritesModal';
import { KotlinCodeModal } from './components/KotlinCodeModal';
import { DeviceFrame } from './components/DeviceFrame';
import { PageScrollControls } from './components/PageScrollControls';
import { ItemClassifierModal } from './components/ItemClassifierModal';

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [favoriteLists, setFavoriteLists] = useState<FavoriteList[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('full');

  // Modals state
  const [isRepositoriesModalOpen, setIsRepositoriesModalOpen] = useState(false);
  const [isFavoritesModalOpen, setIsFavoritesModalOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<Folder | null>(null);

  const [isMovieModalOpen, setIsMovieModalOpen] = useState(false);
  const [movieToEdit, setMovieToEdit] = useState<MovieItem | null>(null);
  const [initialMovieData, setInitialMovieData] = useState<Partial<MovieItem> | null>(null);

  const [isJsonImportModalOpen, setIsJsonImportModalOpen] = useState(false);
  const [isHiddenVaultOpen, setIsHiddenVaultOpen] = useState(false);
  const [isKotlinModalOpen, setIsKotlinModalOpen] = useState(false);
  const [isItemClassifierOpen, setIsItemClassifierOpen] = useState(false);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Hidden All Favorites sections (green, yellow, purple, black)
  const [hiddenFavoriteSections, setHiddenFavoriteSections] = useState<FavoriteColor[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('autocinema_hidden_favorite_sections');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const handleToggleHideFavoriteSection = (sectionId: FavoriteColor) => {
    setHiddenFavoriteSections((prev) => {
      const next = prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId];
      try {
        localStorage.setItem('autocinema_hidden_favorite_sections', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Font scale state (50% to 200%, step 10%, default 100%)
  const [fontScale, setFontScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('autocinema_font_scale');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 50 && val <= 200) {
          return val;
        }
      }
    }
    return 100;
  });

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale}%`;
    try {
      localStorage.setItem('autocinema_font_scale', fontScale.toString());
    } catch (e) {
      // Ignore storage errors
    }
  }, [fontScale]);

  const handleIncreaseFont = () => {
    setFontScale((prev) => Math.min(200, Math.round((prev + 10) * 10) / 10));
  };

  const handleDecreaseFont = () => {
    setFontScale((prev) => Math.max(50, Math.round((prev - 10) * 10) / 10));
  };

  const handleResetFont = () => {
    setFontScale(100);
  };

  // Initialize data: Load from storage, seed ONLY if completely empty and uninitialized
  useEffect(() => {
    const initAppData = async () => {
      // 1. Initialize IndexedDB storage asynchronously
      const asyncStorage = await initStorageAsync();

      const hasUserData = localStorage.getItem('autocinema_has_user_data') === 'true';

      let finalFolders = asyncStorage.folders;
      let finalMovies = asyncStorage.movies;
      let finalFavs = asyncStorage.favoriteLists;

      // 2. Only seed from initialData.json if user storage has not been initialized yet
      if (!hasUserData && finalFolders.length === 0 && finalMovies.length === 0) {
        const initialData = await fetchInitialDataJson();
        if (initialData && (initialData.folders.length > 0 || initialData.movies.length > 0)) {
          finalFolders = initialData.folders;
          finalMovies = initialData.movies;
          if (initialData.favoriteLists && Array.isArray(initialData.favoriteLists) && initialData.favoriteLists.length > 0) {
            finalFavs = initialData.favoriteLists;
          }
        } else {
          finalFolders = INITIAL_FOLDERS;
          finalMovies = INITIAL_MOVIES;
        }

        saveFolders(finalFolders);
        saveMovies(finalMovies);
        saveFavoriteLists(finalFavs);
      }

      // Automatically sanitize and purify all movie titles (e.g. remove (HD1:30:04), HD2:23:57, etc.)
      const { cleanedMovies, modifiedCount } = cleanAllMovieItems(finalMovies);
      if (modifiedCount > 0) {
        finalMovies = cleanedMovies;
      }

      // Enforce user requirements for All Favorites sections:
      // 1. All movies in List 1 fav -> green section in All Favorites
      // 2. All movies in List 2 fav -> yellow section in All Favorites
      // 3. Movies from XX-fav -> black section in All Favorites
      // 4. Movies with rating 4/5 (red) or 5/5 (purple) -> purple section in All Favorites
      const list1FolderIds = new Set(
        finalFolders
          .filter((f) => {
            const name = (f.name || '').toLowerCase();
            return name.includes('list 1 fav') || name.includes('list1 fav') || name.includes('list 1fav') || name.includes('list of fav1') || name.includes('list of fav 1');
          })
          .map((f) => f.id)
      );
      const list2FolderIds = new Set(
        finalFolders
          .filter((f) => {
            const name = (f.name || '').toLowerCase();
            return name.includes('list 2 fav') || name.includes('list2 fav') || name.includes('list 2fav') || name.includes('list of fav2') || name.includes('list of fav 2');
          })
          .map((f) => f.id)
      );
      const xxFolderIds = new Set(
        finalFolders
          .filter((f) => {
            const name = (f.name || '').toLowerCase();
            return name.includes('xx-fav') || name.includes('xx fav') || name.includes('xxfav') || f.id.includes('xx-fav');
          })
          .map((f) => f.id)
      );

      let favColorsUpdated = false;
      finalMovies = finalMovies.map((m) => {
        const isFromList1 = list1FolderIds.has(m.parentFolderId);
        const isFromList2 = list2FolderIds.has(m.parentFolderId);
        const isFromXX = xxFolderIds.has(m.parentFolderId);
        const isHighRating = m.classification === 'red' || m.classification === 'purple';

        if (m.isFavorite) {
          // Rule: Move all movies classified as high (red) or very high (purple) to purple section
          if (isHighRating && m.favoriteColor !== 'purple') {
            favColorsUpdated = true;
            return { ...m, favoriteColor: 'purple' as FavoriteColor };
          } else if (isFromXX && m.favoriteColor !== 'black') {
            favColorsUpdated = true;
            return { ...m, favoriteColor: 'black' as FavoriteColor };
          } else if (isFromList1 && m.favoriteColor !== 'green') {
            favColorsUpdated = true;
            return { ...m, favoriteColor: 'green' as FavoriteColor };
          } else if (isFromList2 && m.favoriteColor !== 'yellow') {
            favColorsUpdated = true;
            return { ...m, favoriteColor: 'yellow' as FavoriteColor };
          } else if (!m.favoriteColor) {
            favColorsUpdated = true;
            return { ...m, favoriteColor: (isHighRating ? 'purple' : 'yellow') as FavoriteColor };
          }
        } else if (m.isFavorite === undefined) {
          if (isHighRating) {
            favColorsUpdated = true;
            return { ...m, isFavorite: true, favoriteColor: 'purple' as FavoriteColor };
          } else if (isFromList1) {
            favColorsUpdated = true;
            return { ...m, isFavorite: true, favoriteColor: 'green' as FavoriteColor };
          } else if (isFromList2) {
            favColorsUpdated = true;
            return { ...m, isFavorite: true, favoriteColor: 'yellow' as FavoriteColor };
          }
        }
        return m;
      });

      if (modifiedCount > 0 || favColorsUpdated) {
        saveMovies(finalMovies);
        syncInitialDataFile(finalFolders, finalMovies, finalFavs);
      }

      setFolders(finalFolders);
      setMovies(finalMovies);
      setFavoriteLists(finalFavs);

      // Core Logic Requirement: Pick folder with content
      const visibleFolders = finalFolders.filter((f) => !f.isFolderHidden);
      const folderWithMovies = visibleFolders.find((f) =>
        finalMovies.some((m) => m.parentFolderId === f.id && !m.isHidden)
      );
      const initialId = folderWithMovies ? folderWithMovies.id : getRandomFolderId(finalFolders);
      setSelectedFolderId(initialId);
    };

    initAppData();
  }, []);

  // Save changes to localStorage whenever state updates and sync initialData.json
  const handleSaveFolders = (updatedFolders: Folder[]) => {
    setFolders(updatedFolders);
    saveFolders(updatedFolders);
    syncInitialDataFile(updatedFolders, movies, favoriteLists);
  };

  const handleSaveMovies = (updatedMovies: MovieItem[]) => {
    setMovies(updatedMovies);
    saveMovies(updatedMovies);
    syncInitialDataFile(folders, updatedMovies, favoriteLists);
  };

  const handleSaveFavoriteLists = (updatedLists: FavoriteList[]) => {
    setFavoriteLists(updatedLists);
    saveFavoriteLists(updatedLists);
    syncInitialDataFile(folders, movies, updatedLists);
  };

  // Custom Favorite List Handlers
  const handleCreateFavoriteList = (name: string, description: string, color: string) => {
    const newList: FavoriteList = {
      id: `fav-list-${Date.now()}`,
      name,
      description,
      color,
      createdAt: new Date().toISOString(),
      movieIds: [],
    };
    const updated = [...favoriteLists, newList];
    handleSaveFavoriteLists(updated);
  };

  const handleDeleteFavoriteList = (listId: string) => {
    if (window.confirm('هل أنت تأكد من إزالة هذه القائمة المفضلة؟')) {
      const updated = favoriteLists.filter((l) => l.id !== listId);
      handleSaveFavoriteLists(updated);
    }
  };

  const handleToggleMovieInFavoriteList = (movieId: string, listId: string) => {
    // 1. Update FavoriteList.movieIds
    const updatedLists = favoriteLists.map((list) => {
      if (list.id === listId) {
        const exists = list.movieIds.includes(movieId);
        const newMovieIds = exists
          ? list.movieIds.filter((id) => id !== movieId)
          : [...list.movieIds, movieId];
        return { ...list, movieIds: newMovieIds };
      }
      return list;
    });
    handleSaveFavoriteLists(updatedLists);

    // 2. Update MovieItem.favoriteListIds
    const updatedMovies = movies.map((m) => {
      if (m.id === movieId) {
        const currentListIds = m.favoriteListIds || [];
        const exists = currentListIds.includes(listId);
        const newListIds = exists
          ? currentListIds.filter((id) => id !== listId)
          : [...currentListIds, listId];
        return { ...m, favoriteListIds: newListIds, isFavorite: true };
      }
      return m;
    });
    handleSaveMovies(updatedMovies);
  };

  // Bulk Import handler for JSON files with duplicate filtering per repository
  const handleImportMovies = (parsedMovies: Partial<MovieItem>[], targetFolderId: string) => {
    const acceptedMovies: MovieItem[] = [];
    let duplicateCount = 0;

    // Track titles & URLs already present in targetFolderId (existing + new in this batch)
    const existingTitles = new Set<string>();
    const existingUrls = new Set<string>();

    movies.forEach((m) => {
      if (m.parentFolderId === targetFolderId) {
        if (m.title) existingTitles.add(m.title.trim().toLowerCase());
        if (m.url) existingUrls.add(m.url.trim().toLowerCase());
        if (m.embedUrl) existingUrls.add(m.embedUrl.trim().toLowerCase());
      }
    });

    parsedMovies.forEach((item, index) => {
      const itemTitle = (item.title || '').trim().toLowerCase();
      const itemUrl = (item.url || item.embedUrl || '').trim().toLowerCase();

      const isTitleDup = itemTitle ? existingTitles.has(itemTitle) : false;
      const isUrlDup = itemUrl ? existingUrls.has(itemUrl) : false;

      if (isTitleDup || isUrlDup) {
        duplicateCount++;
      } else {
        if (itemTitle) existingTitles.add(itemTitle);
        if (itemUrl) existingUrls.add(itemUrl);

        acceptedMovies.push({
          id: `mov-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
          title: cleanMovieTitle(item.title || '') || item.title || 'Imported Movie',
          url: item.url || '',
          embedUrl: item.embedUrl || item.url || '',
          duration: item.duration || '',
          useDirectPlayer: true,
          description: item.description || '',
          category: item.category || 'Movie',
          posterUrl: item.posterUrl || '',
          addedAt: new Date().toISOString(),
          isHidden: false,
          isBroken: false,
          isFavorite: false,
          parentFolderId: targetFolderId,
        });
      }
    });

    const targetFolderObj = folders.find((f) => f.id === targetFolderId);
    const targetFolderName = targetFolderObj ? targetFolderObj.name : 'المستودع المحدد';

    if (acceptedMovies.length === 0) {
      if (duplicateCount > 0) {
        alert(`تنبيه: جميع الأفلام المحددة (${duplicateCount}) موجودة بالفعل في مستودع "${targetFolderName}" وتعتبر مكررة داخله! لم يتم إضافة أي فيلم مكرر.`);
      } else {
        alert('لم يتم العثور على أي أفلام صالحة للاستيراد.');
      }
      return;
    }

    const updated = [...movies, ...acceptedMovies];
    handleSaveMovies(updated);
    setSelectedFolderId(targetFolderId);

    if (duplicateCount > 0) {
      alert(`تم قبول ${acceptedMovies.length} فيلم بنجاح في مستودع "${targetFolderName}"، وتم استبعاد ${duplicateCount} فيلم مكرر في نفس المستودع.`);
    } else {
      alert(`تم إضافة ${acceptedMovies.length} فيلم بنجاح إلى مستودع "${targetFolderName}".`);
    }
  };

  const handleCreateFolderAndImport = (
    folderName: string,
    folderColor: string,
    parsedMovies: Partial<MovieItem>[]
  ) => {
    const newFolderId = `folder-${Date.now()}`;
    const newFolder: Folder = {
      id: newFolderId,
      name: folderName || 'Imported Collection',
      description: `Collection imported on ${new Date().toLocaleDateString()}`,
      color: folderColor || '#8E24AA',
      sortBy: 'title',
      isFolderHidden: false,
    };

    const updatedFolders = [...folders, newFolder];
    handleSaveFolders(updatedFolders);

    handleImportMovies(parsedMovies, newFolderId);
  };

  // Randomized Startup Trigger
  const handleRandomFolder = useCallback(() => {
    const randomId = getRandomFolderId(folders);
    if (randomId) {
      setSelectedFolderId(randomId);
    }
  }, [folders]);

  // Pull / Swipe to Refresh action
  const handleRefreshData = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      // Re-verify links / update statuses
      setIsRefreshing(false);
    }, 1200);
  };

  // Export Full App Data (including Custom Favorite Lists & All Favorites, supporting multi-chunks)
  const handleExportFullAppData = (targetChunkIndex?: number) => {
    const currentFolders = folders.length > 0 ? folders : loadFolders();
    const currentMovies = movies.length > 0 ? movies : loadMovies();
    const currentFavs = favoriteLists.length > 0 ? favoriteLists : loadFavoriteLists();
    exportFullAppData(currentFolders, currentMovies, currentFavs, hiddenFavoriteSections, targetChunkIndex);
  };

  // Copy movie item to a specific repository (List 1 fav, List 2 fav, XX-fav, etc.)
  const handleCopyMovieToFolder = (movie: MovieItem, targetFolderNameOrId: string) => {
    // Find target folder in current folders list (case-insensitive name or ID)
    let targetFolder = folders.find(
      (f) =>
        f.id === targetFolderNameOrId ||
        f.name.trim().toLowerCase() === targetFolderNameOrId.trim().toLowerCase() ||
        f.name.trim().toLowerCase().includes(targetFolderNameOrId.trim().toLowerCase())
    );

    let updatedFolders = folders;

    // If the target repository doesn't exist yet, create it automatically
    if (!targetFolder) {
      const newFolder: Folder = {
        id: `folder-${Date.now()}`,
        name: targetFolderNameOrId,
        description: `مستودع ${targetFolderNameOrId}`,
        color: targetFolderNameOrId.toLowerCase().includes('xx')
          ? '#D81B60'
          : targetFolderNameOrId.toLowerCase().includes('1')
          ? '#8E24AA'
          : '#0284C7',
        sortBy: 'title',
        isFolderHidden: false,
        includeInAllFavorites: true,
      };
      targetFolder = newFolder;
      updatedFolders = [...folders, newFolder];
      handleSaveFolders(updatedFolders);
    }

    // Check if the movie already exists in the TARGET repository only
    const alreadyInTarget = movies.some((m) => {
      if (m.parentFolderId !== targetFolder.id) return false;
      const targetTitle = (movie.title || '').trim().toLowerCase();
      const targetUrl = (movie.url || '').trim().toLowerCase();
      const targetEmbedUrl = (movie.embedUrl || '').trim().toLowerCase();

      const mTitle = (m.title || '').trim().toLowerCase();
      const mUrl = (m.url || '').trim().toLowerCase();
      const mEmbedUrl = (m.embedUrl || '').trim().toLowerCase();

      const sameTitle = targetTitle !== '' && mTitle !== '' && targetTitle === mTitle;
      const sameUrl =
        (targetUrl !== '' && (mUrl === targetUrl || (mEmbedUrl !== '' && mEmbedUrl === targetUrl))) ||
        (targetEmbedUrl !== '' && (mUrl === targetEmbedUrl || (mEmbedUrl !== '' && mEmbedUrl === targetEmbedUrl)));

      return sameTitle || sameUrl;
    });

    if (alreadyInTarget) {
      const titleClean = cleanMovieTitle(movie.title) || movie.title || 'العنصر';
      alert(`تنبيه: "${titleClean}" موجود بالفعل في مستودع "${targetFolder.name}"! تم منع التكرار داخل نفس المستودع.`);
      return;
    }

    const targetName = targetFolder.name.toLowerCase();
    const isTargetList1 = targetName.includes('list 1 fav') || targetName.includes('list of fav1');
    const isTargetList2 = targetName.includes('list 2 fav') || targetName.includes('list of fav2');
    const isTargetXX = targetName.includes('xx-fav') || targetName.includes('xx fav');

    // Create duplicated movie item attached to target repository
    const copiedMovie: MovieItem = {
      ...movie,
      id: `movie-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      parentFolderId: targetFolder.id,
      addedAt: new Date().toISOString(),
      isFavorite: isTargetList1 || isTargetList2 ? true : movie.isFavorite,
      favoriteColor: isTargetList1
        ? 'green'
        : isTargetList2
        ? 'yellow'
        : movie.isFavorite
        ? isTargetXX
          ? 'black'
          : movie.favoriteColor
        : undefined,
    };

    const updatedMovies = [...movies, copiedMovie];
    handleSaveMovies(updatedMovies);

    const titleClean = cleanMovieTitle(movie.title) || movie.title || 'العنصر';
    alert(`تم نسخ "${titleClean}" بنجاح إلى مستودع "${targetFolder.name}"!`);
  };

  // Import Full App Data (Atomic update for state, IndexedDB/storage, and server sync)
  const handleImportFullAppData = async (
    importedFolders: Folder[],
    importedMovies: MovieItem[],
    importedFavs?: FavoriteList[],
    importedHiddenFavoriteSections?: FavoriteColor[]
  ) => {
    const sanitizedFolders = importedFolders.length > 0 ? importedFolders : (folders.length > 0 ? folders : loadFolders());
    const folderIdsSet = new Set(sanitizedFolders.map((f) => f.id));
    const defaultFolderId = sanitizedFolders.find((f) => !f.isFolderHidden && f.id !== ALL_FAVORITES_FOLDER_ID)?.id || sanitizedFolders[0]?.id || 'default';

    const list1FolderIds = new Set(
      sanitizedFolders
        .filter((f) => {
          const name = (f.name || '').toLowerCase();
          return name.includes('list 1 fav') || name.includes('list1 fav') || name.includes('list 1fav') || name.includes('list of fav1') || name.includes('list of fav 1');
        })
        .map((f) => f.id)
    );
    const list2FolderIds = new Set(
      sanitizedFolders
        .filter((f) => {
          const name = (f.name || '').toLowerCase();
          return name.includes('list 2 fav') || name.includes('list2 fav') || name.includes('list 2fav') || name.includes('list of fav2') || name.includes('list of fav 2');
        })
        .map((f) => f.id)
    );
    const xxFolderIds = new Set(
      sanitizedFolders
        .filter((f) => {
          const name = (f.name || '').toLowerCase();
          return name.includes('xx-fav') || name.includes('xx fav') || name.includes('xxfav') || f.id.includes('xx-fav');
        })
        .map((f) => f.id)
    );

    const processedMovies: MovieItem[] = importedMovies.map((m, idx) => {
      const parentId = (m.parentFolderId && folderIdsSet.has(m.parentFolderId) && m.parentFolderId !== ALL_FAVORITES_FOLDER_ID)
        ? m.parentFolderId
        : defaultFolderId;
      const isFromList1 = list1FolderIds.has(parentId);
      const isFromList2 = list2FolderIds.has(parentId);
      const isFromXX = xxFolderIds.has(parentId);
      const isHighRating = m.classification === 'red' || m.classification === 'purple';

      let isFav = m.isFavorite === true;
      let favColor: FavoriteColor | undefined = m.favoriteColor;

      if (isHighRating && (isFav || isFromList1 || isFromList2 || isFromXX)) {
        isFav = true;
        favColor = 'purple';
      } else if (isFromList1) {
        isFav = true;
        favColor = 'green';
      } else if (isFromList2) {
        isFav = true;
        favColor = 'yellow';
      } else if (isFav) {
        if (isFromXX) {
          favColor = 'black';
        } else if (!favColor) {
          favColor = 'yellow';
        }
      } else {
        favColor = undefined;
      }

      return {
        ...m,
        id: m.id || `mov-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        parentFolderId: parentId,
        isFavorite: isFav,
        favoriteColor: favColor,
      };
    });

    const favsToSave = importedFavs && Array.isArray(importedFavs) ? importedFavs : favoriteLists;

    // 1. Update React states simultaneously
    setFolders(sanitizedFolders);
    setMovies(processedMovies);
    setFavoriteLists(favsToSave);
    if (importedHiddenFavoriteSections && Array.isArray(importedHiddenFavoriteSections)) {
      setHiddenFavoriteSections(importedHiddenFavoriteSections);
      localStorage.setItem('autocinema_hidden_favorite_sections', JSON.stringify(importedHiddenFavoriteSections));
    }

    // 2. Persist to storage
    saveFolders(sanitizedFolders);
    saveMovies(processedMovies);
    saveFavoriteLists(favsToSave);

    localStorage.setItem('autocinema_has_user_data', 'true');

    // 3. Sync to server in ONE clean atomic call with all 3 updated datasets
    await syncInitialDataFile(sanitizedFolders, processedMovies, favsToSave);

    const randomId = getRandomFolderId(sanitizedFolders);
    if (randomId) setSelectedFolderId(randomId);

    const favCount = processedMovies.filter((m) => m.isFavorite).length;

    alert(
      `تم استعادة واستيراد النسخة الاحتياطية بنجاح!\n\n` +
      `• إجمالي المستودعات المستعادة: ${sanitizedFolders.length}\n` +
      `• إجمالي الأفلام والعروض: ${processedMovies.length}\n` +
      `• عناصر المفضلة العامة (All Favorites): تم استعادة ${favCount} عنصر مفضل`
    );
  };

  // Reset to default seed data from initialData.json
  const handleResetData = async () => {
    if (window.confirm('هل تريد إعادة ضبط بيانات التطبيق واستعادتها مباشرة من ملف initialData.json؟')) {
      try {
        const { folders: defaultFolders, movies: defaultMovies, favoriteLists: defaultFavs } =
          await resetToDefaultsFromInitialJson();
        setFolders(defaultFolders);
        setMovies(defaultMovies);
        setFavoriteLists(defaultFavs);
        const randomId = getRandomFolderId(defaultFolders);
        setSelectedFolderId(randomId);
      } catch (e) {
        console.error('Error resetting data from initialData.json:', e);
      }
    }
  };

  // Folder CRUD handlers
  const handleCreateOrUpdateFolder = (folderData: Partial<Folder>) => {
    if (folderData.id) {
      // Update existing
      const updated = folders.map((f) =>
        f.id === folderData.id ? ({ ...f, ...folderData } as Folder) : f
      );
      handleSaveFolders(updated);
    } else {
      // Create new
      const newFolder: Folder = {
        id: `folder-${Date.now()}`,
        name: folderData.name || 'New Folder',
        description: folderData.description || '',
        color: folderData.color || '#1E88E5',
        sortBy: folderData.sortBy || 'title',
        isFolderHidden: folderData.isFolderHidden || false,
      };
      const updated = [...folders, newFolder];
      handleSaveFolders(updated);
      setSelectedFolderId(newFolder.id);
    }
  };

  const handleHideFolder = (folderId: string) => {
    const updated = folders.map((f) =>
      f.id === folderId ? { ...f, isFolderHidden: true } : f
    );
    handleSaveFolders(updated);

    // If current selected folder was hidden, pick a new random visible folder
    if (selectedFolderId === folderId) {
      const newRandomId = getRandomFolderId(updated);
      setSelectedFolderId(newRandomId);
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    if (folders.length <= 1) {
      alert('At least one directory folder must be kept.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this folder and its movie items?')) {
      const updatedFolders = folders.filter((f) => f.id !== folderId);
      const updatedMovies = movies.filter((m) => m.parentFolderId !== folderId);
      handleSaveFolders(updatedFolders);
      handleSaveMovies(updatedMovies);

      if (selectedFolderId === folderId) {
        const newRandomId = getRandomFolderId(updatedFolders);
        setSelectedFolderId(newRandomId);
      }
    }
  };

  const handleUnhideFolder = (folderId: string) => {
    const updated = folders.map((f) =>
      f.id === folderId ? { ...f, isFolderHidden: false } : f
    );
    handleSaveFolders(updated);
    if (!selectedFolderId) {
      setSelectedFolderId(folderId);
    }
  };

  // Movie CRUD handlers
  const handleCreateOrUpdateMovie = (movieData: Partial<MovieItem>) => {
    let targetFolderId = movieData.parentFolderId || selectedFolderId || folders[0]?.id || '';
    if (targetFolderId === ALL_FAVORITES_FOLDER_ID) {
      targetFolderId = folders.find((f) => f.id !== ALL_FAVORITES_FOLDER_ID && !f.isFolderHidden)?.id || folders[0]?.id || '';
    }

    // Check for duplicate movie in target repository ONLY when creating a new movie (not when editing)
    if (!movieData.id) {
      const isDuplicate = movies.some((m) => {
        // STRICTLY check only movies belonging to the same target repository
        if (m.parentFolderId !== targetFolderId) return false;

        const targetTitle = (movieData.title || '').trim().toLowerCase();
        const targetUrl = (movieData.url || '').trim().toLowerCase();
        const targetEmbedUrl = (movieData.embedUrl || '').trim().toLowerCase();

        const mTitle = (m.title || '').trim().toLowerCase();
        const mUrl = (m.url || '').trim().toLowerCase();
        const mEmbedUrl = (m.embedUrl || '').trim().toLowerCase();

        const sameTitle = targetTitle !== '' && mTitle !== '' && targetTitle === mTitle;
        const sameUrl =
          (targetUrl !== '' && (mUrl === targetUrl || (mEmbedUrl !== '' && mEmbedUrl === targetUrl))) ||
          (targetEmbedUrl !== '' && (mUrl === targetEmbedUrl || (mEmbedUrl !== '' && mEmbedUrl === targetEmbedUrl)));

        return sameTitle || sameUrl;
      });

      if (isDuplicate) {
        const folderObj = folders.find((f) => f.id === targetFolderId);
        const folderNameStr = folderObj ? `مستودع "${folderObj.name}"` : 'هذا المستودع';
        alert(`تنبيه: هذا الفيلم موجود بالفعل في ${folderNameStr}! تم منع التكرار داخل نفس المستودع (يمكنك إضافته في مستودع آخر بحرية).`);
        return;
      }
    }

    if (movieData.id) {
      // Update existing movie immediately
      const updated = movies.map((m) => {
        if (m.id !== movieData.id) return m;

        const rawTitle = movieData.title !== undefined ? movieData.title.trim() : m.title;
        const cleanedTitle = cleanMovieTitle(rawTitle) || rawTitle;

        return {
          ...m,
          ...movieData,
          title: cleanedTitle,
          isFavorite: movieData.isFavorite !== undefined ? movieData.isFavorite : m.isFavorite,
          favoriteColor:
            movieData.isFavorite === false
              ? undefined
              : movieData.favoriteColor !== undefined
              ? movieData.favoriteColor
              : m.favoriteColor,
        } as MovieItem;
      });

      handleSaveMovies(updated);
    } else {
      // Create new
      const cleanedTitle = cleanMovieTitle(movieData.title || '') || movieData.title || 'Untitled Movie';
      const newMovie: MovieItem = {
        id: `mov-${Date.now()}`,
        title: cleanedTitle,
        url: movieData.url || '',
        embedUrl: movieData.embedUrl || movieData.url || '',
        duration: movieData.duration || '',
        useDirectPlayer: movieData.useDirectPlayer || false,
        description: movieData.description || '',
        category: movieData.category || 'General',
        posterUrl: movieData.posterUrl || '',
        addedAt: new Date().toISOString(),
        isHidden: movieData.isHidden || false,
        isBroken: movieData.isBroken || false,
        isFavorite: movieData.isFavorite !== undefined ? movieData.isFavorite : (selectedFolderId === ALL_FAVORITES_FOLDER_ID),
        favoriteColor: movieData.favoriteColor || (movieData.isFavorite ? (() => {
          const isHighRating = movieData.classification === 'red' || movieData.classification === 'purple';
          if (isHighRating) return 'purple';
          const targetFolderObj = folders.find((f) => f.id === targetFolderId);
          const tName = (targetFolderObj?.name || '').toLowerCase();
          const isFromList1 = tName.includes('list 1 fav') || tName.includes('list of fav1');
          const isFromList2 = tName.includes('list 2 fav') || tName.includes('list of fav2');
          const isFromXX = tName.includes('xx-fav') ||
                           tName.includes('xx fav') ||
                           targetFolderId.includes('xx-fav');
          return isFromList1 ? 'green' : isFromList2 ? 'yellow' : isFromXX ? 'black' : 'yellow';
        })() : undefined),
        parentFolderId: targetFolderId,
      };
      const updated = [...movies, newMovie];
      handleSaveMovies(updated);
    }
  };

  const handleToggleFavorite = (movieId: string, color?: FavoriteColor | null) => {
    const target = movies.find((m) => m.id === movieId);
    if (!target) return;

    const targetFolder = folders.find((f) => f.id === target.parentFolderId);
    const tName = (targetFolder?.name || '').toLowerCase();
    const isFromList1 = tName.includes('list 1 fav') || tName.includes('list of fav1');
    const isFromList2 = tName.includes('list 2 fav') || tName.includes('list of fav2');
    const isFromXX = tName.includes('xx-fav') ||
                     tName.includes('xx fav') ||
                     (target.parentFolderId || '').includes('xx-fav');
    const isHighRating = target.classification === 'red' || target.classification === 'purple';
    const autoDefaultColor: FavoriteColor = isHighRating
      ? 'purple'
      : isFromXX
      ? 'black'
      : isFromList1
      ? 'green'
      : isFromList2
      ? 'yellow'
      : (target.favoriteColor || 'yellow');

    let willBeFavorite: boolean;
    let newColor: FavoriteColor | undefined;

    if (color === null) {
      // Explicit remove from favorites
      willBeFavorite = false;
      newColor = undefined;
    } else if (color !== undefined) {
      // Explicit set to a color: high/very high rating movies always route to purple
      willBeFavorite = true;
      newColor = isHighRating ? 'purple' : color;
    } else {
      // Toggle favorite: if movie is high or very high rating, directly add to purple
      willBeFavorite = !target.isFavorite;
      newColor = willBeFavorite ? (isHighRating ? 'purple' : autoDefaultColor) : undefined;
    }

    let newOrder = target.manualOrder;
    if (willBeFavorite && !target.isFavorite) {
      const folderMovies = movies.filter((m) => m.parentFolderId === target.parentFolderId);
      const minOrder = folderMovies.reduce(
        (min, m) => (m.manualOrder !== undefined && m.manualOrder < min ? m.manualOrder : min),
        1
      );
      newOrder = minOrder - 1;
    }

    const updated = movies.map((m) =>
      m.id === movieId
        ? {
            ...m,
            isFavorite: willBeFavorite,
            favoriteColor: willBeFavorite ? (newColor || autoDefaultColor) : undefined,
            favoriteListIds: willBeFavorite ? m.favoriteListIds : [],
            manualOrder: newOrder,
          }
        : m
    );

    if (!willBeFavorite && favoriteLists.some((fl) => fl.movieIds?.includes(movieId))) {
      const updatedLists = favoriteLists.map((fl) => ({
        ...fl,
        movieIds: (fl.movieIds || []).filter((id) => id !== movieId),
      }));
      setFavoriteLists(updatedLists);
      saveFavoriteLists(updatedLists);
    }

    handleSaveMovies(updated);
  };

  const handleToggleBroken = (movieId: string) => {
    const updated = movies.map((m) =>
      m.id === movieId ? { ...m, isBroken: !m.isBroken } : m
    );
    handleSaveMovies(updated);
  };

  const handleToggleHideMovie = (movieId: string) => {
    const updated = movies.map((m) =>
      m.id === movieId ? { ...m, isHidden: !m.isHidden } : m
    );
    handleSaveMovies(updated);
  };

  const handleUpdateClassification = (
    movieId: string,
    rating: ClassificationRating,
    reason?: string,
    storySummary?: string
  ) => {
    const targetMovie = movies.find((m) => m.id === movieId);
    const targetFolder = targetMovie ? folders.find((f) => f.id === targetMovie.parentFolderId) : null;
    const isFromXX = (targetFolder?.name || '').toLowerCase().includes('xx-fav') ||
                     (targetFolder?.name || '').toLowerCase().includes('xx fav') ||
                     (targetMovie?.parentFolderId || '').includes('xx-fav');
    const isHighRating = rating === 'red' || rating === 'purple';

    const updated = movies.map((m) =>
      m.id === movieId
        ? {
            ...m,
            classification: rating,
            classificationReason: reason ?? m.classificationReason,
            storySummary: storySummary ?? m.storySummary,
            description: (!m.description && storySummary) ? storySummary : m.description,
            favoriteColor: m.isFavorite ? (isFromXX ? 'black' : isHighRating ? 'purple' : m.favoriteColor) : m.favoriteColor,
          }
        : m
    );
    handleSaveMovies(updated);
  };

  const handleBatchUpdateClassification = (
    updates: Array<{ id: string; classification: ClassificationRating; reason?: string; storySummary?: string }>
  ) => {
    const updateMap = new Map(updates.map((u) => [u.id, u]));
    const xxFolderIds = new Set(
      folders
        .filter((f) => {
          const name = (f.name || '').toLowerCase();
          return name.includes('xx-fav') || name.includes('xx fav') || name.includes('xxfav') || f.id.includes('xx-fav');
        })
        .map((f) => f.id)
    );

    const updated = movies.map((m) => {
      const u = updateMap.get(m.id);
      if (u) {
        const isFromXX = xxFolderIds.has(m.parentFolderId);
        const isHighRating = u.classification === 'red' || u.classification === 'purple';
        let updatedFavColor = m.favoriteColor;
        if (m.isFavorite) {
          if (isFromXX) {
            updatedFavColor = 'black';
          } else if (isHighRating) {
            updatedFavColor = 'purple';
          }
        }

        return {
          ...m,
          classification: u.classification,
          classificationReason: u.reason ?? m.classificationReason,
          storySummary: u.storySummary ?? m.storySummary,
          description: (!m.description && u.storySummary) ? u.storySummary : m.description,
          favoriteColor: updatedFavColor,
        };
      }
      return m;
    });
    handleSaveMovies(updated);
  };

  const handleDeleteMovie = (movieId: string) => {
    if (window.confirm('Are you sure you want to delete this cinema entry?')) {
      const updated = movies.filter((m) => m.id !== movieId);
      handleSaveMovies(updated);
    }
  };

  const handleBulkAddToFavorite = (movieIds: string[], color: FavoriteColor) => {
    if (!movieIds || movieIds.length === 0) return;
    const idSet = new Set(movieIds);
    let minOrder = movies.reduce(
      (min, m) => (m.manualOrder !== undefined && m.manualOrder < min ? m.manualOrder : min),
      1
    );
    const updated = movies.map((m) => {
      if (idSet.has(m.id)) {
        minOrder -= 1;
        return {
          ...m,
          isFavorite: true,
          favoriteColor: color,
          manualOrder: minOrder,
        };
      }
      return m;
    });
    handleSaveMovies(updated);
  };

  const handleBulkMoveMovies = (movieIds: string[], targetFolderId: string) => {
    const idSet = new Set(movieIds);
    const updated = movies.map((m) =>
      idSet.has(m.id) ? { ...m, parentFolderId: targetFolderId } : m
    );
    handleSaveMovies(updated);
  };

  const handleDeduplicateMovies = (deletedMovieIds: string[]) => {
    if (!deletedMovieIds || deletedMovieIds.length === 0) return;
    const idSet = new Set(deletedMovieIds);
    const updated = movies.filter((m) => !idSet.has(m.id));
    handleSaveMovies(updated);
  };

  const handleBulkDeleteMovies = (movieIds: string[]) => {
    const idSet = new Set(movieIds);
    const updated = movies.filter((m) => !idSet.has(m.id));
    handleSaveMovies(updated);
  };

  const handleBulkRenameMovies = (updates: Array<{ id: string; newTitle: string }>) => {
    const updateMap = new Map(updates.map((u) => [u.id, u.newTitle]));
    const updated = movies.map((m) => {
      const newTitle = updateMap.get(m.id);
      if (newTitle !== undefined) {
        return {
          ...m,
          title: newTitle,
        };
      }
      return m;
    });
    handleSaveMovies(updated);
  };

  const handleMoveSingleMovie = (movieId: string, targetFolderId: string) => {
    const updated = movies.map((m) =>
      m.id === movieId ? { ...m, parentFolderId: targetFolderId } : m
    );
    handleSaveMovies(updated);
  };

  const handleUnhideMovie = (movieId: string) => {
    const updated = movies.map((m) =>
      m.id === movieId ? { ...m, isHidden: false } : m
    );
    handleSaveMovies(updated);
  };

  const handleUnhideAll = () => {
    const unhiddenFolders = folders.map((f) => ({ ...f, isFolderHidden: false }));
    const unhiddenMovies = movies.map((m) => ({ ...m, isHidden: false }));
    handleSaveFolders(unhiddenFolders);
    handleSaveMovies(unhiddenMovies);
  };

  const handleReorderFavoriteMovie = (
    movieId: string,
    newPosition: number,
    targetSection?: FavoriteColor | 'all'
  ) => {
    const targetMovie = movies.find((m) => m.id === movieId);
    if (!targetMovie) return;

    const folderMap = new Map<string, Folder>(folders.map((f) => [f.id, f]));
    const allFavs = movies.filter((m) => {
      const parent = folderMap.get(m.parentFolderId);
      return (
        (m.isFavorite || (m.favoriteListIds && m.favoriteListIds.length > 0)) &&
        !m.isHidden &&
        !parent?.isFolderHidden &&
        parent?.includeInAllFavorites !== false
      );
    });

    const getEffectiveFavColor = (m: MovieItem): FavoriteColor => {
      if (m.classification === 'red' || m.classification === 'purple') return 'purple';
      return m.favoriteColor || 'yellow';
    };

    let poolMovies: MovieItem[];
    if (targetSection && targetSection !== 'all') {
      poolMovies = allFavs.filter((m) => getEffectiveFavColor(m) === targetSection);
    } else if (targetSection === 'all') {
      poolMovies = allFavs;
    } else {
      const effColor = getEffectiveFavColor(targetMovie);
      poolMovies = allFavs.filter((m) => getEffectiveFavColor(m) === effColor);
    }

    if (!poolMovies.some((m) => m.id === movieId)) {
      poolMovies = allFavs;
    }

    // Sort current pool by their current order
    poolMovies.sort((a, b) => {
      const orderA = a.favoriteOrder ?? a.manualOrder ?? 999999;
      const orderB = b.favoriteOrder ?? b.manualOrder ?? 999999;
      const diff = orderA - orderB;
      if (diff !== 0) return diff;
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });

    const currentIdx = poolMovies.findIndex((m) => m.id === movieId);
    if (currentIdx === -1) return;

    // Remove from current index
    const [removed] = poolMovies.splice(currentIdx, 1);

    // Insert at clamped newPosition - 1
    const clampedPos = Math.max(1, Math.min(newPosition, poolMovies.length + 1));
    poolMovies.splice(clampedPos - 1, 0, removed);

    // Re-assign clean sequential numbers 1, 2, 3...
    const orderMap = new Map<string, number>();
    poolMovies.forEach((m, idx) => {
      orderMap.set(m.id, idx + 1);
    });

    const updated = movies.map((m) => {
      if (orderMap.has(m.id)) {
        const ord = orderMap.get(m.id)!;
        return {
          ...m,
          favoriteOrder: ord,
          manualOrder: ord,
        };
      }
      return m;
    });

    handleSaveMovies(updated);
  };

  // Open Movie external link directly
  const handleOpenMovie = (movie: MovieItem) => {
    const targetUrl = movie.url || movie.embedUrl;
    if (!targetUrl) return;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  // Explicitly purify all movie titles across all sections and repositories
  const handlePurifyAllTitles = () => {
    const { cleanedMovies, modifiedCount } = cleanAllMovieItems(movies);
    if (modifiedCount > 0) {
      handleSaveMovies(cleanedMovies);
      alert(
        `تمت تنقية وتطهير أسماء (${modifiedCount}) فيلم بنجاح!\n` +
        `تم حذف رموز وأوقات العرض مثل (HD1:30:04) وتحديث كافة الأقسام والمستودعات فورياً.`
      );
    } else {
      alert('كافة أسماء الأفلام في جميع الأقسام نقية ومطهرة بالفعل ولا تحتوي على أي رموز أوقات!');
    }
  };

  // Calculate movie counts per folder (only counting non-hidden movies for folder badges)
  const movieCounts = folders.reduce((acc, folder) => {
    const count = movies.filter(
      (m) => m.parentFolderId === folder.id && !m.isHidden
    ).length;
    acc[folder.id] = count;
    return acc;
  }, {} as Record<string, number>);

  const currentFolder =
    selectedFolderId === ALL_FAVORITES_FOLDER_ID
      ? ALL_FAVORITES_FOLDER
      : folders.find((f) => f.id === selectedFolderId) ||
        folders.find((f) => !f.isFolderHidden) ||
        folders[0] ||
        null;
  const folderMap = new Map<string, Folder>(folders.map((f) => [f.id, f]));
  const hiddenFoldersCount = folders.filter((f) => f.isFolderHidden).length;
  const hiddenMoviesCount = movies.filter((m) => m.isHidden).length;
  const favoritesCount = movies.filter((m) => {
    const parentFolder = folderMap.get(m.parentFolderId);
    return (
      (m.isFavorite || (m.favoriteListIds && m.favoriteListIds.length > 0)) &&
      !m.isHidden &&
      !parentFolder?.isFolderHidden &&
      parentFolder?.includeInAllFavorites !== false
    );
  }).length;

  const handleToggleIncludeInAllFavorites = (folderId: string, included: boolean) => {
    const updated = folders.map((f) =>
      f.id === folderId ? { ...f, includeInAllFavorites: included } : f
    );
    handleSaveFolders(updated);
  };

  const handleBulkSetIncludeInAllFavorites = (included: boolean) => {
    const updated = folders.map((f) => ({ ...f, includeInAllFavorites: included }));
    handleSaveFolders(updated);
  };

  // Drag & Drop Link handler to create movie item directly
  const handleDropLink = (droppedUrl: string) => {
    setMovieToEdit(null);
    setInitialMovieData({
      title: droppedUrl,
      url: droppedUrl,
      embedUrl: droppedUrl,
      parentFolderId: selectedFolderId && selectedFolderId !== ALL_FAVORITES_FOLDER_ID ? selectedFolderId : (folders[0]?.id || ''),
    });
    setIsMovieModalOpen(true);
  };

  return (
    <DeviceFrame viewMode={viewMode} onToggleViewMode={() => setViewMode(viewMode === 'phone' ? 'full' : 'phone')}>
      <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 min-h-screen">
        {/* Navigation Bar */}
        <Navbar
          viewMode={viewMode}
          setViewMode={setViewMode}
          onRandomFolder={handleRandomFolder}
          onOpenRepositoriesModal={() => setIsRepositoriesModalOpen(true)}
          onOpenFavoritesModal={() => setSelectedFolderId(ALL_FAVORITES_FOLDER_ID)}
          onOpenHiddenFoldersModal={() => setIsHiddenVaultOpen(true)}
          onOpenFolderModal={() => {
            setFolderToEdit(null);
            setIsFolderModalOpen(true);
          }}
          onOpenMovieModal={() => {
            setMovieToEdit(null);
            setIsMovieModalOpen(true);
          }}
          onOpenJsonImportModal={() => setIsJsonImportModalOpen(true)}
          onExportData={handleExportFullAppData}
          onOpenKotlinModal={() => setIsKotlinModalOpen(true)}
          onResetData={handleResetData}
          hiddenFoldersCount={hiddenFoldersCount}
          hiddenMoviesCount={hiddenMoviesCount}
          favoritesCount={favoritesCount}
          fontScale={fontScale}
          onIncreaseFont={handleIncreaseFont}
          onDecreaseFont={handleDecreaseFont}
          onResetFont={handleResetFont}
          folders={folders}
          movies={movies}
          onOpenClassifierModal={() => setIsItemClassifierOpen(true)}
          onPurifyAllTitles={handlePurifyAllTitles}
          hiddenFavoriteSections={hiddenFavoriteSections}
          onToggleHideFavoriteSection={handleToggleHideFavoriteSection}
          onDeduplicateMovies={handleDeduplicateMovies}
        />

        {/* Main Section: Movie Items Grid */}
        <main className="flex-1">
          <MovieGrid
            currentFolder={currentFolder}
            folders={folders}
            onSelectFolder={setSelectedFolderId}
            onUpdateFolder={handleCreateOrUpdateFolder}
            movies={movies}
            onOpenMovie={handleOpenMovie}
            onOpenMovieWithProxy={handleOpenMovie}
            onToggleFavorite={handleToggleFavorite}
            onBulkAddToFavorite={handleBulkAddToFavorite}
            onToggleBroken={handleToggleBroken}
            onToggleHide={handleToggleHideMovie}
            onUpdateClassification={handleUpdateClassification}
            onBatchUpdateClassification={handleBatchUpdateClassification}
            onEditMovie={(movie) => {
              setMovieToEdit(movie);
              setInitialMovieData(null);
              setIsMovieModalOpen(true);
            }}
            onDeleteMovie={handleDeleteMovie}
            onAddMovie={() => {
              setMovieToEdit(null);
              setInitialMovieData(null);
              setIsMovieModalOpen(true);
            }}
            onDropLink={handleDropLink}
            onRefreshData={handleRefreshData}
            isRefreshing={isRefreshing}
            onCopyMovieToFolder={handleCopyMovieToFolder}
            onOpenFavoritesModal={() => setSelectedFolderId(ALL_FAVORITES_FOLDER_ID)}
            favoritesCount={favoritesCount}
            hiddenFavoriteSections={hiddenFavoriteSections}
            onToggleHideFavoriteSection={handleToggleHideFavoriteSection}
            onReorderFavoriteMovie={handleReorderFavoriteMovie}
          />
        </main>

        {/* Modals */}
        <RepositoriesModal
          isOpen={isRepositoriesModalOpen}
          onClose={() => setIsRepositoriesModalOpen(false)}
          folders={folders}
          movies={movies}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          onEditFolder={(folder) => {
            setFolderToEdit(folder);
            setIsFolderModalOpen(true);
          }}
          onHideFolder={handleHideFolder}
          onDeleteFolder={handleDeleteFolder}
          onAddFolder={() => {
            setFolderToEdit(null);
            setIsFolderModalOpen(true);
          }}
          onReorderFolders={handleSaveFolders}
          onToggleIncludeInAllFavorites={handleToggleIncludeInAllFavorites}
          onBulkSetIncludeInAllFavorites={handleBulkSetIncludeInAllFavorites}
          movieCounts={movieCounts}
          favoritesCount={favoritesCount}
          onOpenClassifierModal={() => setIsItemClassifierOpen(true)}
        />

        <ItemClassifierModal
          isOpen={isItemClassifierOpen}
          onClose={() => setIsItemClassifierOpen(false)}
          folders={folders}
          movies={movies}
          onBulkMoveMovies={handleBulkMoveMovies}
          onBulkDeleteMovies={handleBulkDeleteMovies}
          onBulkRenameMovies={handleBulkRenameMovies}
          onMoveMovie={handleMoveSingleMovie}
          onDeleteMovie={handleDeleteMovie}
          onOpenMovie={handleOpenMovie}
        />

        <FavoritesModal
          isOpen={isFavoritesModalOpen}
          onClose={() => setIsFavoritesModalOpen(false)}
          folders={folders}
          movies={movies}
          favoriteLists={favoriteLists}
          onToggleFavorite={handleToggleFavorite}
          onOpenMovie={handleOpenMovie}
          onCreateFavoriteList={handleCreateFavoriteList}
          onDeleteFavoriteList={handleDeleteFavoriteList}
          onToggleMovieInFavoriteList={handleToggleMovieInFavoriteList}
          hiddenFavoriteSections={hiddenFavoriteSections}
          onToggleHideFavoriteSection={handleToggleHideFavoriteSection}
          onReorderFavoriteMovie={handleReorderFavoriteMovie}
        />

        <FolderModal
          isOpen={isFolderModalOpen}
          onClose={() => setIsFolderModalOpen(false)}
          onSave={handleCreateOrUpdateFolder}
          folderToEdit={folderToEdit}
        />

        <MovieModal
          isOpen={isMovieModalOpen}
          onClose={() => {
            setIsMovieModalOpen(false);
            setInitialMovieData(null);
            setMovieToEdit(null);
          }}
          onSave={handleCreateOrUpdateMovie}
          folders={folders}
          activeFolderId={selectedFolderId}
          movieToEdit={movieToEdit}
          initialMovieData={initialMovieData}
          existingMovies={movies}
        />

        <JsonImportModal
          isOpen={isJsonImportModalOpen}
          onClose={() => setIsJsonImportModalOpen(false)}
          folders={folders}
          movies={movies}
          activeFolderId={selectedFolderId}
          onImportMovies={handleImportMovies}
          onCreateFolderAndImport={handleCreateFolderAndImport}
          onImportFullAppData={handleImportFullAppData}
          onExportFullAppData={handleExportFullAppData}
        />

        <HiddenFoldersModal
          isOpen={isHiddenVaultOpen}
          onClose={() => setIsHiddenVaultOpen(false)}
          folders={folders}
          movies={movies}
          onUnhideFolder={handleUnhideFolder}
          onUnhideMovie={handleUnhideMovie}
          onUnhideAll={handleUnhideAll}
        />

        <KotlinCodeModal
          isOpen={isKotlinModalOpen}
          onClose={() => setIsKotlinModalOpen(false)}
        />

        {/* Floating Page Up / Down & Top / Bottom Scroll Controls */}
        <PageScrollControls />
      </div>
    </DeviceFrame>
  );
}


