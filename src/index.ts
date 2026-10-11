// 独立召回实现：调用方提供候选来源，库不打开数据库、不读取文件，也不依赖宿主或插件。
export interface VectorSource {
  sourceId: string;
  similarity: number;
  [key: string]: unknown;
}

/** 只要求合并与现有排序需要的字段；问答正文、会话定位等由调用方携带。 */
export interface RecallCandidate {
  blockId: string;
  fresh: boolean;
  time: number;
  score?: number;
  vectorSources?: VectorSource[];
  matchedModality?: string;
}

export interface RecallRequest {
  query?: string;
  keywords?: string[];
  image?: { path: string; sha256: string };
  limit?: number;
  passive?: boolean;
  minScore?: number;
  minSimilarity?: number;
  minSimilarityBySource?: Record<string, number>;
  // 过滤参数原样交给来源处理，公共层不解释记忆分类或数据库结构。
  [key: string]: unknown;
}

export interface RecallFailure { sourceId: string; reason: string }
export interface CandidateResult<T extends RecallCandidate> {
  items: T[];
  failures?: RecallFailure[];
  truncated?: boolean;
}
export interface RecallProviders<T extends RecallCandidate> {
  memory: { recall(request: RecallRequest): CandidateResult<T> | Promise<CandidateResult<T>> };
  vectors?: { search(request: RecallRequest): CandidateResult<T> | Promise<CandidateResult<T>> };
}
export type Recalled<T extends RecallCandidate> = Omit<T, "score" | "vectorSources"> & {
  score: undefined;
  keywordScore: number | undefined;
  vectorSources: VectorSource[];
  recallScore: number;
  recallSources: ("keyword" | "vector")[];
};
export interface RecallOutcome<T extends RecallCandidate> {
  items: Recalled<T>[];
  total: number;
  fresh: number;
  stale: number;
  failures: RecallFailure[];
  truncated: boolean;
  mode: "hybrid" | "keyword-only";
}

/** 延续原关键词提取规则，主动与被动召回共用同一个实现。 */
export function extractKeywords(text: string): string[] {
  const source = String(text ?? "");
  const found = [
    ...source.matchAll(/[\u4e00-\u9fff]{2,}/g),
    ...source.matchAll(/[A-Za-z0-9_]{3,}/g),
  ].map((match) => match[0]);
  return [...new Set(found)].slice(0, 8);
}

/**
 * 合并关键词与语义候选，以各自排名累计 RRF，不直接相加异构原始分数。
 * 本次抽离保留旧的新鲜度优先及被动阈值；这不是通用排序策略已验收的声明。
 */
export async function hybridRecall<T extends RecallCandidate>(
  { memory, vectors }: RecallProviders<T>, request: RecallRequest = {},
): Promise<RecallOutcome<T>> {
  const limit = Math.max(1, Math.min(2000, Math.trunc(request.limit ?? 5)));
  const query = request.query?.trim() || (request.keywords ?? []).filter((word) => typeof word === "string").join(" ");
  const keywords = request.keywords?.length ? request.keywords : extractKeywords(query);
  const candidateLimit = Math.min(2000, Math.max(limit * 4, 20));
  const keyword = await memory.recall({ ...request, keywords, limit: candidateLimit });
  let semantic: CandidateResult<T> = {
    items: [], failures: [{ sourceId: "vectorStore", reason: "not-mounted" }], truncated: false,
  };
  if (vectors) {
    try { semantic = await vectors.search({ ...request, query, limit: candidateLimit }); }
    catch { semantic.failures = [{ sourceId: "vectorStore", reason: "unavailable" }]; }
  }
  const merged = new Map<string, Recalled<T>>();
  const entry = (item: T): Recalled<T> => {
    let value = merged.get(item.blockId);
    if (!value) {
      value = { ...item, score: undefined, keywordScore: undefined, vectorSources: [], recallScore: 0, recallSources: [] };
      merged.set(item.blockId, value);
    }
    return value;
  };
  keyword.items.forEach((item, rank) => {
    const value = entry(item);
    value.keywordScore = item.score;
    value.recallScore += 1 / (60 + rank + 1);
    value.recallSources.push("keyword");
  });
  semantic.items.forEach((item, rank) => {
    const value = entry(item);
    value.vectorSources = item.vectorSources ?? [];
    value.matchedModality = item.matchedModality;
    value.recallScore += 1 / (60 + rank + 1);
    value.recallSources.push("vector");
  });
  // 在截断前判断被动门槛，避免弱候选占满返回名额。
  const eligible = [...merged.values()].filter((item) => {
    if (!request.passive) return true;
    if (-Number(item.keywordScore) >= (request.minScore ?? 1)) return true;
    return item.vectorSources.some((source) => {
      const threshold = request.minSimilarityBySource?.[source.sourceId]
        ?? (source.sourceId === "local-multimodal" ? 0.3 : request.minSimilarity ?? 0.45);
      return Number.isFinite(source.similarity) && source.similarity >= threshold;
    });
  });
  const items = eligible.sort((a, b) => Number(b.fresh) - Number(a.fresh) || b.recallScore - a.recallScore || b.time - a.time).slice(0, limit);
  return {
    items, total: merged.size, fresh: items.filter((item) => item.fresh).length,
    stale: items.filter((item) => !item.fresh).length, failures: semantic.failures ?? [],
    truncated: semantic.truncated ?? false, mode: vectors ? "hybrid" : "keyword-only",
  };
}
