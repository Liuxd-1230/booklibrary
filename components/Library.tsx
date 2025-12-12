import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Book } from '../types';
import { PlusIcon, BookIcon, FolderIcon, ChevronLeftIcon, FlameIcon, TrophyIcon, SparklesIcon, PaletteIcon } from './Icons';
import { getReadingStats, ReadingStats } from '../services/statsService';

interface LibraryProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
  onAddBook: (file: File) => void;
  onOrganizeLibrary: () => void;
  onMoveBook: (bookId: string, newCategory: string) => void;
  onUpdateBook: (book: Book) => void;
  isOrganizing: boolean;
  currentTheme: 'light' | 'sepia' | 'dark' | 'eye-care';
  onThemeChange: (theme: 'light' | 'sepia' | 'dark' | 'eye-care') => void;
}

type ViewMode = 'all' | 'folders';

const COLORS = ['blue', 'red', 'green', 'purple', 'orange', 'gray'];

const getGradient = (color: string) => {
  switch(color) {
    case 'blue': return 'bg-gradient-to-br from-[#4A90E2] to-[#007AFF]';
    case 'red': return 'bg-gradient-to-br from-[#FF5E3A] to-[#FF2A68]';
    case 'green': return 'bg-gradient-to-br from-[#34C759] to-[#30B453]';
    case 'purple': return 'bg-gradient-to-br from-[#AF52DE] to-[#5856D6]';
    case 'orange': return 'bg-gradient-to-br from-[#FF9500] to-[#FF3B30]';
    case 'gray': return 'bg-gradient-to-br from-[#8E8E93] to-[#636366]';
    default: return 'bg-gradient-to-br from-[#8E8E93] to-[#636366]';
  }
};

const getShadowColor = (color: string) => {
    switch(color) {
        case 'blue': return 'shadow-blue-500/20';
        case 'red': return 'shadow-red-500/20';
        case 'green': return 'shadow-green-500/20';
        case 'purple': return 'shadow-purple-500/20';
        case 'orange': return 'shadow-orange-500/20';
        default: return 'shadow-gray-500/20';
    }
};

// Book Card Component
const BookCard: React.FC<{ 
    book: Book; 
    onClick: (book: Book) => void; 
    draggable?: boolean; 
    onDragStart?: (e: React.DragEvent, bookId: string) => void;
    onTouchStart?: (e: React.TouchEvent, book: Book) => void;
    selected?: boolean;
    selectionMode?: boolean;
    onColorChange?: (book: Book) => void;
}> = ({ book, onClick, draggable, onDragStart, onTouchStart, selected, selectionMode, onColorChange }) => (
  <div 
      onClick={() => onClick(book)}
      draggable={draggable && !selectionMode}
      onDragStart={(e) => onDragStart && onDragStart(e, book.id)}
      onTouchStart={(e) => onTouchStart && onTouchStart(e, book)}
      className={`group relative flex flex-col items-center cursor-pointer perspective-1000 animate-scale-in ${selectionMode ? 'active:scale-95' : ''}`}
      style={{ touchAction: 'none' }} 
  >
      <div className={`
      w-full aspect-[2/3] rounded-2xl shadow-[0_10px_20px_-5px_rgba(0,0,0,0.15)] 
      relative overflow-hidden mb-4
      transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
      ${selectionMode ? '' : 'group-hover:-translate-y-3 group-hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.3)] group-hover:scale-[1.03]'}
      book-card-border
      ${!book.coverImage ? getGradient(book.coverColor) : 'bg-gray-200'}
      ${selected ? 'ring-4 ring-blue-500 ring-offset-2' : ''}
      `}>
          {book.coverImage ? (
              <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover" />
          ) : (
              <>
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-white/10 opacity-80"></div>
                <div className="absolute inset-0 flex items-center justify-center p-4">
                    <div className="text-center text-white drop-shadow-lg">
                    <h3 className="font-serif font-bold text-lg leading-snug line-clamp-3 mb-2 tracking-wide">
                        {book.title}
                    </h3>
                    <p className="text-[10px] opacity-90 font-sans uppercase tracking-[0.2em] line-clamp-1">
                        {book.author}
                    </p>
                    </div>
                </div>
              </>
          )}
          
          {selectionMode && selected && (
              <div className="absolute inset-0 bg-blue-500/30 flex items-center justify-center">
                  <div className="bg-blue-500 text-white rounded-full p-2">
                      <PlusIcon className="w-6 h-6" />
                  </div>
              </div>
          )}
          
          {/* Color Picker Button */}
          {!selectionMode && onColorChange && (
               <button 
                  onClick={(e) => { e.stopPropagation(); onColorChange(book); }}
                  className="absolute bottom-2 right-2 p-2 rounded-full bg-black/20 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/40 z-10"
                  title="更改颜色"
               >
                   <PaletteIcon className="w-4 h-4" />
               </button>
          )}
      
          {/* Progress Bar with Glass Effect */}
          {!selected && (
            <div className="absolute bottom-3 left-3 right-3 h-1.5 bg-black/20 rounded-full overflow-hidden backdrop-blur-md border border-white/10 pointer-events-none">
                <div 
                className="h-full bg-white/90 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]" 
                style={{ width: `${book.progress}%` }}
                />
            </div>
          )}
      </div>

      <div className="text-center w-full px-1">
      <p className="text-[15px] font-semibold text-[var(--text-color)] truncate tracking-tight">{book.title}</p>
      <p className="text-xs opacity-60 mt-1 font-medium">{Math.round(book.progress)}% 已读</p>
      </div>
  </div>
);

const Library: React.FC<LibraryProps> = ({ books, onSelectBook, onAddBook, onOrganizeLibrary, onMoveBook, onUpdateBook, isOrganizing, currentTheme, onThemeChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('folders');
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [stats, setStats] = useState<ReadingStats>(getReadingStats());
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  
  // Selection Mode State for "New Folder" flow
  const [selectionMode, setSelectionMode] = useState<{ active: boolean; targetFolder: string } | null>(null);

  // Mobile Drag State
  const [dragState, setDragState] = useState<{
      isDragging: boolean;
      book: Book | null;
      x: number;
      y: number;
      startX: number;
      startY: number;
  } | null>(null);
  const longPressTimer = useRef<any>(null);

  useEffect(() => {
    setStats(getReadingStats());
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onAddBook(e.target.files[0]);
      e.target.value = '';
    }
  };

  const categories = useMemo<{ [key: string]: Book[] }>(() => {
    const groups: { [key: string]: Book[] } = {};
    books.forEach(book => {
      const cat = book.category || "未分类";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(book);
    });
    return groups;
  }, [books]);

  const handleCycleColor = (book: Book) => {
      const currentIndex = COLORS.indexOf(book.coverColor);
      const nextIndex = (currentIndex + 1) % COLORS.length;
      const nextColor = COLORS[nextIndex];
      onUpdateBook({ ...book, coverColor: nextColor });
  };

  // --- Desktop Drag & Drop ---
  const handleDragStart = (e: React.DragEvent, bookId: string) => {
    e.dataTransfer.setData("bookId", bookId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, folderName: string) => {
    e.preventDefault();
    setDragOverFolder(folderName);
  };

  const handleDragLeave = () => {
     setDragOverFolder(null);
  };

  const handleDrop = (e: React.DragEvent, folderName: string) => {
    e.preventDefault();
    setDragOverFolder(null);
    const bookId = e.dataTransfer.getData("bookId");
    if (bookId) {
       onMoveBook(bookId, folderName);
    }
  };
  
  const handleCreateFolderDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverFolder(null);
      const bookId = e.dataTransfer.getData("bookId");
      if (bookId) {
          const name = prompt("请输入新文件夹名称:");
          if (name && name.trim()) {
              onMoveBook(bookId, name.trim());
          }
      }
  };

  const initiateCreateFolderFlow = () => {
      const name = prompt("请输入新文件夹名称:");
      if (name && name.trim()) {
          setSelectionMode({ active: true, targetFolder: name.trim() });
      }
  };

  const handleBookClick = (book: Book) => {
      if (selectionMode?.active) {
          onMoveBook(book.id, selectionMode.targetFolder);
      } else {
          onSelectBook(book);
      }
  };

  // --- Mobile Touch Drag Logic ---
  const handleTouchStart = (e: React.TouchEvent, book: Book) => {
      if (selectionMode?.active) return; // Disable drag in selection mode

      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;

      longPressTimer.current = setTimeout(() => {
          setDragState({
              isDragging: true,
              book,
              x: startX,
              y: startY,
              startX,
              startY
          });
          if (navigator.vibrate) navigator.vibrate(50);
      }, 500); 
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);

      if (dragState && dragState.isDragging) {
          const touch = e.changedTouches[0];
          const element = document.elementFromPoint(touch.clientX, touch.clientY);
          
          if (element) {
              const folderTarget = element.closest('[data-folder-name]');
              if (folderTarget) {
                  const folderName = folderTarget.getAttribute('data-folder-name');
                  if (folderName && dragState.book) {
                      if (folderName === '__new__') {
                           const name = prompt("请输入新文件夹名称:");
                           if (name && name.trim()) onMoveBook(dragState.book.id, name.trim());
                      } else {
                           onMoveBook(dragState.book.id, folderName);
                      }
                  }
              }
          }
      }
      setDragState(null);
  };

  useEffect(() => {
      const moveHandler = (e: TouchEvent) => {
          if (dragState?.isDragging) {
              e.preventDefault();
              setDragState(prev => prev ? ({ ...prev, x: e.touches[0].clientX, y: e.touches[0].clientY }) : null);
          }
      };
      const endHandler = (e: TouchEvent) => {
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
          if (dragState?.isDragging) {
            const touch = e.changedTouches[0];
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            if (element && dragState.book) {
                const folderTarget = element.closest('[data-folder-name]');
                if (folderTarget) {
                    const folderName = folderTarget.getAttribute('data-folder-name');
                    if (folderName) {
                         if (folderName === '__new__') {
                             setTimeout(() => {
                                 const name = prompt("请输入新文件夹名称:");
                                 if (name && name.trim()) onMoveBook(dragState.book!.id, name.trim());
                             }, 50);
                         } else {
                             onMoveBook(dragState.book.id, folderName);
                         }
                    }
                }
            }
          }
          setDragState(null);
      };

      if (dragState?.isDragging) {
        window.addEventListener('touchmove', moveHandler, { passive: false });
        window.addEventListener('touchend', endHandler);
      }
      return () => {
          window.removeEventListener('touchmove', moveHandler);
          window.removeEventListener('touchend', endHandler);
      };
  }, [dragState, onMoveBook]);

  return (
    <div className="min-h-screen p-6 pb-24 overflow-y-auto transition-colors duration-500">
      
      {/* Selection Mode Header */}
      {selectionMode?.active && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white p-4 shadow-lg animate-slide-down flex justify-between items-center">
              <div>
                  <h3 className="font-bold">选择书籍</h3>
                  <p className="text-xs opacity-80">点击书籍将其移动到 "{selectionMode.targetFolder}"</p>
              </div>
              <button 
                onClick={() => setSelectionMode(null)}
                className="bg-white/20 px-4 py-2 rounded-full text-xs font-bold hover:bg-white/30"
              >
                  完成
              </button>
          </div>
      )}

      {/* Mobile Drag Ghost Element */}
      {dragState?.isDragging && dragState.book && (
          <div 
             className="fixed z-[9999] pointer-events-none w-24 h-32 rounded-lg shadow-2xl opacity-90 overflow-hidden border-2 border-blue-500"
             style={{ 
                 top: dragState.y - 60, 
                 left: dragState.x - 40,
                 transform: 'rotate(5deg) scale(1.1)' 
             }}
          >
              {dragState.book.coverImage ? (
                  <img src={dragState.book.coverImage} className="w-full h-full object-cover" />
              ) : (
                  <div className={`w-full h-full ${getGradient(dragState.book.coverColor)}`} />
              )}
          </div>
      )}

      {/* Header & Stats Dashboard */}
      <header className={`flex flex-col gap-8 mb-10 mt-4 px-4 animate-slide-down transition-opacity ${selectionMode?.active ? 'opacity-20 pointer-events-none' : ''}`}>
        <div className="flex justify-between items-start">
             <div>
                <h2 className="text-xs font-bold opacity-60 uppercase tracking-[0.2em] mb-2">今日阅读</h2>
                <h1 className="text-3xl font-bold tracking-tight flex items-baseline gap-2">
                    <span className="text-4xl bg-clip-text text-transparent bg-gradient-to-r from-[var(--text-color)] to-gray-500">{Math.round(stats.dailyMinutes)}</span>
                    <span className="text-lg font-medium opacity-60">/ {stats.dailyGoal} 分钟</span>
                </h1>
             </div>
             
             <div className="flex items-center gap-4">
                 {/* Theme Toggles */}
                 <div className="flex bg-[var(--menu-active)] rounded-full p-1 border border-[var(--glass-border)]">
                    <button onClick={() => onThemeChange('light')} className={`w-6 h-6 rounded-full border border-gray-200 bg-[#F2F2F7] ${currentTheme === 'light' ? 'ring-2 ring-blue-500 shadow-sm' : 'opacity-70'}`} title="Light"></button>
                    <button onClick={() => onThemeChange('sepia')} className={`w-6 h-6 rounded-full border border-orange-200 bg-[#F8F1E3] ml-1 ${currentTheme === 'sepia' ? 'ring-2 ring-blue-500 shadow-sm' : 'opacity-70'}`} title="Sepia"></button>
                    <button onClick={() => onThemeChange('eye-care')} className={`w-6 h-6 rounded-full border border-green-200 bg-[#C7EDCC] ml-1 ${currentTheme === 'eye-care' ? 'ring-2 ring-blue-500 shadow-sm' : 'opacity-70'}`} title="Eye Care"></button>
                    <button onClick={() => onThemeChange('dark')} className={`w-6 h-6 rounded-full border border-gray-600 bg-[#1C1C1E] ml-1 ${currentTheme === 'dark' ? 'ring-2 ring-blue-500 shadow-sm' : 'opacity-70'}`} title="Dark"></button>
                 </div>

                 <div className="flex flex-col items-center justify-center glass-panel-adaptive px-4 py-2.5 rounded-[1.25rem]">
                     <div className="flex items-center gap-1.5 text-orange-500 mb-0.5">
                         <FlameIcon filled className="w-4 h-4 drop-shadow-sm" />
                         <span className="text-xl font-bold leading-none">{stats.streak}</span>
                     </div>
                     <span className="text-[9px] font-bold opacity-60 uppercase tracking-widest">天连读</span>
                 </div>
             </div>
        </div>
        
        {/* Navigation Bar */}
        <div className="flex justify-between items-end">
             <div className="flex items-center gap-2">
              {activeFolder ? (
                  <button 
                    onClick={() => setActiveFolder(null)}
                    className="flex items-center gap-1 text-2xl font-bold hover:opacity-70 transition-colors animate-scale-in origin-left"
                  >
                     <ChevronLeftIcon className="w-7 h-7 text-blue-500" />
                     {activeFolder}
                  </button>
              ) : (
                  <div className="glass-panel-adaptive p-1.5 rounded-xl flex text-xs font-semibold shadow-sm">
                    <button 
                        onClick={() => setViewMode('folders')}
                        className={`px-4 py-2 rounded-lg transition-all duration-300 ${viewMode === 'folders' ? 'bg-[var(--menu-active)] shadow-sm scale-100' : 'opacity-60 hover:opacity-100'}`}
                    >
                        文件夹
                    </button>
                    <button 
                        onClick={() => setViewMode('all')}
                        className={`px-4 py-2 rounded-lg transition-all duration-300 ${viewMode === 'all' ? 'bg-[var(--menu-active)] shadow-sm scale-100' : 'opacity-60 hover:opacity-100'}`}
                    >
                        全部
                    </button>
                  </div>
              )}
            </div>

            <div className="flex gap-2">
                {!activeFolder && (
                    <button 
                        onClick={onOrganizeLibrary}
                        disabled={isOrganizing}
                        className={`glass-panel-adaptive px-4 h-11 rounded-full flex items-center gap-2 justify-center text-blue-500 shadow-lg active:scale-95 transition-all duration-300 shrink-0 ${isOrganizing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {/* Improved Sparkles Icon */}
                        <SparklesIcon className={`w-5 h-5 flex-shrink-0 ${isOrganizing ? 'animate-spin' : ''}`} />
                        <span className="text-xs font-bold hidden md:inline whitespace-nowrap">{isOrganizing ? '整理中...' : 'AI 整理'}</span>
                    </button>
                )}

                 <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="glass-panel-adaptive w-11 h-11 rounded-full flex items-center justify-center text-blue-500 shadow-lg active:scale-90 transition-all duration-300"
                    title="导入书籍"
                >
                    <PlusIcon className="w-6 h-6" />
                </button>
            </div>
        </div>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".txt,.md,.markdown,.epub,.pdf"
          onChange={handleFileChange} 
        />
      </header>

      {books.length === 0 && (
        <div className="flex flex-col items-center justify-center h-[50vh] opacity-40 animate-fade-in">
          <div className="w-24 h-24 rounded-[2rem] glass-panel-adaptive flex items-center justify-center mb-6 shadow-xl">
             <BookIcon className="w-10 h-10" />
          </div>
          <p className="text-xl font-medium mb-2">书库为空</p>
          <p className="text-sm">请导入 .epub, .pdf, 或 .txt 开始阅读。</p>
        </div>
      )}

      {/* Grid Content */}
      <div className={`px-1 min-h-[400px] ${selectionMode?.active ? 'pt-16' : ''}`}>
        
        {/* CASE 1: Active Folder View (Drill Down) */}
        {activeFolder && categories[activeFolder] && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-12 animate-fade-in">
                {categories[activeFolder].map(book => (
                    <BookCard 
                        key={book.id} 
                        book={book} 
                        onClick={handleBookClick} 
                        draggable 
                        onDragStart={handleDragStart}
                        onTouchStart={handleTouchStart}
                        selectionMode={!!selectionMode}
                        selected={selectionMode ? book.category === selectionMode.targetFolder : false}
                        onColorChange={handleCycleColor}
                    />
                ))}
            </div>
        )}

        {/* CASE 2: Folders Overview */}
        {!activeFolder && viewMode === 'folders' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-fade-in pb-20">
                {/* Regular Categories - With Enhanced Hover Expansion */}
                {Object.entries(categories).map(([category, categoryBooks], idx) => {
                    const avgProgress = categoryBooks.reduce((acc, b) => acc + b.progress, 0) / (categoryBooks.length || 1);
                    const isDragOver = dragOverFolder === category;
                    
                    // Determine folder tint based on the first book's color
                    const firstBookColor = categoryBooks[0]?.coverColor || 'gray';
                    // Map color name to a subtle bg tint class
                    const tintClass = {
                        'blue': 'bg-blue-500/5',
                        'red': 'bg-red-500/5',
                        'green': 'bg-green-500/5',
                        'purple': 'bg-purple-500/5',
                        'orange': 'bg-orange-500/5',
                        'gray': 'bg-gray-500/5',
                    }[firstBookColor] || 'bg-white/0';
                    
                    const borderHoverClass = {
                        'blue': 'group-hover:border-blue-300',
                        'red': 'group-hover:border-red-300',
                        'green': 'group-hover:border-green-300',
                        'purple': 'group-hover:border-purple-300',
                        'orange': 'group-hover:border-orange-300',
                        'gray': 'group-hover:border-gray-300',
                    }[firstBookColor] || 'group-hover:border-[var(--glass-border)]';

                    return (
                    <div 
                        key={category} 
                        data-folder-name={category}
                        onDragOver={(e) => handleDragOver(e, category)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, category)}
                        className={`
                            relative aspect-square group z-0 hover:z-20
                            ${isDragOver ? 'scale-105' : ''}
                        `}
                        style={{ animationDelay: `${idx * 50}ms` }}
                    >
                        {/* 
                          Container logic: 
                          - Default: fits in grid cell (inset-0)
                          - Hover: Expands height (min-h-[120%]) to allow books to fan out above while keeping text at bottom inside.
                        */}
                        <div 
                           onClick={() => selectionMode?.active ? null : setActiveFolder(category)}
                           className={`
                              absolute top-0 left-0 right-0 
                              h-full
                              min-h-full
                              group-hover:h-auto group-hover:min-h-[125%] group-hover:shadow-2xl
                              rounded-[1.5rem] p-4
                              transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
                              glass-panel-adaptive
                              flex flex-col
                              cursor-pointer
                              ${tintClass}
                              ${borderHoverClass}
                              ${isDragOver ? 'bg-blue-500/20 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]' : ''}
                        `}>
                             {/* Folder Icon / Book Stack Container */}
                             <div className="w-full relative flex-1">
                                 {categoryBooks.slice(0, 4).map((book, idx) => {
                                     return (
                                         <div 
                                            key={idx} 
                                            className={`
                                                absolute left-0 w-full rounded-lg 
                                                shadow-sm border border-white/20 origin-bottom
                                                transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
                                                ${!book.coverImage ? getGradient(book.coverColor) : 'bg-gray-200'}
                                            `}
                                            style={{
                                                // Default State: Stacked
                                                zIndex: 4 - idx,
                                                top: `${idx * 8}%`, 
                                                height: '65%',
                                                transform: `scale(${1 - idx * 0.05})`,
                                            }}
                                         >
                                            {book.coverImage && <img src={book.coverImage} className="w-full h-full object-cover rounded-lg" />}
                                            
                                            {/* Hover State: Vertical Accordion Fan Out */}
                                            <style>{`
                                                .group:hover .absolute:nth-child(${idx + 1}) {
                                                    top: ${idx * 28}%; /* Spread out vertically more */
                                                    height: 55%; 
                                                    transform: scale(1);
                                                    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
                                                }
                                            `}</style>
                                         </div>
                                     );
                                 })}
                                 {categoryBooks.length === 0 && (
                                     <div className="w-full h-full flex items-center justify-center opacity-30">
                                        <FolderIcon />
                                     </div>
                                 )}
                             </div>

                             {/* Text Content - Resides at the bottom of the glass panel */}
                             <div className="mt-auto text-center px-1 z-10 pt-4">
                                <h3 className="font-semibold text-[var(--text-color)] text-base tracking-tight truncate">{category}</h3>
                                <p className="text-xs opacity-60 font-medium mt-0.5">{categoryBooks.length} 本书</p>
                             </div>

                             {/* Progress Pill Indicator */}
                             {avgProgress > 0 && (
                                 <div className="absolute top-3 right-3 bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md border border-white z-10">
                                     {Math.round(avgProgress)}%
                                 </div>
                             )}
                        </div>
                    </div>
                );})}
                
                {/* "Create New Folder" Drop Zone / Button */}
                {!selectionMode?.active && (
                    <div 
                        data-folder-name="__new__"
                        onDragOver={(e) => { e.preventDefault(); setDragOverFolder('__new__'); }}
                        onDragLeave={handleDragLeave}
                        onDrop={handleCreateFolderDrop}
                        onClick={initiateCreateFolderFlow}
                        className={`
                            aspect-square rounded-[2rem] border-2 border-dashed border-gray-300 
                            flex flex-col items-center justify-center gap-2 cursor-pointer
                            hover:border-blue-400 hover:bg-blue-500/10 transition-all
                            ${dragOverFolder === '__new__' ? 'border-blue-500 bg-blue-500/20 scale-105' : ''}
                        `}
                    >
                        <PlusIcon className="w-8 h-8 opacity-40" />
                        <span className="text-xs font-semibold opacity-40">新建文件夹</span>
                    </div>
                )}
            </div>
        )}

        {/* CASE 3: All Books View (Flat List) */}
        {!activeFolder && viewMode === 'all' && (
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-12 animate-fade-in">
                {books.map((book) => (
                    <BookCard 
                        key={book.id} 
                        book={book} 
                        onClick={handleBookClick} 
                        draggable={!selectionMode?.active}
                        onDragStart={handleDragStart}
                        onTouchStart={handleTouchStart}
                        selectionMode={!!selectionMode}
                        selected={selectionMode ? book.category === selectionMode.targetFolder : false}
                        onColorChange={handleCycleColor}
                    />
                ))}
             </div>
        )}

      </div>
    </div>
  );
};

export default Library;