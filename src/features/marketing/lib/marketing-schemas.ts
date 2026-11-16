import { z } from "zod";

export const emailTemplateSchema = z.object({
  name: z.string().trim().min(2, "Enter a template name.").max(180),
  subject: z
    .string()
    .trim()
    .min(1, "Enter a subject.")
    .max(255, "Keep the subject under 255 characters."),
  category: z.string().trim().max(80).optional(),
  bodyHtml: z
    .string()
    .trim()
    .min(1, "Enter the HTML body.")
    .max(100_000, "Keep the body under 100,000 characters."),
  bodyText: z
    .string()
    .trim()
    .max(100_000, "Keep the fallback under 100,000 characters.")
    .optional(),
});

export type EmailTemplateInput = z.infer<typeof emailTemplateSchema>;

export const smsTemplateSchema = z.object({
  name: z.string().trim().min(2, "Enter a template name.").max(180),
  category: z.string().trim().max(80).optional(),
  body: z
    .string()
    .trim()
    .min(1, "Enter the message body.")
    .max(1_600, "Keep the message under 1,600 characters."),
});

export type SmsTemplateInput = z.infer<typeof smsTemplateSchema>;

export const campaignSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a campaign name.").max(180),
    channel: z.enum(["email", "sms", "social"]),
    emailTemplateId: z.string(),
    smsTemplateId: z.string(),
    scheduledAt: z.string(),
    contactIds: z.array(z.string()).min(1, "Select at least one consenting recipient."),
  })
  .superRefine((value, context) => {
    if (value.channel === "email" && !value.emailTemplateId)
      context.addIssue({
        code: "custom",
        path: ["emailTemplateId"],
        message: "Select an email template.",
      });
    if (value.channel === "sms" && !value.smsTemplateId)
      context.addIssue({
        code: "custom",
        path: ["smsTemplateId"],
        message: "Select an SMS template.",
      });
    if (value.scheduledAt && Number.isNaN(new Date(value.scheduledAt).getTime()))
      context.addIssue({
        code: "custom",
        path: ["scheduledAt"],
        message: "Enter a valid date and time.",
      });
  });

export type CampaignInput = z.infer<typeof campaignSchema>;

export const sequenceSchema = z.object({
  name: z.string().trim().min(2, "Enter a sequence name.").max(180),
  description: z.string().trim().max(3_000, "Keep the description under 3,000 characters."),
  triggerType: z.enum(["lead_created", "deal_stage_changed", "viewing_completed", "manual"]),
});

export type SequenceInput = z.infer<typeof sequenceSchema>;

export const stepSchema = z
  .object({
    actionType: z.enum(["send_email", "send_sms", "create_task", "wait", "assign_user"]),
    delayMinutes: z.coerce
      .number()
      .int("Enter whole minutes.")
      .min(0, "A delay cannot be negative."),
    emailTemplateId: z.string(),
    smsTemplateId: z.string(),
    taskTitle: z.string().trim().max(220),
    configuration: z.string().trim().max(5_000),
  })
  .superRefine((value, context) => {
    if (value.actionType === "send_email" && !value.emailTemplateId)
      context.addIssue({
        code: "custom",
        path: ["emailTemplateId"],
        message: "Select an email template.",
      });
    if (value.actionType === "send_sms" && !value.smsTemplateId)
      context.addIssue({
        code: "custom",
        path: ["smsTemplateId"],
        message: "Select an SMS template.",
      });
    if (value.actionType === "create_task" && !value.taskTitle)
      context.addIssue({
        code: "custom",
        path: ["taskTitle"],
        message: "Enter the task this step creates.",
      });
    if (value.configuration) {
      try {
        JSON.parse(value.configuration);
      } catch {
        context.addIssue({
          code: "custom",
          path: ["configuration"],
          message: "Configuration must be valid JSON.",
        });
      }
    }
  });

export type StepInput = z.infer<typeof stepSchema>;

export const enrollmentSchema = z
  .object({
    contactId: z.string(),
    dealId: z.string(),
  })
  .refine((value) => Boolean(value.contactId || value.dealId), {
    path: ["contactId"],
    message: "Select a contact or a deal.",
  });

export type EnrollmentInput = z.infer<typeof enrollmentSchema>;
