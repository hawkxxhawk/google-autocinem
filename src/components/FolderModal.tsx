import React, { useState, useEffect } from 'react';
import { Folder, SortOption } from '../types';
import { X, FolderPlus, EyeOff, Palette, Check, Globe, HelpCircle, Star } from 'lucide-react';

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (folder: Partial<Folder>) => void;
  folderToEdit?: Folder | null;
}

const PRESET_COLORS = [
  '#1E88E5', // Blue
  '#E53935', // Red
  '#43A047', // Green
  '#FB8C00', // Orange
  '#8E24AA', // Purple
  '#00ACC1', // Cyan
  '#3949AB', // Indigo
  '#D81B60', // Pink
  '#00897B', // Teal
  '#546E7A', // Blue Grey
];

export const FolderModal: React.FC<FolderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  folderToEdit,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#1E88E5');
  const [sortBy, setSortBy] = useState<SortOption>('title');
  const [isFolderHidden, setIsFolderHidden] = useState(false);
  const [includeInAllFavorites, setIncludeInAllFavorites] = useState(true);

  useEffect(() => {
    if (folderToEdit) {
      setName(folderToEdit.name);
      setDescription(folderToEdit.description || '');
      setColor(folderToEdit.color || '#1E88E5');
      setSortBy(folderToEdit.sortBy || 'title');
      setIsFolderHidden(folderToEdit.isFolderHidden || false);
      setIncludeInAllFavorites(folderToEdit.includeInAllFavorites !== false);
    } else {
      setName('');
      setDescription('');
      setColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
      setSortBy('title');
      setIsFolderHidden(false);
      setIncludeInAllFavorites(true);
    }
  }, [folderToEdit, isOpen]);

  const handleAutoSelect = (
    e:
      | React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
      | React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    e.currentTarget.select();
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      id: folderToEdit ? folderToEdit.id : undefined,
      name: name.trim(),
      description: description.trim(),
      color,
      sortBy,
      isFolderHidden,
      includeInAllFavorites,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${color}33` }}
            >
              <FolderPlus className="w-5 h-5" style={{ color }} />
            </div>
            <h3 className="text-base font-bold text-white">
              {folderToEdit ? 'Edit Folder' : 'Create New Folder'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Name Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Folder Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onFocus={handleAutoSelect}
              onClick={handleAutoSelect}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Classic Sci-Fi, Award Winners"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Description Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onFocus={handleAutoSelect}
              onClick={handleAutoSelect}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary or notes for this directory category"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Color Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
              <Palette className="w-3.5 h-3.5 text-indigo-400" />
              Theme Accent Color
            </label>
            <div className="flex items-center flex-wrap gap-2">
              {PRESET_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 shadow-md"
                  style={{ backgroundColor: hex }}
                >
                  {color === hex && <Check className="w-4 h-4 text-white" />}
                </button>
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-0"
                title="Custom color picker"
              />
            </div>
          </div>

          {/* Default SortBy */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Default Item Sorting
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="domain">Sort by Domain (Host Name)</option>
              <option value="title">Sort by Title (A-Z)</option>
              <option value="date">Sort by Date Added (Newest First)</option>
              <option value="manual">Sort by Manual Ordering</option>
            </select>
          </div>

          {/* Include in All Favorites Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="flex items-center space-x-2.5 space-x-reverse">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <Star className="w-4 h-4 fill-amber-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">
                  الظهور في مجلد "كل المفضلة" (All Favorites)
                </p>
                <p className="text-[11px] text-slate-400">
                  السماح للعناصر المفضلة من هذا المستودع بالعرض ضمن المفضلة العامة
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              id="include-in-all-favs-checkbox"
              checked={includeInAllFavorites}
              onChange={(e) => setIncludeInAllFavorites(e.target.checked)}
              className="w-4 h-4 text-amber-500 rounded focus:ring-amber-400 bg-slate-900 border-slate-700 cursor-pointer"
            />
          </div>

          {/* Folder Visibility Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="flex items-center space-x-2">
              <EyeOff className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-xs font-semibold text-white">Hide Folder</p>
                <p className="text-[11px] text-slate-400">
                  Hidden folders are filtered out from main folder tabs
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isFolderHidden}
              onChange={(e) => setIsFolderHidden(e.target.checked)}
              className="w-4 h-4 text-amber-500 rounded focus:ring-amber-400 bg-slate-900 border-slate-700 cursor-pointer"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all"
            >
              {folderToEdit ? 'Save Changes' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
