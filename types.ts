export interface TocItem {
  label: string;
  page?: number; // For PDF
  href?: string; // For EPUB (e.g. "chapter1.html#section2")
  position?: number; // For Text (optional)
  children?: TocItem[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  content: string; // Plain text for 'text', HTML for 'epub', description for 'pdf'
  pdfData?: ArrayBuffer; // Binary data for PDF rendering
  type: 'text' | 'pdf' | 'epub';
  coverColor: string;
  coverImage?: string; // Base64 encoded image
  progress: number; // 0 to 100
  lastRead: number; // Timestamp
  category: string; // AI Assigned Category
  toc?: TocItem[]; // Table of Contents
}

export interface Bookmark {
  id: string;
  bookId: string;
  excerpt: string;
  position: number; // PDF: Page Number, Text/Epub: Scroll Percentage (0-100)
  note?: string;
  createdAt: number;
}

export interface SelectionState {
  text: string;
  rect: DOMRect | null;
  isActive: boolean;
}

export enum AppView {
  LIBRARY = 'LIBRARY',
  READER = 'READER',
}

export type AIProvider = 'gemini' | 'deepseek';

export interface ReaderSettings {
  theme: 'light' | 'sepia' | 'dark' | 'eye-care';
  fontSize: number;
  fontFamily: 'serif' | 'sans';
  lineHeight: number;
  pdfScale: number;
  bionicReading: boolean;
  aiProvider: AIProvider;
  aiApiKey?: string;
  aiModel?: string;
  focusMode: boolean;
}