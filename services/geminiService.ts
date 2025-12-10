import { GoogleGenAI } from "@google/genai";

// Initialize Gemini
// Note: In a real production app, we would handle missing keys more gracefully in the UI.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const explainTextWithAI = async (text: string, context?: string): Promise<string> => {
  if (!process.env.API_KEY) {
    return "API Key is missing. Please check your configuration.";
  }

  try {
    const prompt = `
      你是一个智能阅读助手。请简洁地解释以下选中的文本。
      如果选中的是一个单词，请给出定义和同义词。
      如果是一个短语或句子，请解释其含义和语境。
      
      选中文本: "${text}"
      ${context ? `书籍上下文: "...${context}..."` : ''}
      
      要求：
      1. 请使用中文（简体）回答。
      2. 语气要亲切、有文学感。
      3. 格式清晰，分段落。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are a helpful reading assistant integrated into an ebook reader. Always respond in Simplified Chinese.",
      }
    });

    return response.text || "无法生成解释。";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "连接 AI 服务时出错，请检查网络设置。";
  }
};

export const categorizeBook = async (title: string, author: string, existingCategories: string[] = []): Promise<string> => {
  if (!process.env.API_KEY) return "未分类";

  try {
    const categoriesStr = existingCategories.length > 0 
      ? `已存在的文件夹列表: [${existingCategories.join(', ')}].` 
      : "";

    // Modified prompt to include existing categories and prefer them
    const prompt = `
      请将书籍 "${title}" (作者: ${author}) 分类。
      ${categoriesStr}
      
      规则:
      1. 如果这本书明显属于"已存在的文件夹列表"中的某一项，请直接返回该名称。
      2. 如果不属于任何现有文件夹，请创建一个新的、简短的中文类别名称 (例如: 小说, 历史, 科技, 商业, 传记).
      3. 只返回类别名称，不要包含任何标点符号或额外解释。
    `;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    let category = response.text?.trim() || "综合";
    // Remove punctuation just in case
    category = category.replace(/[。，.'"]/g, '');
    return category;
  } catch (error) {
    console.warn("Categorization failed", error);
    return "综合";
  }
};