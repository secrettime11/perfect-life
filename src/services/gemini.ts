import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface NewsSource {
  title: string;
  uri: string;
}

export interface NewsResult {
  summary: string;
  sources: NewsSource[];
}

export async function fetchStockNews(query: string, timeFrame: string): Promise<NewsResult> {
  const prompt = `請搜尋關於台股「${query}」在「${timeFrame}」內的新聞。
請提供：
1. 條列式的新聞重點摘要，請著重在公司的營運、財報、重大事件、法人動向等對股價有影響的資訊。
2. 盡量多參考不同的新聞來源。
請確保資訊是最新的，並且只提供與該個股相關的資訊。
**重要：請使用 Markdown 的粗體（**文字**）標註重要數據、公司名稱及關鍵趨勢。**`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      // 暫時移除 googleSearch 避免 API Quota 錯誤
      // tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || "無法生成摘要。";
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  
  const sources: NewsSource[] = chunks.map(chunk => {
    if (chunk.web) {
      return {
        title: chunk.web.title,
        uri: chunk.web.uri,
      };
    }
    return null;
  }).filter((item): item is NewsSource => item !== null);

  // Remove duplicates by URI
  const uniqueSources = Array.from(new Map(sources.map(item => [item.uri, item])).values());

  return {
    summary: text,
    sources: uniqueSources,
  };
}

export interface FinancialReport {
  summary: string;
  sources: NewsSource[];
}

export async function fetchFinancialReport(query: string): Promise<FinancialReport> {
  const prompt = `請搜尋關於台股「${query}」最新一季的財報資訊。
請提供：
1. 營收、毛利率、營業利益率、稅後淨利、EPS等關鍵數據。
2. 財報亮點或衰退原因分析。
3. 法說會或公司對未來的展望。
請確保資訊是最新的，並且只提供與該個股相關的資訊。
**重要：請使用 Markdown 的粗體（**文字**）標註關鍵數據（如營收、EPS、毛利率等）及重要亮點。**`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      // tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || "無法生成財報摘要。";
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  
  const sources: NewsSource[] = chunks.map(chunk => {
    if (chunk.web) {
      return {
        title: chunk.web.title,
        uri: chunk.web.uri,
      };
    }
    return null;
  }).filter((item): item is NewsSource => item !== null);

  // Remove duplicates by URI
  const uniqueSources = Array.from(new Map(sources.map(item => [item.uri, item])).values());

  return {
    summary: text,
    sources: uniqueSources,
  };
}

export interface StockData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalAnalysisReport {
  summary: string;
  data: StockData[];
  sources: NewsSource[];
}

export async function fetchTechnicalAnalysis(query: string): Promise<TechnicalAnalysisReport> {
  const prompt = `請搜尋關於台股「${query}」最近的股價走勢與技術分析。
請提供：
1. 技術面分析摘要（包含均線、MACD、RSI等指標狀態，以及支撐與壓力位）。
2. 請以 JSON 格式提供最近 30 個交易日的股價資料，格式如下：
\`\`\`json
[
  {"date": "MM/DD", "open": 100, "high": 105, "low": 99, "close": 102, "volume": 1000}
]
\`\`\`
請確保資訊是最新的，並且只提供與該個股相關的資訊。
**重要：JSON 資料中的日期必須由舊到新排序（最舊的日期在陣列最前面，最新的日期在陣列最後面）。**
**重要：請使用 Markdown 的粗體（**文字**）標註關鍵價位（如支撐、壓力位）及重要技術指標狀態。**`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      // tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || "無法生成技術分析摘要。";
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  
  const sources: NewsSource[] = chunks.map(chunk => {
    if (chunk.web) {
      return {
        title: chunk.web.title,
        uri: chunk.web.uri,
      };
    }
    return null;
  }).filter((item): item is NewsSource => item !== null);

  const uniqueSources = Array.from(new Map(sources.map(item => [item.uri, item])).values());

  // Extract JSON data
  let stockData: StockData[] = [];
  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      stockData = JSON.parse(jsonMatch[1]);
    } else {
      // Try parsing without markdown block
      const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch) {
         stockData = JSON.parse(arrayMatch[0]);
      }
    }
  } catch (e) {
    console.error("Failed to parse stock data JSON", e);
  }

  // Remove JSON block from summary
  const summary = text.replace(/```json\n[\s\S]*?\n```/, '').replace(/\[\s*\{[\s\S]*\}\s*\]/, '').trim();

  return {
    summary,
    data: stockData,
    sources: uniqueSources,
  };
}

export interface ComprehensiveAnalysisReport {
  summary: string;
  sources: NewsSource[];
}

export interface StockRecommendation {
  symbol: string;
  name: string;
  reason: string;
  theme: string;
  price?: number;
  change?: number;
  changePercent?: number;
}

export interface SectorRating {
  theme: string;
  score: number;
  reason: string;
}

export interface SectorStock {
  symbol: string;
  name: string;
  score: number;
  reason: string;
  price?: number;
  change?: number;
  changePercent?: number;
}

export async function fetchStocksBySector(sector: string): Promise<SectorStock[]> {
  const prompt = `請分析目前台股「${sector}」族群中的主要個股（列出 5 到 10 檔）。
請根據目前的市場趨勢、財報表現與資金動向，為每檔個股給予 1 到 10 分的推薦評分（10分為極度推薦，1分為極不推薦）。
請務必以純 JSON 陣列格式回傳，並依照分數由高到低排序。不要包含任何 Markdown 標記或其他說明文字。格式如下：
[
  {
    "symbol": "2330",
    "name": "台積電",
    "score": 9,
    "reason": "先進製程需求強勁，營收持續創高。",
    "price": 1050,
    "change": 15,
    "changePercent": 1.45
  }
]
請確保資訊是最新的，並包含最新的股價(price)、漲跌點數(change，上漲為正數，下跌為負數)與漲跌幅百分比(changePercent，例如 1.45 代表 1.45%)。`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      // tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || "[]";
  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    } else {
      const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch) {
         return JSON.parse(arrayMatch[0]);
      }
    }
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse sector stocks JSON", e);
    return [];
  }
}

export async function fetchSectorRatings(): Promise<SectorRating[]> {
  const FIXED_SECTORS = [
    "半導體", "先進封裝(CoWoS/FOPLP)", "CPO矽光子", "AI伺服器與電腦週邊", "散熱模組",
    "機器人與智慧自動化", "電子零組件", "光電業", "通信網路與低軌衛星",
    "電機機械與重電", "航運業", "金融保險業", "生技醫療業", "車用電子與電動車",
    "鋼鐵工業", "塑膠工業", "營建業", "綠能環保", "觀光餐旅", "紡織纖維", "食品工業", "造紙工業"
  ];

  const prompt = `請分析目前台股市場的以下 ${FIXED_SECTORS.length} 個固定產業族群：
${FIXED_SECTORS.join('、')}。
請根據目前的市場趨勢、財報表現與資金動向，為「每一個」族群給予 1 到 10 分的推薦評分（10分為極度推薦，1分為極不推薦）。
請務必以純 JSON 陣列格式回傳，並包含所有上述族群，依照分數由高到低排序。不要包含任何 Markdown 標記或其他說明文字。格式如下：
[
  {
    "theme": "半導體",
    "score": 9,
    "reason": "先進製程需求強勁，AI晶片帶動整體產業鏈成長。"
  }
]
請確保資訊是最新的，並且「必須」完整包含我提供的所有族群，不要遺漏任何一個。`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      // tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || "[]";
  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    } else {
      const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch) {
         return JSON.parse(arrayMatch[0]);
      }
    }
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse sector ratings JSON", e);
    return [];
  }
}

export async function fetchStockRecommendations(): Promise<StockRecommendation[]> {
  const prompt = `請分析目前台股市場，挑選 2 到 3 個目前最熱門的族群/題材（例如：AI伺服器、重電、半導體設備等）。
請針對每個族群推薦 1 到 2 檔綜合考量最新財報表現與技術面強勢的個股，總共推薦 4 到 6 檔。
請務必以純 JSON 陣列格式回傳，不要包含任何 Markdown 標記或其他說明文字。格式如下：
[
  {
    "symbol": "2330",
    "name": "台積電",
    "reason": "營收創高，先進製程需求強勁，技術面呈現多頭排列。",
    "theme": "半導體/AI",
    "price": 1050,
    "change": 15,
    "changePercent": 1.45
  }
]
請確保資訊是最新的，並包含最新的股價(price)、漲跌點數(change，上漲為正數，下跌為負數)與漲跌幅百分比(changePercent，例如 1.45 代表 1.45%)。`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      // tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || "[]";
  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    } else {
      const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch) {
         return JSON.parse(arrayMatch[0]);
      }
    }
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse recommendations JSON", e);
    return [];
  }
}

export async function fetchComprehensiveAnalysis(query: string): Promise<ComprehensiveAnalysisReport> {
  const prompt = `請針對台股「${query}」進行綜合趨勢分析。
請「非常仔細且嚴謹地」查證並綜合考量該個股的最新新聞、最新一季財報表現、技術面走勢以及當日市場整體情形。
請提供以下彙整資訊，若無明確數據請說明「目前無明確資訊」，切勿憑空捏造：
1. 未來趨勢走向分析（結合基本面與技術面）。
2. 展望價格（目標價區間，請務必參考近期法人報告或新聞，若無則註明）。
3. 壓力區（上檔反壓位置）。
4. 支撐區（下檔防守位置）。
請確保資訊是最新的，並且只提供與該個股相關的資訊。
**重要：請使用 Markdown 的粗體（**文字**）標註目標價、壓力區、支撐區及關鍵趨勢結論。**`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      // tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || "無法生成綜合分析。";
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  
  const sources: NewsSource[] = chunks.map(chunk => {
    if (chunk.web) {
      return {
        title: chunk.web.title,
        uri: chunk.web.uri,
      };
    }
    return null;
  }).filter((item): item is NewsSource => item !== null);

  const uniqueSources = Array.from(new Map(sources.map(item => [item.uri, item])).values());

  return {
    summary: text,
    sources: uniqueSources,
  };
}