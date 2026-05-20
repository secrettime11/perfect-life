import { useState, useEffect, useMemo } from 'react';
import { Search, Clock, TrendingUp, ExternalLink, AlertCircle, Loader2, Newspaper, DollarSign, LineChart as LineChartIcon, Target, RefreshCw, Sparkles, ArrowLeft, Layers } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { fetchStockNews, fetchFinancialReport, fetchTechnicalAnalysis, fetchComprehensiveAnalysis, fetchStockRecommendations, fetchSectorRatings, fetchStocksBySector, NewsResult, FinancialReport, TechnicalAnalysisReport, ComprehensiveAnalysisReport, StockRecommendation, SectorRating, SectorStock } from './services/gemini';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, BarChart } from 'recharts';

const TIME_FRAMES = [
  { id: '24小時內', label: '24小時內' },
  { id: '過去1週', label: '過去1週' },
  { id: '過去1個月', label: '過去1個月' },
];

const Candlestick = (props: any) => {
  const { x, y, width, height, payload } = props;
  
  // Try to get data from payload.payload (Recharts wrapper) or payload directly
  const data = payload?.payload || payload || props;
  if (!data || typeof x !== 'number' || typeof y !== 'number') return null;
  
  const open = Number(data.open);
  const close = Number(data.close);
  const high = Number(data.high);
  const low = Number(data.low);
  
  // 台灣股市：紅漲綠跌。通常 K 線實體顏色以收盤價與開盤價比較
  const isUp = close >= open;
  const color = isUp ? '#ef4444' : '#22c55e';

  const h = typeof height === 'number' && !isNaN(height) ? Math.abs(height) : 10;
  const w = typeof width === 'number' && !isNaN(width) ? Math.max(width, 1) : 5;
  const yTop = typeof y === 'number' && !isNaN(y) ? Math.min(y, y + (height || 0)) : 0;

  if (high === low || h === 0) {
    return <rect x={x} y={yTop} width={w} height={2} fill={color} />;
  }

  const ratio = h / (high - low);
  const openY = yTop + (high - open) * ratio;
  const closeY = yTop + (high - close) * ratio;

  const bodyTop = Math.min(openY, closeY);
  const bodyHeight = Math.max(Math.abs(openY - closeY), 2);
  const centerX = x + w / 2;

  return (
    <g>
      <line x1={centerX} y1={yTop} x2={centerX} y2={yTop + h} stroke={color} strokeWidth={1.5} />
      <rect x={x} y={bodyTop} width={w} height={bodyHeight} fill={color} stroke={color} />
    </g>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isUp = data.close >= (data.yesterdayClose || data.open);
    const colorClass = isUp ? 'text-red-500' : 'text-green-500';
    return (
      <div className="bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-slate-200 text-slate-800 z-50">
        <p className="font-bold text-slate-900 mb-2 border-b border-slate-100 pb-1">{label}</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <span className="text-slate-500">昨收:</span>
          <span className="font-medium">{data.yesterdayClose || '-'}</span>
          <span className="text-slate-500">開盤:</span>
          <span className={`font-medium ${data.open >= (data.yesterdayClose || data.open) ? 'text-red-500' : 'text-green-500'}`}>{data.open}</span>
          <span className="text-slate-500">最高:</span>
          <span className={`font-medium ${data.high >= (data.yesterdayClose || data.open) ? 'text-red-500' : 'text-green-500'}`}>{data.high}</span>
          <span className="text-slate-500">最低:</span>
          <span className={`font-medium ${data.low >= (data.yesterdayClose || data.open) ? 'text-red-500' : 'text-green-500'}`}>{data.low}</span>
          <span className="text-slate-500">收盤:</span>
          <span className={`font-bold ${colorClass}`}>{data.close}</span>
          <span className="text-slate-500">成交量:</span>
          <span className="font-medium">{data.volume}</span>
        </div>
      </div>
    );
  }
  return null;
};

const processChartData = (data: any[]) => {
  if (!data || data.length === 0) return [];
  
  return data.map((item, index, arr) => {
    const getMA = (days: number) => {
      if (index < days - 1) return null;
      let sum = 0;
      for (let i = 0; i < days; i++) {
        const prevItem = arr[index - i];
        sum += Number(prevItem.close || prevItem['收盤'] || prevItem['收盤價'] || 0);
      }
      return Number((sum / days).toFixed(2));
    };
    
    const open = Number(item.open || item['開盤'] || item['開盤價'] || 0);
    const close = Number(item.close || item['收盤'] || item['收盤價'] || 0);
    const high = Number(item.high || item['最高'] || item['最高價'] || 0);
    const low = Number(item.low || item['最低'] || item['最低價'] || 0);
    const volume = Number(item.volume || item['成交量'] || 0);
    
    const prevItem = index > 0 ? arr[index - 1] : item;
    const yesterdayClose = index > 0 ? Number(prevItem.close || prevItem['收盤'] || prevItem['收盤價'] || 0) : open;
    
    return {
      ...item,
      open,
      close,
      high,
      low,
      volume,
      yesterdayClose,
      ma5: getMA(5),
      ma10: getMA(10),
      ma20: getMA(20),
    };
  });
};

const searchCache = new Map<string, {
  timestamp: number;
  data: {
    news: NewsResult | null;
    financial: FinancialReport | null;
    tech: TechnicalAnalysisReport | null;
    comp: ComprehensiveAnalysisReport | null;
  }
}>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export default function App() {
  const [query, setQuery] = useState('');
  const [timeFrame, setTimeFrame] = useState(TIME_FRAMES[2].id);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NewsResult | null>(null);
  const [financialResult, setFinancialResult] = useState<FinancialReport | null>(null);
  const [techResult, setTechResult] = useState<TechnicalAnalysisReport | null>(null);
  const [comprehensiveResult, setComprehensiveResult] = useState<ComprehensiveAnalysisReport | null>(null);
  const [activeTab, setActiveTab] = useState<'news' | 'financial' | 'tech' | 'comprehensive'>('news');
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState<StockRecommendation[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(true);
  const [sectorRatings, setSectorRatings] = useState<SectorRating[]>([]);
  const [isLoadingSectors, setIsLoadingSectors] = useState(true);
  const [homeTab, setHomeTab] = useState<'stocks' | 'sectors'>('stocks');
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [sectorStocks, setSectorStocks] = useState<SectorStock[]>([]);
  const [isLoadingSectorStocks, setIsLoadingSectorStocks] = useState(false);

  const loadRecommendations = async () => {
    setIsLoadingRecs(true);
    try {
      const recs = await fetchStockRecommendations();
      setRecommendations(recs);
    } catch (err) {
      console.error("Failed to load recommendations:", err);
    } finally {
      setIsLoadingRecs(false);
    }
  };

  useEffect(() => {
    const loadSectors = async () => {
      try {
        const sectors = await fetchSectorRatings();
        setSectorRatings(sectors);
      } catch (err) {
        console.error("Failed to load sectors:", err);
      } finally {
        setIsLoadingSectors(false);
      }
    };

    loadRecommendations();
    loadSectors();
  }, []);

  const performSearch = async (searchQuery: string, forceRefresh = false) => {
    if (!searchQuery.trim()) return;
    
    setQuery(searchQuery);
    setIsLoading(true);
    setError(null);
    setResult(null);
    setFinancialResult(null);
    setTechResult(null);
    setComprehensiveResult(null);
    setActiveTab('news');

    const cacheKey = `${searchQuery.trim()}-${timeFrame}`;
    if (!forceRefresh) {
      const cached = searchCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setResult(cached.data.news);
        setFinancialResult(cached.data.financial);
        setTechResult(cached.data.tech);
        setComprehensiveResult(cached.data.comp);
        setIsLoading(false);
        return;
      }
    }

    try {
      const [newsData, financialData, techData, compData] = await Promise.all([
        fetchStockNews(searchQuery.trim(), timeFrame),
        fetchFinancialReport(searchQuery.trim()),
        fetchTechnicalAnalysis(searchQuery.trim()),
        fetchComprehensiveAnalysis(searchQuery.trim())
      ]);
      
      searchCache.set(cacheKey, {
        timestamp: Date.now(),
        data: { news: newsData, financial: financialData, tech: techData, comp: compData }
      });

      setResult(newsData);
      setFinancialResult(financialData);
      setTechResult(techData);
      setComprehensiveResult(compData);
    } catch (err) {
      console.error(err);
      setError('搜尋時發生錯誤，請稍後再試。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const handleClearSearch = () => {
    setQuery('');
    setResult(null);
    setFinancialResult(null);
    setTechResult(null);
    setComprehensiveResult(null);
    setError(null);
  };

  const handleSectorClick = async (sectorTheme: string) => {
    setSelectedSector(sectorTheme);
    setIsLoadingSectorStocks(true);
    try {
      const stocks = await fetchStocksBySector(sectorTheme);
      setSectorStocks(stocks);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingSectorStocks(false);
    }
  };

  const handleBackToSectors = () => {
    setSelectedSector(null);
    setSectorStocks([]);
  };

  const groupedRecommendations = recommendations.reduce((acc, rec) => {
    const theme = rec.theme || '其他';
    if (!acc[theme]) {
      acc[theme] = [];
    }
    acc[theme].push(rec);
    return acc;
  }, {} as Record<string, StockRecommendation[]>);

  const handleReanalyze = async () => {
    if (!query.trim()) return;
    setIsReanalyzing(true);
    setError(null);
    try {
      const compData = await fetchComprehensiveAnalysis(query.trim());
      setComprehensiveResult(compData);
    } catch (err) {
      console.error(err);
      setError('重新彙整時發生錯誤，請稍後再試。');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const chartData = useMemo(() => {
    return techResult?.data ? processChartData(techResult.data) : [];
  }, [techResult?.data]);

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto">
      <header className="mb-8 text-center md:text-left">
        <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
          <div className="bg-blue-600 p-2 rounded-xl text-white">
            <TrendingUp size={28} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Perfect life</h1>
        </div>
        <p className="text-slate-500">快速掌握個股最新動態與市場新聞</p>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 mb-8">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="輸入股票名稱或代號 (例如: 台積電, 2330)"
              className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              required
            />
          </div>
          
          <div className="relative md:w-48">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Clock className="h-5 w-5 text-slate-400" />
            </div>
            <select
              value={timeFrame}
              onChange={(e) => setTimeFrame(e.target.value)}
              className="block w-full pl-10 pr-10 py-3 border border-slate-300 rounded-xl leading-5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none transition-colors"
            >
              {TIME_FRAMES.map((tf) => (
                <option key={tf.id} value={tf.id}>
                  {tf.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[120px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>搜尋中...</span>
              </>
            ) : (
              <span>搜尋新聞</span>
            )}
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-8 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {!result && !isLoading && !error && (
        <div className="mb-8">
          <div className="flex space-x-2 border-b border-slate-200 mb-6">
            <button
              onClick={() => setHomeTab('stocks')}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                homeTab === 'stocks'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                AI 嚴選推薦
              </div>
            </button>
            <button
              onClick={() => setHomeTab('sectors')}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                homeTab === 'sectors'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                產業族群評分
              </div>
            </button>
          </div>

          {homeTab === 'stocks' && (
            <div>
              <div className="flex justify-end mb-4">
                <button
                  onClick={loadRecommendations}
                  disabled={isLoadingRecs}
                  className="flex items-center gap-2 text-sm font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingRecs ? 'animate-spin' : ''}`} />
                  重新推薦
                </button>
              </div>
              {isLoadingRecs ? (
                <div className="flex items-center justify-center py-12 text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>正在分析市場趨勢與精選個股...</span>
                </div>
              ) : recommendations.length > 0 ? (
                <div className="space-y-6">
                  {Object.entries(groupedRecommendations).map(([theme, recs]) => (
                    <div key={theme} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                      <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2 border-l-4 border-blue-500 pl-3">
                        {theme}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recs.map((rec, idx) => (
                          <button
                            key={idx}
                            onClick={() => performSearch(`${rec.name} ${rec.symbol}`)}
                            className="text-left bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all group flex flex-col"
                          >
                            <div className="flex justify-between items-start mb-3 w-full">
                              <div>
                                <h4 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                  {rec.name} <span className="text-sm text-slate-500 font-normal ml-1">{rec.symbol}</span>
                                </h4>
                                {rec.price !== undefined && (
                                  <div className="flex items-baseline gap-2 mt-1">
                                    <span className="text-lg font-bold text-slate-800">{rec.price}</span>
                                    <span className={`text-sm font-medium ${rec.change && rec.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                                      {rec.change && rec.change > 0 ? '+' : ''}{rec.change} ({rec.changePercent && rec.changePercent > 0 ? '+' : ''}{rec.changePercent}%)
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed mt-auto">
                              {rec.reason}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center text-slate-500">
                  目前無法取得推薦名單，請稍後再試或直接使用上方搜尋。
                </div>
              )}
            </div>
          )}

          {homeTab === 'sectors' && (
            <div>
              {selectedSector ? (
                <div>
                  <div className="flex items-center gap-4 mb-6">
                    <button
                      onClick={handleBackToSectors}
                      className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors font-medium bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 hover:border-blue-300"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      返回族群列表
                    </button>
                    <h2 className="text-xl font-bold text-slate-800">{selectedSector} 族群個股評分</h2>
                  </div>
                  
                  {isLoadingSectorStocks ? (
                    <div className="flex items-center justify-center py-12 text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-sm">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      <span>正在分析 {selectedSector} 族群個股...</span>
                    </div>
                  ) : sectorStocks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sectorStocks.map((stock, idx) => (
                        <button
                          key={idx}
                          onClick={() => performSearch(`${stock.name} ${stock.symbol}`)}
                          className="text-left bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all group flex flex-col"
                        >
                          <div className="flex justify-between items-start mb-3 w-full">
                            <div>
                              <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                {stock.name} <span className="text-sm text-slate-500 font-normal ml-1">{stock.symbol}</span>
                              </h3>
                              {stock.price !== undefined && (
                                <div className="flex items-baseline gap-2 mt-1">
                                  <span className="text-lg font-bold text-slate-800">{stock.price}</span>
                                  <span className={`text-sm font-medium ${stock.change && stock.change >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                                    {stock.change && stock.change > 0 ? '+' : ''}{stock.change} ({stock.changePercent && stock.changePercent > 0 ? '+' : ''}{stock.changePercent}%)
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className={`px-2.5 py-1 rounded-md text-sm font-bold whitespace-nowrap ml-2 ${
                              stock.score >= 8 ? 'bg-green-100 text-green-700' :
                              stock.score >= 5 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {stock.score} 分
                            </div>
                          </div>
                          <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed mt-auto">
                            {stock.reason}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center text-slate-500">
                      目前無法取得該族群的個股資料，請稍後再試。
                    </div>
                  )}
                </div>
              ) : isLoadingSectors ? (
                <div className="flex items-center justify-center py-12 text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>正在分析各大產業族群趨勢...</span>
                </div>
              ) : sectorRatings.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sectorRatings.map((sector, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => handleSectorClick(sector.theme)}
                      className="text-left bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col hover:border-blue-400 hover:shadow-md transition-all group w-full"
                    >
                      <div className="flex justify-between items-center mb-3 w-full">
                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{sector.theme}</h3>
                        <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                          sector.score >= 8 ? 'bg-green-100 text-green-700' :
                          sector.score >= 5 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {sector.score} / 10 分
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {sector.reason}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center text-slate-500">
                  目前無法取得族群評分，請稍後再試。
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mb-6">
          <button
            onClick={handleClearSearch}
            className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors font-medium bg-white px-4 py-2.5 rounded-xl shadow-sm border border-slate-200 hover:border-blue-300 w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            返回推薦首頁
          </button>
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex space-x-2 border-b border-slate-200 mb-6">
              <button
                onClick={() => setActiveTab('news')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'news'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Newspaper className="h-4 w-4" />
                  新聞摘要
                </div>
              </button>
              <button
                onClick={() => setActiveTab('financial')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'financial'
                    ? 'border-emerald-600 text-emerald-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  最新財報
                </div>
              </button>
              <button
                onClick={() => setActiveTab('tech')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'tech'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <LineChartIcon className="h-4 w-4" />
                  技術分析
                </div>
              </button>
              <button
                onClick={() => setActiveTab('comprehensive')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'comprehensive'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  綜合趨勢分析
                </div>
              </button>
            </div>

            {activeTab === 'financial' && financialResult && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                  <DollarSign className="h-6 w-6 text-emerald-600" />
                  最新一季財報摘要
                </h2>
                <div className="markdown-body text-slate-700">
                  <ReactMarkdown>{financialResult.summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {activeTab === 'tech' && techResult && (
              <div className="space-y-6">
                {techResult.data && techResult.data.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                    <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                      <LineChartIcon className="h-6 w-6 text-purple-600" />
                      近期股價走勢
                    </h2>
                    
                    <div className="bg-white rounded-xl p-2 md:p-4 w-full border border-slate-100 shadow-sm">
                      {/* Price Chart */}
                      <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} syncId="stockChart" margin={{ top: 15, right: 40, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                            <XAxis dataKey="date" hide />
                            <YAxis yAxisId="price" orientation="right" domain={['auto', 'auto']} stroke="#94a3b8" fontSize={12} tickFormatter={(value) => value.toString()} axisLine={false} tickLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            
                            {chartData.length > 0 && chartData[chartData.length - 1].yesterdayClose && (
                              <ReferenceLine 
                                yAxisId="price" 
                                y={chartData[chartData.length - 1].yesterdayClose} 
                                stroke="#94a3b8" 
                                strokeDasharray="3 3" 
                                label={{ position: 'insideTopLeft', value: `昨收 ${chartData[chartData.length - 1].yesterdayClose}`, fill: '#94a3b8', fontSize: 12 }}
                              />
                            )}

                            <Bar yAxisId="price" dataKey={['low', 'high'] as any} name="K線" shape={<Candlestick />} />
                            
                            {/* Invisible lines to ensure YAxis domain includes high and low */}
                            <Line yAxisId="price" type="monotone" dataKey="high" stroke="none" dot={false} isAnimationActive={false} />
                            <Line yAxisId="price" type="monotone" dataKey="low" stroke="none" dot={false} isAnimationActive={false} />
                            
                            <Line yAxisId="price" type="monotone" dataKey="ma5" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="MA5" />
                            <Line yAxisId="price" type="monotone" dataKey="ma10" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="MA10" />
                            <Line yAxisId="price" type="monotone" dataKey="ma20" stroke="#06b6d4" strokeWidth={1.5} dot={false} name="MA20" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      
                      {/* Volume Chart */}
                      <div className="h-[120px] w-full mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} syncId="stockChart" margin={{ top: 0, right: 40, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickMargin={10} axisLine={false} tickLine={false} />
                            <YAxis orientation="right" stroke="#94a3b8" fontSize={12} tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(1)}k` : value} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{fill: '#f8fafc'}} content={() => null} />
                            <Bar dataKey="volume" name="成交量" opacity={0.8}>
                              {chartData.map((entry, index) => {
                                const isUp = entry.close >= (entry.yesterdayClose || entry.open);
                                return <Cell key={`cell-${index}`} fill={isUp ? '#ef4444' : '#22c55e'} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      
                      <div className="flex items-center gap-4 mt-2 text-sm justify-center text-slate-600">
                        <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#f59e0b]"></div> MA5</div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#3b82f6]"></div> MA10</div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#06b6d4]"></div> MA20</div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#94a3b8] border-t border-dashed border-[#94a3b8]"></div> 昨收(平盤)</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                  <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                    <TrendingUp className="h-6 w-6 text-purple-600" />
                    技術面分析摘要
                  </h2>
                  <div className="markdown-body text-slate-700">
                    <ReactMarkdown>{techResult.summary}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'comprehensive' && comprehensiveResult && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                    <Target className="h-6 w-6 text-orange-600" />
                    綜合趨勢與展望分析
                  </h2>
                  <button
                    onClick={handleReanalyze}
                    disabled={isReanalyzing}
                    className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-orange-200"
                  >
                    {isReanalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        重新彙整中...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        重新仔細查證與彙整
                      </>
                    )}
                  </button>
                </div>
                <div className="markdown-body text-slate-700">
                  <ReactMarkdown>{comprehensiveResult.summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {activeTab === 'news' && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                  <Newspaper className="h-6 w-6 text-blue-600" />
                  AI 新聞摘要
                </h2>
                <div className="markdown-body text-slate-700">
                  <ReactMarkdown>{result.summary}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <ExternalLink className="h-5 w-5 text-slate-500" />
                參考來源 ({
                  activeTab === 'news' ? result.sources.length : 
                  activeTab === 'financial' ? (financialResult?.sources.length || 0) :
                  activeTab === 'tech' ? (techResult?.sources.length || 0) :
                  (comprehensiveResult?.sources.length || 0)
                })
              </h2>
              
              {(
                activeTab === 'news' ? result.sources : 
                activeTab === 'financial' ? (financialResult?.sources || []) :
                activeTab === 'tech' ? (techResult?.sources || []) :
                (comprehensiveResult?.sources || [])
              ).length > 0 ? (
                <ul className="space-y-3">
                  {(
                    activeTab === 'news' ? result.sources : 
                    activeTab === 'financial' ? (financialResult?.sources || []) :
                    activeTab === 'tech' ? (techResult?.sources || []) :
                    (comprehensiveResult?.sources || [])
                  ).map((source, index) => (
                    <li key={index}>
                      <a
                        href={source.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all"
                      >
                        <h3 className="text-sm font-medium text-slate-800 group-hover:text-blue-600 line-clamp-2 mb-1">
                          {source.title}
                        </h3>
                        <p className="text-xs text-slate-400 truncate">
                          {new URL(source.uri).hostname}
                        </p>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 italic">未找到具體的來源連結。</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
