import nodemailer from 'nodemailer';
import { env } from '../config.js';
import { appendAppLog } from './logger.js';
import { renderPromptEmail } from './promptEmailRenderer.js';

export function isEmailEnabled() {
  return Boolean(env.email.enabled);
}

function createTransporter() {
  return nodemailer.createTransport({
    host: env.email.smtpHost,
    port: env.email.smtpPort,
    secure: env.email.smtpPort === 465,
    auth: env.email.smtpUser || env.email.smtpPass ? {
      user: env.email.smtpUser,
      pass: env.email.smtpPass
    } : undefined
  });
}

export async function sendPromptReportEmail(report) {
  if (!isEmailEnabled()) {
    appendAppLog('info', 'Prompt email disabled', {
      repoName: report.repoName,
      repoPath: report.repoPath
    });
    return { skipped: true, reason: 'disabled' };
  }

  const subject = `TeleDevBot · Tarea finalizada · ${report.repoName}`;
  const html = renderPromptEmail(report);
  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from: env.email.smtpFrom,
    to: env.email.to,
    subject,
    html
  });

  appendAppLog('info', 'Prompt email sent', {
    repoName: report.repoName,
    repoPath: report.repoPath,
    to: env.email.to,
    messageId: info.messageId || null
  });

  return { skipped: false, messageId: info.messageId || null };
}
