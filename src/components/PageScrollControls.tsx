import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, ChevronsUp, ChevronsDown } from 'lucide-react';

export const PageScrollControls: React.FC = () => {
  const [showControls, setShowControls] = useState(true);

  // Helper to find the active scrollable container (either TV viewport or document window)
  const getScrollContainer = (): Element | Window => {
    const tvContainer = document.querySelector('.overflow-y-auto');
    if (tvContainer && tvContainer.scrollHeight > tvContainer.clientHeight + 10) {
      return tvContainer;
    }
    return window;
  };

  const handleScrollUp = () => {
    const container = getScrollContainer();
    if (container === window) {
      window.scrollBy({ top: -window.innerHeight * 0.7, behavior: 'smooth' });
    } else {
      const el = container as Element;
      el.scrollBy({ top: -el.clientHeight * 0.7, behavior: 'smooth' });
    }
  };

  const handleScrollDown = () => {
    const container = getScrollContainer();
    if (container === window) {
      window.scrollBy({ top: window.innerHeight * 0.7, behavior: 'smooth' });
    } else {
      const el = container as Element;
      el.scrollBy({ top: el.clientHeight * 0.7, behavior: 'smooth' });
    }
  };

  const handleScrollToTop = () => {
    const container = getScrollContainer();
    if (container === window) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      (container as Element).scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleScrollToBottom = () => {
    const container = getScrollContainer();
    if (container === window) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } else {
      const el = container as Element;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  };

  return (
    <div
      id="floating-scroll-controls"
      className="fixed bottom-6 -right-0.5 sm:right-0 z-50 flex flex-col items-center gap-1 select-none group"
    >
      {/* Scroll to Top */}
      <button
        type="button"
        id="btn-scroll-top"
        onClick={handleScrollToTop}
        title="أعلى الصفحة بالكامل"
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-950/90 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/50 shadow-2xl flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-110 focus:ring-2 focus:ring-purple-500 cursor-pointer backdrop-blur-md"
      >
        <ChevronsUp className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      {/* Scroll Up Step */}
      <button
        type="button"
        id="btn-scroll-up-step"
        onClick={handleScrollUp}
        title="تحريك الصفحة لأعلى ⇧"
        className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-slate-900/95 hover:bg-purple-600 text-purple-300 hover:text-white border-2 border-purple-500/60 shadow-2xl flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-110 focus:ring-2 focus:ring-purple-500 cursor-pointer backdrop-blur-md ring-2 ring-purple-900/30"
      >
        <ArrowUp className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
      </button>

      {/* Scroll Down Step */}
      <button
        type="button"
        id="btn-scroll-down-step"
        onClick={handleScrollDown}
        title="تحريك الصفحة لأسفل ⇩"
        className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-slate-900/95 hover:bg-purple-600 text-purple-300 hover:text-white border-2 border-purple-500/60 shadow-2xl flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-110 focus:ring-2 focus:ring-purple-500 cursor-pointer backdrop-blur-md ring-2 ring-purple-900/30"
      >
        <ArrowDown className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
      </button>

      {/* Scroll to Bottom */}
      <button
        type="button"
        id="btn-scroll-bottom"
        onClick={handleScrollToBottom}
        title="أسفل الصفحة بالكامل"
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-950/90 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/50 shadow-2xl flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-110 focus:ring-2 focus:ring-purple-500 cursor-pointer backdrop-blur-md"
      >
        <ChevronsDown className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
    </div>
  );
};
