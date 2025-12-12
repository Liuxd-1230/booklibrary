import JSZip from 'jszip';
import * as pdfjsProxy from 'pdfjs-dist';
import { TocItem, Book } from '../types';

// Handle ES Module import interoperability
export const pdfjsLib = (pdfjsProxy as any).default || pdfjsProxy;

// Set worker source for PDF.js
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
  type: 'text' | 'pdf' | 'epub';
  toc?: TocItem[];
  coverImage?: string;
}

// --- Helper: Path Resolution ---
const resolvePath = (base: string, relative: string): string => {
  const stack = base.split('/');
  stack.pop(); // Remove current filename to get directory
  const parts = relative.split('/');
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
};

// --- Helper: Process Chapter (Inline Images) ---
const processChapterHTML = async (
  zip: JSZip, 
  fullPath: string, 
  rawContent: string
): Promise<string> => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawContent, "text/html");

  // Inline Images
  const images = Array.from(doc.querySelectorAll('img'));
  
  // Use map/Promise.all to load images in parallel within the chapter
  await Promise.all(images.map(async (img) => {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('http') && !src.startsWith('data:')) {
      // Clean src (remove query params or hashes if any, though rare for images)
      const cleanSrc = src.split('#')[0].split('?')[0];
      const imagePath = resolvePath(fullPath, cleanSrc);
      
      const file = zip.file(imagePath);
      if (file) {
        try {
          const base64 = await file.async('base64');
          // Guess mime type based on extension
          const ext = imagePath.split('.').pop()?.toLowerCase() || 'jpg';
          let mime = 'image/jpeg';
          if (ext === 'png') mime = 'image/png';
          else if (ext === 'gif') mime = 'image/gif';
          else if (ext === 'svg') mime = 'image/svg+xml';
          else if (ext === 'webp') mime = 'image/webp';
          
          img.setAttribute('src', `data:${mime};base64,${base64}`);
          img.setAttribute('style', 'max-width: 100%; height: auto; display: block; margin: 1em auto;');
        } catch (e) {
          console.warn(`Failed to inline image: ${imagePath}`, e);
        }
      }
    }
  }));

  // Clean links
  const links = Array.from(doc.querySelectorAll('a'));
  links.forEach(link => {
      const href = link.getAttribute('href');
      // Remove target="_blank" to prevent opening new tabs for internal navigation
      link.removeAttribute('target');
  });

  // Extract body content only
  // Wrap in a div with an ID equal to the filename so TOC can jump to it
  const filename = fullPath.split('/').pop();
  return `<div id="${filename}" class="epub-chapter" data-path="${fullPath}">${doc.body.innerHTML}</div>`;
};

// --- Helper: Parse NCX TOC ---
const parseNcxToc = (xmlDoc: Document, opfDir: string): TocItem[] => {
    const navMap = xmlDoc.querySelector('navMap');
    if (!navMap) return [];

    const parsePoints = (elements: Element[]): TocItem[] => {
        return elements.map(point => {
            const label = point.querySelector('navLabel > text')?.textContent || "Untitled";
            const content = point.querySelector('content');
            let href = content?.getAttribute('src') || "";
            
            if (href) {
                const parts = href.split('/');
                href = parts[parts.length - 1]; // "chapter1.html#sec1"
            }

            const children = Array.from(point.querySelectorAll(':scope > navPoint'));
            return {
                label,
                href, // This will be used to jump to element ID
                children: children.length > 0 ? parsePoints(children) : undefined
            };
        });
    };

    return parsePoints(Array.from(navMap.querySelectorAll(':scope > navPoint')));
};

const parsePdf = async (file: File): Promise<ParsedBook> => {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const loadingTask = pdfjsLib.getDocument({ 
        data: arrayBuffer.slice(0),
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true,
    });
    const pdf = await loadingTask.promise;
    const metadata = await pdf.getMetadata().catch(() => ({ info: {} }));
    const info = metadata.info as any;
    const title = info?.Title || file.name.replace(/\.pdf$/i, "");
    const author = info?.Author || "Unknown Author";

    const toc: TocItem[] = [];
    const outline = await pdf.getOutline();

    if (outline) {
      const processOutline = async (nodes: any[]): Promise<TocItem[]> => {
        const items: TocItem[] = [];
        for (const node of nodes) {
          let pageNumber = 0;
          try {
            if (node.dest) {
              const dest = typeof node.dest === 'string' ? await pdf.getDestination(node.dest) : node.dest;
              if (dest && dest.length > 0) {
                 const index = await pdf.getPageIndex(dest[0]);
                 pageNumber = index + 1;
              }
            }
          } catch (e) { /* ignore */ }
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

    return { title, author, content: "PDF Document", pdfData: arrayBuffer, type: 'pdf', toc: toc.length > 0 ? toc : undefined };
  } catch (err) {
    throw new Error("Could not parse PDF content.");
  }
};

const parseEpub = async (file: File): Promise<ParsedBook> => {
  const zip = new JSZip();
  const content = await zip.loadAsync(file);

  // 1. Find OPF
  const container = await content.file("META-INF/container.xml")?.async("string");
  if (!container) throw new Error("Invalid EPUB: Missing container.xml");
  
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(container, "application/xml");
  const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("Invalid EPUB: No OPF path found");

  // 2. Read OPF
  const opfContent = await content.file(opfPath)?.async("string");
  if (!opfContent) throw new Error("Invalid EPUB: OPF file missing");
  const opfDoc = parser.parseFromString(opfContent, "application/xml");

  const title = opfDoc.querySelector("metadata > title")?.textContent || file.name.replace(/\.epub$/i, "");
  const author = opfDoc.querySelector("metadata > creator")?.textContent || "Unknown Author";

  // 3. Manifest & Spine
  const manifestItems = Array.from(opfDoc.querySelectorAll("manifest > item"));
  const spineItems = Array.from(opfDoc.querySelectorAll("spine > itemref"));
  
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // 4. Find Cover Image
  let coverImage: string | undefined = undefined;
  
  // Method A: Look for meta name="cover"
  const coverMeta = opfDoc.querySelector('metadata > meta[name="cover"]');
  let coverId = coverMeta?.getAttribute('content');

  // Method B: Look for item with properties="cover-image"
  if (!coverId) {
     const coverItem = manifestItems.find(item => item.getAttribute('properties')?.includes('cover-image'));
     coverId = coverItem?.getAttribute('id') || null;
  }
  
  // Method C: Brute force search for "cover" in id
  if (!coverId) {
      const coverItem = manifestItems.find(item => item.getAttribute('id')?.toLowerCase().includes('cover') && item.getAttribute('media-type')?.startsWith('image/'));
      coverId = coverItem?.getAttribute('id') || null;
  }

  if (coverId) {
      const coverItem = manifestItems.find(item => item.getAttribute('id') === coverId);
      if (coverItem) {
          const href = coverItem.getAttribute('href');
          if (href) {
              const fullCoverPath = resolvePath(opfPath, href);
              const coverFile = content.file(fullCoverPath);
              if (coverFile) {
                  const base64 = await coverFile.async('base64');
                  const ext = fullCoverPath.split('.').pop()?.toLowerCase() || 'jpg';
                  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
                  coverImage = `data:${mime};base64,${base64}`;
              }
          }
      }
  }

  // 5. Parallel Processing of Chapters
  const chapterPromises = spineItems.map(async (itemRef) => {
    const id = itemRef.getAttribute("idref");
    const item = manifestItems.find(i => i.getAttribute("id") === id);
    if (!item) return "";

    const href = item.getAttribute("href");
    if (!href) return "";

    const fullHref = resolvePath(opfPath, href); // Handle relative paths correctly
    const fileContent = await content.file(fullHref)?.async("string");
    
    if (fileContent) {
        return await processChapterHTML(zip, fullHref, fileContent);
    }
    return "";
  });

  const chapters = await Promise.all(chapterPromises);
  const fullHtml = chapters.join("\n");

  // 6. Extract Table of Contents (NCX or Nav)
  let toc: TocItem[] = [];
  
  // Try NCX (EPUB 2)
  const ncxItem = manifestItems.find(i => i.getAttribute("media-type") === "application/x-dtbncx+xml");
  if (ncxItem) {
      const ncxHref = resolvePath(opfPath, ncxItem.getAttribute("href") || "");
      const ncxContent = await content.file(ncxHref)?.async("string");
      if (ncxContent) {
          const ncxDoc = parser.parseFromString(ncxContent, "application/xml");
          toc = parseNcxToc(ncxDoc, opfDir);
      }
  }

  return { title, author, content: fullHtml, type: 'epub', toc, coverImage };
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
    if (extension === 'txt') {
        return parseText(file);
    }
    throw e;
  }
};