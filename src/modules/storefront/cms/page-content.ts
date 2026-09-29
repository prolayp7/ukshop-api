import sanitizeHtml = require('sanitize-html');

// Public rendering of CMS page content (Page.contentBlocks). Two jobs:
//  1. {{placeholders}} are filled from Admin > Settings > General, so legal pages always state the
//     current business details (and a change there updates every page at once).
//  2. Block bodies are admin-authored rich text (the tiptap editor), so they are sanitised to the
//     formatting that editor can produce before any browser renders them.

export const PAGE_PLACEHOLDERS: Record<string, string> = {
  companyName: 'brandName',
  companyNumber: 'companyNumber',
  companyAddress: 'companyAddress',
  supportEmail: 'supportEmail',
  supportPhone: 'supportPhone1',
  vatNumber: 'vatNumber',
};
const MISSING = '(to be confirmed)';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function fill(text: string, settings: Record<string, unknown>, html: boolean): string {
  return text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, name: string) => {
    const key = PAGE_PLACEHOLDERS[name];
    if (!key) return match;
    const value = typeof settings[key] === 'string' ? (settings[key] as string).trim() : '';
    const text = value || MISSING;
    return html ? escapeHtml(text) : text;
  });
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'a', 'br', 'hr', 'code', 'pre'],
  allowedAttributes: { a: ['href', 'target', 'rel'], p: ['style'], h2: ['style'], h3: ['style'], h4: ['style'] },
  allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/] } },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: { a: (tagName, attribs) => ({ tagName, attribs: attribs.target === '_blank' ? { ...attribs, rel: 'noopener noreferrer' } : attribs }) },
};

export function sanitizePageHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

const looksLikeHtml = (text: string) => /<[a-z][\s\S]*>/i.test(text);

/** contentBlocks is either a plain string (paragraphs split by blank lines) or [{ heading?, body }]. */
export function renderPageContent(blocks: unknown, settings: Record<string, unknown>): unknown {
  const body = (text: string) => (looksLikeHtml(text) ? sanitizePageHtml(fill(text, settings, true)) : fill(text, settings, false));
  if (typeof blocks === 'string') return body(blocks);
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((block) => {
    if (!block || typeof block !== 'object') return block;
    const { heading, body: text } = block as { heading?: unknown; body?: unknown };
    return {
      ...(typeof heading === 'string' ? { heading: fill(heading, settings, false) } : {}),
      ...(typeof text === 'string' ? { body: body(text) } : {}),
    };
  });
}
