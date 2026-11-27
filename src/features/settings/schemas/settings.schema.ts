import { z } from "zod";

export const permissionOverridesSchema = z
  .array(z.object({ key: z.string().min(1).max(150), granted: z.boolean() }))
  .max(500);

export const optionalUuid = z.union([z.uuid(), z.literal("")]);

export const userSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.email(),
  password: z.string().min(12).max(128),
  phone: z.string().trim().max(50).optional(),
  brokerId: optionalUuid,
  roleIds: z.array(z.uuid()).min(1),
  salesExecutiveIds: z.array(z.uuid()).optional(),
  brokerIds: z.array(z.uuid()).optional(),
  documents: z.array(z.instanceof(File)).max(5),
});

export const accessSchema = z.object({
  id: z.uuid(),
  status: z.enum(["invited", "active", "inactive", "suspended"]),
  brokerId: optionalUuid,
  roleIds: z.array(z.uuid()).min(1),
  salesExecutiveIds: z.array(z.uuid()).optional(),
  // A Master Broker's brokers; omitted leaves them as they are.
  brokerIds: z.array(z.uuid()).optional(),
  // The user's own permission changes, saved with the access; omitted leaves them as they are.
  permissionOverrides: permissionOverridesSchema.optional(),
});

export const userDocumentSchema = z.object({
  userId: z.uuid(),
  documentId: z.union([z.uuid(), z.literal("")]),
  file: z.instanceof(File),
});

export const userCertificateSchema = z.object({
  userId: z.uuid(),
  file: z.instanceof(File),
  certificateNumber: z.string().trim().min(1).max(180),
  validFrom: z.iso.date(),
  validUntil: z.iso.date(),
});

export const agentAccountSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.email(),
  password: z.string().min(12).max(128),
  phone: z.string().trim().max(50).optional(),
  // No longer asked on the form; agents.license stays NOT NULL, so it is stored empty.
  license: z.string().trim().max(180).optional().default(""),
  // Optional: an agent may work on their own, with no broker.
  brokerId: optionalUuid.optional().default(""),
  documents: z.array(z.instanceof(File)).max(5),
});

export const userStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["active", "inactive"]),
  /** Who takes over the user's contacts, deals and team when they leave. */
  handoverToUserId: optionalUuid.optional(),
});

export const commissionRateSchema = z.object({
  id: z.uuid(),
  commissionRate: z.number().min(0).max(100).nullable(),
});

export const userDeletionSchema = z.object({
  id: z.uuid(),
  deleted: z.boolean(),
  handoverToUserId: optionalUuid.optional(),
});
