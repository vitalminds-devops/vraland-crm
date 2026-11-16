import { getInitials } from "@/features/contacts/lib/helpers";
import type { DataScope } from "@/lib/permissions/catalog";

export type RoleRef = { id: string; name: string; slug: string };

export type BrokerOption = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
};

export type UserDocument = {
  id: string;
  name: string;
  documentType: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  createdAt: Date;
  validFrom: string | null;
  validUntil: string | null;
  certificateNumber: string | null;
};

export type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  lastLoginAt: Date | null;
  avatarUrl: string | null;
  brokerId: string | null;
  /** Whose records the user reaches, from their roles' and their own permissions. */
  dataScope: DataScope;
  roles: RoleRef[];
  documents: UserDocument[];
};

export function displayName(user: Pick<UserRow, "firstName" | "lastName">): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

export function initialsOf(user: Pick<UserRow, "firstName" | "lastName">): string {
  return getInitials(user.firstName, user.lastName);
}
