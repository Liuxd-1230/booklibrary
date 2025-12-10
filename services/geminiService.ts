// Replaced Google GenAI with DeepSeek API implementation
// Note: The filename is kept as geminiService.ts to preserve imports in other files,
// but the underlying engine is now DeepSeek.

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

// Helper to call DeepSeek API
const callDeepSeek = async (messages: Array<{ role: string; content: string }>, temperature: number = 0.7) => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat", // V3
        messages: messages,
        temperature: temperature,
        stream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`DeepSeek API Error: ${response.status} ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.error("DeepSeek Request Failed:", error);
    return null;
  }
};

export const explainTextWithAI = async (text: string, context?: string): Promise<string> => {
  if (!process.env.API_KEY) {
    return "API Key 缺失，请配置 DeepSeek API Key。";
  }

  const systemPrompt = "你是一个智能阅读助手。请简洁地解释用户选中的文本。如果选中的是一个单词，请给出定义和同义词。如果是一个短语或句子，请解释其含义和语境。请使用中文（简体）回答。语气要亲切、有文学感。格式清晰，分段落。";
  
  const userContent = `选中文本: "${text}"\n${context ? `书籍上下文: "...${context}..."` : ''}`;

  const result = await callDeepSeek([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ]);

  return result || "无法生成解释，请检查网络或 API Key。";
};

export const categorizeBook = async (title: string, author: string, existingCategories: string[] = []): Promise<string> => {
  if (!process.env.API_KEY) return "未分类";

  const categoriesStr = existingCategories.length > 0 
    ? `已存在的文件夹列表: [${existingCategories.join(', ')}].` 
    : "";

  const systemPrompt = "你是一个专业的图书管理员。你的任务是将书籍归类到一个简短的中文类别名称中。";

  const userPrompt = `
    请将书籍 "${title}" (作者: ${author}) 分类。
    ${categoriesStr}
    
    规则:
    1. 如果这本书明显属于"已存在的文件夹列表"中的某一项，请直接返回该名称。
    2. 如果不属于任何现有文件夹，请创建一个新的、简短的中文类别名称 (例如: 小说, 历史, 科技, 商业, 传记).
    3. 只返回类别名称，不要包含任何标点符号或额外解释。
  `;

  const result = await callDeepSeek([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], 0.3); // Lower temperature for more deterministic categorization

  if (!result) return "综合";

  let category = result.trim();
  // Clean up any potential punctuation DeepSeek might add despite instructions
  category = category.replace(/[。，.'"]/g, '');
  
  return category;
};