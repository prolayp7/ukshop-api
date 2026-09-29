import { renderPageContent, sanitizePageHtml } from './page-content';

describe('CMS page content', () => {
  it('strips scripts, event handlers and javascript: links but keeps editor formatting', () => {
    const html = sanitizePageHtml('<h2 style="text-align:center">Hi</h2><p onclick="x()">Text <strong>bold</strong></p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><ul><li>one</li></ul>');
    expect(html).toBe('<h2 style="text-align:center">Hi</h2><p>Text <strong>bold</strong></p><a>bad</a><ul><li>one</li></ul>');
  });

  it('adds rel=noopener to links opening a new tab', () => {
    expect(sanitizePageHtml('<a href="https://x.test" target="_blank">x</a>')).toBe('<a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>');
  });

  it('fills placeholders from settings, escaping them inside HTML', () => {
    const blocks = [{ heading: 'About {{companyName}}', body: '<p>Email {{supportEmail}}, registered no. {{companyNumber}}</p>' }];
    expect(renderPageContent(blocks, { brandName: 'Shop & Co', supportEmail: 'help@shop.test' })).toEqual([
      { heading: 'About Shop & Co', body: '<p>Email help@shop.test, registered no. (to be confirmed)</p>' },
    ]);
    expect(renderPageContent('<p>{{companyName}}</p>', { brandName: '<b>x</b>' })).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>');
  });

  it('keeps plain-text pages as text and leaves unknown placeholders alone', () => {
    expect(renderPageContent('Hello {{companyName}}\n\n{{unknown}}', { brandName: 'Shop' })).toBe('Hello Shop\n\n{{unknown}}');
  });
});
