import { DEFAULT_FOOTER, normaliseFooter } from './footer-settings';

describe('normaliseFooter', () => {
  it('returns the defaults when nothing has been saved', () => {
    expect(normaliseFooter(undefined)).toEqual(DEFAULT_FOOTER);
    expect(normaliseFooter('garbage')).toEqual(DEFAULT_FOOTER);
  });

  it('keeps saved values, trims them and caps their length', () => {
    const config = normaliseFooter({ newsletter: { enabled: false, heading: '  Hi  ' }, aboutText: 'x'.repeat(900) });
    expect(config.newsletter).toEqual({ ...DEFAULT_FOOTER.newsletter, enabled: false, heading: 'Hi' });
    expect(config.aboutText).toHaveLength(400);
  });

  it('respects an empty badge list but drops blank and non-text badges', () => {
    expect(normaliseFooter({ paymentMethods: [] }).paymentMethods).toEqual([]);
    expect(normaliseFooter({ paymentMethods: [' VISA ', '', 7, null, 'KLARNA'] }).paymentMethods).toEqual(['VISA', 'KLARNA']);
  });
});
