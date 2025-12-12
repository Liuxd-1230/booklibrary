// Simple estimation: English words ~5 chars, Chinese chars count as 1 word
export const countWords = (text: string): number => {
    // Remove HTML tags for calculation
    const stripped = text.replace(/<[^>]*>?/gm, '');
    const cjk = (stripped.match(/[\u4e00-\u9fa5]/g) || []).length;
    const latin = (stripped.match(/[a-zA-Z0-9]+/g) || []).length;
    return cjk + latin;
};

// Transform text to Bionic Reading format (Bold first half of words)
export const applyBionicReadingToText = (text: string): string => {
    return text.split(' ').map(word => {
        // Skip simple logic for very short words or non-words
        if (word.length < 2) return word;
        
        // Handle English/Latin words
        if (/^[a-zA-Z]+$/.test(word)) {
            const splitIndex = Math.ceil(word.length / 2);
            return `<b>${word.slice(0, splitIndex)}</b>${word.slice(splitIndex)}`;
        }
        return word;
    }).join(' ');
};

// Process HTML content for Bionic Reading (safely modifying text nodes)
export const processHtmlForBionic = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
        if (node.nodeValue && node.nodeValue.trim().length > 0) {
            // Apply logic only to text content
            const div = document.createElement('div');
            div.innerHTML = applyBionicReadingToText(node.nodeValue);
            
            // Replace text node with a span containing the bolded HTML
            const span = document.createElement('span');
            span.innerHTML = div.innerHTML;
            node.parentNode?.replaceChild(span, node);
        }
    }
    
    return doc.body.innerHTML;
};