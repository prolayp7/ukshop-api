import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

jest.mock('nodemailer');

describe('EmailService', () => {
  afterEach(() => jest.clearAllMocks());

  it('no-ops and returns false when SMTP is not configured', async () => {
    const settings = { internalIntegration: jest.fn().mockResolvedValue(null) };
    const service = new EmailService(settings as never);

    const result = await service.send('customer@example.com', 'Subject', '<p>hi</p>');

    expect(result).toBe(false);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('no-ops when the integration exists but is missing required fields', async () => {
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({ mode: 'SANDBOX', settings: { host: 'smtp.example.com' } }),
    };
    const service = new EmailService(settings as never);

    const result = await service.send('customer@example.com', 'Subject', '<p>hi</p>');

    expect(result).toBe(false);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('sends via the configured SMTP transport', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({
        mode: 'SANDBOX',
        settings: { host: 'smtp.example.com', port: 587, user: 'user@example.com', pass: 'secret', fromAddress: 'shop@example.com' },
      }),
    };
    const service = new EmailService(settings as never);

    const result = await service.send('customer@example.com', 'Subject', '<p>hi</p>');

    expect(result).toBe(true);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'user@example.com', pass: 'secret' },
    });
    expect(sendMail).toHaveBeenCalledWith({ from: 'shop@example.com', to: 'customer@example.com', subject: 'Subject', html: '<p>hi</p>' });
  });

  it('falls back to the SMTP user as the from-address when fromAddress is not set', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({
        mode: 'SANDBOX',
        settings: { host: 'smtp.example.com', port: 587, user: 'user@example.com', pass: 'secret' },
      }),
    };
    const service = new EmailService(settings as never);

    await service.send('customer@example.com', 'Subject', '<p>hi</p>');

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'user@example.com' }));
  });

  it('defaults secure to true for port 465', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({
        mode: 'SANDBOX',
        settings: { host: 'smtp.example.com', port: 465, user: 'user@example.com', pass: 'secret' },
      }),
    };
    const service = new EmailService(settings as never);

    await service.send('customer@example.com', 'Subject', '<p>hi</p>');

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });

  it('swallows transporter errors and returns false rather than throwing', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('connection refused'));
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({
        mode: 'SANDBOX',
        settings: { host: 'smtp.example.com', port: 587, user: 'user@example.com', pass: 'secret' },
      }),
    };
    const service = new EmailService(settings as never);

    await expect(service.send('customer@example.com', 'Subject', '<p>hi</p>')).resolves.toBe(false);
  });
});
