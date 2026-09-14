// ponytail: plain inline HTML strings, no templating engine or design system -
// four transactional emails and one notification hook don't need one. Revisit
// if the number of templates or branding requirements grow.

function wrap(title: string, bodyHtml: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#101827">
    <h2 style="margin:0 0 12px">${title}</h2>
    ${bodyHtml}
  </div>`;
}

export function orderConfirmationEmail(params: { orderNumber: string; total: string; itemCount: number }) {
  return {
    subject: `Order confirmed - ${params.orderNumber}`,
    html: wrap(
      'Thanks for your order!',
      `<p>Your order <b>${params.orderNumber}</b> (${params.itemCount} item${params.itemCount === 1 ? '' : 's'}, total £${params.total}) has been received and is being processed.</p>`,
    ),
  };
}

export function orderShippedEmail(params: {
  orderNumber: string;
  trackingCarrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}) {
  const tracking = params.trackingNumber
    ? `<p>Carrier: <b>${params.trackingCarrier ?? 'N/A'}</b><br/>Tracking number: <b>${params.trackingNumber}</b>${
        params.trackingUrl ? `<br/><a href="${params.trackingUrl}">Track your parcel</a>` : ''
      }</p>`
    : '';
  return {
    subject: `Your order has shipped - ${params.orderNumber}`,
    html: wrap('Your order is on its way', `<p>Order <b>${params.orderNumber}</b> has shipped.</p>${tracking}`),
  };
}

export function orderDeliveredEmail(params: { orderNumber: string }) {
  return {
    subject: `Order delivered - ${params.orderNumber}`,
    html: wrap('Delivered!', `<p>Order <b>${params.orderNumber}</b> has been marked as delivered. We hope you love it.</p>`),
  };
}

export function orderRefundedEmail(params: { orderNumber: string; refundAmount: string }) {
  return {
    subject: `Refund processed - ${params.orderNumber}`,
    html: wrap(
      'Refund processed',
      `<p>A refund of <b>£${params.refundAmount}</b> has been processed for order <b>${params.orderNumber}</b>. It may take a few days to appear on your statement.</p>`,
    ),
  };
}

export function notificationEmail(params: { title: string; message: string }) {
  return {
    subject: params.title,
    html: wrap(params.title, `<p>${params.message}</p>`),
  };
}
