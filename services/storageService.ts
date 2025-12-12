import { Book, Bookmark } from '../types';

const DB_NAME = 'LuminaReaderDB';
const DB_VERSION = 1;
const STORE_BOOKS = 'books';
const STORE_BOOKMARKS = 'bookmarks';

export const initDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BOOKMARKS)) {
        db.createObjectStore(STORE_BOOKMARKS, { keyPath: 'id' });
      }
    };
  });
};

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

export const saveBookToStorage = async (book: Book): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_BOOKS], 'readwrite');
    const store = transaction.objectStore(STORE_BOOKS);
    const request = store.put(book);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const loadBooksFromStorage = async (): Promise<Book[]> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_BOOKS], 'readonly');
    const store = transaction.objectStore(STORE_BOOKS);
    const request = store.getAll();
    request.onsuccess = () => {
      // Sort by lastRead desc
      const books = request.result as Book[];
      books.sort((a, b) => b.lastRead - a.lastRead);
      resolve(books);
    };
    request.onerror = () => reject(request.error);
  });
};

// Optimized update for progress to avoid replacing the whole object from React state potentially causing stale data issues
// This fetches the current DB version, updates just the fields we want, and writes it back.
export const updateBookProgressInDB = async (id: string, progress: number, lastRead: number): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_BOOKS], 'readwrite');
    const store = transaction.objectStore(STORE_BOOKS);
    
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const book = getRequest.result as Book;
      if (book) {
        book.progress = progress;
        book.lastRead = lastRead;
        const putRequest = store.put(book);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve(); // Book not found, maybe deleted
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

export const saveBookmarkToStorage = async (bookmark: Bookmark): Promise<void> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_BOOKMARKS], 'readwrite');
      const store = transaction.objectStore(STORE_BOOKMARKS);
      const request = store.put(bookmark);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
};

export const deleteBookmarkFromStorage = async (id: string): Promise<void> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_BOOKMARKS], 'readwrite');
      const store = transaction.objectStore(STORE_BOOKMARKS);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
};

export const loadBookmarksFromStorage = async (): Promise<Bookmark[]> => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_BOOKMARKS], 'readonly');
      const store = transaction.objectStore(STORE_BOOKMARKS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
};