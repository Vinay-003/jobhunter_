import nodemailer from 'nodemailer';

const TIMEOUT_MS = 10_000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SentEmailRecord {
  to: string;
  subject: string;
  text: string;
  html?: string;
  sentAt: Date;
}

// In-memory record for testing and diagnostics
export const sentEmailHistory: SentEmailRecord[] = [];

export function clearEmailHistory(): void {
  sentEmailHistory.length = 0;
}

export async function sendEmail(
  email: string,
  subject: string,
  message: string,
  html?: string
): Promise<string> {
  const to = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(to) || !subject?.trim() || !message?.trim()) {
    throw new Error('Invalid email input');
  }

  const provider = (process.env.EMAIL_PROVIDER || 'vercel_smtp').trim().toLowerCase();

  // Test / mock mode
  if (provider === 'mock' || process.env.NODE_ENV === 'test') {
    sentEmailHistory.push({ to, subject, text: message, html, sentAt: new Date() });
    return 'mock-email-id';
  }

  // 1. Vercel SMTP relay (Render -> Vercel internal API)
  if (provider === 'vercel_smtp') {
    const relayUrl = process.env.EMAIL_RELAY_URL?.trim();
    const relayToken = process.env.EMAIL_RELAY_TOKEN?.trim();

    if (!relayUrl || !relayToken) {
      console.error('[sendEmail] Missing EMAIL_RELAY_URL or EMAIL_RELAY_TOKEN');
      throw new Error('Email relay is not configured. Set EMAIL_RELAY_URL and EMAIL_RELAY_TOKEN.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const payload: { to: string; subject: string; text: string; html?: string } = {
        to,
        subject,
        text: message,
      };
      if (html) {
        payload.html = html;
      }

      const response = await fetch(relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${relayToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        try {
          const body = (await response.json()) as { message?: string };
          if (body?.message) errMessage = body.message;
        } catch {
          // ignore
        }
        console.error(`[sendEmail] Vercel relay rejected request: ${errMessage}`);
        throw new Error(`Email delivery failed: ${errMessage}`);
      }

      const data = (await response.json()) as { success?: boolean; message?: string };
      if (!data?.success) {
        throw new Error(data?.message || 'Email relay returned unsuccessful status');
      }

      sentEmailHistory.push({ to, subject, text: message, html, sentAt: new Date() });
      return 'vercel-relay-accepted';
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Email relay request timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // 2. Direct SMTP
  if (provider === 'smtp') {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
    const port = SMTP_PORT ? Number(SMTP_PORT) : 587;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
      throw new Error('SMTP is not configured. Missing SMTP_HOST, SMTP_USER, or SMTP_PASSWORD.');
    }

    const from = (SMTP_FROM || SMTP_USER).trim();
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER.trim(), pass: SMTP_PASSWORD.replace(/\s+/g, '') },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });

    const mailOptions = {
      from,
      to,
      subject,
      text: message,
      ...(html ? { html } : {}),
    };

    const result = await transporter.sendMail(mailOptions);
    sentEmailHistory.push({ to, subject, text: message, html, sentAt: new Date() });
    return result.messageId || 'smtp-delivered';
  }

  throw new Error(`Unsupported EMAIL_PROVIDER "${provider}"`);
}
