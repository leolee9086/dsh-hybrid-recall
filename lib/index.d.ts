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
    image?: {
        path: string;
        sha256: string;
    };
    limit?: number;
    passive?: boolean;
    minScore?: number;
    minSimilarity?: number;
    minSimilarityBySource?: Record<string, number>;
    [key: string]: unknown;
}
export interface RecallFailure {
    sourceId: string;
    reason: string;
}
export interface CandidateResult<T extends RecallCandidate> {
    items: T[];
    failures?: RecallFailure[];
    truncated?: boolean;
}
export interface RecallProviders<T extends RecallCandidate> {
    memory: {
        recall(request: RecallRequest): CandidateResult<T> | Promise<CandidateResult<T>>;
    };
    vectors?: {
        search(request: RecallRequest): CandidateResult<T> | Promise<CandidateResult<T>>;
    };
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
export declare function extractKeywords(text: string): string[];
/**
 * 合并关键词与语义候选，以各自排名累计 RRF，不直接相加异构原始分数。
 * 本次抽离保留旧的新鲜度优先及被动阈值；这不是通用排序策略已验收的声明。
 */
export declare function hybridRecall<T extends RecallCandidate>({ memory, vectors }: RecallProviders<T>, request?: RecallRequest): Promise<RecallOutcome<T>>;
