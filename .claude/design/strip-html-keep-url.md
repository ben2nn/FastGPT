# 增强索引清洗 HTML 标签时保留 URL

## 背景

增强索引队列（`generateEnhanceIndex`）在清洗数据时调用 `stripHtml` 去除 HTML 标签，避免把标签当作内容发给 LLM。但当前实现会把 Markdown 自动链接形式的 URL 也当作标签吞掉。

## 问题

`.replace(/<[^>]+>/g, '')` 无法区分 HTML 标签与尖括号包裹的 URL：

| 输入 | 当前输出（错误） | 期望输出 |
| --- | --- | --- |
| `访问 <https://example.com/a?b=1&c=2>` | `访问` | `访问 https://example.com/a?b=1&c=2` |
| `见 <www.example.com>` | `见` | `见 www.example.com` |
| `<div>正文</div>` | `正文` | `正文`（真实标签仍须删除） |

影响范围：
- 发给 LLM 的增强内容丢失 URL（`generateEnhanceIndex.ts:184-185`）
- 写回数据库的 A 字段丢失 URL（`newA = buildAnswerWithContext(cleanA ...)`）
- 标题提取（`extractTitle`）若第一行是自动链接 URL，标题会变空

## 方案

在删除 HTML 标签**之前**，先摘掉 URL 自动链接的尖括号，保留 URL 本身：

```ts
// 摘掉 Markdown 自动链接 <https://...> / <www...> 的尖括号，
// 避免后续被当作 HTML 标签删除
export const unwrapAutoLinkUrl = (text: string): string =>
  text.replace(/<((?:https?:\/\/|ftp:\/\/|www\.)[^<>\s]+)>/gi, '$1');
```

- 放置位置：`projects/admin/src/service/common/string.ts`，供所有调用方复用
- `stripHtml` 在第一步调用它
- 三处 `extractTitle`（`generateEnhanceIndex.ts` / `enhancePreview.ts` / `enhanceQuickTest.ts`）的 `.replace(/<[^>]+>/g, '')` 之前同样调用
- 字符类排除 `<` `>` 和空白，防止跨标签误匹配；URL 后紧跟的中文标点（如 `。`）位于尖括号外时不受影响
- 实体解码顺序不变：`stripHtml` 末尾的 `.replace(/&amp;/g, '&')` 会把 URL 查询参数中的 `&amp;` 还原为 `&`，符合预期

## 实体解码扩展

现状只解码 4 个实体（`&nbsp;` `&lt;` `&gt;` `&amp;`）。中文文档（Word 导出、网页抓取）常见的 `&ldquo;`、`&sect;`、`&#160;` 等会以原文残留，URL 甚至会被整体实体化（`https:&#47;&#47;example.com`）。

### 方案

新增 `decodeHtmlEntities`，用**单次 replace 回调**统一解码命名实体 + 数字实体（`&#dddd;` / `&#xhhhh;`）。单次扫描天然避免双重解码（`&amp;lt;` → `&lt;`，只解一层），替换顺序不变：仍放在删标签**之后**，保证 `&lt;div&gt;` 解码后作为字面文本保留、不被当标签删除。

```ts
const HTML_ENTITY_MAP: Record<string, string> = {
  nbsp: ' ', ensp: ' ', emsp: ' ',
  quot: '"', apos: "'",
  lt: '<', gt: '>', amp: '&',
  ldquo: '“', rdquo: '”',   // “ ”
  lsquo: '‘', rsquo: '’',   // ‘ ’
  hellip: '…',                    // …
  mdash: '—', ndash: '–',   // — –
  middot: '·', bull: '•',   // · •
  sect: '§', para: '¶',     // § ¶（法规文档高频）
  times: '×', divide: '÷', deg: '°', plusmn: '±', // × ÷ ° ±
  le: '≤', ge: '≥', ne: '≠',
  frac12: '½', frac14: '¼', frac34: '¾',
  copy: '©', reg: '®', trade: '™',
  yen: '¥', euro: '€', pound: '£',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓'
};

export const decodeHtmlEntities = (text: string): string =>
  text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    // 数字实体 &#47; / &#x2F;
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return HTML_ENTITY_MAP[entity.toLowerCase()] ?? match;
  });
```

- 未知实体（`&foo;`）、超范围码点（`&#99999999;`）、控制字符码点原样保留，不抛异常
- `&#160;`（NBSP）归一化为普通空格，与 `&nbsp;` 行为一致，避免干扰下游分块/分词
- `stripHtml` 用 `decodeHtmlEntities` 替换现有 4 行实体 replace（解码仍位于删标签之后、换行压缩之前）

### 测试示例（追加）

```ts
it('解码中文文档常见实体', () => {
  expect(stripHtml('&ldquo;放射诊疗&rdquo;与&sect;相关')).toBe('“放射诊疗”与§相关');
});
it('数字实体还原 URL', () => {
  expect(stripHtml('https:&#47;&#47;example.com&#47;a&#63;b=1')).toBe('https://example.com/a?b=1');
});
it('&#160; 还原为空格', () => {
  expect(stripHtml('a&#160;b')).toBe('a b');
});
it('实体编码的标签保留为字面文本', () => {
  expect(stripHtml('&lt;div&gt;正文&lt;/div&gt;')).toBe('<div>正文</div>');
});
it('仅解码一层，不双重解码', () => {
  expect(stripHtml('&amp;lt;')).toBe('&lt;');
});
it('未知实体与非法码点原样保留', () => {
  expect(stripHtml('&foo; &#99999999;')).toBe('&foo; &#99999999;');
});
```

## 测试示例（test/cases/service/common/stripHtml.test.ts）

```ts
import { describe, it, expect } from 'vitest';
import { stripHtml, unwrapAutoLinkUrl } from '@/service/common/string';

describe('stripHtml keep url', () => {
  it('保留 http 自动链接', () => {
    expect(stripHtml('访问 <https://example.com/a?b=1&c=2> 获取')).toBe(
      '访问 https://example.com/a?b=1&c=2 获取'
    );
  });
  it('保留 www 自动链接', () => {
    expect(stripHtml('见 <www.example.com> 或 https://a.b.c')).toBe(
      '见 www.example.com 或 https://a.b.c'
    );
  });
  it('URL 查询参数 &amp; 还原为 &', () => {
    expect(stripHtml('<https://example.com?a=1&amp;b=2>')).toBe('https://example.com?a=1&b=2');
  });
  it('真实 HTML 标签仍被删除', () => {
    expect(stripHtml('<a href="https://x.com">链接</a><br>正文')).toBe('链接\n正文');
    expect(stripHtml('<script>alert(1)</script>')).toBe('alert(1)');
  });
  it('unwrapAutoLinkUrl 仅处理 URL 自动链接', () => {
    expect(unwrapAutoLinkUrl('<https://a.b> <div>')).toBe('https://a.b <div>');
  });
});
```

## 涉及文件

| 文件 | 改动 |
| --- | --- |
| `projects/admin/src/service/common/string.ts` | 新增 `unwrapAutoLinkUrl`；`stripHtml` 第一步调用 |
| `projects/admin/src/service/core/dataset/queues/generateEnhanceIndex.ts` | `extractTitle` 在删标签前调用 `unwrapAutoLinkUrl` |
| `projects/admin/src/pages/api/core/dataset/training/enhancePreview.ts` | 同上 |
| `projects/admin/src/pages/api/core/dataset/training/enhanceQuickTest.ts` | 同上 |
| `test/cases/service/common/stripHtml.test.ts` | 新增测试 |

## 验证

1. `pnpm vitest run test/cases/service/common/stripHtml.test.ts` 通过
2. 受影响模块无编译错误（`pnpm -C projects/admin exec tsc --noEmit` 或 lint）
