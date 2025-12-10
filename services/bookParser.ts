import JSZip from 'jszip';
import * as pdfjsProxy from 'pdfjs-dist';
import { TocItem } from '../types';

// Handle ES Module import interoperability
// pdfjs-dist via some CDNs/bundlers exports the library as the default export
export const pdfjsLib = (pdfjsProxy as any).default || pdfjsProxy;

// Set worker source for PDF.js
// We use the direct jsDelivr URL to the worker file to ensure proper loading without redirects or module wrapping issues
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
} else {
  console.warn("PDF.js GlobalWorkerOptions not found, PDF parsing might fail.");
}

export interface ParsedBook {
  title: string;
  author: string;
  content: string;
  pdfData?: ArrayBuffer;
  type: 'text' | 'pdf';
  toc?: TocItem[];
}

const parsePdf = async (file: File): Promise<ParsedBook> => {
  const arrayBuffer = await file.arrayBuffer();
  
  try {
    // IMPORTANT: Clone the buffer (slice(0)) because pdfjsLib.getDocument may transfer/detach 
    // the buffer to the worker, making the original 'arrayBuffer' variable empty/unusable.
    // We need the original 'arrayBuffer' to return it in the result.
    const loadingTask = pdfjsLib.getDocument({ 
        data: arrayBuffer.slice(0),
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true,
    });
    const pdf = await loadingTask.promise;
    
    // Extract metadata
    const metadata = await pdf.getMetadata().catch(() => ({ info: {} }));
    const info = metadata.info as any;
    
    const title = info?.Title || file.name.replace(/\.pdf$/i, "");
    const author = info?.Author || "Unknown Author";

    // Extract Table of Contents
    const toc: TocItem[] = [];
    const outline = await pdf.getOutline();

    if (outline) {
      // Helper to process outline nodes
      const processOutline = async (nodes: any[]): Promise<TocItem[]> => {
        const items: TocItem[] = [];
        for (const node of nodes) {
          let pageNumber = 0;
          try {
            if (node.dest) {
              const dest = typeof node.dest === 'string' 
                ? await pdf.getDestination(node.dest) 
                : node.dest;
              
              if (dest && dest.length > 0) {
                 // getPageIndex returns 0-based index
                 const index = await pdf.getPageIndex(dest[0]);
                 pageNumber = index + 1;
              }
            }
          } catch (e) {
            console.warn("Could not resolve TOC destination", e);
          }

          items.push({
            label: node.title,
            page: pageNumber,
            children: node.items && node.items.length > 0 ? await processOutline(node.items) : undefined
          });
        }
        return items;
      };
      
      const processedToc = await processOutline(outline);
      toc.push(...processedToc);
    }

    return { 
        title, 
        author, 
        content: "PDF Document", 
        pdfData: arrayBuffer, 
        type: 'pdf',
        toc: toc.length > 0 ? toc : undefined
    };
  } catch (err) {
    console.error("PDF Parsing Error detail:", err);
    throw new Error("Could not parse PDF content.");
  }
};

const parseEpub = async (file: File): Promise<ParsedBook> => {
  const zip = new JSZip();
  const content = await zip.loadAsync(file);

  // 1. Find OPF file path from container.xml
  const container = await content.file("META-INF/container.xml")?.async("string");
  if (!container) throw new Error("Invalid EPUB: Missing container.xml");
  
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(container, "application/xml");
  const rootFile = containerDoc.querySelector("rootfile");
  const opfPath = rootFile?.getAttribute("full-path");
  if (!opfPath) throw new Error("Invalid EPUB: No OPF path found");

  // 2. Read OPF to get metadata and spine
  const opfContent = await content.file(opfPath)?.async("string");
  if (!opfContent) throw new Error("Invalid EPUB: OPF file missing");
  const opfDoc = parser.parseFromString(opfContent, "application/xml");

  // Metadata
  const title = opfDoc.querySelector("metadata > title")?.textContent || file.name.replace(/\.epub$/i, "");
  const author = opfDoc.querySelector("metadata > creator")?.textContent || "Unknown Author";

  // Spine and Manifest
  const manifestItems = Array.from(opfDoc.querySelectorAll("manifest > item"));
  const spineItems = Array.from(opfDoc.querySelectorAll("spine > itemref"));
  
  // Resolve paths relative to OPF directory
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  let fullText = "";

  // 3. Extract text from each chapter in order
  for (const itemRef of spineItems) {
    const id = itemRef.getAttribute("idref");
    const item = manifestItems.find(i => i.getAttribute("id") === id);
    if (item) {
      const href = item.getAttribute("href");
      if (href) {
        // Construct full path inside zip
        const fullHref = opfDir + href; 
        const fileContent = await content.file(fullHref)?.async("string");
        
        if (fileContent) {
          const doc = parser.parseFromString(fileContent, "text/html");
          const chapterText = doc.body.textContent || "";
          if (chapterText.trim().length > 0) {
              fullText += chapterText + "\n\n";
          }
        }
      }
    }
  }

  return { title, author, content: fullText, type: 'text' };
};

const parseMarkdown = async (file: File): Promise<ParsedBook> => {
  const text = await file.text();
  const lines = text.split('\n');
  let title = file.name.replace(/\.md$/i, "");
  let author = "Unknown";
  
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ')) {
      title = line.substring(2).trim();
      break;
    }
  }

  return { title, author, content: text, type: 'text' };
};

const parseText = async (file: File): Promise<ParsedBook> => {
  const text = await file.text();
  return {
    title: file.name.replace(/\.txt$/i, ""),
    author: "Unknown",
    content: text,
    type: 'text'
  };
};

export const parseBook = async (file: File): Promise<ParsedBook> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  try {
    if (extension === 'epub') {
      return await parseEpub(file);
    } else if (extension === 'pdf') {
      return await parsePdf(file);
    } else if (extension === 'md' || extension === 'markdown') {
      return await parseMarkdown(file);
    } else {
      return await parseText(file);
    }
  } catch (e) {
    console.error("Failed to parse book", e);
    // Fallback to reading as plain text is risky for binary files (pdf/epub), 
    // but we let text files pass through.
    if (extension === 'txt') {
        return parseText(file);
    }
    throw e;
  }
};