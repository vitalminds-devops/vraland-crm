import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logError, logInfo, logWarn } from "@/lib/logger";

type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
};

type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

class EmailService {
  private transporter: Transporter | null = null;
  private fromAddress: string;
  private fromName: string;

  constructor() {
    this.fromAddress = process.env.SMTP_FROM || "noreply@vraland-crm.com";
    this.fromName = process.env.SMTP_FROM_NAME || "VRA Land CRM";
    this.initializeTransporter();
  }

  private initializeTransporter() {
    // Skip initialization if SMTP is not configured
    if (!this.isConfigured()) {
      logWarn("Email service: SMTP not configured. Emails will be logged, not sent.");
      return;
    }

    const config: EmailConfig = {
      host: process.env.SMTP_HOST || "",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASSWORD || "",
      },
    };

    try {
      this.transporter = nodemailer.createTransport(config);
      logInfo("Email service: SMTP transporter initialized");
    } catch (error) {
      logError("Email service: transporter setup failed", error, { operation: "email_setup" });
    }
  }

  private isConfigured(): boolean {
    return !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD
    );
  }

  async send(message: EmailMessage): Promise<void> {
    // Development mode: log to console
    if (process.env.NODE_ENV === "development" && !this.isConfigured()) {
      logInfo("[DEV EMAIL]", { to: message.to, subject: message.subject, html: message.html });
      return;
    }

    // Production mode: send via SMTP
    if (!this.transporter) {
      throw new Error("Email service: SMTP transporter not initialized");
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      logInfo("Email service: email sent", { subject: message.subject });
    } catch (error) {
      logError("Email service: send failed", error, { operation: "email_send" });
      throw new Error(
        `Couldn't send email: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      logError("Email service: SMTP verification failed", error, { operation: "email_verify" });
      return false;
    }
  }
}

// Singleton instance
let emailServiceInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}
