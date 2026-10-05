import React from 'react';
import { Folder, MovieItem } from '../types';
import { X, Eye, EyeOff, Folder as FolderIcon, Film, CheckCircle2 } from 'lucide-react';

interface HiddenFoldersModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  movies: MovieItem[];
  onUnhideFolder: (folderId: string) => void;
  onUnhideMovie: (movieId: string) => void;
  onUnhideAll: () => void;
}

export const HiddenFoldersModal: React.FC<HiddenFoldersModalProps> = ({
  isOpen,
  onClose,
  folders,
  movies,
  onUnhideFolder,
  onUnhideMovie,
  onUnhideAll,
}) => {
  if (!isOpen) return null;

  const hiddenFolders = folders.filter((f) => f.isFolderHidden);
  const hiddenMovies = movies.filter((m) => m.isHidden);
  const totalHidden = hiddenFolders.length + hiddenMovies.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[85vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <EyeOff className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Hidden Vault Directory</h3>
              <p className="text-xs text-slate-400">
                Manage hidden folders and movie items
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {totalHidden > 0 && (
            <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <span className="text-xs text-amber-300 font-medium">
                {totalHidden} {totalHidden === 1 ? 'item' : 'items'} currently hidden from default views
              </span>
              <button
                onClick={onUnhideAll}
                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-sm flex items-center gap-1"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Unhide All</span>
              </button>
            </div>
          )}

          {/* Hidden Folders Section */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <FolderIcon className="w-3.5 h-3.5 text-indigo-400" />
              Hidden Folders ({hiddenFolders.length})
            </h4>

            {hiddenFolders.length > 0 ? (
              <div className="space-y-2">
                {hiddenFolders.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: f.color }}
                      />
                      <div>
                        <p className="text-xs font-bold text-white">{f.name}</p>
                        {f.description && (
                          <p className="text-[11px] text-slate-400">{f.description}</p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => onUnhideFolder(f.id)}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-semibold transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Unhide</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                No hidden folders.
              </p>
            )}
          </div>

          {/* Hidden Movies Section */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-emerald-400" />
              Hidden Movies ({hiddenMovies.length})
            </h4>

            {hiddenMovies.length > 0 ? (
              <div className="space-y-2">
                {hiddenMovies.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                      <Film className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <div className="truncate">
                        <p className="text-xs font-bold text-white truncate">{m.title}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          Category: {m.category} • {m.duration || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => onUnhideMovie(m.id)}
                      className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-semibold transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Unhide</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-950/40 rounded-xl border border-slate-800/50">
                No hidden movie items.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
