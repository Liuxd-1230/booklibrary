export interface TocItem {
  label: string;
  page?: number; // For PDF
  position?: number; // For Text (optional, if we support text ToC later)
  children?: TocItem[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  content: string; // Plain text content for text books, or description/preview for PDFs
  pdfData?: ArrayBuffer; // Binary data for PDF rendering
  type: 'text' | 'pdf';
  coverColor: string;
  progress: number; // 0 to 100
  lastRead: number; // Timestamp
  category: string; // AI Assigned Category
  toc?: TocItem[]; // Table of Contents
}

export interface Bookmark {
  id: string;
  bookId: string;
  excerpt: string;
  position: number; // PDF: Page Number, Text: Scroll Percentage (0-100)
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
  theme: 'light' | 'sepia' | 'dark';
  fontSize: number;
  fontFamily: 'serif' | 'sans';
  lineHeight: number;
  pdfScale: number;
  // AI Settings
  aiProvider: AIProvider;
  aiApiKey?: string; // Optional custom key for DeepSeek
  aiModel?: string; // Optional custom model name
}