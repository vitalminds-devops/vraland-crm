import { z } from "zod";
import { MAX_OCCURRENCES, REPEATS } from "../lib/recurrence";
const optionalUuid = z.union([z.uuid(), z.literal(""), z.null()]).transform((v) => v || null);
export const eventSchema = z
  .object({
    title: z.string().trim().min(2).max(220),
    description: z.string().trim().max(5000).optional().default(""),
    eventType: z.enum(["general", "meeting", "call", "closing", "follow_up"]),
    startAt: z.iso.datetime({ local: true }),
    endAt: z.iso.datetime({ local: true }),
    allDay: z.boolean().default(false),
    location: z.string().trim().max(1000).optional().default(""),
    contactId: optionalUuid,
    propertyId: optionalUuid,
    dealId: optionalUuid,
    attendeeUserId: optionalUuid,
    repeat: z.enum(REPEATS).default("none"),
    repeatCount: z.coerce.number().int().min(1).max(MAX_OCCURRENCES).default(1),
  })
  .refine((v) => new Date(v.endAt) >= new Date(v.startAt), {
    path: ["endAt"],
    message: "End time must be after the start time.",
  });
/** Editing one event, a viewing included: moving its times is how it is rescheduled. */
export const eventUpdateSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(2).max(220),
    description: z.string().trim().max(5000).optional().default(""),
    /** Ignored for viewings, which keep their type. */
    eventType: z.enum(["general", "meeting", "call", "closing", "follow_up"]).optional(),
    startAt: z.iso.datetime({ local: true }),
    endAt: z.iso.datetime({ local: true }),
    allDay: z.boolean().default(false),
    location: z.string().trim().max(1000).optional().default(""),
  })
  .refine((v) => new Date(v.endAt) >= new Date(v.startAt), {
    path: ["endAt"],
    message: "End time must be after the start time.",
  });
export const viewingSchema = z
  .object({
    propertyId: z.uuid(),
    contactId: z.uuid(),
    agentUserId: optionalUuid,
    title: z.string().trim().min(2).max(220),
    startAt: z.iso.datetime({ local: true }),
    endAt: z.iso.datetime({ local: true }),
    location: z.string().trim().max(1000).optional().default(""),
    notes: z.string().trim().max(5000).optional().default(""),
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), {
    path: ["endAt"],
    message: "End time must be after the start time.",
  });
export const viewingStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show", "rescheduled"]),
  feedback: z.string().trim().max(5000).optional().default(""),
  interestLevel: z
    .union([z.coerce.number().int().min(1).max(5), z.literal(""), z.null()])
    .transform((v) => (v === "" ? null : v)),
});
