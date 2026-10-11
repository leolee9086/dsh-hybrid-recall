# @leolee9086/dsh-hybrid-recall

独立的 TypeScript 混合召回实现。调用方提供关键词和向量候选来源，库执行排名融合、降级和被动门槛筛选。没有运行时依赖，不加载 DSH，不打开数据库，不生成嵌入，也不依赖查询插件。

```ts
import { hybridRecall } from '@leolee9086/dsh-hybrid-recall';

const result = await hybridRecall({
  memory: { recall: request => keywordSearch(request) },
  vectors: { search: request => vectorSearch(request) },
}, { query: '自然语言线索', limit: 5 });
```

来源返回 `{ items }`，语义来源可附带 `failures` 和 `truncated`。候选必须携带 `blockId`、`fresh` 和毫秒时间 `time`；关键词候选可带 `score`，语义候选可带 `vectorSources`。其它业务字段原样保留，无须使用问答正文。来源支持同步或异步函数。过滤条件及图片对象原样交给来源，由来源执行检索与校验。

返回结果包含 `recallSources`、`recallScore`、来源失败信息与截断标记。缺少或失败的语义来源不阻止关键词结果返回。

本次抽离保留查询插件原有的新鲜度优先、RRF 常数和被动阈值。跨空间排序与分片合并的后续纠正仍由相关工作处理，不能把这些默认策略当作经过质量评估的结论。

开发使用 `pnpm install`、`pnpm build`、`pnpm test`。TypeScript 源码在 src，编译后的 JavaScript 和声明文件在 lib 并随包提交；消费者不需要编译 TypeScript。

0.1.0 通过 GitHub Release 分发，使用以下固定版本地址安装：

```sh
pnpm add https://github.com/leolee9086/dsh-hybrid-recall/releases/download/v0.1.0/leolee9086-dsh-hybrid-recall-0.1.0.tgz
```

npm registry 发布需要维护者完成二次认证；当前消费者锁定上述远端产物，不需要相邻工作树。
