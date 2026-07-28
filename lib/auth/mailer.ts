import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";

type MailInput = { to: string; subject: string; text: string; html: string };

const DEV_MAIL_DIR = path.resolve(process.cwd(), ".dev-mail");

/**
 * In development, when SMTP isn't configured, also drop the last email sent to
 * each address as a JSON file so e2e tests can pick up verification/reset/
 * invite links without needing a real mailbox. Never used in production —
 * gated by the same NODE_ENV check as the console-log fallback below.
 */
function writeDevMailFile(input: MailInput): void {
  fs.mkdirSync(DEV_MAIL_DIR, { recursive: true });
  const safeName = input.to.replace(/[^a-z0-9@.-]/gi, "_");
  fs.writeFileSync(
    path.join(DEV_MAIL_DIR, `${safeName}.json`),
    JSON.stringify({ ...input, sentAt: new Date().toISOString() }, null, 2),
  );
}

function smtpFullyConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_FROM_EMAIL,
  );
}

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;
  const port = Number(process.env.SMTP_PORT);
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  return cachedTransporter;
}

/**
 * Sends synchronously in the same request — this project has no background
 * job/queue to defer email delivery to (see CLAUDE.md). If SMTP isn't fully
 * configured: fails loudly in production (never silently drops a security-
 * relevant email), but in development logs the message to the console so
 * local flows (verify/invite/reset links) can still be exercised end-to-end
 * without real SMTP.
 */
export async function sendMail(input: MailInput): Promise<void> {
  if (!smtpFullyConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SMTP is not fully configured (SMTP_HOST/PORT/USER/PASSWORD/FROM_EMAIL) — cannot send email.",
      );
    }
    console.log(
      `\n--- [dev email] to=${input.to} subject="${input.subject}" ---\n${input.text}\n---\n`,
    );
    writeDevMailFile(input);
    return;
  }

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  await sendMail({
    to,
    subject: "Verify your email",
    text: `Verify your email by visiting: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    html: `<p>Verify your email by clicking the link below.</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendMail({
    to,
    subject: "Reset your password",
    text: `Reset your password by visiting: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    html: `<p>Reset your password by clicking the link below.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });
}

export async function sendInvitationEmail(
  to: string,
  businessName: string,
  acceptUrl: string,
): Promise<void> {
  await sendMail({
    to,
    subject: `You've been invited to join ${businessName}`,
    text: `You've been invited to join ${businessName}. Accept the invitation: ${acceptUrl}\n\nThis link expires in 7 days.`,
    html: `<p>You've been invited to join <strong>${businessName}</strong>.</p><p><a href="${acceptUrl}">Accept the invitation</a></p><p>This link expires in 7 days.</p>`,
  });
}
