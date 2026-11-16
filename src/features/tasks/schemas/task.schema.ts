import { z } from "zod";
const optionalUuid = z.union([z.uuid(), z.literal(""), z.null()]).transform((v) => v || null);
const optionalDateTime = z
  .union([z.iso.datetime({ local: true }), z.literal(""), z.null()])
  .transform((v) => v || null);
export const taskSchema = z
  .object({
    title: z.string().trim().min(2).max(220),
    description: z.string().trim().max(5000).optional().default(""),
    taskType: z.enum(["follow_up", "call", "email", "document", "viewing", "closing", "general"]),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    assignedUserId: optionalUuid,
    contactId: optionalUuid,
    propertyId: optionalUuid,
    dealId: optionalUuid,
    dueAt: optionalDateTime,
    reminderAt: optionalDateTime,
  })
  .superRefine((v, ctx) => {
    if (v.reminderAt && v.dueAt && new Date(v.reminderAt) > new Date(v.dueAt))
      ctx.addIssue({
        code: "custom",
        path: ["reminderAt"],
        message: "Reminder must be before the due date.",
      });
  });
export const taskStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["todo", "in_progress", "completed", "cancelled"]),
});
export type TaskInput = z.input<typeof taskSchema>;
