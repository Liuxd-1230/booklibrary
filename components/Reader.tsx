import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Book, Bookmark, ReaderSettings, TocItem, AIProvider } from '../types';
import { ChevronLeftIcon, BookmarkIcon, SparklesIcon, XIcon, SettingsIcon, ListIcon, TrophyIcon, ClockIcon, PenIcon } from './Icons';
import { explainTextWithAI } from '../services/geminiService';
import { pdfjsLib } from '../services/bookParser';
import { updateReadingTime } from '../services/statsService';
import { countWords, processHtmlForBionic, applyBionicReadingToText } from '../services/textUtils';

interface ReaderProps {
  book: Book;
  bookmarks: Bookmark[];
  onBack: () => void;
  onUpdateProgress: (bookId: string, progress: number) => void;
  onAddBookmark: (bookId: string, excerpt: string, position: number, note?: string) => void;
  onRemoveBookmark: (bookmarkId: string) => void;
  theme: 'light' | 'sepia' | 'dark' | 'eye-care';
  onThemeChange: (theme: 'light' | 'sepia' | 'dark' | 'eye-care') => void;
}

interface PdfPageProps {
  pageNumber: number;
  pdf: any;
  scale: number;
  id?: string;
}

const PdfPage: React.FC<PdfPageProps> = ({ pageNumber, pdf, scale, id }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  
  const [inView, setInView] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [status, setStatus] = useState<'init' | 'loading' | 'success' | 'error'>('init');
  const [retryCount, setRetryCount] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<{width: number, height: number} | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '50% 0px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [retryCount]);

  useEffect(() => {
    let timer: any;
    if (inView && !shouldLoad) {
      timer = setTimeout(() => {
        setShouldLoad(true);
      }, 200); 
    }
    return () => clearTimeout(timer);
  }, [inView, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || !pdf || !canvasRef.current || !textLayerRef.current) return;

    let isCancelled = false;

    const renderPage = async () => {
      if (renderTaskRef.current) {
        try {
          await renderTaskRef.current.cancel();
        } catch (e) { /* ignore */ }
      }

      setStatus('loading');

      try {
        const page = await pdf.getPage(pageNumber);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        setPageDimensions({ width: viewport.width, height: viewport.height });

        const dpr = window.devicePixelRatio || 1;
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d');

        if (!context) throw new Error("Canvas context unavailable");

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          transform: [dpr, 0, 0, dpr, 0, 0]
        };

        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;

        if (isCancelled) return;

        const textContent = await page.getTextContent();
        if (isCancelled) return;

        const textLayer = textLayerRef.current!;
        textLayer.innerHTML = '';
        textLayer.style.width = `${Math.floor(viewport.width)}px`;
        textLayer.style.height = `${Math.floor(viewport.height)}px`;
        textLayer.style.setProperty('--scale-factor', `${scale}`);

        await pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport: viewport,
          textDivs: []
        }).promise;

        if (!isCancelled) {
          setStatus('success');
        }

      } catch (err: any) {
        if (err.name !== 'RenderingCancelled' && !err.message?.includes('cancelled')) {
          console.error(`Error rendering page ${pageNumber}`, err);
          if (!isCancelled) setStatus('error');
        }
      } finally {
         renderTaskRef.current = null;
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [shouldLoad, pdf, pageNumber, scale, retryCount]);

  const handleRetry = () => {
    setStatus('init');
    setRetryCount(c => c + 1);
  };

  return (
    <div 
      id={id}
      ref={containerRef} 
      className="relative mb-6 mx-auto bg-white shadow-sm transition-all duration-300"
      style={{ 
        width: pageDimensions ? pageDimensions.width : '100%',
        height: pageDimensions ? pageDimensions.height : (scale * 800),
        minHeight: '200px',
        maxWidth: '100%'
      }}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 z-10 p-4 text-center">
          <p className="text-red-500 text-sm font-medium mb-2">加载失败</p>
          <button onClick={handleRetry} className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg shadow-sm text-xs active:scale-95 transition-transform">
            重试
          </button>
        </div>
      )}
      <canvas ref={canvasRef} className="block" />
      <div ref={textLayerRef} className="textLayer" />
    </div>
  );
};

const Reader: React.FC<ReaderProps> = ({ 
  book, 
  bookmarks, 
  onBack, 
  onUpdateProgress, 
  onAddBookmark, 
  onRemoveBookmark,
  theme,
  onThemeChange
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<any>(null);

  const [selection, setSelection] = useState<{text: string, top: number, left: number} | null>(null);
  const [menuExpanded, setMenuExpanded] = useState(false); // New state for swipe gesture

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuTab, setMenuTab] = useState<'toc' | 'bookmarks'>('toc');
  const [showGoalToast, setShowGoalToast] = useState(false);
  const [showHighlightToast, setShowHighlightToast] = useState(false);
  
  // Stats for "Time Remaining"
  const [minutesLeft, setMinutesLeft] = useState<number>(0);
  const [totalWords, setTotalWords] = useState<number>(0);

  const [settings, setSettings] = useState<ReaderSettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lumina-reader-settings');
      if (saved) {
        try {
          return { focusMode: false, bionicReading: false, ...JSON.parse(saved) };
        } catch (e) { console.error(e); }
      }
    }
    return {
      theme: 'light', // This is now ignored in favor of prop
      fontSize: 18,
      fontFamily: 'serif',
      lineHeight: 1.6,
      pdfScale: 1.0,
      aiProvider: 'gemini',
      aiApiKey: '',
      aiModel: 'deepseek-chat',
      focusMode: false,
      bionicReading: false
    };
  });

  // Calculate Total Words on mount
  useEffect(() => {
    if (book.content) {
        setTotalWords(countWords(book.content));
    }
  }, [book.content]);

  // Persist settings
  useEffect(() => {
    const { focusMode, ...persistentSettings } = settings;
    localStorage.setItem('lumina-reader-settings', JSON.stringify(persistentSettings));
  }, [settings]);

  // Restore Scroll Position
  useEffect(() => {
    if (book.progress > 0 && contentRef.current) {
        setTimeout(() => {
            if (contentRef.current) {
                const { scrollHeight, clientHeight } = contentRef.current;
                const scrollTop = (book.progress / 100) * (scrollHeight - clientHeight);
                contentRef.current.scrollTo({ top: scrollTop, behavior: 'auto' });
            }
        }, 300);
    }
  }, []);

  // Timer & Wake Lock
  useEffect(() => {
    const timer = setInterval(() => {
      const { goalReached } = updateReadingTime(10);
      if (goalReached) {
         setShowGoalToast(true);
         setTimeout(() => setShowGoalToast(false), 5000); 
      }
    }, 10000); 
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && settings.focusMode) {
        try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (err: any) {}
      }
    };
    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try { await wakeLockRef.current.release(); wakeLockRef.current = null; } catch (err: any) {}
      }
    };
    if (settings.focusMode) requestWakeLock();
    else releaseWakeLock();

    const handleVisibilityChange = () => {
       if (document.visibilityState === 'visible' && settings.focusMode) requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [settings.focusMode]);

  const [inputPage, setInputPage] = useState("1");
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    if (book.type === 'pdf' && book.pdfData) {
      const loadPdf = async () => {
        try {
          const loadingTask = pdfjsLib.getDocument({
            data: book.pdfData!.slice(0),
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true,
          });
          const pdf = await loadingTask.promise;
          setPdfDocument(pdf);
          setNumPages(pdf.numPages);
          try {
             const page = await pdf.getPage(1);
             const viewport = page.getViewport({ scale: 1 });
             const fitScale = Math.min(2.5, (window.innerWidth - 32) / viewport.width);
             setSettings(prev => ({ ...prev, pdfScale: fitScale }));
          } catch (e) { /* ignore */ }
        } catch (error) { console.error(error); }
      };
      loadPdf();
    }
  }, [book]);

  const handleScroll = useCallback(() => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      const progress = (scrollTop / (scrollHeight - clientHeight)) * 100;
      
      // Update Progress
      if (Math.abs(progress - book.progress) > 1) {
        onUpdateProgress(book.id, progress);
      }

      // Update Time Remaining (Assume 250 words per minute average reading speed)
      // Percentage Remaining * Total Words / WPM
      if (totalWords > 0) {
          const percentageLeft = 1 - (progress / 100);
          const wordsLeft = totalWords * percentageLeft;
          const avgSpeed = 250; 
          setMinutesLeft(Math.max(1, Math.ceil(wordsLeft / avgSpeed)));
      }
    }
  }, [book.id, book.progress, onUpdateProgress, totalWords]);

  // Robust Selection Detection
  useEffect(() => {
    const handleSelectionChange = () => {
       const sel = window.getSelection();
       // Only proceed if we have a valid text selection
       if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
           // We might want to check if the selection is inside our contentRef, 
           // but on mobile, checking strict containment can be tricky with Shadow DOM or specific structures.
           // For now, assume any selection on the page (since reader is fullscreen) is valid.
           
           try {
             const range = sel.getRangeAt(0);
             const rect = range.getBoundingClientRect();
             
             // Debounce visual updates if needed, but for now direct update gives responsive feel
             // Ensure we don't update if coordinates are 0 (sometimes happens initially)
             if (rect.width > 0 && rect.height > 0) {
                 setSelection({
                    text: sel.toString(),
                    top: rect.top,
                    left: rect.left + (rect.width / 2)
                 });
             }
           } catch (e) { /* ignore range errors */ }
       } else {
           // If selection is cleared, and we aren't explicitly keeping the menu open for AI processing
           if (!aiPanelOpen && !aiLoading) {
               setSelection(null);
               setMenuExpanded(false);
           }
       }
    };
    
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [aiPanelOpen, aiLoading]);


  const handleContentClick = (e: React.MouseEvent) => {
    if (!selection) {
       if ((e.target as HTMLElement).tagName === 'A') return;
       setShowControls(prev => !prev);
       setShowSettings(false);
       setShowMenu(false);
    }
  };

  const handleExplain = async () => {
    if (!selection) return;
    setAiPanelOpen(true);
    setAiLoading(true);
    setAiExplanation("");
    setSelection(null); 
    // Do not clear selection range immediately so user sees what is being explained?
    // Actually standard behavior is to keep it or clear it. Let's clear to show the panel cleanly.
    window.getSelection()?.removeAllRanges(); 

    const explanation = await explainTextWithAI(
      selection.text, 
      undefined, 
      {
        provider: settings.aiProvider,
        apiKey: settings.aiApiKey,
        model: settings.aiModel
      }
    );
    setAiExplanation(explanation);
    setAiLoading(false);
  };

  const handleApplyHighlight = () => {
      if (!selection) return;
      
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            
            // Visual Highlight (Fluorescent Yellow)
            const span = document.createElement('span');
            span.className = 'highlight-fluorescent';
            
            try {
                range.surroundContents(span);
            } catch (e) {
                document.designMode = "on";
                document.execCommand("hiliteColor", false, "#fff700");
                document.designMode = "off";
            }
        }
      } catch(e) {
          console.error("Highlight failed", e);
      }
      
      setSelection(null);
      window.getSelection()?.removeAllRanges();
  };
  
  const handleAddNote = () => {
      if (!selection) return;
      
      const note = prompt("添加笔记:", "");
      if (note !== null) { // If not cancelled
          onAddBookmark(book.id, selection.text, book.progress, note || "");
          setShowHighlightToast(true);
          setTimeout(() => setShowHighlightToast(false), 2000);
      }
      
      setSelection(null);
      window.getSelection()?.removeAllRanges();
  };

  const jumpToPage = (page: number) => {
    if (book.type !== 'pdf') return;
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth' });
    setShowControls(false);
    setShowMenu(false);
  };

  const jumpToTocItem = (item: TocItem) => {
    if (book.type === 'pdf' && item.page) {
        jumpToPage(item.page);
        return;
    }
    if (item.href) {
        let targetId = item.href;
        if (targetId.includes('#')) {
             const parts = targetId.split('#');
             const el = document.getElementById(parts[1]) || document.getElementById(parts[0]);
             if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            const el = document.getElementById(targetId);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    setShowMenu(false);
    setShowControls(false);
  };

  const jumpToBookmark = (position: number) => {
    if (contentRef.current) {
        const { scrollHeight, clientHeight } = contentRef.current;
        const scrollTop = (position / 100) * (scrollHeight - clientHeight);
        contentRef.current.scrollTo({ top: scrollTop, behavior: 'smooth' });
    }
    setShowMenu(false);
  };

  // Prepare Bionic Content
  const displayContent = useMemo(() => {
      if (!settings.bionicReading || book.type === 'pdf') return book.content;

      if (book.type === 'epub') {
         return processHtmlForBionic(book.content);
      } else {
         // Text/Markdown
         return applyBionicReadingToText(book.content);
      }
  }, [book.content, settings.bionicReading, book.type]);

  const getThemeClass = () => {
    switch (theme) {
      case 'sepia': return 'theme-sepia';
      case 'eye-care': return 'theme-eye-care';
      case 'dark': return 'theme-dark';
      default: return 'theme-light';
    }
  };

  // Handle Swipe on Pill
  const [touchStart, setTouchStart] = useState<number | null>(null);
  
  const handlePillTouchStart = (e: React.TouchEvent) => {
      setTouchStart(e.touches[0].clientX);
  };
  
  const handlePillTouchMove = (e: React.TouchEvent) => {
      if (!touchStart) return;
      const currentX = e.touches[0].clientX;
      const diff = currentX - touchStart;
      
      if (diff > 30) { // Swipe Right threshold
          setMenuExpanded(true);
      }
  };

  const handlePillClick = () => {
      setMenuExpanded(true);
  };

  return (
    <div className={`relative h-screen flex flex-col overflow-hidden ${getThemeClass()} transition-colors duration-500 bg-[var(--bg-color)] text-[var(--text-color)]`}>
      
      {/* Header Bar - Heavy Glass Menu */}
      <div className={`
        fixed top-0 left-0 right-0 z-40 px-4 pt-4 pb-2 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
        ${showControls ? 'translate-y-0 opacity-100' : '-translate-y-[120%] opacity-0 pointer-events-none'}
      `}>
        {/* Uses .glass-menu for heavy blur */}
        <div className="glass-menu rounded-full px-5 py-3 flex justify-between items-center shadow-lg">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-[var(--menu-hover)] active:scale-95 transition-all text-current">
            <ChevronLeftIcon />
          </button>
          
          <div className="flex gap-2">
            <button 
              onClick={() => { setShowMenu(!showMenu); setShowSettings(false); }} 
              className={`p-2 rounded-full hover:bg-[var(--menu-hover)] active:scale-95 transition-all ${showMenu ? 'bg-[var(--menu-active)]' : ''}`}
            >
              <ListIcon />
            </button>
            <button 
              onClick={() => { setShowSettings(!showSettings); setShowMenu(false); }} 
              className={`p-2 rounded-full hover:bg-[var(--menu-hover)] active:scale-95 transition-all ${showSettings ? 'bg-[var(--menu-active)]' : ''}`}
            >
              <SettingsIcon />
            </button>
            <button 
              onClick={() => {
                   const excerpt = book.title + " (Manual)";
                   onAddBookmark(book.id, excerpt, book.progress, "");
                   setShowHighlightToast(true);
                   setTimeout(() => setShowHighlightToast(false), 2000);
              }} 
              className="p-2 -mr-2 rounded-full hover:bg-[var(--menu-hover)] active:scale-95 transition-all"
            >
              <BookmarkIcon />
            </button>
          </div>
        </div>

        {/* Menu (ToC & Bookmarks) - Popover */}
        {showMenu && (
          <div className="absolute top-20 left-4 w-72 glass-panel-adaptive rounded-[1.5rem] p-0 shadow-2xl overflow-hidden flex flex-col max-h-[60vh] animate-scale-in origin-top-left z-50">
             <div className="flex border-b border-[var(--glass-border)] p-1">
                <button 
                  onClick={() => setMenuTab('toc')}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${menuTab === 'toc' ? 'bg-[var(--menu-active)] shadow-sm' : 'opacity-60 hover:opacity-100 hover:bg-[var(--menu-hover)]'}`}
                >
                  目录
                </button>
                <button 
                  onClick={() => setMenuTab('bookmarks')}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${menuTab === 'bookmarks' ? 'bg-[var(--menu-active)] shadow-sm' : 'opacity-60 hover:opacity-100 hover:bg-[var(--menu-hover)]'}`}
                >
                  书签
                </button>
             </div>
             <div className="overflow-y-auto flex-1 p-2 space-y-1">
               {menuTab === 'toc' ? (
                 <>
                    {book.toc && book.toc.length > 0 ? (
                      book.toc.map((item, i) => (
                        <div key={i} className="animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                           <button 
                              onClick={() => jumpToTocItem(item)}
                              className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--menu-hover)] rounded-xl truncate transition-colors flex justify-between"
                            >
                              <span className="truncate pr-2">{item.label}</span>
                              {item.page && <span className="opacity-50 text-xs font-mono">p.{item.page}</span>}
                           </button>
                           {item.children?.map((child, j) => (
                             <button 
                                key={`${i}-${j}`}
                                onClick={() => jumpToTocItem(child)}
                                className="w-full text-left pl-8 pr-4 py-2 text-sm opacity-80 hover:bg-[var(--menu-hover)] rounded-xl truncate transition-colors"
                             >
                               {child.label}
                             </button>
                           ))}
                        </div>
                      ))
                    ) : (
                      <p className="text-center opacity-50 py-8 text-sm">暂无目录</p>
                    )}
                 </>
               ) : (
                 <>
                   {bookmarks.length > 0 ? (
                     bookmarks.map((bm, i) => (
                       <div key={bm.id} className="animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                         <button 
                           onClick={() => jumpToBookmark(bm.position)}
                           className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--menu-hover)] rounded-xl group relative transition-colors flex justify-between items-start"
                         >
                           <div className="overflow-hidden flex-1 pr-2">
                               <div className="font-medium truncate">{bm.excerpt}</div>
                               {bm.note && <div className="text-xs text-blue-500 mt-1 italic line-clamp-1">{bm.note}</div>}
                               <div className="text-xs opacity-50 mt-0.5">{new Date(bm.createdAt).toLocaleDateString()}</div>
                           </div>
                           <div 
                              onClick={(e) => { e.stopPropagation(); onRemoveBookmark(bm.id); }}
                              className="p-2 opacity-30 hover:opacity-100 hover:text-red-400 transition-all active:scale-95"
                           >
                              <XIcon className="w-4 h-4" />
                           </div>
                         </button>
                       </div>
                     ))
                   ) : (
                     <p className="text-center opacity-50 py-8 text-sm">暂无书签</p>
                   )}
                 </>
               )}
             </div>
          </div>
        )}

        {/* Settings Popover - Adaptive Glass */}
        {showSettings && (
          <div className="absolute top-20 right-4 w-80 glass-panel-adaptive rounded-[1.5rem] p-5 shadow-2xl flex flex-col gap-5 animate-scale-in origin-top-right z-50 max-h-[70vh] overflow-y-auto">
             {/* ... settings content ... */}
             <div className="flex gap-2">
                 <div className="flex-1 bg-[var(--menu-hover)] rounded-xl p-3 flex flex-col justify-between items-start gap-2 border border-[var(--glass-border)]">
                     <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">专注模式</span>
                     <button 
                        onClick={() => setSettings(s => ({...s, focusMode: !s.focusMode}))}
                        className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all ${settings.focusMode ? 'bg-blue-500 text-white shadow-md' : 'bg-[var(--menu-active)] opacity-60'}`}
                     >
                         {settings.focusMode ? "ON" : "OFF"}
                     </button>
                 </div>
                 <div className="flex-1 bg-[var(--menu-hover)] rounded-xl p-3 flex flex-col justify-between items-start gap-2 border border-[var(--glass-border)]">
                     <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">仿生阅读</span>
                     <button 
                        onClick={() => setSettings(s => ({...s, bionicReading: !s.bionicReading}))}
                        className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all ${settings.bionicReading ? 'bg-blue-500 text-white shadow-md' : 'bg-[var(--menu-active)] opacity-60'}`}
                     >
                         {settings.bionicReading ? "ON" : "OFF"}
                     </button>
                 </div>
             </div>

             {/* AI Settings */}
             <div className="flex flex-col gap-3 pb-2 border-b border-[var(--glass-border)]">
                 <span className="text-xs font-bold uppercase tracking-wider opacity-60">AI 模型</span>
                 <div className="flex bg-[var(--menu-active)] rounded-xl p-1 text-xs font-bold">
                    <button 
                        onClick={() => setSettings(s => ({...s, aiProvider: 'gemini'}))}
                        className={`flex-1 px-3 py-2 rounded-lg transition-all ${settings.aiProvider === 'gemini' ? 'bg-white shadow-sm text-black' : 'opacity-60 hover:opacity-100'}`}
                    >
                        Gemini
                    </button>
                    <button 
                        onClick={() => setSettings(s => ({...s, aiProvider: 'deepseek'}))}
                        className={`flex-1 px-3 py-2 rounded-lg transition-all ${settings.aiProvider === 'deepseek' ? 'bg-white shadow-sm text-black' : 'opacity-60 hover:opacity-100'}`}
                    >
                        DeepSeek
                    </button>
                 </div>
                 {settings.aiProvider === 'deepseek' && (
                    <div className="space-y-2 mt-1 animate-slide-down">
                        <input 
                          type="password"
                          placeholder="API Key"
                          value={settings.aiApiKey || ''}
                          onChange={(e) => setSettings(s => ({...s, aiApiKey: e.target.value}))}
                          className="w-full px-3 py-2 text-xs bg-[var(--menu-hover)] border border-[var(--glass-border)] rounded-lg focus:outline-none focus:border-blue-500 placeholder-opacity-50"
                        />
                        <input 
                          type="text"
                          placeholder="Model Name"
                          value={settings.aiModel || 'deepseek-chat'}
                          onChange={(e) => setSettings(s => ({...s, aiModel: e.target.value}))}
                          className="w-full px-3 py-2 text-xs bg-[var(--menu-hover)] border border-[var(--glass-border)] rounded-lg focus:outline-none focus:border-blue-500 placeholder-opacity-50"
                        />
                    </div>
                 )}
             </div>

             {/* Font Size */}
             <div className="flex justify-between items-center">
               <span className="text-xs font-bold uppercase tracking-wider opacity-60">
                 {book.type === 'pdf' ? '缩放' : '字号'}
               </span>
               <div className="flex items-center gap-2 bg-[var(--menu-active)] rounded-xl p-1">
                 <button 
                   onClick={() => book.type === 'pdf' 
                      ? setSettings(s => ({...s, pdfScale: Math.max(0.1, s.pdfScale - 0.1)})) 
                      : setSettings(s => ({...s, fontSize: Math.max(12, s.fontSize - 2)}))
                   } 
                   className="w-10 h-8 flex items-center justify-center text-sm font-bold opacity-60 hover:opacity-100 hover:bg-white/50 rounded-lg transition-colors"
                 >A-</button>
                 <button 
                   onClick={() => book.type === 'pdf' 
                      ? setSettings(s => ({...s, pdfScale: Math.min(3.0, s.pdfScale + 0.1)})) 
                      : setSettings(s => ({...s, fontSize: Math.min(32, s.fontSize + 2)}))
                   } 
                   className="w-10 h-8 flex items-center justify-center text-lg font-bold opacity-60 hover:opacity-100 hover:bg-white/50 rounded-lg transition-colors"
                 >A+</button>
               </div>
             </div>

             {/* Theme (Read Only as managed in App, but keeping local toggle here as well if needed, though now redundant) */}
             <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider opacity-60">主题</span>
                <div className="flex gap-3 justify-between">
                  <button onClick={() => onThemeChange('light')} className={`w-10 h-10 rounded-full border border-gray-300 bg-[#F2F2F7] transition-transform active:scale-90 ${theme === 'light' ? 'ring-2 ring-blue-500 scale-110 shadow-md' : 'opacity-70 hover:opacity-100'}`} />
                  <button onClick={() => onThemeChange('sepia')} className={`w-10 h-10 rounded-full border border-gray-300 bg-[#F8F1E3] transition-transform active:scale-90 ${theme === 'sepia' ? 'ring-2 ring-blue-500 scale-110 shadow-md' : 'opacity-70 hover:opacity-100'}`} />
                  <button onClick={() => onThemeChange('eye-care')} className={`w-10 h-10 rounded-full border border-gray-300 bg-[#C7EDCC] transition-transform active:scale-90 ${theme === 'eye-care' ? 'ring-2 ring-blue-500 scale-110 shadow-md' : 'opacity-70 hover:opacity-100'}`} />
                  <button onClick={() => onThemeChange('dark')} className={`w-10 h-10 rounded-full border border-gray-600 bg-[#1C1C1E] transition-transform active:scale-90 ${theme === 'dark' ? 'ring-2 ring-blue-500 scale-110 shadow-md' : 'opacity-70 hover:opacity-100'}`} />
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div 
        ref={contentRef}
        onScroll={handleScroll}
        onClick={handleContentClick}
        className={`flex-1 overflow-y-auto no-scrollbar px-0 md:px-6 py-24 allow-select`}
        style={{ scrollBehavior: 'smooth' }}
      >
        {book.type === 'pdf' ? (
           <div className="flex flex-col items-center min-h-screen pb-20 animate-fade-in">
             {pdfDocument && Array.from(new Array(numPages), (el, index) => (
               <PdfPage 
                 key={`page_${index + 1}`} 
                 id={`page-${index + 1}`}
                 pageNumber={index + 1} 
                 pdf={pdfDocument} 
                 scale={settings.pdfScale} 
               />
             ))}
             {!pdfDocument && (
               <div className="flex items-center justify-center h-64 opacity-50">正在加载 PDF...</div>
             )}
           </div>
        ) : (
            <div 
                className={`
                    max-w-2xl mx-auto leading-relaxed transition-all duration-300 px-6 prose prose-lg allow-select
                    ${theme === 'dark' ? 'prose-invert' : ''} 
                    ${settings.fontFamily === 'serif' ? 'font-serif' : 'font-sans'} 
                    animate-fade-in
                    ${settings.bionicReading ? 'bionic-text' : ''}
                `}
                style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}
            >
                {book.type === 'epub' ? (
                     <div dangerouslySetInnerHTML={{ __html: displayContent }} />
                ) : (
                     <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{__html: displayContent}} />
                )}
            </div>
        )}
      </div>

      {/* Toast Notifications */}
      {showGoalToast && (
          <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
             <div className="glass-panel-adaptive px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-[var(--glass-border)]">
                 <div className="p-1.5 bg-yellow-400 rounded-full text-white shadow-lg shadow-yellow-400/20">
                     <TrophyIcon className="w-5 h-5" />
                 </div>
                 <div>
                     <p className="font-bold text-sm">目标达成!</p>
                     <p className="text-xs opacity-70">今天的阅读任务已完成</p>
                 </div>
             </div>
          </div>
      )}

      {showHighlightToast && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-scale-in">
             <div className="glass-panel-adaptive px-4 py-2 rounded-full shadow-xl flex items-center gap-2 border border-[var(--glass-border)]">
                 <BookmarkIcon filled className="w-4 h-4 text-blue-500" />
                 <span className="text-xs font-bold">已添加书签/笔记</span>
             </div>
          </div>
      )}

      {/* Selection Pill - Swipe to Open Pattern */}
      {selection && !aiPanelOpen && (
        <div 
          className="fixed z-50 flex flex-col items-center animate-scale-in origin-bottom"
          style={{ top: Math.max(60, selection.top - 60), left: selection.left, transform: 'translateX(-50%)' }}
        >
          {/* 
              Interaction: 
              1. Show small handle/pill initially.
              2. User swipes right on it (or clicks) to expand full options.
          */}
          <div 
            onTouchStart={handlePillTouchStart}
            onTouchMove={handlePillTouchMove}
            onTouchEnd={() => setTouchStart(null)}
            onClick={handlePillClick}
            className={`
                glass-panel-adaptive rounded-full shadow-2xl flex items-center
                border border-[var(--glass-border)] backdrop-blur-2xl
                transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden
                ${menuExpanded ? 'p-1.5 w-auto' : 'w-10 h-10 p-0 justify-center cursor-pointer'}
            `}
          >
            {!menuExpanded ? (
                // Collapsed State: Chevron Icon indicating "Swipe Right" or "Tap"
                <div className="opacity-60 flex items-center justify-center w-full h-full animate-pulse">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <polyline points="9 18 15 12 9 6"></polyline>
                     </svg>
                </div>
            ) : (
                // Expanded State: Full Options
                <div className="flex gap-1 animate-fade-in items-center">
                    <button 
                    onClick={(e) => { e.stopPropagation(); handleApplyHighlight(); }}
                    className="px-4 py-2 text-xs font-bold rounded-full hover:bg-[var(--menu-hover)] active:scale-95 transition-all flex items-center gap-1"
                    >
                        <div className="w-3 h-3 rounded-full bg-yellow-400 border border-black/10"></div>
                        高亮
                    </button>
                    
                    <div className="w-[1px] h-4 bg-[var(--glass-border)]"></div>
                    
                    <button 
                    onClick={(e) => { e.stopPropagation(); handleAddNote(); }}
                    className="px-4 py-2 text-xs font-bold rounded-full hover:bg-[var(--menu-hover)] active:scale-95 transition-all flex items-center gap-1"
                    >
                        <PenIcon className="w-3.5 h-3.5" />
                        笔记
                    </button>

                    <div className="w-[1px] h-4 bg-[var(--glass-border)]"></div>

                    <button 
                    onClick={(e) => { e.stopPropagation(); handleExplain(); }}
                    className="px-4 py-2 text-xs font-bold rounded-full hover:bg-[var(--menu-hover)] active:scale-95 transition-all flex items-center gap-1"
                    >
                        <SparklesIcon className="w-3.5 h-3.5 text-blue-500" />
                        AI
                    </button>
                    
                    <div className="w-[1px] h-4 bg-[var(--glass-border)]"></div>
                    
                    <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(selection.text);
                        setSelection(null);
                        window.getSelection()?.removeAllRanges();
                    }}
                    className="px-4 py-2 text-xs font-bold rounded-full hover:bg-[var(--menu-hover)] active:scale-95 transition-all"
                    >
                    复制
                    </button>
                </div>
            )}
          </div>
          
          {/* Hint for interaction if not expanded */}
          {!menuExpanded && (
              <div className="absolute -bottom-6 text-[9px] font-bold opacity-40 whitespace-nowrap bg-black/5 px-2 py-0.5 rounded-full backdrop-blur-sm">
                  向右滑动
              </div>
          )}
        </div>
      )}

      {/* Footer / Time Remaining */}
      <div className={`
        fixed bottom-0 left-0 right-0 p-6 z-40 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] pointer-events-none
        ${showControls ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}
      `}>
         {/* Uses .glass-menu for heavy blur */}
         <div className="glass-menu rounded-full px-5 py-2.5 mx-auto max-w-fit shadow-lg flex justify-center items-center gap-3">
            <span className="text-[10px] font-bold opacity-70 tracking-wider">
                {Math.round(book.progress)}%
            </span>
            <div className="w-[1px] h-3 bg-[var(--glass-border)]"></div>
            {minutesLeft > 0 && book.type !== 'pdf' ? (
                <span className="text-[10px] font-bold opacity-90 tracking-wide flex items-center gap-1.5">
                    <ClockIcon className="w-3 h-3 text-blue-500" />
                    剩余 {minutesLeft} 分钟
                </span>
            ) : (
                <span className="text-[10px] font-bold opacity-90 tracking-wide">
                   Lumina Reader
                </span>
            )}
         </div>
      </div>

      {/* AI Explanation Sheet - Adaptive Glass */}
      {aiPanelOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 transition-opacity duration-500 animate-fade-in"
            onClick={() => setAiPanelOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-slide-up">
            <div className="glass-panel-adaptive shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.2)] rounded-[2.5rem] max-w-2xl mx-auto overflow-hidden flex flex-col max-h-[70vh] border border-[var(--glass-border)]">
              <div className="flex justify-center pt-3 pb-1 cursor-pointer" onClick={() => setAiPanelOpen(false)}>
                <div className="w-12 h-1.5 bg-gray-400/40 rounded-full"></div>
              </div>
              
              <div className="p-8 pt-4 overflow-y-auto">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-100/50 rounded-[1rem] border border-blue-200/30">
                       <SparklesIcon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold tracking-tight">AI 智能解读</h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500">{settings.aiProvider === 'deepseek' ? 'DeepSeek V3' : 'Gemini Pro'}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setAiPanelOpen(false)}
                    className="p-2 bg-[var(--menu-hover)] rounded-full opacity-60 hover:opacity-100 transition-colors"
                  >
                    <XIcon className="w-6 h-6" />
                  </button>
                </div>

                {aiLoading ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-gray-400/20 rounded-full w-3/4"></div>
                    <div className="h-4 bg-gray-400/20 rounded-full w-full"></div>
                    <div className="h-4 bg-gray-400/20 rounded-full w-5/6"></div>
                    <div className="h-4 bg-gray-400/20 rounded-full w-1/2"></div>
                  </div>
                ) : (
                  <div className="prose prose-lg prose-blue text-[var(--text-color)] leading-relaxed font-serif animate-fade-in delay-100">
                    {aiExplanation.split('\n').map((line, i) => (
                      <p key={i} className="mb-3">{line}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default Reader;