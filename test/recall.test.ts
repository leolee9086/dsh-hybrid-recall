import test from 'node:test';
import assert from 'node:assert/strict';
import { hybridRecall } from '../lib/index.js';

const candidate = (blockId: string) => ({ blockId, fresh: true, time: 1000 });

test('融合重合候选，保留两路依据且不修改来源结果', async () => {
  const keyword = [{ ...candidate('shared'), score: -2 }, { ...candidate('lexical'), score: -1 }];
  const semantic = [{ ...candidate('semantic'), vectorSources: [{ sourceId: 'local', similarity: 0.8 }] },
    { ...candidate('shared'), vectorSources: [{ sourceId: 'local', similarity: 0.7 }] }];
  const before = structuredClone({ keyword, semantic });
  const result = await hybridRecall({ memory: { recall: () => ({ items: keyword }) },
    vectors: { search: async () => ({ items: semantic }) } }, { query: 'clue', limit: 3 });
  assert.equal(result.items[0].blockId, 'shared');
  assert.deepEqual(result.items[0].recallSources, ['keyword', 'vector']);
  assert.equal(result.items.length, 3);
  assert.deepEqual({ keyword, semantic }, before);
});

test('语义来源异常时保留关键词结果并报告失败', async () => {
  const result = await hybridRecall({ memory: { recall: () => ({ items: [candidate('kept')] }) },
    vectors: { search: async () => { throw new Error('offline'); } } }, { query: 'clue' });
  assert.equal(result.items[0].blockId, 'kept');
  assert.deepEqual(result.failures, [{ sourceId: 'vectorStore', reason: 'unavailable' }]);
});

test('被动门槛在返回条数截断前筛除弱候选', async () => {
  const result = await hybridRecall({ memory: { recall: () => ({ items: [] }) }, vectors: {
    search: () => ({ items: [
      { ...candidate('weak'), vectorSources: [{ sourceId: 'local', similarity: 0.1 }] },
      { ...candidate('strong'), vectorSources: [{ sourceId: 'local', similarity: 0.8 }] },
    ] }),
  } }, { query: 'clue', passive: true, limit: 1 });
  assert.deepEqual(result.items.map(item => item.blockId), ['strong']);
});
