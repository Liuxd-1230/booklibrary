import React, { useRef, useMemo, useState } from 'react';
import { Book } from '../types';
import { PlusIcon, BookIcon, FolderIcon, ChevronLeftIcon, ListIcon } from './Icons';

interface LibraryProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
  onAddBook: (file: File) => void;
}

type ViewMode = 'all' | 'folders';

const Library: React.FC<LibraryProps> = ({ books, onSelectBook, onAddBook }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('folders');
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onAddBook(e.target.files[0]);
      e.target.value = '';
    }
  };

  const getGradient = (color: string) => {
    switch(color) {
      case 'blue': return 'bg-gradient-to-br from-[#4A90E2] to-[#007AFF]';
      case 'red': return 'bg-gradient-to-br from-[#FF5E3A] to-[#FF2A68]';
      case 'green': return 'bg-gradient-to-br from-[#34C759] to-[#30B453]';
      case 'purple': return 'bg-gradient-to-br from-[#AF52DE] to-[#5856D6]';
      case 'orange': return 'bg-gradient-to-br from-[#FF9500] to-[#FF3B30]';
      default: return 'bg-gradient-to-br from-gray-400 to-gray-600';
    }
  };

  // Group books by category
  const categories = useMemo(() => {
    const groups: { [key: string]: Book[] } = {};
    books.forEach(book => {
      const cat = book.category || "未分类";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(book);
    });
    return groups;
  }, [books]);

  // Render a single book card
  const BookCard = ({ book }: { book: Book }) => (
    <div 
        onClick={() => onSelectBook(book)}
        className="group relative flex flex-col items-center cursor-pointer perspective-1000 animate-in fade-in zoom-in-95 duration-300"
    >
        {/* Book Cover */}
        <div className={`
        w-full aspect-[2/3] rounded-xl shadow-[0_8px_16px_-4px_rgba(0,0,0,0.15)] 
        ${getGradient(book.coverColor)} 
        relative overflow-hidden mb-3
        transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]
        group-hover:-translate-y-2 group-hover:shadow-[0_15px_30px_-8px_rgba(0,0,0,0.25)]
        group-hover:scale-[1.02]
        `}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-60"></div>
        <div className="absolute inset-0 flex items-center justify-center p-3">
            <div className="text-center text-white drop-shadow-md">
            <h3 className="font-serif font-bold text-base leading-tight line-clamp-3 mb-1">
                {book.title}
            </h3>
            <p className="text-[9px] opacity-90 font-sans uppercase tracking-widest line-clamp-1">
                {book.author}
            </p>
            </div>
        </div>
        
        {/* Progress Bar within Cover */}
        <div className="absolute bottom-2 left-2 right-2 h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-md">
            <div 
            className="h-full bg-white/90 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" 
            style={{ width: `${book.progress}%` }}
            />
        </div>
        </div>

        {/* Book Meta below */}
        <div className="text-center w-full px-1">
        <p className="text-sm font-semibold text-gray-800 truncate">{book.title}</p>
        <p className="text-xs text-gray-400 mt-1 font-medium">{Math.round(book.progress)}% 已读</p>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F2F2F7] p-6 pb-24 overflow-y-auto">
      <header className="flex justify-between items-end mb-8 mt-6 px-2">
        <div className="flex flex-col">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">我的书库</h2>
          <div className="flex items-center gap-2">
              {activeFolder ? (
                  <button 
                    onClick={() => setActiveFolder(null)}
                    className="flex items-center gap-1 text-2xl font-bold text-blue-600 hover:opacity-80 transition-opacity"
                  >
                     <ChevronLeftIcon className="w-6 h-6" />
                     {activeFolder}
                  </button>
              ) : (
                  <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                    {viewMode === 'all' ? '所有书籍' : '文件夹'}
                  </h1>
              )}
          </div>
        </div>

        <div className="flex items-center gap-3">
            {/* View Toggle */}
            {!activeFolder && (
                <div className="bg-gray-200/50 p-1 rounded-lg flex text-xs font-medium">
                    <button 
                        onClick={() => setViewMode('folders')}
                        className={`px-3 py-1.5 rounded-md transition-all ${viewMode === 'folders' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        文件夹
                    </button>
                    <button 
                        onClick={() => setViewMode('all')}
                        className={`px-3 py-1.5 rounded-md transition-all ${viewMode === 'all' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        全部
                    </button>
                </div>
            )}

            <button 
            onClick={() => fileInputRef.current?.click()}
            className="glass-panel w-10 h-10 rounded-full flex items-center justify-center text-blue-600 active:scale-95 transition-all duration-300 hover:bg-white/80 shadow-sm"
            title="导入书籍"
            >
            <PlusIcon className="w-6 h-6" />
            </button>
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
        <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400">
          <div className="w-20 h-20 rounded-3xl bg-gray-200/50 flex items-center justify-center mb-6">
             <BookIcon className="w-8 h-8 opacity-40" />
          </div>
          <p className="text-xl font-medium text-gray-500 mb-2">书库为空</p>
          <p className="text-sm text-gray-400">请导入 .epub, .pdf, 或 .txt 开始阅读。</p>
        </div>
      )}

      {/* Grid Content */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 px-2">
        
        {/* CASE 1: Active Folder View (Drill Down) */}
        {activeFolder && categories[activeFolder] && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-10">
                {categories[activeFolder].map(book => (
                    <BookCard key={book.id} book={book} />
                ))}
            </div>
        )}

        {/* CASE 2: Folders Overview */}
        {!activeFolder && viewMode === 'folders' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {Object.entries(categories).map(([category, categoryBooks]) => (
                    <div 
                        key={category} 
                        onClick={() => setActiveFolder(category)}
                        className="group cursor-pointer"
                    >
                        {/* iOS Style Folder Icon */}
                        <div className="aspect-square bg-white/40 backdrop-blur-xl border border-white/60 rounded-3xl p-4 shadow-sm hover:shadow-md transition-all duration-300 group-hover:scale-[1.02] mb-3 grid grid-cols-2 gap-2 content-start overflow-hidden">
                             {/* Mini Thumbnails (max 4) */}
                             {categoryBooks.slice(0, 4).map((book, idx) => (
                                 <div key={idx} className={`w-full aspect-[2/3] rounded-md ${getGradient(book.coverColor)} opacity-80 shadow-sm`}></div>
                             ))}
                             {/* Placeholder dots if empty spots */}
                             {categoryBooks.length < 4 && Array.from({length: 4 - categoryBooks.length}).map((_, i) => (
                                 <div key={`empty-${i}`} className="w-full aspect-[2/3] rounded-md bg-black/5"></div>
                             ))}
                        </div>
                        <div className="text-center">
                            <h3 className="font-medium text-gray-800 text-base">{category}</h3>
                            <p className="text-xs text-gray-400">{categoryBooks.length} 本书</p>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {/* CASE 3: All Books View (Flat List) */}
        {!activeFolder && viewMode === 'all' && (
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-10">
                {books.map((book) => (
                    <BookCard key={book.id} book={book} />
                ))}
             </div>
        )}

      </div>
    </div>
  );
};

export default Library;