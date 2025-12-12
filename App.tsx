import React, { useState, useEffect, useRef } from 'react';
import Library from './components/Library';
import Reader from './components/Reader';
import { Book, Bookmark, AppView } from './types';
import { parseBook } from './services/bookParser';
import { categorizeBook } from './services/geminiService';
import { 
  initDB, 
  loadBooksFromStorage, 
  saveBookToStorage, 
  loadBookmarksFromStorage, 
  saveBookmarkToStorage, 
  deleteBookmarkFromStorage,
  updateBookProgressInDB
} from './services/storageService';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LIBRARY);
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [theme, setTheme] = useState<'light' | 'sepia' | 'dark' | 'eye-care'>('light');

  // Debounce refs
  const progressSaveTimeout = useRef<{[key: string]: any}>({});

  // Initialize DB and load data
  useEffect(() => {
    const init = async () => {
      try {
        await initDB();
        const [storedBooks, storedBookmarks] = await Promise.all([
          loadBooksFromStorage(),
          loadBookmarksFromStorage()
        ]);
        setBooks(storedBooks);
        setBookmarks(storedBookmarks);
        
        // Load theme
        const savedTheme = localStorage.getItem('lumina-theme');
        if (savedTheme) setTheme(savedTheme as any);
      } catch (e) {
        console.error("Storage initialization failed", e);
      } finally {
        setIsReady(true);
      }
    };
    init();
  }, []);
  
  // Persist Theme
  useEffect(() => {
    localStorage.setItem('lumina-theme', theme);
  }, [theme]);

  const activeBook = books.find(b => b.id === activeBookId);

  const handleSelectBook = (book: Book) => {
    setActiveBookId(book.id);
    setView(AppView.READER);
    
    // Update last read locally and in DB
    const now = Date.now();
    setBooks(prev => prev.map(b => b.id === book.id ? { ...b, lastRead: now } : b));
    updateBookProgressInDB(book.id, book.progress, now);
  };

  const handleAddBook = async (file: File) => {
    setIsProcessing(true);
    try {
      const parsedBook = await parseBook(file);
      
      // Default to "未分类" (Uncategorized)
      const category = "未分类";

      const newBook: Book = {
        id: Date.now().toString(),
        title: parsedBook.title || "Untitled",
        author: parsedBook.author || "Unknown",
        content: parsedBook.content,
        pdfData: parsedBook.pdfData,
        type: parsedBook.type,
        coverColor: ['blue', 'red', 'green', 'purple', 'orange'][Math.floor(Math.random() * 5)],
        progress: 0,
        lastRead: Date.now(),
        category: category,
        toc: parsedBook.toc,
      };
      
      // Save to IndexedDB first
      await saveBookToStorage(newBook);
      
      // Then update State
      setBooks(prev => [newBook, ...prev]);
      
    } catch (error) {
      console.error("Error parsing book:", error);
      alert("无法加载书籍。请尝试使用有效的 .txt, .md, .epub 或 .pdf 文件。");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateBook = async (updatedBook: Book) => {
    // Optimistic Update
    setBooks(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
    // Persist
    await saveBookToStorage(updatedBook);
  };

  const handleOrganizeLibrary = async () => {
      setIsOrganizing(true);
      const booksToOrganize = books.filter(b => b.category === "未分类");
      
      if (booksToOrganize.length === 0) {
          alert("没有需要整理的“未分类”书籍。");
          setIsOrganizing(false);
          return;
      }

      // Collect existing categories to help AI avoid duplicates
      const existingCategories = Array.from(new Set(books.filter(b => b.category !== "未分类").map(b => b.category)));
      
      let updatedCount = 0;
      const newBooks = [...books];

      for (const book of booksToOrganize) {
          const newCategory = await categorizeBook(book.title, book.author, existingCategories);
          if (newCategory !== "未分类") {
               const index = newBooks.findIndex(b => b.id === book.id);
               if (index !== -1) {
                   newBooks[index] = { ...newBooks[index], category: newCategory };
                   // Persist
                   await saveBookToStorage(newBooks[index]);
                   updatedCount++;
               }
          }
      }

      setBooks(newBooks);
      setIsOrganizing(false);
      if (updatedCount > 0) {
          // Optional toast or feedback
      }
  };

  const handleMoveBook = async (bookId: string, newCategory: string) => {
      if (!newCategory) return;
      
      setBooks(prev => prev.map(book => {
          if (book.id === bookId) {
              const updated = { ...book, category: newCategory };
              saveBookToStorage(updated); // Sync with DB
              return updated;
          }
          return book;
      }));
  };

  const handleUpdateProgress = (bookId: string, progress: number) => {
    const now = Date.now();
    
    // 1. Immediate UI update
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, progress, lastRead: now } : b));

    // 2. Debounced DB update (prevent spamming IndexedDB on scroll)
    if (progressSaveTimeout.current[bookId]) {
      clearTimeout(progressSaveTimeout.current[bookId]);
    }

    progressSaveTimeout.current[bookId] = setTimeout(() => {
       updateBookProgressInDB(bookId, progress, now);
    }, 1000);
  };

  const handleAddBookmark = (bookId: string, excerpt: string, position: number, note?: string) => {
    const newBookmark: Bookmark = {
      id: Date.now().toString(),
      bookId,
      excerpt,
      position,
      note,
      createdAt: Date.now(),
    };
    
    saveBookmarkToStorage(newBookmark);
    setBookmarks(prev => [...prev, newBookmark]);
  };

  const handleRemoveBookmark = (bookmarkId: string) => {
    deleteBookmarkFromStorage(bookmarkId);
    setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
  };

  if (!isReady) {
     return (
        <div className="h-screen w-full flex items-center justify-center bg-[#F2F2F7]">
           <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
     );
  }

  return (
    <div className={`antialiased text-gray-900 bg-[var(--bg-color)] text-[var(--text-color)] h-screen overflow-hidden relative theme-${theme} transition-colors duration-500`}>
      {view === AppView.LIBRARY ? (
        <>
          <Library 
            books={books} 
            onSelectBook={handleSelectBook} 
            onAddBook={handleAddBook} 
            onOrganizeLibrary={handleOrganizeLibrary}
            onMoveBook={handleMoveBook}
            onUpdateBook={handleUpdateBook}
            isOrganizing={isOrganizing}
            currentTheme={theme}
            onThemeChange={setTheme}
          />
          {isProcessing && (
            <div className="absolute inset-0 bg-black/10 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in">
              <div className="glass-panel px-8 py-6 rounded-3xl shadow-2xl flex flex-col items-center">
                 <div className="relative w-10 h-10 mb-4">
                    <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                 </div>
                 <p className="text-sm font-semibold text-gray-700 tracking-wide">处理中...</p>
              </div>
            </div>
          )}
        </>
      ) : activeBook ? (
        <Reader 
          book={activeBook} 
          bookmarks={bookmarks.filter(b => b.bookId === activeBook.id)}
          onBack={() => setView(AppView.LIBRARY)}
          onUpdateProgress={handleUpdateProgress}
          onAddBookmark={handleAddBookmark}
          onRemoveBookmark={handleRemoveBookmark}
          theme={theme}
          onThemeChange={setTheme}
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Book not found.</p>
          <button onClick={() => setView(AppView.LIBRARY)} className="ml-4 text-blue-500">返回</button>
        </div>
      )}
    </div>
  );
};

export default App;