import { describe, expect, it } from 'vitest';
import { stripHtml, unwrapAutoLinkUrl } from '../../../../projects/admin/src/service/common/string';

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

  it('解码中文文档常见实体', () => {
    expect(stripHtml('&ldquo;放射诊疗&rdquo;与&sect;相关')).toBe('“放射诊疗”与§相关');
  });

  it('数字实体还原 URL', () => {
    expect(stripHtml('https:&#47;&#47;example.com&#47;a&#63;b=1')).toBe(
      'https://example.com/a?b=1'
    );
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
});
