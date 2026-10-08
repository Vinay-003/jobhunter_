import { timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT = 200;
const MAX_TEXT = 10_000;
const MAX_HTML = 100_000;

function matchesSecret(received: string | null | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received.trim());
  const right = Buffer.from(expected.trim());
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(req: any, res: any) {
  // CORS / preflight support
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;

  if (!matchesSecret(token, process.env.EMAIL_RELAY_TOKEN)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid JSON body' });
    }
  }

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid request body' });
  }

  const to = typeof body.to === 'string' ? body.to.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const text = typeof body.text === 'string' ? body.text : '';
  const html = typeof body.html === 'string' ? body.html : undefined;

  if (
    !EMAIL_REGEX.test(to) ||
    to.length > 254 ||
    /[\r\n\x00-\x1f\x7f]/.test(to) ||
    !subject ||
    subject.length > MAX_SUBJECT ||
    /[\r\n\x00-\x1f\x7f]/.test(subject) ||
    !text ||
    text.length > MAX_TEXT ||
    (html !== undefined && html.length > MAX_HTML)
  ) {
    return res.status(400).json({ success: false, message: 'Invalid parameters' });
  }

  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.replace(/\s+/g, '');
  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!user || !password || !from || !Number.isInteger(port)) {
    console.error('[email-relay] SMTP configuration missing:', { hasUser: !!user, hasPassword: !!password, host, port });
    return res.status(503).json({ success: false, message: 'Email relay unavailable' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user, pass: password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
      tls: { minVersion: 'TLSv1.2' },
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    };

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, message: 'Accepted for sending' });
  } catch (error: any) {
    console.error('[email-relay] SMTP send error:', error?.message || error);
    return res.status(503).json({ success: false, message: 'Email relay delivery failed' });
  }
}
