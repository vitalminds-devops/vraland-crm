import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

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
      console.warn("Email service: SMTP not configured. Emails will be logged to console.");
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
      console.info("Email service: SMTP transporter initialized successfully");
    } catch (error) {
      console.error("Email service: Failed to initialize transporter", error);
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
      console.info(`[DEV EMAIL] To: ${message.to}`);
      console.info(`[DEV EMAIL] Subject: ${message.subject}`);
      console.info(`[DEV EMAIL] HTML: ${message.html}`);
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
      console.info(`Email service: Email sent successfully to ${message.to}`);
    } catch (error) {
      console.error(`Email service: Failed to send email to ${message.to}`, error);
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
      console.error("Email service: SMTP connection verification failed", error);
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
