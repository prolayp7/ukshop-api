// Admin-editable top bar above the storefront header (Setting key `topbar.site`). The stock count is
// live from the catalogue and the currency comes from the environment, so those can only be shown or
// hidden. Stored JSON is untrusted input for the public storefront: wrong shapes fall back to defaults.

export interface TopBarConfig {
  enabled: boolean;
  trackOrder: { enabled: boolean; label: string };
  popular: { enabled: boolean; label: string; terms: string[] };
  showStockCount: boolean;
  help: { enabled: boolean; label: string; href: string };
  showCurrency: boolean;
}

// Mirrors what the storefront header had hardcoded before it became admin-managed.
export const DEFAULT_TOP_BAR: TopBarConfig = {
  enabled: true,
  trackOrder: { enabled: true, label: 'Track my order' },
  popular: { enabled: true, label: 'Popular:', terms: ['RTX 4070', 'Ryzen 7', 'DDR5', 'NVMe'] },
  showStockCount: true,
  help: { enabled: true, label: 'Help centre', href: '/faqs' },
  showCurrency: true,
};

const MAX_TERMS = 8;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const text = (value: unknown, max: number, fallback: string) => (typeof value === 'string' ? value.trim().slice(0, max) : fallback);
// Site-relative paths or http(s) only - never javascript:, data: or protocol-relative URLs.
const href = (value: unknown, fallback: string) => {
  const url = text(value, 300, fallback);
  return /^(\/(?!\/)|https?:\/\/)\S*$/i.test(url) ? url : fallback;
};

export function normaliseTopBar(raw: unknown): TopBarConfig {
  const source = isRecord(raw) ? raw : {};
  const track = isRecord(source.trackOrder) ? source.trackOrder : {};
  const popular = isRecord(source.popular) ? source.popular : {};
  const help = isRecord(source.help) ? source.help : {};
  const d = DEFAULT_TOP_BAR;
  return {
    enabled: flag(source.enabled, d.enabled),
    trackOrder: { enabled: flag(track.enabled, d.trackOrder.enabled), label: text(track.label, 40, d.trackOrder.label) },
    popular: {
      enabled: flag(popular.enabled, d.popular.enabled),
      label: text(popular.label, 30, d.popular.label),
      // An empty list is a valid choice (hides the chips); unusable entries are dropped.
      terms: Array.isArray(popular.terms)
        ? popular.terms.flatMap((term) => (typeof term === 'string' && term.trim() ? [term.trim().slice(0, 40)] : [])).slice(0, MAX_TERMS)
        : d.popular.terms,
    },
    showStockCount: flag(source.showStockCount, d.showStockCount),
    help: { enabled: flag(help.enabled, d.help.enabled), label: text(help.label, 40, d.help.label), href: href(help.href, d.help.href) },
    showCurrency: flag(source.showCurrency, d.showCurrency),
  };
}
