import { and, asc, eq, inArray, isNull, lt, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  campaignRecipients,
  campaigns,
  contacts,
  emailTemplates,
  smsTemplates,
} from "@/db/schema";
import { getUserFacingMessage } from "@/lib/error-handler";
import { logError } from "@/lib/logger";
import { getEmailProvider, getSmsProvider } from "@/lib/messaging/providers";
import { conflict, ActionErrorCode } from "@/lib/errors";
import { type ActionResult, failure, failureFrom, success } from "@/lib/types/action-result";

import { escapeHtml, render } from "./merge-fields";

export { escapeHtml, render };

/**
 * Sends a campaign's pending recipients. Callers check permission first; the scheduler calls it
 * directly. Not a server action, so it cannot be invoked from the browser.
 */
export async function deliverCampaign(
  organizationId: string,
  id: string,
): Promise<ActionResult<{ id: string; status: "completed" | "paused"; processed: number }>> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.organizationId, organizationId)))
    .limit(1);
  if (!campaign) return failureFrom(ActionErrorCode.NOT_FOUND, "Campaign not found.");
  if (!["draft", "scheduled", "paused"].includes(campaign.status))
    return failure(conflict("Only draft, scheduled or paused campaigns can be sent."));
  if (campaign.channel === "social")
    return failure(conflict("A social publishing provider must be configured first."));
  const emailProvider = campaign.channel === "email" ? getEmailProvider() : null;
  const smsProvider = campaign.channel === "sms" ? getSmsProvider() : null;
  if (campaign.channel === "email" && !emailProvider)
    return failure(conflict("Resend configuration is required before sending email campaigns."));
  if (campaign.channel === "sms" && !smsProvider)
    return failure(conflict("An SMS provider must be configured before sending SMS campaigns."));
  const [emailTemplate] = campaign.emailTemplateId
    ? await db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.id, campaign.emailTemplateId))
        .limit(1)
    : [];
  const [smsTemplate] = campaign.smsTemplateId
    ? await db
        .select()
        .from(smsTemplates)
        .where(eq(smsTemplates.id, campaign.smsTemplateId))
        .limit(1)
    : [];
  const rows = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      email: contacts.email,
      phone: contacts.mobilePhone1,
    })
    .from(campaignRecipients)
    .innerJoin(contacts, eq(campaignRecipients.contactId, contacts.id))
    .where(
      and(
        eq(campaignRecipients.campaignId, id),
        eq(campaignRecipients.deliveryStatus, "pending"),
        // Consent can be withdrawn after the campaign was built.
        eq(contacts.marketingConsent, true),
        isNull(contacts.deletedAt),
      ),
    );
  // Claim the campaign in one statement so a double-click cannot send twice.
  const claimed = await db
    .update(campaigns)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(campaigns.id, id), inArray(campaigns.status, ["draft", "scheduled", "paused"])))
    .returning({ id: campaigns.id });
  if (!claimed.length) return failure(conflict("This campaign is already being sent."));
  let processed = 0;
  let paused = false;
  let lastBeat = Date.now();
  for (const row of rows) {
    // Every minute, well inside the stall window, whatever the provider's speed.
    if (Date.now() - lastBeat >= HEARTBEAT_MS) {
      lastBeat = Date.now();
      // Also a heartbeat: a running campaign that stops updating was interrupted.
      const [current] = await db
        .update(campaigns)
        .set({ updatedAt: new Date() })
        .where(and(eq(campaigns.id, id), eq(campaigns.status, "running")))
        .returning({ id: campaigns.id });
      if (!current) {
        paused = true;
        break;
      }
    }
    // Claim the recipient so an overlapping resume cannot send it a second time.
    const [mine] = await db
      .update(campaignRecipients)
      .set({ deliveryStatus: "sending" })
      .where(
        and(
          eq(campaignRecipients.campaignId, id),
          eq(campaignRecipients.contactId, row.contactId),
          eq(campaignRecipients.deliveryStatus, "pending"),
        ),
      )
      .returning({ contactId: campaignRecipients.contactId });
    if (!mine) continue;
    processed++;
    try {
      if (campaign.channel === "email") {
        if (!row.email || !emailTemplate) throw new Error("Email address or template unavailable");
        await emailProvider!.send({
          to: row.email,
          subject: render(emailTemplate.subject, row.firstName),
          html: render(emailTemplate.bodyHtml, escapeHtml(row.firstName)),
          text: emailTemplate.bodyText ? render(emailTemplate.bodyText, row.firstName) : undefined,
        });
      } else {
        if (!row.phone || !smsTemplate) throw new Error("Phone number or template unavailable");
        await smsProvider!.send({
          to: row.phone,
          body: render(smsTemplate.body, row.firstName),
        });
      }
      await db
        .update(campaignRecipients)
        .set({ deliveryStatus: "sent", sentAt: new Date(), errorMessage: null })
        .where(
          and(
            eq(campaignRecipients.campaignId, id),
            eq(campaignRecipients.contactId, row.contactId),
          ),
        );
    } catch (error) {
      await db
        .update(campaignRecipients)
        .set({
          deliveryStatus: "failed",
          errorMessage: getUserFacingMessage(error),
        })
        .where(
          and(
            eq(campaignRecipients.campaignId, id),
            eq(campaignRecipients.contactId, row.contactId),
          ),
        );
    }
  }
  // A campaign paused mid-send keeps its paused status.
  const [completed] = paused
    ? []
    : await db
        .update(campaigns)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(campaigns.id, id), eq(campaigns.status, "running")))
        .returning({ id: campaigns.id });
  // Recipients left pending withdrew consent or were archived after the campaign was built.
  if (completed)
    await db
      .update(campaignRecipients)
      .set({
        deliveryStatus: "skipped",
        errorMessage: "No marketing consent, or contact archived.",
      })
      .where(
        and(
          eq(campaignRecipients.campaignId, id),
          eq(campaignRecipients.deliveryStatus, "pending"),
        ),
      );
  return success({ id, status: completed ? "completed" : "paused", processed });
}

const STALL_MS = 15 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

/**
 * Pauses campaigns whose sender died mid-send, so they can be resumed. Recipients caught mid-send
 * are marked failed rather than retried: they may already have received the message.
 */
export async function recoverStalledCampaigns(now = new Date()): Promise<number> {
  const stalled = await db
    .update(campaigns)
    .set({ status: "paused", updatedAt: now })
    .where(
      and(
        eq(campaigns.status, "running"),
        lt(campaigns.updatedAt, new Date(now.getTime() - STALL_MS)),
      ),
    )
    .returning({ id: campaigns.id });
  if (stalled.length)
    await db
      .update(campaignRecipients)
      .set({
        deliveryStatus: "failed",
        errorMessage: "Interrupted while sending; may not have gone out.",
      })
      .where(
        and(
          inArray(
            campaignRecipients.campaignId,
            stalled.map((row) => row.id),
          ),
          eq(campaignRecipients.deliveryStatus, "sending"),
        ),
      );
  return stalled.length;
}

const UNSENDABLE_REASON: Record<string, string> = {
  social: "No social publishing provider.",
  email: "Email provider not set up.",
  sms: "SMS provider not set up.",
};

/**
 * Due campaigns whose channel cannot send move back to draft with an audited reason. Left
 * scheduled, they would be retried forever and, being oldest, fill every slot ahead of newer ones.
 */
async function unscheduleUnsendable(now: Date): Promise<void> {
  const channels = [
    "social",
    ...(getEmailProvider() ? [] : ["email"]),
    ...(getSmsProvider() ? [] : ["sms"]),
  ];
  const stopped = await db
    .update(campaigns)
    .set({ status: "draft", updatedAt: now })
    .where(
      and(
        eq(campaigns.status, "scheduled"),
        lte(campaigns.scheduledAt, now),
        inArray(campaigns.channel, channels),
      ),
    )
    .returning({
      id: campaigns.id,
      organizationId: campaigns.organizationId,
      channel: campaigns.channel,
    });
  if (stopped.length)
    await db.insert(auditLogs).values(
      stopped.map((campaign) => ({
        organizationId: campaign.organizationId,
        action: "update",
        entityType: "campaign",
        entityId: campaign.id,
        oldValues: { status: "scheduled" },
        newValues: {
          status: "draft",
          trigger: "schedule",
          reason: `Not sent: ${UNSENDABLE_REASON[campaign.channel] ?? "channel cannot send."}`,
        },
      })),
    );
}

/** Campaigns this process is sending now; each tick starts others beside them. */
const sending = new Set<string>();
const MAX_PARALLEL_SENDS = 4;

/**
 * Starts every scheduled campaign whose time has come, up to four at once, so one long send never
 * holds up the rest. Returns how many were sent.
 */
export async function sendDueCampaigns(now = new Date()): Promise<number> {
  await recoverStalledCampaigns(now);
  await unscheduleUnsendable(now);
  const due = await db
    .select({ id: campaigns.id, organizationId: campaigns.organizationId })
    .from(campaigns)
    .where(and(eq(campaigns.status, "scheduled"), lte(campaigns.scheduledAt, now)))
    .orderBy(asc(campaigns.scheduledAt))
    // Bounded: only the slots free in this process, plus the ones it is already sending.
    .limit(MAX_PARALLEL_SENDS + sending.size);
  const batch = due
    .filter((campaign) => !sending.has(campaign.id))
    .slice(0, Math.max(0, MAX_PARALLEL_SENDS - sending.size));
  const results = await Promise.all(
    batch.map(async (campaign) => {
      sending.add(campaign.id);
      try {
        const result = await deliverCampaign(campaign.organizationId, campaign.id);
        if (!result.success) {
          // E.g. another server claimed it first; channels that cannot send were unscheduled above.
          logError("Scheduled campaign not sent", result.error.message, {
            campaignId: campaign.id,
          });
          return false;
        }
        await db.insert(auditLogs).values({
          organizationId: campaign.organizationId,
          action: "update",
          entityType: "campaign",
          entityId: campaign.id,
          newValues: {
            status: result.data.status,
            processed: result.data.processed,
            trigger: "schedule",
          },
        });
        return true;
      } finally {
        sending.delete(campaign.id);
      }
    }),
  );
  return results.filter(Boolean).length;
}

/**
 * Checks for due campaigns every minute, so a send starts within a minute of its scheduled time;
 * called once from instrumentation. Two servers cannot send the same campaign: deliverCampaign
 * claims it with one conditional update (scheduled -> running) before sending anything.
 */
export function startScheduledCampaigns(): void {
  const store = globalThis as typeof globalThis & { vraScheduledCampaigns?: boolean };
  if (store.vraScheduledCampaigns) return;
  store.vraScheduledCampaigns = true;
  // No overlap guard: campaigns already sending are skipped, so a long send doesn't block new ones.
  const run = () =>
    sendDueCampaigns().catch((error) => logError("Scheduled campaigns failed", error));
  void run();
  setInterval(run, 60_000).unref?.();
}
