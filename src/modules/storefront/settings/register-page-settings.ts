// Admin-editable content of the storefront "Create account" page (Setting key `register.page`).
// Three independently switchable sections: the heading/intro block above the form, the showcase column
// beside it, and the benefits row under the form. Stored JSON is untrusted input for the public
// storefront, so it is normalised here: wrong shapes fall back to the defaults and text is length-limited.

export const REGISTER_PAGE_ICONS = ['package', 'heart', 'search', 'truck', 'shield', 'cpu', 'star', 'undo'] as const;
export type RegisterPageIcon = (typeof REGISTER_PAGE_ICONS)[number];
export type RegisterBenefit = { icon: RegisterPageIcon; title: string; text: string };

export interface RegisterPageConfig {
  incentive: {
    enabled: boolean;
    heading: string;
    highlight: string;
    intro: string;
    noticeTitle: string;
    noticeText: string;
    offerEnabled: boolean;
    offerCode: string;
    offerText: string;
    offerAmount: string;
  };
  showcase: { enabled: boolean; title: string; description: string };
  benefits: { enabled: boolean; items: RegisterBenefit[] };
}

// Mirrors the copy the registration page had hardcoded before it became admin-managed.
// `{store}` is replaced with the storefront's name when rendered.
export const DEFAULT_REGISTER_PAGE: RegisterPageConfig = {
  incentive: {
    enabled: true,
    heading: 'Create your account.',
    highlight: 'Make your next upgrade yours.',
    intro: 'Join {store} to save your favourite components, track orders and keep your details ready for checkout.',
    noticeTitle: 'Everything for your next setup.',
    noticeText: 'One account for components, computers, laptops and accessories.',
    // Off by default: the page must not advertise a discount the store has not set up.
    offerEnabled: false,
    offerCode: '',
    offerText: '',
    offerAmount: '',
  },
  showcase: {
    enabled: true,
    title: 'Start your next setup',
    description: 'Explore PC components, laptops and peripherals for work, play and everything in between.',
  },
  benefits: {
    enabled: true,
    items: [
      { icon: 'package', title: 'Your orders', text: 'All in one place' },
      { icon: 'heart', title: 'Your wishlist', text: 'Save your favourites' },
      { icon: 'search', title: 'Find your parts', text: 'Search by specification' },
    ],
  },
};

const MAX_BENEFITS = 6;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number, fallback: string): string => (typeof value === 'string' ? value.trim().slice(0, max) : fallback);
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const isIcon = (value: unknown): value is RegisterPageIcon => REGISTER_PAGE_ICONS.includes(value as RegisterPageIcon);

export function normaliseRegisterPage(raw: unknown): RegisterPageConfig {
  const source = isRecord(raw) ? raw : {};
  const d = DEFAULT_REGISTER_PAGE;
  const incentive = isRecord(source.incentive) ? source.incentive : {};
  const showcase = isRecord(source.showcase) ? source.showcase : {};
  const benefits = isRecord(source.benefits) ? source.benefits : {};

  // Absent -> the default list; present -> exactly what the admin saved (an empty list is respected).
  const items: RegisterBenefit[] = !Array.isArray(benefits.items)
    ? d.benefits.items
    : benefits.items.slice(0, MAX_BENEFITS).flatMap((entry): RegisterBenefit[] => {
        const item = isRecord(entry) ? entry : {};
        const title = text(item.title, 60, '');
        if (!title) return [];
        return [{ icon: isIcon(item.icon) ? item.icon : 'package', title, text: text(item.text, 80, '') }];
      });

  const offerCode = text(incentive.offerCode, 40, d.incentive.offerCode);
  return {
    incentive: {
      enabled: flag(incentive.enabled, d.incentive.enabled),
      heading: text(incentive.heading, 100, d.incentive.heading),
      highlight: text(incentive.highlight, 100, d.incentive.highlight),
      intro: text(incentive.intro, 400, d.incentive.intro),
      noticeTitle: text(incentive.noticeTitle, 80, d.incentive.noticeTitle),
      noticeText: text(incentive.noticeText, 200, d.incentive.noticeText),
      // A welcome offer without a code would promise nothing redeemable, so it stays hidden.
      offerEnabled: flag(incentive.offerEnabled, d.incentive.offerEnabled) && offerCode !== '',
      offerCode,
      offerText: text(incentive.offerText, 160, d.incentive.offerText),
      offerAmount: text(incentive.offerAmount, 20, d.incentive.offerAmount),
    },
    showcase: {
      enabled: flag(showcase.enabled, d.showcase.enabled),
      title: text(showcase.title, 80, d.showcase.title),
      description: text(showcase.description, 200, d.showcase.description),
    },
    benefits: { enabled: flag(benefits.enabled, d.benefits.enabled), items },
  };
}
