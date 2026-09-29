import { BadRequestException } from '@nestjs/common';
import type { HomepageSectionType } from '@prisma/client';

// Editable text of each homepage section, stored in HomepageSection.config as `heading` (the section
// title) and `body` (the line or paragraphs under it). The defaults are the storefront's original copy,
// so an untouched section renders exactly as before. A null default means the storefront works it out
// from live data (e.g. the deals count, or the featured rail's own title). Other config keys (hero side
// cards, featured slug, banner position, deals end date) are left as they are.

type TextField = { default: string | null; max: number };
type SectionText = { heading?: TextField; body?: TextField };

const heading = (value: string | null): TextField => ({ default: value, max: 120 });
const line = (value: string | null): TextField => ({ default: value, max: 300 });

export const SECTION_TEXT: Partial<Record<HomepageSectionType, SectionText>> = {
  DEALS: { heading: heading("Today's Best Deals"), body: line(null) },
  FEATURED_PRODUCTS: { heading: heading(null), body: line(null) },
  NEW_ARRIVALS: { heading: heading('New arrivals'), body: line('Just landed — added to the catalogue most recently.') },
  BRANDS: { heading: heading('Shop by brand'), body: line('') },
  TESTIMONIALS: { heading: heading('Built by people who build PCs') },
  FAQS: { heading: heading('Frequently asked questions'), body: line('') },
  NEWSLETTER: { heading: heading('Get restock alerts & deal notifications'), body: line('One email a week, mostly about stock drops and price cuts. No spam.') },
  // {count} is replaced with the number of categories shown.
  CATEGORY_SHOWCASE: { heading: heading('Shop by category'), body: line('{count} departments, one catalogue — from single components to complete systems.') },
  SHOP_BY_NEED: { heading: heading('Shop by need'), body: line('Not sure which category you need? Start from what you’re actually trying to do.') },
  GAMING_SHOWCASE: { heading: heading('Level up your gaming'), body: line('Three pre-built tiers, each stress-tested for 48 hours before it ships. Customise any part before you check out.') },
  LAPTOP_SHOWCASE: { heading: heading('Laptops for work, study & play'), body: line('') },
  BUYING_GUIDES: { heading: heading('Not sure what you need? Start here.'), body: line('Computer buying guides') },
  // Paragraphs separated by a blank line.
  SEO_INTRO: {
    heading: heading('UK Computer Shop for PC Hardware, Gaming & Business Technology'),
    body: { max: 5000, default: [
      "UK Computer Shop stocks computer hardware and complete systems for every kind of buyer, not just gaming enthusiasts. Our PC components range covers CPUs, graphics cards, motherboards, memory, storage and power supplies from the brands UK builders already trust, alongside cases, cooling and the small parts that finish a build properly.",
      "If you'd rather buy a finished machine, our computers range spans gaming PCs, business PCs, workstations, mini PCs and all-in-one desktops, each benchmarked and stress-tested before it leaves our Manchester warehouse. Laptops are split the same way — gaming, business, student and refurbished — so a student replacing a lecture-hall laptop and a business buying ten units for a new office both land on the right page quickly.",
      "Beyond the desk, we stock monitors, keyboards, mice, headsets and webcams under peripherals, plus the networking hardware — routers, mesh Wi-Fi, switches and cabling — that keeps a home or small office online. Our accessories range covers the cables, docking stations, USB hubs and chargers that tend to get forgotten until the day they're needed.",
      "Every product page lists real specifications, current stock and manufacturer warranty terms, and every \"goes well with\" suggestion on the site is checked against socket, memory and power compatibility first — so what we recommend together actually works together. Whether you're upgrading a single graphics card or fitting out a business, UK Computer Shop is built to get you to the right product quickly.",
    ].join('\n\n') },
  },
};

/** Fills in defaults and cleans stored text; used wherever sections leave the API (admin and storefront). */
export function withSectionText(type: HomepageSectionType, config: unknown): Record<string, unknown> {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? { ...(config as Record<string, unknown>) } : {};
  for (const [key, field] of Object.entries(SECTION_TEXT[type] ?? {}) as [keyof SectionText, TextField][]) {
    const value = source[key];
    const text = typeof value === 'string' ? value.trim().slice(0, field.max) : null;
    // An empty heading falls back to the default; an empty body is respected (the line is hidden).
    source[key] = text === null || (key === 'heading' && !text) ? field.default : text;
  }
  return source;
}

/** Rejects text that is not a string (or null, meaning "use the default") or is too long. */
export function assertSectionText(type: HomepageSectionType, config: Record<string, unknown>): void {
  for (const [key, field] of Object.entries(SECTION_TEXT[type] ?? {}) as [keyof SectionText, TextField][]) {
    const value = config[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') throw new BadRequestException(`${key} must be text`);
    if (value.trim().length > field.max) throw new BadRequestException(`${key} must be at most ${field.max} characters`);
  }
}
