import PDFDocument = require('pdfkit');
import { resolve } from 'path';
import { formatMoney as formatIn } from '../../common/currency';

const FONTS = resolve(process.cwd(), 'assets/fonts');

export interface CreditNoteData {
  currency: string;
  creditNoteNumber: string;
  orderNumber: string;
  refundNumber?: string | null;
  issuedAt: Date;
  customerEmail: string;
  amount: number;
  reason: string;
  company: {
    name: string;
    legalName: string;
    address: string;
    vatNumber: string | null;
    email: string;
    phone: string;
    copyright: string;
  };
  billing: {
    name: string;
    company: string | null;
    address: string;
  };
}

export function buildCreditNotePdf(data: CreditNoteData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Credit note ${data.creditNoteNumber}`, Author: data.company.legalName } });
  doc.registerFont('R', `${FONTS}/NotoSans-Regular.ttf`);
  doc.registerFont('B', `${FONTS}/NotoSans-Bold.ttf`);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolvePromise) => doc.on('end', () => resolvePromise(Buffer.concat(chunks))));

  const text = (s: string, x: number, y: number, opts: { font?: 'R' | 'B'; size?: number; color?: string; width?: number; align?: 'left' | 'right' | 'center'; spacing?: number } = {}) => {
    doc.font(opts.font ?? 'R').fontSize(opts.size ?? 8.5).fillColor(opts.color ?? '#101827').text(s, x, y, { width: opts.width ?? 500, align: opts.align ?? 'left', characterSpacing: opts.spacing ?? 0 });
  };
  const rect = (x: number, y: number, w: number, h: number, fill?: string, stroke?: string, r = 0) => {
    doc.roundedRect(x, y, w, h, r);
    if (fill && stroke) doc.fillAndStroke(fill, stroke); else if (fill) doc.fill(fill); else if (stroke) doc.lineWidth(0.6).stroke(stroke);
  };
  const money = (n: number) => formatIn(n, data.currency);
  const date = data.issuedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const PAGE = { w: 595.28, h: 841.89, m: 36 };
  const W = PAGE.w - PAGE.m * 2;

  rect(0, 0, PAGE.w, 60, '#0b0f14');
  text('CREDIT NOTE', PAGE.m, 22, { font: 'B', size: 22, color: '#ffffff', width: 180 });
  text(data.creditNoteNumber, PAGE.w - 200, 24, { font: 'B', size: 18, color: '#ffffff', align: 'right', width: 160 });

  text(data.company.name.toUpperCase(), PAGE.m, 80, { font: 'B', size: 13, color: '#101827', width: 260 });
  text(data.company.legalName, PAGE.m, 96, { font: 'B', size: 8.5, color: '#101827', width: 280 });
  text(data.company.address, PAGE.m, 110, { size: 7.5, width: 280 });
  text([data.company.vatNumber ? `VAT reg. no. ${data.company.vatNumber}` : '', data.company.email].filter(Boolean).join(' · '), PAGE.m, 126, { size: 7.5, width: 280 });

  const metaY = 152;
  const boxW = W / 2 - 10;
  rect(PAGE.m, metaY, boxW, 80, '#f4f6f9', '#e2e6ec', 6);
  rect(PAGE.m + boxW + 20, metaY, boxW, 80, '#f4f6f9', '#e2e6ec', 6);

  text('ORDER REFERENCE', PAGE.m + 12, metaY + 12, { font: 'B', size: 6, color: '#6b7585', width: boxW - 20, spacing: 0.8 });
  text(data.orderNumber, PAGE.m + 12, metaY + 26, { font: 'B', size: 14, color: '#101827', width: boxW - 20 });
  text('Issued', PAGE.m + 12, metaY + 52, { font: 'B', size: 6, color: '#6b7585', width: boxW - 20, spacing: 0.8 });
  text(date, PAGE.m + 12, metaY + 66, { font: 'B', size: 11, color: '#101827', width: boxW - 20 });

  text('REFUND REFERENCE', PAGE.m + boxW + 32, metaY + 12, { font: 'B', size: 6, color: '#6b7585', width: boxW - 20, spacing: 0.8 });
  text(data.refundNumber ?? '—', PAGE.m + boxW + 32, metaY + 26, { font: 'B', size: 14, color: '#101827', width: boxW - 20 });
  text('Customer', PAGE.m + boxW + 32, metaY + 52, { font: 'B', size: 6, color: '#6b7585', width: boxW - 20, spacing: 0.8 });
  text(data.customerEmail, PAGE.m + boxW + 32, metaY + 66, { font: 'B', size: 11, color: '#101827', width: boxW - 20 });

  const billY = 260;
  rect(PAGE.m, billY, W, 80, '#fafbfc', '#e2e6ec', 6);
  text('CREDITED TO', PAGE.m + 12, billY + 12, { font: 'B', size: 6, color: '#6b7585', width: 120, spacing: 0.8 });
  text(data.billing.company || data.billing.name, PAGE.m + 12, billY + 26, { font: 'B', size: 12, color: '#101827', width: 200 });
  text(data.billing.address.replace(/\n/g, ' · '), PAGE.m + 12, billY + 44, { size: 8, color: '#4b5565', width: W - 24 });

  const amountY = 370;
  rect(PAGE.m, amountY, W, 72, '#e6f7f0', '#bfe5d4', 6);
  text('TOTAL CREDIT AMOUNT', PAGE.m + 14, amountY + 14, { font: 'B', size: 8, color: '#12703a', width: 200 });
  text(money(data.amount), PAGE.m + W - 220, amountY + 12, { font: 'B', size: 28, color: '#12703a', align: 'right', width: 200 });
  text(`Reason: ${data.reason}`, PAGE.m + 14, amountY + 48, { size: 8, color: '#12703a', width: W - 28 });

  const reasonY = 470;
  rect(PAGE.m, reasonY, W, 70, undefined, '#e2e6ec', 6);
  text('Refund summary', PAGE.m + 12, reasonY + 12, { font: 'B', size: 8, color: '#101827', width: 160 });
  text(`This credit note offsets the refund for order ${data.orderNumber}. The amount is payable back to the customer via the original payment method.`, PAGE.m + 12, reasonY + 30, { size: 8, color: '#4b5565', width: W - 24 });

  const footerY = PAGE.h - 54;
  rect(0, footerY, PAGE.w, 54, '#101827');
  text(`${data.company.copyright} · ${data.company.phone} · ${data.company.email}`, PAGE.m, footerY + 18, { font: 'B', size: 7, color: '#dfe6ee', width: W - 90 });

  doc.end();
  return done;
}
