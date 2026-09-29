import { DEFAULT_REGISTER_PAGE, normaliseRegisterPage } from './register-page-settings';

describe('normaliseRegisterPage', () => {
  it('returns the defaults when nothing has been saved', () => {
    expect(normaliseRegisterPage(undefined)).toEqual(DEFAULT_REGISTER_PAGE);
    expect(normaliseRegisterPage('garbage')).toEqual(DEFAULT_REGISTER_PAGE);
  });

  it('keeps saved values, trims them and caps their length', () => {
    const config = normaliseRegisterPage({ incentive: { heading: '  Hello  ', intro: 'x'.repeat(500) }, showcase: { enabled: false } });
    expect(config.incentive.heading).toBe('Hello');
    expect(config.incentive.intro).toHaveLength(400);
    expect(config.showcase.enabled).toBe(false);
    expect(config.showcase.title).toBe(DEFAULT_REGISTER_PAGE.showcase.title);
  });

  it('respects an empty benefits list but drops untitled items and unknown icons', () => {
    expect(normaliseRegisterPage({ benefits: { items: [] } }).benefits.items).toEqual([]);
    const items = normaliseRegisterPage({ benefits: { items: [{ title: '', text: 'x' }, { icon: '<script>', title: 'Fast', text: 'Next day' }] } }).benefits.items;
    expect(items).toEqual([{ icon: 'package', title: 'Fast', text: 'Next day' }]);
  });

  it('hides the welcome offer unless it has a coupon code', () => {
    expect(normaliseRegisterPage({ incentive: { offerEnabled: true, offerCode: ' ' } }).incentive.offerEnabled).toBe(false);
    expect(normaliseRegisterPage({ incentive: { offerEnabled: true, offerCode: 'WELCOME10' } }).incentive.offerEnabled).toBe(true);
  });
});
