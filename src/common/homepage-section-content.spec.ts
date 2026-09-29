import { BadRequestException } from '@nestjs/common';
import { assertSectionText, withSectionText } from './homepage-section-content';

describe('homepage section text', () => {
  it('fills defaults for an untouched section and keeps other config keys', () => {
    const config = withSectionText('NEW_ARRIVALS', { other: 1 });
    expect(config).toEqual({ other: 1, heading: 'New arrivals', body: 'Just landed — added to the catalogue most recently.' });
  });

  it('uses saved text, trimmed; an empty heading falls back but an empty body stays empty', () => {
    expect(withSectionText('SHOP_BY_NEED', { heading: '  Shop by task ', body: '' })).toMatchObject({ heading: 'Shop by task', body: '' });
    expect(withSectionText('SHOP_BY_NEED', { heading: '   ' }).heading).toBe('Shop by need');
  });

  it('leaves live-data defaults as null for the storefront to work out', () => {
    expect(withSectionText('DEALS', {})).toMatchObject({ heading: "Today's Best Deals", body: null });
    expect(withSectionText('FEATURED_PRODUCTS', { slug: 'best' })).toEqual({ slug: 'best', heading: null, body: null });
  });

  it('does not touch sections without editable text', () => {
    expect(withSectionText('HERO', { cards: [] })).toEqual({ cards: [] });
  });

  it('rejects non-text or over-long values, accepts null as "use default"', () => {
    expect(() => assertSectionText('BRANDS', { heading: 42 })).toThrow(BadRequestException);
    expect(() => assertSectionText('BRANDS', { heading: 'x'.repeat(121) })).toThrow(BadRequestException);
    expect(() => assertSectionText('BRANDS', { heading: null, body: 'ok' })).not.toThrow();
  });
});
