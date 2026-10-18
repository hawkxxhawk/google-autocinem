import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { MovieItem, ExtractedStream, PlaylistItem } from '../types';
import {
  X,
  Plus,
  Check,
  Film,
  Radio,
  ExternalLink,
  Copy,
  Layers,
  Sparkles,
  AlertCircle,
  Tv,
  ListVideo,
  ChevronRight,
  RefreshCw,
  Search,
  Eye,
  ArrowRight,
  RotateCcw,
  MonitorPlay,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sliders,
} from 'lucide-react';

interface StreamExtractorModalProps {
  isOpen: boolean;
  onClose: () => void;
  movie?: MovieItem | null;
  initialUrl?: string;
  onAddToPlaylist: (item: PlaylistItem) => void;
  onPlayNow: (item: PlaylistItem) => void;
  currentPlaylist: PlaylistItem[];
  onOpenCinemaScreen: () => void;
}

export const StreamExtractorModal: React.FC<StreamExtractorModalProps> = ({
  isOpen,
  onClose,
  movie,
  initialUrl,
  onAddToPlaylist,
  onPlayNow,
  currentPlaylist,
  onOpenCinemaScreen,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [movieTitle, setMovieTitle] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streams, setStreams] = useState<ExtractedStream[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [addedStreamIds, setAddedStreamIds] = useState<Set<string>>(new Set());

  // Preview Mode State
  const [previewStream, setPreviewStream] = useState<ExtractedStream | null>(null);
  const [previewPlayerMode, setPreviewPlayerMode] = useState<'direct' | 'embed'>('direct');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [isPreviewMuted, setIsPreviewMuted] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Initialize modal state whenever it opens or props change
  useEffect(() => {
    if (isOpen) {
      const targetUrl = (movie?.url || movie?.embedUrl || initialUrl || '').trim();
      setUrlInput(targetUrl);
      setMovieTitle(movie?.title || '');
      setPosterUrl(movie?.posterUrl || '');
      setError(null);
      setStreams([]);
      setPreviewStream(null);
      setPreviewError(null);
      setNotification(null);

      if (targetUrl) {
        handleExtract(targetUrl, movie?.title);
      }
    } else {
      setPreviewStream(null);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    }
  }, [isOpen, movie, initialUrl]);

  // Sync already added streams based on the current playlist
  useEffect(() => {
    const added = new Set<string>();
    currentPlaylist.forEach((item) => {
      added.add(item.selectedStream.url);
      if (item.selectedStream.id) added.add(item.selectedStream.id);
      if (item.selectedStream.directUrl) added.add(item.selectedStream.directUrl);
    });
    setAddedStreamIds(added);
  }, [currentPlaylist]);

  // Handle Video / HLS player inside Preview Screen
  useEffect(() => {
    if (!previewStream) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    const streamUrl = previewStream.directUrl || previewStream.url;
    setPreviewError(null);

    // If player mode is embed or stream type is explicitly embed
    if (previewPlayerMode === 'embed' || previewStream.type === 'embed') {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = streamUrl.includes('.m3u8') || previewStream.type === 'hls';

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 60,
        });
        hlsRef.current = hls;

        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {
            // Browsers may block unmuted autoplay; mute and retry
            video.muted = true;
            setIsPreviewMuted(true);
            video.play().catch(() => {});
          });
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.warn('[Preview Player] HLS error:', data.type);
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (!streamUrl.startsWith('/api/stream-proxy')) {
                  const proxyUrl = `/api/stream-proxy?url=${encodeURIComponent(streamUrl)}`;
                  hls.loadSource(proxyUrl);
                  hls.startLoad();
                } else {
                  setPreviewError('تعذر جلب بث الفيديو مباشرة. يمكنك تجربة مشغل السيرفر الخارجي.');
                  setPreviewPlayerMode('embed');
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                setPreviewError('فشل تشغيل البث المباشر، تم التحويل لمشغل السيرفر الخارجي.');
                setPreviewPlayerMode('embed');
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.play().catch(() => {
          video.muted = true;
          setIsPreviewMuted(true);
          video.play().catch(() => {});
        });
      } else {
        setPreviewPlayerMode('embed');
      }
    } else {
      // Direct MP4
      video.src = streamUrl;
      video.play().catch(() => {
        video.muted = true;
        setIsPreviewMuted(true);
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [previewStream, previewPlayerMode]);

  const handleExtract = async (targetUrl: string, title?: string) => {
    if (!targetUrl || !targetUrl.trim()) {
      setError('يرجى إدخال رابط الفيلم أو الصفحة.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStreams([]);
    setPreviewStream(null);

    try {
      const res = await fetch('/api/extract-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl.trim(), title: title || movieTitle }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل استخراج الروابط من هذا الموقع.');
      }

      if (data.title && !movieTitle) {
        setMovieTitle(data.title);
      }
      if (data.poster && !posterUrl) {
        setPosterUrl(data.poster);
      }

      setStreams(data.streams || []);

      if (!data.streams || data.streams.length === 0) {
        setError('لم يتم العثور على سيرفرات بث مباشرة في هذه الصفحة. تأكد من صحة الرابط.');
      }
    } catch (err: any) {
      console.error('Extraction error:', err);
      setError(err?.message || 'حدث خطأ في الاتصال بالخادم واستخراج السيرفرات.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyUrl = (text: string, id: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  const createPlaylistItem = (stream: ExtractedStream): PlaylistItem => {
    return {
      id: `pl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      movieId: movie?.id,
      movieTitle: movieTitle || movie?.title || 'فيلم بدون عنوان',
      posterUrl: posterUrl || movie?.posterUrl || '',
      originalUrl: urlInput,
      category: movie?.category || 'سينما',
      selectedStream: stream,
      allStreams: streams,
      addedAt: new Date().toISOString(),
      duration: movie?.duration,
    };
  };

  const handleAddSingleToPlaylist = (stream: ExtractedStream) => {
    const item = createPlaylistItem(stream);
    onAddToPlaylist(item);
    setAddedStreamIds((prev) => {
      const next = new Set(prev);
      next.add(stream.url);
      next.add(stream.id);
      if (stream.directUrl) next.add(stream.directUrl);
      return next;
    });

    setNotification(`تمت إضافة (${stream.server} - ${stream.quality}) إلى قائمة التشغيل بنجاح! 🎬`);
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  const handleAddAllToPlaylist = () => {
    streams.forEach((stream) => {
      if (!addedStreamIds.has(stream.url) && !addedStreamIds.has(stream.id)) {
        const item = createPlaylistItem(stream);
        onAddToPlaylist(item);
      }
    });
    const allIds = new Set(addedStreamIds);
    streams.forEach((s) => {
      allIds.add(s.url);
      allIds.add(s.id);
      if (s.directUrl) allIds.add(s.directUrl);
    });
    setAddedStreamIds(allIds);

    setNotification(`تمت إضافة جميع السيرفرات (${streams.length}) إلى قائمة التشغيل!`);
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // Open Preview Mode for a chosen stream
  const handleOpenPreview = (stream: ExtractedStream) => {
    setPreviewStream(stream);
    setPreviewPlayerMode(stream.type === 'embed' ? 'embed' : 'direct');
    setPreviewError(null);
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 dir-rtl text-right"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[94vh] flex flex-col bg-slate-900 border-2 border-indigo-500/40 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* ======================================================== */}
        {/* VIEW 1: PREVIEW SCREEN (شاشة المعاينة)                   */}
        {/* ======================================================== */}
        {previewStream ? (() => {
          const isAdded =
            addedStreamIds.has(previewStream.url) ||
            addedStreamIds.has(previewStream.id) ||
            (previewStream.directUrl ? addedStreamIds.has(previewStream.directUrl) : false);

          return (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Preview Header: All 4 Action Buttons at Top (Library, Qualities, Add to Playlist, Go to Playlist) */}
              <div className="flex flex-wrap items-center justify-between p-3 sm:p-4 bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900 border-b border-indigo-500/30 gap-2.5">
                {/* Movie Title & Preview Indicator */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-sky-600/30 text-sky-300 border border-sky-400/30 shadow-inner flex-shrink-0">
                    <Eye className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full bg-sky-600 text-white text-[11px] font-black">
                        معاينة البث 👁️
                      </span>
                      <h3 className="text-sm sm:text-base font-black text-white truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                        {movieTitle || 'فيلم بدون عنوان'}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-300">
                      <span className="text-amber-300 font-bold">{previewStream.server}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-200 font-mono font-bold bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700">
                        {previewStream.quality}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Top Action Buttons Group */}
                <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                  {/* 1. Return to Library Button */}
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-200 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40 text-xs sm:text-sm font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
                    title="العودة لمكتبة الأفلام"
                  >
                    <Film className="w-4 h-4 text-rose-400" />
                    <span>المكتبة</span>
                  </button>

                  {/* 2. Return to Extracted Qualities Button */}
                  <button
                    type="button"
                    onClick={() => setPreviewStream(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 hover:text-white border border-indigo-500/40 text-xs sm:text-sm font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
                    title="العودة لقائمة السيرفرات والجودات المستخرجة"
                  >
                    <ArrowRight className="w-4 h-4 text-indigo-400" />
                    <span>الجودات المستخرجة</span>
                  </button>

                  {/* 3. Add to Playlist Button */}
                  <button
                    type="button"
                    onClick={() => handleAddSingleToPlaylist(previewStream)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-black text-xs sm:text-sm border transition-all cursor-pointer active:scale-95 shadow-md ${
                      isAdded
                        ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50 hover:bg-emerald-600/40'
                        : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-emerald-400/50'
                    }`}
                    title="إضافة هذا السيرفر والجودة إلى قائمة التشغيل (Playlist)"
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                        <span>مضاف بالـ Playlist</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 stroke-[3]" />
                        <span>إضافة للـ Playlist</span>
                      </>
                    )}
                  </button>

                  {/* 4. Go to Cinema Screen / Playlist Button */}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCinemaScreen();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/40 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-400/40 text-xs sm:text-sm font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
                    title="الانتقال إلى شاشة العرض وقائمة التشغيل"
                  >
                    <Tv className="w-4 h-4 text-amber-300" />
                    <span>قائمة التشغيل ({currentPlaylist.length})</span>
                  </button>

                  {/* Close Button X */}
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    title="إغلاق"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Notification Toast */}
              {notification && (
                <div className="bg-emerald-600 text-white text-xs sm:text-sm font-black px-4 py-2 flex items-center justify-between animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>{notification}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotification(null)}
                    className="p-0.5 hover:bg-emerald-700 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Center: Video Player Area */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar bg-slate-950/70 flex flex-col items-center justify-center min-h-[220px]">
                {/* Video Player Box */}
                <div className="relative w-full aspect-video max-h-[46vh] sm:max-h-[50vh] rounded-xl overflow-hidden bg-black border-2 border-indigo-500/30 shadow-2xl flex items-center justify-center">
                  {previewPlayerMode === 'direct' && previewStream.type !== 'embed' ? (
                    <video
                      ref={videoRef}
                      controls
                      playsInline
                      className="w-full h-full object-contain bg-black"
                    />
                  ) : (
                    <iframe
                      src={previewStream.url}
                      className="w-full h-full border-0 bg-black"
                      allowFullScreen
                      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                      title={`Preview ${previewStream.server}`}
                    />
                  )}

                  {/* Error Banner overlay if any */}
                  {previewError && (
                    <div className="absolute top-3 inset-x-3 p-2.5 rounded-lg bg-red-950/90 border border-red-500/50 text-red-200 text-xs flex items-center justify-between gap-2 shadow-lg backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span>{previewError}</span>
                      </div>
                      {previewPlayerMode !== 'embed' && (
                        <button
                          type="button"
                          onClick={() => setPreviewPlayerMode('embed')}
                          className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black cursor-pointer"
                        >
                          تجربة مشغل السيرفر Embed
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Section: Server Info + Extracted Link Box + Qualities (Without Horizontal Scroll) */}
              <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 space-y-2.5 flex-shrink-0 z-10">
                {/* 1. Server Info & Format & Mode Switcher */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center flex-wrap gap-2 text-xs">
                    <span className="font-bold text-slate-400">السيرفر:</span>
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black flex items-center gap-1.5 shadow-sm">
                      <Tv className="w-3.5 h-3.5" />
                      <span>{previewStream.server}</span>
                    </span>

                    <span className="font-bold text-slate-400">الجودة الحالية:</span>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-black border ${
                        previewStream.quality.includes('1080') || previewStream.quality.includes('4K')
                          ? 'bg-purple-950/90 text-purple-300 border-purple-500/50'
                          : previewStream.quality.includes('720')
                          ? 'bg-sky-950/90 text-sky-300 border-sky-500/50'
                          : 'bg-slate-800 text-amber-300 border-slate-700'
                      }`}
                    >
                      {previewStream.quality}
                    </span>

                    <span className="px-2 py-1 rounded-lg bg-slate-850 text-slate-300 text-[11px] font-mono border border-slate-700">
                      {previewStream.type === 'hls'
                        ? '⚡ HLS M3U8'
                        : previewStream.type === 'mp4'
                        ? '🎬 MP4 مباشر'
                        : '🌐 مشغل Embed'}
                    </span>
                  </div>

                  {/* Mode Switcher Toggle (if direct stream is available) */}
                  {previewStream.type !== 'embed' && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400 font-bold">المشغل:</span>
                      <button
                        type="button"
                        onClick={() => setPreviewPlayerMode('direct')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          previewPlayerMode === 'direct'
                            ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
                            : 'bg-slate-850 text-slate-400 hover:text-white border border-slate-700'
                        }`}
                      >
                        مباشر HLS/MP4
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewPlayerMode('embed')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          previewPlayerMode === 'embed'
                            ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
                            : 'bg-slate-850 text-slate-400 hover:text-white border border-slate-700'
                        }`}
                      >
                        سيرفر Embed
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Extracted Link Box (خانة الرابط المستخرج) with copy button */}
                <div className="flex items-center justify-between gap-2 text-xs font-mono bg-slate-900 px-3 py-2 rounded-xl border border-slate-700/80 text-slate-300">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[11px] font-black text-amber-400 flex-shrink-0 font-sans">
                      رابط البث المستخرج:
                    </span>
                    <span className="truncate select-all text-slate-200">
                      {previewStream.directUrl || previewStream.url}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyUrl(previewStream.directUrl || previewStream.url, previewStream.id)}
                    className="flex items-center gap-1.5 text-xs font-sans font-bold bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700 hover:border-indigo-400/50 transition-all cursor-pointer flex-shrink-0 active:scale-95"
                    title="نسخ رابط البث المستخرج"
                  >
                    {copiedId === previewStream.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ الرابط</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 3. Available Qualities & Servers (الجودات بدون الحاجة لاستعمال السكرول الجانبي) */}
                {streams.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-black text-white">
                        الجودات والسيرفرات المستخرجة (اضغط للمعاينة الفورية):
                      </span>
                      <span className="px-1.5 py-0.2 rounded-full bg-indigo-600/40 text-indigo-300 text-[10px] font-bold">
                        {streams.length} متاح
                      </span>
                    </div>

                    {/* flex-wrap ensures NO horizontal scrolling is needed! */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {streams.map((s, idx) => {
                        const isCurrent = s.url === previewStream.url && s.id === previewStream.id;
                        const isStreamAdded =
                          addedStreamIds.has(s.url) ||
                          addedStreamIds.has(s.id) ||
                          (s.directUrl && addedStreamIds.has(s.directUrl));

                        return (
                          <button
                            key={s.id || idx}
                            type="button"
                            onClick={() => handleOpenPreview(s)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                              isCurrent
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-400 shadow-md ring-2 ring-indigo-400/60 font-black scale-[1.02]'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 hover:border-slate-600'
                            }`}
                            title={`معاينة سيرفر ${s.server} بجودة ${s.quality}`}
                          >
                            <span>{s.server}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-black ${
                                isCurrent
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-slate-800 text-amber-300 border border-slate-700'
                              }`}
                            >
                              {s.quality}
                            </span>
                            {isCurrent && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                            {isStreamAdded && !isCurrent && (
                              <span className="text-[10px] text-emerald-400" title="مضاف بالـ Playlist">
                                ✔
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })() : (
          /* ======================================================== */
          /* VIEW 2: EXTRACTED QUALITIES & SERVERS LIST SCREEN       */
          /* ======================================================== */
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 border-b border-indigo-500/30">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-600/30 text-indigo-300 border border-indigo-400/30 shadow-inner">
                  <Radio className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg sm:text-xl font-black text-white">
                      استخراج سيرفرات وبث الفيديو
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-[11px] font-black text-amber-300 border border-indigo-400/40">
                      شاشة العرض 🎬
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    فحص صفحة الفيلم، استخراج السيرفرات والجودات المختلفة ومعاينتها واختيارها لـ Playlist شاشة العرض
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Back to Library Button in Header */}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition-all cursor-pointer active:scale-95"
                  title="العودة للمكتبة"
                >
                  <Film className="w-4 h-4 text-rose-400" />
                  <span>العودة للمكتبة</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Notification Toast */}
            {notification && (
              <div className="bg-emerald-600 text-white text-xs sm:text-sm font-black px-4 py-2 flex items-center justify-between animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{notification}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNotification(null)}
                  className="p-0.5 hover:bg-emerald-700 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* URL Input & Extractor Action Bar */}
            <div className="p-4 bg-slate-950/50 border-b border-slate-800">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleExtract(urlInput);
                    }}
                    placeholder="أدخل أو الصق رابط صفحة الفيلم (مثلاً: https://aflam18.media/... أو https://aflamicose.com/...)"
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-900 text-slate-100 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleExtract(urlInput)}
                  disabled={isLoading || !urlInput.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black text-xs sm:text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95 whitespace-nowrap"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  <span>{isLoading ? 'جاري الفحص...' : 'فحص واستخراج السيرفرات'}</span>
                </button>
              </div>

              {/* Quick Info Bar */}
              {movieTitle && (
                <div className="mt-2.5 flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Film className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="text-amber-300">الفيلم:</span>
                  <span className="truncate text-white">{movieTitle}</span>
                </div>
              )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
              {/* Loading Animation */}
              {isLoading && (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                    <Radio className="w-6 h-6 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-black text-white">
                      جاري الاتصال بصفحة الفيلم وفحص السيرفرات والجودات...
                    </p>
                    <p className="text-xs text-slate-400">
                      فك تشفير مشغلات VTG واستخراج جودات وروابط البث (HLS, MP4, Iframe Embed)
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && !isLoading && (
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 flex items-start gap-3 text-red-200 text-xs sm:text-sm">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-black text-red-300">{error}</p>
                    <p className="text-slate-400 text-xs">
                      تأكد من أن الرابط مباشر لصفحة الفيلم التي تحتوي على مشغلات الفيديو (مثل روابط aflam18.media أو aflamicose.com).
                    </p>
                  </div>
                </div>
              )}

              {/* Extracted Streams List */}
              {!isLoading && streams.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">
                        تم اكتشاف {streams.length} سيرفر/بث متاح:
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-500/40 rounded-full text-xs font-black">
                        جاهز للمعاينة والإضافة
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddAllToPlaylist}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-400/40 text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة الكل إلى Playlist</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    {streams.map((stream, idx) => {
                      const isAdded =
                        addedStreamIds.has(stream.url) ||
                        addedStreamIds.has(stream.id) ||
                        (stream.directUrl && addedStreamIds.has(stream.directUrl));
                      const isCopied = copiedId === stream.id;

                      return (
                        <div
                          key={stream.id || idx}
                          className={`p-3.5 rounded-xl border transition-all ${
                            isAdded
                              ? 'bg-emerald-950/30 border-emerald-500/40'
                              : 'bg-slate-850/80 hover:bg-slate-800 border-slate-700/80 hover:border-indigo-500/40'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            {/* Server Title & Badges */}
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white font-black text-xs sm:text-sm shadow-sm flex items-center gap-1.5">
                                  <Tv className="w-3.5 h-3.5" />
                                  <span>{stream.server}</span>
                                </span>

                                {/* Quality Badge */}
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${
                                    stream.quality.includes('1080') || stream.quality.includes('4K')
                                      ? 'bg-purple-950/80 text-purple-300 border-purple-500/40'
                                      : stream.quality.includes('720')
                                      ? 'bg-sky-950/80 text-sky-300 border-sky-500/40'
                                      : 'bg-slate-800 text-amber-300 border-slate-700'
                                  }`}
                                >
                                  {stream.quality}
                                </span>

                                {/* Stream Type Badge */}
                                <span className="px-2 py-0.5 rounded-md bg-slate-800/90 text-slate-300 text-[10px] font-bold border border-slate-700 font-mono">
                                  {stream.type === 'hls'
                                    ? '⚡ HLS M3U8 مباشر'
                                    : stream.type === 'mp4'
                                    ? '🎬 MP4 مباشر'
                                    : '🌐 مشغل سيرفر Embed'}
                                </span>
                              </div>

                              {/* URL text preview */}
                              <div className="flex items-center gap-2 text-xs font-mono text-slate-400 truncate">
                                <span className="truncate max-w-[280px] sm:max-w-md">
                                  {stream.directUrl || stream.url}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyUrl(stream.directUrl || stream.url, stream.id)}
                                  className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700 flex-shrink-0 cursor-pointer"
                                  title="نسخ الرابط"
                                >
                                  {isCopied ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Action Buttons: Preview Only + Add to Playlist */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* 1. Preview Only Button (زر العرض لأجل المعاينة فقط) */}
                              <button
                                type="button"
                                onClick={() => handleOpenPreview(stream)}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm shadow-md transition-all cursor-pointer active:scale-95 whitespace-nowrap border border-sky-400/30"
                                title="معاينة هذا البث والجودة في شاشة المعاينة"
                              >
                                <Eye className="w-4 h-4 text-sky-200" />
                                <span>معاينة البث</span>
                              </button>

                              {/* 2. Add to Playlist Button */}
                              <button
                                type="button"
                                onClick={() => handleAddSingleToPlaylist(stream)}
                                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-black text-xs sm:text-sm border transition-all cursor-pointer active:scale-95 whitespace-nowrap ${
                                  isAdded
                                    ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/30'
                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400/50 shadow-md'
                                }`}
                                title={isAdded ? 'موجود بالفعل في الـ Playlist' : 'إضافة هذا السيرفر إلى قائمة شاشة العرض'}
                              >
                                {isAdded ? (
                                  <>
                                    <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                                    <span>مضاف بالـ Playlist</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-4 h-4 stroke-[2.5]" />
                                    <span>إضافة للـ Playlist</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty Prompt */}
              {!isLoading && streams.length === 0 && !error && (
                <div className="py-8 text-center text-slate-400 space-y-2">
                  <Radio className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-bold">
                    أدخل رابط أي فيلم واضغط على "فحص واستخراج السيرفرات" للبدء.
                  </p>
                  <p className="text-xs text-slate-500">
                    يدعم مواقع aflam18.media و aflamicose.com وسيرفرات Uqload و Filemoon و Stream وغيرها.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                <Film className="w-4 h-4 text-rose-400" />
                <span>العودة للمكتبة</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCinemaScreen();
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-95"
              >
                <Tv className="w-4.5 h-4.5 text-amber-300" />
                <span>الانتقال إلى شاشة العرض ({currentPlaylist.length} عنصر)</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
