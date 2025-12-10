import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Book, Bookmark, ReaderSettings, TocItem, AIProvider } from '../types';
import { ChevronLeftIcon, BookmarkIcon, SparklesIcon, XIcon, SettingsIcon, ListIcon } from './Icons';
import { explainTextWithAI } from '../services/geminiService';
import { pdfjsLib } from '../services/bookParser';

interface ReaderProps {
  book: Book;
  bookmarks: Bookmark[];
  onBack: () => void;
  onUpdateProgress: (bookId: string, progress: number) => void;
  onAddBookmark: (bookId: string, excerpt: string, position: number) => void;
  onRemoveBookmark: (bookmarkId: string) => void;
}

// Individual PDF Page Component with Lazy Loading, Error Handling, High DPI Support, and Debounce
const PdfPage = ({ pageNumber, pdf, scale, id }: { pageNumber: number, pdf: any, scale: number, id?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  
  const [inView, setInView] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false); // Debounced trigger
  const [status, setStatus] = useState<'init' | 'loading' | 'success' | 'error'>('init');
  const [retryCount, setRetryCount] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<{width: number, height: number} | null>(null);

  // Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect(); // Once in view, we commit to tracking it via the debounce logic
          }
        });
      },
      { rootMargin: '50% 0px' } // Reduced preload margin slightly to favor debounce
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [retryCount]);

  // Debounce Logic: Only load if the page stays in view (or was in view) for >200ms
  useEffect(() => {
    let timer: any;
    if (inView && !shouldLoad) {
      // Small delay to prevent loading pages during fast scrolling
      timer = setTimeout(() => {
        setShouldLoad(true);
      }, 200); 
    }
    return () => clearTimeout(timer);
  }, [inView, shouldLoad]);

  // Render Logic
  useEffect(() => {
    if (!shouldLoad || !pdf || !canvasRef.current || !textLayerRef.current) return;

    let isCancelled = false;

    const renderPage = async () => {
      // If render task exists, it means we might be retrying or re-scaling
      if (renderTaskRef.current) {
        try {
          await renderTaskRef.current.cancel();
        } catch (e) { /* ignore cancel error */ }
      }

      setStatus('loading');

      try {
        const page = await pdf.getPage(pageNumber);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        setPageDimensions({ width: viewport.width, height: viewport.height });

        // High DPI Support
        const dpr = window.devicePixelRatio || 1;
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d');

        if (!context) throw new Error("Canvas context unavailable");

        // Set dimensions for high resolution
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        
        // Style dimensions match the CSS viewport
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          transform: [dpr, 0, 0, dpr, 0, 0] // Scale transform for context
        };

        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;

        if (isCancelled) return;

        // Text Layer
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
        height: pageDimensions ? pageDimensions.height : (scale * 800), // Approximate height placeholder
        minHeight: '200px',
        maxWidth: '100%'
      }}
    >
      {/* Loading State */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Error State */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 z-10 p-4 text-center">
          <p className="text-red-500 text-sm font-medium mb-2">加载失败</p>
          <button 
            onClick={handleRetry}
            className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg shadow-sm text-xs active:scale-95 transition-transform"
          >
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
  onRemoveBookmark 
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{text: string, top: number, left: number} | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuTab, setMenuTab] = useState<'toc' | 'bookmarks'>('toc');

  // Reader Settings
  const [settings, setSettings] = useState<ReaderSettings>({
    theme: 'light',
    fontSize: 18,
    fontFamily: 'serif',
    lineHeight: 1.6,
    pdfScale: 1.0,
    aiProvider: 'gemini',
    aiApiKey: '',
  });

  const [inputPage, setInputPage] = useState("1");
  
  // PDF State
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);

  // Initialize PDF
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

          // Auto-Fit Logic
          try {
             const page = await pdf.getPage(1);
             const viewport = page.getViewport({ scale: 1 });
             const containerWidth = window.innerWidth;
             const padding = 32;
             const availableWidth = containerWidth - padding;
             let fitScale = availableWidth / viewport.width;
             if (fitScale > 2.5) fitScale = 2.5; 
             setSettings(prev => ({ ...prev, pdfScale: fitScale }));
          } catch (e) {
             console.warn("Failed to calculate auto-fit scale", e);
          }

        } catch (error) {
          console.error("Error loading PDF in reader:", error);
        }
      };
      loadPdf();
    }
  }, [book]);

  // Scroll Progress Tracking
  const handleScroll = useCallback(() => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      const progress = (scrollTop / (scrollHeight - clientHeight)) * 100;
      if (Math.abs(progress - book.progress) > 1) {
        onUpdateProgress(book.id, progress);
      }
    }
  }, [book.id, book.progress, onUpdateProgress]);

  // Handle Text Selection
  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelection({
        text: sel.toString(),
        top: rect.top, 
        left: rect.left + (rect.width / 2)
      });
      return;
    }
    setSelection(null);
  };

  const handleContentClick = () => {
    if (!selection) {
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
    window.getSelection()?.removeAllRanges(); 

    const explanation = await explainTextWithAI(
      selection.text, 
      undefined, 
      {
        provider: settings.aiProvider,
        apiKey: settings.aiApiKey
      }
    );
    setAiExplanation(explanation);
    setAiLoading(false);
  };

  const handleBookmark = () => {
    const excerpt = book.title + " - " + Math.round(book.progress) + "%";
    onAddBookmark(book.id, excerpt, book.progress);
  };

  const jumpToPage = (page: number) => {
    if (book.type !== 'pdf') return;
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth' });
    }
    setShowControls(false);
    setShowMenu(false);
  };

  const jumpToBookmark = (position: number) => {
    if (contentRef.current) {
        const { scrollHeight, clientHeight } = contentRef.current;
        const scrollTop = (position / 100) * (scrollHeight - clientHeight);
        contentRef.current.scrollTo({ top: scrollTop, behavior: 'smooth' });
    }
    setShowMenu(false);
  };

  const getThemeStyles = () => {
    switch (settings.theme) {
      case 'sepia': return 'bg-[#F4ECD8] text-[#5B4636]';
      case 'dark': return 'bg-[#1a1a1a] text-[#d1d5db]';
      default: return 'bg-[#F2F2F7] text-gray-800';
    }
  };

  return (
    <div className={`relative h-screen flex flex-col overflow-hidden ${getThemeStyles()} transition-colors duration-300`}>
      
      {/* Header */}
      <div className={`
        fixed top-0 left-0 right-0 z-40 p-4 transition-all duration-300 ease-in-out
        ${showControls ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}
      `}>
        <div className="glass-panel rounded-full px-4 py-3 flex justify-between items-center shadow-sm">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100/50">
            <ChevronLeftIcon className="text-current" />
          </button>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setShowMenu(!showMenu)} 
              className="p-2 rounded-full hover:bg-gray-100/50 text-current"
            >
              <ListIcon />
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className="p-2 rounded-full hover:bg-gray-100/50 text-current"
            >
              <SettingsIcon />
            </button>
            <button 
              onClick={handleBookmark} 
              className="p-2 -mr-2 rounded-full hover:bg-gray-100/50 text-current"
            >
              <BookmarkIcon />
            </button>
          </div>
        </div>

        {/* Menu (ToC & Bookmarks) */}
        {showMenu && (
          <div className="absolute top-20 left-4 w-72 glass-panel rounded-2xl p-0 shadow-xl overflow-hidden flex flex-col max-h-[60vh] animate-in fade-in slide-in-from-top-2 z-50">
             <div className="flex border-b border-gray-200/50">
                <button 
                  onClick={() => setMenuTab('toc')}
                  className={`flex-1 py-3 text-sm font-medium ${menuTab === 'toc' ? 'bg-black/5 text-black' : 'text-gray-500 hover:bg-black/5'}`}
                >
                  目录
                </button>
                <button 
                  onClick={() => setMenuTab('bookmarks')}
                  className={`flex-1 py-3 text-sm font-medium ${menuTab === 'bookmarks' ? 'bg-black/5 text-black' : 'text-gray-500 hover:bg-black/5'}`}
                >
                  书签
                </button>
             </div>
             <div className="overflow-y-auto flex-1 p-2">
               {menuTab === 'toc' ? (
                 <div className="space-y-1">
                    {book.toc && book.toc.length > 0 ? (
                      book.toc.map((item, i) => (
                        <div key={i}>
                           <button 
                              onClick={() => item.page && jumpToPage(item.page)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-black/5 rounded-lg truncate"
                              disabled={!item.page} 
                              style={{ opacity: item.page ? 1 : 0.6 }}
                            >
                              {item.label}
                              {item.page && <span className="float-right text-gray-400 text-xs">p. {item.page}</span>}
                           </button>
                           {item.children?.map((child, j) => (
                             <button 
                                key={`${i}-${j}`}
                                onClick={() => child.page && jumpToPage(child.page)}
                                className="w-full text-left pl-6 pr-3 py-2 text-sm text-gray-600 hover:bg-black/5 rounded-lg truncate"
                                disabled={!child.page}
                             >
                               {child.label}
                               {child.page && <span className="float-right text-gray-400 text-xs">p. {child.page}</span>}
                             </button>
                           ))}
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-gray-400 py-4 text-sm">暂无目录</p>
                    )}
                 </div>
               ) : (
                 <div className="space-y-1">
                   {bookmarks.length > 0 ? (
                     bookmarks.map((bm) => (
                       <button 
                         key={bm.id}
                         onClick={() => jumpToBookmark(bm.position)}
                         className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-black/5 rounded-lg group relative"
                       >
                         <div className="font-medium truncate">{bm.excerpt}</div>
                         <div className="text-xs text-gray-400 mt-1">{new Date(bm.createdAt).toLocaleDateString()}</div>
                         <button 
                            onClick={(e) => { e.stopPropagation(); onRemoveBookmark(bm.id); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                         >
                            <XIcon className="w-4 h-4" />
                         </button>
                       </button>
                     ))
                   ) : (
                     <p className="text-center text-gray-400 py-4 text-sm">暂无书签</p>
                   )}
                 </div>
               )}
             </div>
          </div>
        )}

        {/* Settings Popover */}
        {showSettings && (
          <div className="absolute top-20 right-4 w-80 glass-panel rounded-2xl p-4 shadow-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 z-50 text-gray-800 max-h-[70vh] overflow-y-auto">
             
             {/* Section: AI Settings */}
             <div className="flex flex-col gap-2 border-b border-gray-200/50 pb-4">
                 <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">AI 模型</span>
                 <div className="flex bg-gray-200/50 rounded-lg p-1 text-xs font-medium">
                    <button 
                        onClick={() => setSettings(s => ({...s, aiProvider: 'gemini'}))}
                        className={`flex-1 px-3 py-1.5 rounded ${settings.aiProvider === 'gemini' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
                    >
                        Gemini
                    </button>
                    <button 
                        onClick={() => setSettings(s => ({...s, aiProvider: 'deepseek'}))}
                        className={`flex-1 px-3 py-1.5 rounded ${settings.aiProvider === 'deepseek' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
                    >
                        DeepSeek
                    </button>
                 </div>
                 {settings.aiProvider === 'deepseek' && (
                    <input 
                      type="password"
                      placeholder="输入 DeepSeek API Key"
                      value={settings.aiApiKey || ''}
                      onChange={(e) => setSettings(s => ({...s, aiApiKey: e.target.value}))}
                      className="w-full mt-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                 )}
                 {settings.aiProvider === 'deepseek' && (
                    <p className="text-[10px] text-gray-400">注意: 浏览器端直接调用 DeepSeek 可能受 CORS 限制。</p>
                 )}
             </div>

             {/* Section: Display */}
             <div className="flex justify-between items-center">
               <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                 {book.type === 'pdf' ? '缩放' : '字号'}
               </span>
               <div className="flex items-center gap-1 bg-gray-200/50 rounded-lg p-1">
                 <button 
                   onClick={() => book.type === 'pdf' 
                      ? setSettings(s => ({...s, pdfScale: Math.max(0.1, s.pdfScale - 0.1)})) 
                      : setSettings(s => ({...s, fontSize: Math.max(12, s.fontSize - 2)}))
                   } 
                   className="w-10 h-8 flex items-center justify-center text-sm font-bold text-gray-700 hover:bg-white/50 rounded"
                 >A-</button>
                 <button 
                   onClick={() => book.type === 'pdf' 
                      ? setSettings(s => ({...s, pdfScale: Math.min(3.0, s.pdfScale + 0.1)})) 
                      : setSettings(s => ({...s, fontSize: Math.min(32, s.fontSize + 2)}))
                   } 
                   className="w-10 h-8 flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-white/50 rounded"
                 >A+</button>
               </div>
             </div>

             <div className="flex justify-between items-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">主题</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setSettings(s => ({...s, theme: 'light'}))}
                    className={`w-6 h-6 rounded-full border border-gray-300 bg-white ${settings.theme === 'light' ? 'ring-2 ring-blue-500' : ''}`}
                  />
                  <button 
                    onClick={() => setSettings(s => ({...s, theme: 'sepia'}))}
                    className={`w-6 h-6 rounded-full border border-gray-300 bg-[#F4ECD8] ${settings.theme === 'sepia' ? 'ring-2 ring-blue-500' : ''}`}
                  />
                  <button 
                    onClick={() => setSettings(s => ({...s, theme: 'dark'}))}
                    className={`w-6 h-6 rounded-full border border-gray-600 bg-[#1a1a1a] ${settings.theme === 'dark' ? 'ring-2 ring-blue-500' : ''}`}
                  />
                </div>
             </div>
             
             {book.type !== 'pdf' && (
                 <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">字体</span>
                    <div className="flex bg-gray-200/50 rounded-lg p-1 text-xs font-medium">
                        <button 
                            onClick={() => setSettings(s => ({...s, fontFamily: 'serif'}))}
                            className={`px-3 py-1.5 rounded ${settings.fontFamily === 'serif' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                        >
                            宋体
                        </button>
                        <button 
                            onClick={() => setSettings(s => ({...s, fontFamily: 'sans'}))}
                            className={`px-3 py-1.5 rounded ${settings.fontFamily === 'sans' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                        >
                            黑体
                        </button>
                    </div>
                 </div>
             )}

             {book.type === 'pdf' && (
                <div className="pt-2 border-t border-gray-200/50">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex-1">跳转至页码</span>
                        <input 
                          type="number" 
                          min="1" 
                          max={numPages}
                          value={inputPage}
                          onChange={(e) => setInputPage(e.target.value)}
                          className="w-16 px-2 py-1 rounded bg-gray-100 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button 
                          onClick={() => jumpToPage(parseInt(inputPage))}
                          className="text-blue-600 text-sm font-medium hover:underline"
                        >
                          前往
                        </button>
                    </div>
                </div>
             )}

          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div 
        ref={contentRef}
        onScroll={handleScroll}
        onMouseUp={handleMouseUp}
        onClick={handleContentClick}
        className="flex-1 overflow-y-auto no-scrollbar px-0 md:px-6 py-24 selection:bg-blue-200 selection:text-blue-900"
        style={{ scrollBehavior: 'smooth' }}
      >
        {book.type === 'pdf' ? (
           <div className="flex flex-col items-center min-h-screen pb-20">
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
            className={`max-w-2xl mx-auto leading-relaxed whitespace-pre-wrap transition-all duration-300 px-6 ${settings.fontFamily === 'serif' ? 'font-serif' : 'font-sans'}`}
            style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}
          >
            {book.content}
          </div>
        )}
      </div>

      {/* Selection Tooltip */}
      {selection && !aiPanelOpen && (
        <div 
          className="fixed z-50 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200"
          style={{ top: Math.max(20, selection.top - 60), left: selection.left, transform: 'translateX(-50%)' }}
        >
          <div className="glass-panel-dark backdrop-blur-xl rounded-xl shadow-2xl p-1.5 flex gap-1">
            <button 
              onClick={handleExplain}
              className="flex items-center gap-2 px-3 py-2 text-white text-sm font-medium rounded-lg hover:bg-white/10 active:scale-95 transition-all"
            >
              <SparklesIcon className="w-4 h-4 text-yellow-400" />
              <span>AI 解释</span>
            </button>
            <div className="w-[1px] bg-white/20 my-2"></div>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(selection.text);
                setSelection(null);
              }}
              className="px-3 py-2 text-white text-sm font-medium rounded-lg hover:bg-white/10"
            >
              复制
            </button>
          </div>
          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-zinc-800/80 mt-[-1px]"></div>
        </div>
      )}

      {/* Footer / Progress */}
      <div className={`
        fixed bottom-0 left-0 right-0 p-6 z-40 transition-all duration-300 ease-in-out pointer-events-none
        ${showControls ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}
      `}>
        <div className="text-center text-xs opacity-40 font-medium tracking-widest mb-2 shadow-sm mix-blend-difference text-white">
          {Math.round(book.progress)}% 已读
        </div>
      </div>

      {/* AI Explanation Sheet */}
      {aiPanelOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 transition-opacity duration-300"
            onClick={() => setAiPanelOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-bottom duration-300">
            <div className="glass-panel bg-white/90 shadow-2xl rounded-[2rem] max-w-2xl mx-auto overflow-hidden flex flex-col max-h-[60vh]">
              <div className="flex justify-center pt-3 pb-1 cursor-pointer" onClick={() => setAiPanelOpen(false)}>
                <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
              </div>
              
              <div className="p-6 pt-2 overflow-y-auto">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-full">
                       <SparklesIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">AI 解读 ({settings.aiProvider === 'deepseek' ? 'DeepSeek' : 'Gemini'})</h3>
                  </div>
                  <button 
                    onClick={() => setAiPanelOpen(false)}
                    className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200"
                  >
                    <XIcon className="w-5 h-5" />
                  </button>
                </div>

                {aiLoading ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ) : (
                  <div className="prose prose-sm prose-blue text-gray-600 leading-relaxed font-serif">
                    {aiExplanation.split('\n').map((line, i) => (
                      <p key={i} className="mb-2">{line}</p>
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