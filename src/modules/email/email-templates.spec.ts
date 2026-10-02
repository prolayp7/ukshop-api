import { newsletterCampaignEmail, orderRefundedEmail, paymentDisputeOpenedEmail, returnApprovedEmail, returnReceivedEmail, returnRejectedEmail } from './email-templates';

describe('email templates for formerly pending requirements', () => {
  it('escapes campaign content and includes the recipient-specific unsubscribe link', () => {
    const message = newsletterCampaignEmail({
      subject: 'New offers',
      preheader: 'Fresh deals',
      heading: '<Script>',
      message: 'First line\nSecond line\n\nA second paragraph',
      unsubscribeUrl: 'https://store.example/api/v1/newsletter/unsubscribe?token=secret',
    });
    expect(message.html).toContain('&lt;Script&gt;');
    expect(message.html).toContain('First line<br>Second line');
    expect(message.html).toContain('A second paragraph');
    expect(message.html).toContain('https://store.example/api/v1/newsletter/unsubscribe?token=secret');
  });

  it('labels partial and full refunds distinctly', () => {
    expect(orderRefundedEmail({ orderNumber: 'UK100', refundAmount: '12.50', refundType: 'PARTIAL' }).subject).toContain('Partial refund');
    expect(orderRefundedEmail({ orderNumber: 'UK100', refundAmount: '12.50', refundType: 'FULL' }).subject).toContain('Full refund');
  });

  it('provides customer-facing return lifecycle details and an operations dispute alert', () => {
    expect(returnApprovedEmail({ orderNumber: 'UK100', returnNumber: 'RET100' }).html).toContain('approved');
    expect(returnRejectedEmail({ orderNumber: 'UK100', returnNumber: 'RET100', reason: '<unsafe>' }).html).toContain('&lt;unsafe&gt;');
    expect(returnReceivedEmail({ orderNumber: 'UK100', returnNumber: 'RET100' }).html).toContain('being inspected');
    expect(paymentDisputeOpenedEmail({ orderNumber: 'UK100', disputeId: 'dp_1', amount: '10.00', currency: 'GBP', reason: 'fraudulent', respondBy: null }).html).toContain('needs attention');
  });
});