import { GoogleGenAI } from "@google/genai";
import { AIProvider } from "../types";

// Default configuration
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/chat/completions';

interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  model?: string;
}

// Helper for Gemini
const generateGeminiContent = async (text: string, context: string, apiKey: string) => {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
    请解释以下选中的文本。
    
    选中文本: "${text}"
    ${context ? `书籍上下文: "...${context}..."` : ''}
  `;

  const response = await ai.models.generateContent({
    model: DEFAULT_GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: "你是一个智能阅读助手。请简洁地解释用户选中的文本。如果选中的是一个单词，请给出定义和同义词。如果是一个短语或句子，请解释其含义和语境。请使用中文（简体）回答。语气要亲切、有文学感。格式清晰，分段落。",
    }
  });
  return response.text || "无法生成解释。";
};

// Helper for DeepSeek (OpenAI Compatible)
const generateDeepSeekContent = async (text: string, context: string, apiKey: string, model: string = DEFAULT_DEEPSEEK_MODEL) => {
  const prompt = `
    请解释以下选中的文本。
    选中文本: "${text}"
    ${context ? `书籍上下文: "...${context}..."` : ''}
  `;

  try {
    const response = await fetch(DEEPSEEK_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: "你是一个智能阅读助手。请简洁地解释用户选中的文本。如果选中的是一个单词，请给出定义和同义词。如果是一个短语或句子，请解释其含义和语境。请使用中文（简体）回答。语气要亲切、有文学感。格式清晰，分段落。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`DeepSeek API Error: ${response.status} ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "无法生成解释。";
  } catch (error: any) {
    console.error("DeepSeek Fetch Error:", error);
    // Specific error message for CORS
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      return "连接 DeepSeek 失败 (CORS 错误)。由于浏览器安全限制，DeepSeek API 可能无法直接从网页前端调用。请尝试使用 Gemini，或使用支持 CORS 的代理服务。";
    }
    return `AI 请求失败: ${error.message}`;
  }
};

export const explainTextWithAI = async (text: string, context?: string, config?: AIConfig): Promise<string> => {
  const provider = config?.provider || 'gemini';
  
  try {
    if (provider === 'deepseek') {
      if (!config?.apiKey) return "请在设置中配置 DeepSeek API Key。";
      return await generateDeepSeekContent(text, context || "", config.apiKey, config.model);
    } else {
      // Default to Gemini
      // Use env key if available, otherwise check config (though env is preferred for Gemini in this env)
      const key = process.env.API_KEY; 
      if (!key) return "API Key 配置缺失 (Gemini)。";
      return await generateGeminiContent(text, context || "", key);
    }
  } catch (error) {
    console.error("AI Service Error:", error);
    return "服务暂时不可用，请稍后重试。";
  }
};

export const categorizeBook = async (title: string, author: string, existingCategories: string[] = []): Promise<string> => {
  // Categorization currently defaults to Gemini for stability and speed in this demo environment
  if (!process.env.API_KEY) return "未分类";

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const categoriesStr = existingCategories.length > 0 
      ? `已存在的文件夹列表: [${existingCategories.join(', ')}].` 
      : "";

    const prompt = `
      请将书籍 "${title}" (作者: ${author}) 分类。
      ${categoriesStr}
      
      规则:
      1. 如果这本书明显属于"已存在的文件夹列表"中的某一项，请直接返回该名称。
      2. 如果不属于任何现有文件夹，请创建一个新的、简短的中文类别名称 (例如: 小说, 历史, 科技, 商业, 传记).
      3. 只返回类别名称，不要包含任何标点符号或额外解释。
    `;
    
    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: "你是一个专业的图书管理员。",
      }
    });

    let category = response.text?.trim() || "综合";
    category = category.replace(/[。，.'"]/g, '');
    return category;
  } catch (error) {
    console.warn("Categorization failed", error);
    return "综合";
  }
};