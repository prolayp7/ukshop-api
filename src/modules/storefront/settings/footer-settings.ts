// Admin-editable parts of the storefront footer (Setting key `footer.site`): the newsletter block,
// the about line under the logo and the payment badges. Link columns come from Menus > Footer and
// contact details, social links and copyright from Settings > General, so they are not repeated here.
// Stored JSON is untrusted input for the public storefront: wrong shapes fall back to the defaults.

export interface FooterConfig {
  newsletter: { enabled: boolean; eyebrow: string; heading: string; text: string };
  aboutText: string;
  paymentMethods: string[];
}

// Mirrors the copy the storefront footer had hardcoded before it became admin-managed.
export const DEFAULT_FOOTER: FooterConfig = {
  newsletter: {
    enabled: true,
    eyebrow: 'Deals & restock alerts',
    heading: 'Get restock alerts & deal notifications',
    text: 'One email a week, mostly about stock drops and price cuts. No spam.',
  },
  aboutText: 'Independent UK retailer. Warehouse and workshop in Manchester, showroom open Mon–Sat.',
  paymentMethods: ['VISA', 'MASTERCARD', 'AMEX', 'PAYPAL', 'KLARNA', 'APPLE PAY'],
};

const MAX_PAYMENT_METHODS = 12;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number, fallback: string) => (typeof value === 'string' ? value.trim().slice(0, max) : fallback);

export function normaliseFooter(raw: unknown): FooterConfig {
  const source = isRecord(raw) ? raw : {};
  const newsletter = isRecord(source.newsletter) ? source.newsletter : {};
  const defaults = DEFAULT_FOOTER.newsletter;
  return {
    newsletter: {
      enabled: typeof newsletter.enabled === 'boolean' ? newsletter.enabled : defaults.enabled,
      eyebrow: text(newsletter.eyebrow, 60, defaults.eyebrow),
      heading: text(newsletter.heading, 120, defaults.heading),
      text: text(newsletter.text, 300, defaults.text),
    },
    aboutText: text(source.aboutText, 400, DEFAULT_FOOTER.aboutText),
    // An empty list is a valid choice (hides the badges); unusable entries are dropped.
    paymentMethods: Array.isArray(source.paymentMethods)
      ? source.paymentMethods.flatMap((entry) => (typeof entry === 'string' && entry.trim() ? [entry.trim().slice(0, 30)] : [])).slice(0, MAX_PAYMENT_METHODS)
      : DEFAULT_FOOTER.paymentMethods,
  };
}
