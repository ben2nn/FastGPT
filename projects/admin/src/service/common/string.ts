/**
 * 摘掉 Markdown 自动链接 <https://...> / <www...> 的尖括号，保留 URL 本身，
 * 避免后续被当作 HTML 标签删除。
 */
export const unwrapAutoLinkUrl = (text: string): string =>
  text.replace(/<((?:https?:\/\/|ftp:\/\/|www\.)[^<>\s]+)>/gi, '$1');

const HTML_ENTITY_MAP: Record<string, string> = {
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  amp: '&',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  bull: '•',
  sect: '§',
  para: '¶',
  times: '×',
  divide: '÷',
  deg: '°',
  plusmn: '±',
  le: '≤',
  ge: '≥',
  ne: '≠',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  copy: '©',
  reg: '®',
  trade: '™',
  yen: '¥',
  euro: '€',
  pound: '£',
  rarr: '→',
  larr: '←',
  uarr: '↑',
  darr: '↓'
};

/**
 * 解码 HTML 实体：命名实体（&ldquo;、&sect; 等）+ 数字实体（&#47;、&#x2F;）。
 * 单次 replace 回调保证只解一层（&amp;lt; → &lt;，不双重解码）。
 * 未知实体、非法码点、控制字符码点原样保留。
 */
export const decodeHtmlEntities = (text: string): string =>
  text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      const isValid =
        Number.isFinite(code) &&
        code >= 0x20 &&
        code <= 0x10ffff &&
        !(code >= 0x7f && code <= 0x9f);
      if (!isValid) return match;
      // NBSP 归一化为普通空格，避免干扰下游分词
      return code === 160 ? ' ' : String.fromCodePoint(code);
    }
    return HTML_ENTITY_MAP[entity.toLowerCase()] ?? match;
  });

/**
 * Strip HTML tags and decode entities, keep plain text.
 * Block-level tags (<br>, <p>, <div>, <li>, <h1>-<h6>) become newlines.
 */
export const stripHtml = (text: string): string => {
  return decodeHtmlEntities(
    unwrapAutoLinkUrl(text)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|li|h[1-6])[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
