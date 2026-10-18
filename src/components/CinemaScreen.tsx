import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { PlaylistItem, ExtractedStream } from '../types';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Trash2,
  Plus,
  Tv,
  ListVideo,
  Settings,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  Sparkles,
  Sliders,
  Check,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface CinemaScreenProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: PlaylistItem[];
  onUpdatePlaylist: (newPlaylist: PlaylistItem[]) => void;
  onOpenExtractor: (url?: string) => void;
  initialActiveIndex?: number;
}

export const CinemaScreen: React.FC<CinemaScreenProps> = ({
  isOpen,
  onClose,
  playlist,
  onUpdatePlaylist,
  onOpenExtractor,
  initialActiveIndex = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [playerMode, setPlayerMode] = useState<'direct' | 'embed'>('direct');
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isTheaterExpanded, setIsTheaterExpanded] = useState(false);
  const [isPlaylistDrawerOpen, setIsPlaylistDrawerOpen] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync initial index
  useEffect(() => {
    if (initialActiveIndex >= 0 && initialActiveIndex < playlist.length) {
      setCurrentIndex(initialActiveIndex);
    }
  }, [initialActiveIndex, playlist.length]);

  const currentItem = playlist[currentIndex] || null;
  const currentStream = currentItem?.selectedStream || null;

  // Determine effective player mode: if directUrl is available, default to direct; otherwise embed
  useEffect(() => {
    if (currentStream) {
      if (currentStream.directUrl || currentStream.type === 'hls' || currentStream.type === 'mp4') {
        setPlayerMode('direct');
      } else {
        setPlayerMode('embed');
      }
      setPlayerError(null);
    }
  }, [currentStream?.url, currentStream?.directUrl]);

  // Setup HLS or direct HTML5 video playback
  useEffect(() => {
    if (!isOpen || !currentItem || playerMode !== 'direct') {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const streamUrl = currentStream?.directUrl || currentStream?.url;
    if (!streamUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHlsStream = streamUrl.includes('.m3u8') || currentStream?.type === 'hls';

    if (isHlsStream) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
        });
        hlsRef.current = hls;

        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {
            // Autoplay with sound might require user gesture; mute and retry if needed
            video.muted = true;
            setIsMuted(true);
            video.play().catch(() => {});
          });
          setIsPlaying(true);
          setPlayerError(null);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.warn('[Cinema Player] Fatal HLS error, switching to proxy or embed:', data.type);
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                // Try proxying the stream to bypass CORS
                if (!streamUrl.startsWith('/api/stream-proxy')) {
                  const proxyUrl = `/api/stream-proxy?url=${encodeURIComponent(streamUrl)}`;
                  hls.loadSource(proxyUrl);
                  hls.startLoad();
                } else {
                  setPlayerMode('embed');
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                setPlayerMode('embed');
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari HLS
        video.src = streamUrl;
        video.play().catch(() => {});
      } else {
        setPlayerMode('embed');
      }
    } else {
      // Direct MP4
      video.src = streamUrl;
      video.play().catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
      setIsPlaying(true);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [isOpen, currentItem?.id, currentStream?.url, currentStream?.directUrl, playerMode]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (playerMode === 'direct' && videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  // Next / Prev Navigation
  const handleNext = () => {
    if (playlist.length <= 1) return;
    const nextIdx = (currentIndex + 1) % playlist.length;
    setCurrentIndex(nextIdx);
  };

  const handlePrev = () => {
    if (playlist.length <= 1) return;
    const prevIdx = (currentIndex - 1 + playlist.length) % playlist.length;
    setCurrentIndex(prevIdx);
  };

  // Switch selected server for current movie
  const handleSwitchServer = (stream: ExtractedStream) => {
    if (!currentItem) return;
    const updated = [...playlist];
    updated[currentIndex] = {
      ...currentItem,
      selectedStream: stream,
    };
    onUpdatePlaylist(updated);
  };

  // Remove from playlist
  const handleRemoveFromPlaylist = (indexToRemove: number) => {
    const updated = playlist.filter((_, idx) => idx !== indexToRemove);
    onUpdatePlaylist(updated);
    if (currentIndex >= updated.length) {
      setCurrentIndex(Math.max(0, updated.length - 1));
    }
  };

  // Move item up/down in playlist
  const handleMoveItem = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= playlist.length) return;
    const updated = [...playlist];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    onUpdatePlaylist(updated);
    if (currentIndex === fromIdx) {
      setCurrentIndex(toIdx);
    } else if (currentIndex === toIdx) {
      setCurrentIndex(fromIdx);
    }
  };

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 dir-rtl overflow-hidden animate-in fade-in duration-200">
      {/* Top Cinema Header Bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur-xl border-b border-indigo-500/30 shadow-lg flex-shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md shadow-indigo-600/30 flex items-center justify-center">
            <Tv className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                <span>شاشة العرض السينمائية</span>
                <span className="text-amber-400">🎬</span>
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-400/40 text-[11px] font-black">
                {playlist.length} عنصر بالـ Playlist
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              تشغيل تلقائي فوري لسيرفرات وبث الأفلام بدقة عالية مع دعم HLS ومشغلات السيرفر المضمنة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Add Movie Link to Screen */}
          <button
            type="button"
            onClick={() => onOpenExtractor()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-black transition-all shadow-md active:scale-95 cursor-pointer whitespace-nowrap"
            title="استخراج وإضافة رابط فيلم جديد إلى الـ Playlist"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>إضافة فيلم جديد</span>
          </button>

          {/* Toggle Playlist Drawer */}
          <button
            type="button"
            onClick={() => setIsPlaylistDrawerOpen(!isPlaylistDrawerOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold border transition-all cursor-pointer ${
              isPlaylistDrawerOpen
                ? 'bg-slate-800 text-amber-300 border-amber-500/40'
                : 'bg-slate-850 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
            title="إظهار / إخفاء نافذة قائمة التشغيل الجانبية (20%)"
          >
            <ListVideo className="w-4 h-4" />
            <span className="hidden md:inline">قائمة التشغيل (20%)</span>
          </button>

          {/* Close Screen / Back to Movies */}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-black border border-slate-700 transition-all cursor-pointer active:scale-95"
            title="العودة لتصفح المستودعات والأفلام"
          >
            <span>العودة للمكتبة</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Body: Playlist Side Window (Right 20%) + Cinema Player Screen (Left 80%) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Playlist Side Panel / Window (On User's Right - 20% width) */}
        {isPlaylistDrawerOpen && (
          <aside className="w-full md:w-[20%] md:min-w-[260px] lg:w-[20%] flex flex-col bg-slate-900 border-b md:border-b-0 md:border-l border-indigo-500/30 flex-shrink-0 max-h-80 md:max-h-none z-20 shadow-xl">
            {/* Playlist Header */}
            <div className="p-3 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListVideo className="w-5 h-5 text-indigo-400" />
                <h4 className="text-xs sm:text-sm font-black text-white">
                  قائمة العرض (Playlist)
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-[11px] font-black text-amber-300">
                  {playlist.length}
                </span>
              </div>

              {playlist.length > 0 && (
                <button
                  type="button"
                  onClick={() => onUpdatePlaylist([])}
                  className="text-xs font-bold text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-950/40 transition-colors cursor-pointer flex items-center gap-1"
                  title="مسح كافة عناصر الـ Playlist"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>مسح</span>
                </button>
              )}
            </div>

            {/* Playlist Items List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {playlist.length === 0 ? (
                <div className="py-10 text-center text-slate-500 space-y-2 text-xs">
                  <ListVideo className="w-8 h-8 text-slate-600 mx-auto opacity-50" />
                  <p>لا توجد فيديوهات في الـ Playlist بعد.</p>
                  <p className="text-[11px] text-indigo-400 font-bold">
                    اضغط على سيرفرات البث في أي فيلم لإضافته!
                  </p>
                </div>
              ) : (
                playlist.map((item, idx) => {
                  const isActive = idx === currentIndex;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer group/item flex flex-col gap-2 ${
                        isActive
                          ? 'bg-gradient-to-r from-indigo-950/95 via-slate-900 to-indigo-950/90 border-indigo-400/80 shadow-lg ring-1 ring-indigo-500/40'
                          : 'bg-slate-850/80 hover:bg-slate-800 border-slate-700/70 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      {/* Top Row: Thumbnail + Movie Title (Clear, Prominent and Visible) */}
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* Number & Thumbnail */}
                        <div className="relative flex-shrink-0">
                          {item.posterUrl ? (
                            <img
                              src={item.posterUrl}
                              alt={item.movieTitle}
                              className="w-10 h-14 object-cover rounded-lg border border-slate-700 shadow-sm"
                            />
                          ) : (
                            <div className="w-10 h-14 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
                              <Tv className="w-5 h-5" />
                            </div>
                          )}
                          {/* Index Badge */}
                          <span
                            className={`absolute -top-1.5 -right-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-black border shadow-sm ${
                              isActive
                                ? 'bg-amber-400 text-slate-950 border-amber-300'
                                : 'bg-slate-900 text-slate-300 border-slate-700'
                            }`}
                          >
                            #{idx + 1}
                          </span>
                        </div>

                        {/* Movie Title (Large, prominent, 2 lines visible without truncation) */}
                        <div className="flex-1 min-w-0">
                          {isActive && (
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-[10px] font-black">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                <span>يعرض الآن 🎬</span>
                              </span>
                            </div>
                          )}
                          <h5
                            title={item.movieTitle}
                            className={`text-xs sm:text-sm font-black leading-snug line-clamp-2 break-words transition-colors ${
                              isActive
                                ? 'text-amber-300 drop-shadow-sm'
                                : 'text-slate-100 group-hover/item:text-white'
                            }`}
                          >
                            {item.movieTitle}
                          </h5>
                        </div>
                      </div>

                      {/* Bottom Row: Server/Quality Badges & Action Buttons */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 gap-2">
                        {/* Server & Quality Badges */}
                        <div className="flex items-center flex-wrap gap-1 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-600/40 text-indigo-300 text-[10px] font-bold truncate max-w-[95px]">
                            {item.selectedStream.server}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-black font-mono">
                            {item.selectedStream.quality}
                          </span>
                          {item.allStreams && item.allStreams.length > 1 && (
                            <span className="px-1 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px] font-bold">
                              {item.allStreams.length} سيرفر
                            </span>
                          )}
                        </div>

                        {/* Controls (Move Up, Move Down, Delete) */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-0.5 flex-shrink-0"
                        >
                          <button
                            type="button"
                            onClick={() => handleMoveItem(idx, idx - 1)}
                            disabled={idx === 0}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/80 rounded disabled:opacity-20 cursor-pointer transition-colors"
                            title="تحريك لأعلى"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveItem(idx, idx + 1)}
                            disabled={idx === playlist.length - 1}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/80 rounded disabled:opacity-20 cursor-pointer transition-colors"
                            title="تحريك لأسفل"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromPlaylist(idx)}
                            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded cursor-pointer transition-colors"
                            title="حذف من الـ Playlist"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick Add Button in Drawer Footer */}
            <div className="p-2.5 bg-slate-950 border-t border-slate-800">
              <button
                type="button"
                onClick={() => onOpenExtractor()}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-black transition-all border border-slate-700 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>إضافة رابط جديد للـ Playlist</span>
              </button>
            </div>
          </aside>
        )}

        {/* Main Stage: Cinema Screen Player (On User's Left - 80% remainder width) */}
        <div
          ref={playerContainerRef}
          className={`flex-1 ${
            isPlaylistDrawerOpen ? 'md:w-[80%]' : 'w-full'
          } min-w-0 flex flex-col bg-black relative overflow-hidden select-none`}
        >
          {currentItem ? (
            <div className="flex-1 flex flex-col relative w-full h-full bg-black">
              {/* Theater Ambient Glow Background */}
              {currentItem.posterUrl && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-10 blur-3xl pointer-events-none scale-125 transition-all duration-700"
                  style={{ backgroundImage: `url(${currentItem.posterUrl})` }}
                />
              )}

              {/* Player Area */}
              <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden group/player">
                {playerMode === 'direct' ? (
                  <video
                    ref={videoRef}
                    className="w-full h-full object-contain z-10"
                    controls
                    playsInline
                    autoPlay
                    onEnded={() => {
                      if (autoPlayNext) handleNext();
                    }}
                    onError={() => {
                      console.warn('[Cinema Player] Video direct playback error. Falling back to embed.');
                      setPlayerMode('embed');
                    }}
                  />
                ) : (
                  <iframe
                    key={currentStream?.url || currentItem.id}
                    src={currentStream?.url || currentItem.originalUrl}
                    title={currentItem.movieTitle}
                    className="w-full h-full border-0 z-10 bg-black"
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                )}

                {/* Overlaid Server & Quality Controls (Floating top-right bar) */}
                <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-slate-950/85 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/80 shadow-2xl">
                  {/* Mode Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setPlayerMode(playerMode === 'direct' ? 'embed' : 'direct')}
                    className="px-2.5 py-1 rounded-lg text-xs font-black transition-all border flex items-center gap-1.5 cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                    title={playerMode === 'direct' ? 'التحويل إلى مشغل السيرفر المضمن (Embed)' : 'التحويل إلى مشغل HLS/MP4 المباشر'}
                  >
                    <span>{playerMode === 'direct' ? '⚡ HLS مباشر' : '🌐 سيرفر Embed'}</span>
                    <RefreshCw className="w-3 h-3 text-indigo-400" />
                  </button>

                  {/* Server Picker Dropdown if multiple servers exist for this movie */}
                  {currentItem.allStreams && currentItem.allStreams.length > 1 && (
                    <div className="relative group/servers">
                      <button
                        type="button"
                        className="px-2.5 py-1 rounded-lg text-xs font-black bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 border border-indigo-400/40 shadow-sm cursor-pointer"
                        title="تبديل السيرفر أو الجودة الحالية"
                      >
                        <Tv className="w-3 h-3" />
                        <span>{currentStream?.server || 'السيرفر'}</span>
                        <span className="text-[10px] text-amber-300 font-bold bg-indigo-950 px-1 rounded">
                          {currentStream?.quality || 'HD'}
                        </span>
                        <ChevronDown className="w-3 h-3 text-white/80" />
                      </button>

                      {/* Dropdown menu */}
                      <div className="absolute right-0 top-full mt-1.5 w-52 bg-slate-900/98 backdrop-blur-xl border border-slate-700 rounded-xl shadow-2xl p-1 hidden group-hover/servers:block z-30 animate-in fade-in duration-150">
                        <div className="px-2 py-1 text-[10px] font-black text-slate-400 border-b border-slate-800">
                          اختر سيرفر أو جودة أخرى:
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 pt-1 custom-scrollbar">
                          {currentItem.allStreams.map((st, sIdx) => {
                            const isCurrent = st.url === currentStream?.url;
                            return (
                              <button
                                key={st.id || sIdx}
                                type="button"
                                onClick={() => handleSwitchServer(st)}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold text-right transition-colors cursor-pointer ${
                                  isCurrent
                                    ? 'bg-indigo-600 text-white'
                                    : 'hover:bg-slate-800 text-slate-300'
                                }`}
                              >
                                <span className="truncate">{st.server}</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-mono px-1 rounded bg-slate-950/60 text-amber-300">
                                    {st.quality}
                                  </span>
                                  {isCurrent && <Check className="w-3.5 h-3.5 text-emerald-300 stroke-[3]" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fullscreen Button */}
                  <button
                    type="button"
                    onClick={handleToggleFullscreen}
                    className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                    title="ملء الشاشة"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Quick Qualities & Servers Bar Directly Below Video Display */}
              <div className="bg-slate-950 border-t border-indigo-500/30 px-3 sm:px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 z-20 shadow-md">
                {/* Header / Info Label */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="p-1.5 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-400/30 shadow-inner">
                    <Sliders className="w-3.5 h-3.5 text-amber-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-white">
                        الجودات وسيرفرات البث للمعاينة:
                      </span>
                      {currentItem.allStreams && currentItem.allStreams.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-indigo-600/40 text-indigo-300 text-[10px] font-black border border-indigo-500/30">
                          {currentItem.allStreams.length} متاح
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 hidden md:block">
                      اضغط على أي جودة أو سيرفر للانتقال الفوري والمعاينة المباشرة
                    </p>
                  </div>
                </div>

                {/* Interactive Quality Chips / Buttons */}
                <div className="flex items-center flex-wrap gap-1.5 overflow-x-auto py-0.5 custom-scrollbar">
                  {currentItem.allStreams && currentItem.allStreams.length > 0 ? (
                    currentItem.allStreams.map((st, sIdx) => {
                      const isCurrent =
                        st.url === currentStream?.url ||
                        (st.id && currentStream?.id && st.id === currentStream.id) ||
                        (st.directUrl && currentStream?.directUrl && st.directUrl === currentStream.directUrl);

                      return (
                        <button
                          key={st.id || sIdx}
                          type="button"
                          onClick={() => handleSwitchServer(st)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm whitespace-nowrap border ${
                            isCurrent
                              ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 text-white border-indigo-300 ring-2 ring-indigo-400/60 shadow-indigo-600/30 font-black'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/80 hover:border-indigo-400/50'
                          }`}
                          title={`معاينة والانتقال إلى سيرفر ${st.server} بجودة ${st.quality}`}
                        >
                          {/* Server Name */}
                          <span className="flex items-center gap-1">
                            <Tv className="w-3 h-3 text-indigo-300" />
                            <span>{st.server}</span>
                          </span>

                          {/* Quality Badge */}
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                              isCurrent
                                ? 'bg-amber-400 text-slate-950 font-black'
                                : 'bg-slate-800 text-amber-300 border border-slate-700'
                            }`}
                          >
                            {st.quality}
                          </span>

                          {/* Stream Format Tag */}
                          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                            {st.type === 'hls' ? '⚡ HLS' : st.type === 'mp4' ? '🎬 MP4' : '🌐 Embed'}
                          </span>

                          {/* Active Indicator Icon */}
                          {isCurrent && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                        </button>
                      );
                    })
                  ) : (
                    currentStream && (
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>{currentStream.server}</span>
                          <span className="text-amber-300 font-mono">({currentStream.quality})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenExtractor(currentItem.originalUrl)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-850 hover:bg-slate-800 text-indigo-300 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
                          title="فحص واستخراج السيرفرات والجودات الأخرى لهذا الفيلم"
                        >
                          <Plus className="w-3 h-3" />
                          <span>استخراج باقي السيرفرات</span>
                        </button>
                      </div>
                    )
                  )}

                  {/* Quick button to extract/re-extract more servers for this movie */}
                  {currentItem.originalUrl && (
                    <button
                      type="button"
                      onClick={() => onOpenExtractor(currentItem.originalUrl)}
                      className="flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-900 hover:bg-indigo-600/30 text-slate-400 hover:text-indigo-200 text-[11px] font-bold border border-slate-800 hover:border-indigo-400/40 transition-all cursor-pointer whitespace-nowrap active:scale-95"
                      title="فتح نافذة فحص واستخراج السيرفرات لهذا الفيلم"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span className="hidden sm:inline">استخراج سيرفرات أخرى</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Theater Control Bar at bottom of stage */}
              <div className="p-3 sm:p-4 bg-slate-950/95 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 z-20">
                {/* Active Movie Title & Server Info */}
                <div className="flex items-center gap-3 min-w-0 max-w-full sm:max-w-[45%]">
                  {currentItem.posterUrl && (
                    <img
                      src={currentItem.posterUrl}
                      alt={currentItem.movieTitle}
                      className="w-10 h-14 object-cover rounded-lg border border-slate-700 shadow-md flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <h3
                      title={currentItem.movieTitle}
                      className="text-sm sm:text-base font-black text-white line-clamp-2 break-words leading-snug"
                    >
                      {currentItem.movieTitle}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span className="px-1.5 py-0.5 bg-slate-800 text-indigo-300 rounded font-bold">
                        {currentStream?.server}
                      </span>
                      <span className="px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded font-bold font-mono">
                        {currentStream?.quality || 'HD'}
                      </span>
                      <span className="text-slate-500">#{currentIndex + 1} من {playlist.length}</span>
                    </div>
                  </div>
                </div>

                {/* Center Playback Controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={playlist.length <= 1}
                    className="p-2.5 rounded-xl bg-slate-850 hover:bg-slate-800 disabled:opacity-40 text-slate-200 hover:text-white transition-all cursor-pointer active:scale-95 border border-slate-700"
                    title="الفيلم السابق"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black shadow-lg shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
                    title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
                  </button>

                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={playlist.length <= 1}
                    className="p-2.5 rounded-xl bg-slate-850 hover:bg-slate-800 disabled:opacity-40 text-slate-200 hover:text-white transition-all cursor-pointer active:scale-95 border border-slate-700"
                    title="الفيلم التالي"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* Right Options (Autoplay Next toggle, speed, open external) */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAutoPlayNext(!autoPlayNext)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      autoPlayNext
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-850 text-slate-400 border-slate-700'
                    }`}
                    title="تشغيل الفيلم التالي تلقائياً عند انتهاء الحالي"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">تشغيل متتالي</span>
                  </button>

                  {/* External Link */}
                  {currentItem.originalUrl && (
                    <a
                      href={currentItem.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                      title="فتح صفحة الفيلم الأصلية في نافذة جديدة"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Empty Playlist State */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-indigo-600/20 border-2 border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-xl">
                <Tv className="w-10 h-10 animate-bounce" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-xl font-black text-white">
                  شاشة العرض خالية حالياً!
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  قم بالضغط على بطاقة أي فيلم في التطبيق لاختيار سيرفر البث وإضافته إلى playlist شاشة العرض، أو أضف رابط فيلم مباشرة هنا.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onOpenExtractor()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>استخراج وإضافة رابط فيلم للشاشة</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700 transition-colors cursor-pointer"
                >
                  العودة لتصفح الأفلام
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
