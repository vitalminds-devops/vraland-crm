import "server-only";
export type MessageResult = { providerId: string };
export interface EmailProvider {
  send(input: { to: string; subject: string; html: string; text?: string }): Promise<MessageResult>;
}
export interface SmsProvider {
  send(input: { to: string; body: string }): Promise<MessageResult>;
}
class ResendProvider implements EmailProvider {
  constructor(
    private key: string,
    private from: string,
  ) {}
  async send(input: { to: string; subject: string; html: string; text?: string }) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      // A hung provider must not stall a campaign past its stall recovery.
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
    const data = (await response.json()) as { id: string };
    return { providerId: data.id };
  }
}
export function getEmailProvider(): EmailProvider | null {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  return key && from ? new ResendProvider(key, from) : null;
}
export function getSmsProvider(): SmsProvider | null {
  return null;
}
export function getMessagingStatus() {
  return {
    email:
      process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
        ? "connected"
        : "configuration_required",
    sms: "configuration_required" as const,
    social: "configuration_required" as const,
  };
}
