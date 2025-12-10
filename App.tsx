import React, { useState } from 'react';
import Library from './components/Library';
import Reader from './components/Reader';
import { Book, Bookmark, AppView } from './types';
import { parseBook } from './services/bookParser';
import { categorizeBook } from './services/geminiService';

// Mock Data
const MOCK_BOOKS: Book[] = [
  {
    id: '1',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    content: `In my younger and more vulnerable years my father gave me some advice that I’ve been turning over in my mind ever since.

“Whenever you feel like criticizing any one,” he told me, “just remember that all the people in this world haven’t had the advantages that you’ve had.”

He didn’t say any more, but we’ve always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that. In consequence, I’m inclined to reserve all judgments, a habit that has opened up many curious natures to me and also made me the victim of not a few veteran bores. The abnormal mind is quick to detect and attach itself to this quality when it appears in a normal person, and so it came about that in college I was unjustly accused of being a politician, because I was privy to the secret griefs of wild, unknown men. Most of the confidences were unsought — frequently I have feigned sleep, preoccupation, or a hostile levity when I realized by some unmistakable sign that an intimate revelation was quivering on the horizon.`,
    coverColor: 'blue',
    progress: 0,
    lastRead: Date.now(),
    type: 'text',
    category: '小说'
  },
  {
    id: '2',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    content: `It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.

"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"

Mr. Bennet replied that he had not.

"But it is," returned she; "for Mrs. Long has just been here, and she told me all about it."

Mr. Bennet made no answer.

"Do you not want to know who has taken it?" cried his wife impatiently.

"You want to tell me, and I have no objection to hearing it."

This was invitation enough.`,
    coverColor: 'green',
    progress: 45,
    lastRead: Date.now() - 86400000,
    type: 'text',
    category: '经典'
  }
];

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LIBRARY);
  const [books, setBooks] = useState<Book[]>(MOCK_BOOKS);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const activeBook = books.find(b => b.id === activeBookId);

  const handleSelectBook = (book: Book) => {
    setActiveBookId(book.id);
    setView(AppView.READER);
    // Update last read timestamp
    setBooks(prev => prev.map(b => b.id === book.id ? { ...b, lastRead: Date.now() } : b));
  };

  const handleAddBook = async (file: File) => {
    setIsProcessing(true);
    try {
      const parsedBook = await parseBook(file);
      
      // Get list of existing categories to reuse them if possible
      // using Set to ensure uniqueness
      const existingCategories = Array.from(new Set(books.map(b => b.category)));
      
      // AI Categorization with context
      const category = await categorizeBook(parsedBook.title, parsedBook.author, existingCategories);

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
      
      // Use functional state update to ensure we preserve previous books
      setBooks(prev => [newBook, ...prev]);
      
    } catch (error) {
      console.error("Error parsing book:", error);
      alert("无法加载书籍。请尝试使用有效的 .txt, .md, .epub 或 .pdf 文件。");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateProgress = (bookId: string, progress: number) => {
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, progress } : b));
  };

  const handleAddBookmark = (bookId: string, excerpt: string, position: number) => {
    const newBookmark: Bookmark = {
      id: Date.now().toString(),
      bookId,
      excerpt,
      position,
      createdAt: Date.now(),
    };
    setBookmarks(prev => [...prev, newBookmark]);
  };

  const handleRemoveBookmark = (bookmarkId: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
  };

  return (
    <div className="antialiased text-gray-900 bg-white h-screen overflow-hidden relative">
      {view === AppView.LIBRARY ? (
        <>
          <Library 
            books={books} 
            onSelectBook={handleSelectBook} 
            onAddBook={handleAddBook} 
          />
          {isProcessing && (
            <div className="absolute inset-0 bg-black/10 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in">
              <div className="glass-panel px-8 py-6 rounded-3xl shadow-2xl flex flex-col items-center">
                 <div className="relative w-10 h-10 mb-4">
                    <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                 </div>
                 <p className="text-sm font-semibold text-gray-700 tracking-wide">AI 正在整理书库...</p>
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