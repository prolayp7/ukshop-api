import { DEFAULT_TOP_BAR, normaliseTopBar } from './top-bar-settings';

describe('normaliseTopBar', () => {
  it('returns the defaults when nothing has been saved', () => {
    expect(normaliseTopBar(undefined)).toEqual(DEFAULT_TOP_BAR);
    expect(normaliseTopBar([1, 2])).toEqual(DEFAULT_TOP_BAR);
  });

  it('keeps saved switches and trimmed labels, falling back per field', () => {
    const config = normaliseTopBar({ enabled: false, trackOrder: { label: '  Where is my order?  ' }, showCurrency: 'no' });
    expect(config.enabled).toBe(false);
    expect(config.trackOrder).toEqual({ enabled: true, label: 'Where is my order?' });
    expect(config.showCurrency).toBe(true);
  });

  it('respects an empty term list but drops blank terms and caps the count', () => {
    expect(normaliseTopBar({ popular: { terms: [] } }).popular.terms).toEqual([]);
    expect(normaliseTopBar({ popular: { terms: [' SSD ', '', 3] } }).popular.terms).toEqual(['SSD']);
    expect(normaliseTopBar({ popular: { terms: Array.from({ length: 20 }, (_, i) => `t${i}`) } }).popular.terms).toHaveLength(8);
  });

  it('only allows site paths and http(s) links for the help link', () => {
    expect(normaliseTopBar({ help: { href: '/pages/help' } }).help.href).toBe('/pages/help');
    expect(normaliseTopBar({ help: { href: 'https://help.example.com' } }).help.href).toBe('https://help.example.com');
    for (const bad of ['javascript:alert(1)', '//evil.example', 'data:text/html,x']) expect(normaliseTopBar({ help: { href: bad } }).help.href).toBe('/faqs');
  });
});
