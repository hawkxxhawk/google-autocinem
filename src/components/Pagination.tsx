import React from 'react';
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  // Calculate 5 page numbers range around currentPage
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = startPage + maxVisiblePages - 1;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  const pageNumbers = [];
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg my-2">
      {/* Items count summary info */}
      <div className="text-xs text-slate-400 font-medium text-center sm:text-right">
        عرض <span className="font-bold text-indigo-300">{startIndex}</span> -{' '}
        <span className="font-bold text-indigo-300">{endIndex}</span> من إجمالي{' '}
        <span className="font-bold text-white">{totalItems}</span> عنصر
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 flex-wrap justify-center">
        {/* First Page Button */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          title="الصفحة الأولى"
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-all text-xs"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>

        {/* Previous Page Button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex items-center space-x-1 space-x-reverse px-3.5 py-2 rounded-xl bg-slate-950 border-2 border-indigo-500/60 text-indigo-200 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-indigo-900/80 transition-all text-sm sm:text-base font-black shadow-md cursor-pointer"
        >
          <ChevronRight className="w-5 h-5 text-indigo-400" />
          <span className="hidden xs:inline">السابق</span>
        </button>

        {/* 5 Page Numbers */}
        <div className="flex items-center space-x-1.5 space-x-reverse">
          {pageNumbers.map((page) => {
            const isActive = page === currentPage;
            return (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`min-w-[38px] h-[38px] px-2.5 rounded-xl text-sm font-black transition-all border-2 cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-300 shadow-lg ring-2 ring-indigo-400/50 scale-105'
                    : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500 hover:text-white hover:bg-slate-800'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Next Page Button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex items-center space-x-1 space-x-reverse px-3.5 py-2 rounded-xl bg-slate-950 border-2 border-indigo-500/60 text-indigo-200 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-indigo-900/80 transition-all text-sm sm:text-base font-black shadow-md cursor-pointer"
        >
          <span className="hidden xs:inline">التالي</span>
          <ChevronLeft className="w-5 h-5 text-indigo-400" />
        </button>

        {/* Last Page Button */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          title="الصفحة الأخيرة"
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-all text-xs"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
