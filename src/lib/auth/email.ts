import { getEmailService } from "@/lib/email/email-service";
import {
  getPasswordResetHtmlTemplate,
  getPasswordResetTextTemplate,
} from "@/lib/email/templates/password-reset";

type PasswordResetMessage = {
  email: string;
  resetUrl: string;
};

export async function sendPasswordResetEmail(message: PasswordResetMessage): Promise<void> {
  const emailService = getEmailService();

  const html = getPasswordResetHtmlTemplate({
    resetUrl: message.resetUrl,
    expiryHours: 1, // Matches resetPasswordTokenExpiresIn in auth.ts
    appName: "VRA Land CRM",
  });

  const text = getPasswordResetTextTemplate({
    resetUrl: message.resetUrl,
    expiryHours: 1,
    appName: "VRA Land CRM",
  });

  await emailService.send({
    to: message.email,
    subject: "Reset Your Password - VRA Land CRM",
    html,
    text,
  });
}
