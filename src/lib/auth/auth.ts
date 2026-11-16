import "server-only";

import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  organizations,
  users,
} from "@/db/schema";
import { logError } from "@/lib/logger";
import { sendPasswordResetEmail } from "./email";

const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !isProductionBuild && !process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET must be set in production. Refusing to start with a default session secret.",
  );
}
// Without a fixed public URL, password-reset links would be built from the request's Host header,
// which an attacker can set to their own domain.
if (isProduction && !isProductionBuild && !process.env.BETTER_AUTH_URL) {
  throw new Error("BETTER_AUTH_URL must be set in production. Refusing to start.");
}

const trustedOrigins = [
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? []),
  ...(isProduction ? [] : ["http://localhost:*", "http://127.0.0.1:*"]),
]
  .map((origin) => origin.trim())
  .filter(Boolean);

/** Whether this sign-in account belongs to an active, unarchived user of an active organization. */
async function isActiveAccount(authUserId: string) {
  const [allowed] = await db
    .select({ id: users.id })
    .from(authUser)
    .innerJoin(users, eq(authUser.crmUserId, users.id))
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .where(
      and(
        eq(authUser.id, authUserId),
        eq(users.status, "active"),
        isNull(users.deletedAt),
        eq(organizations.isActive, true),
      ),
    )
    .limit(1);
  return Boolean(allowed);
}

export const auth = betterAuth({
  appName: "CRM – VRA Real Estate",
  baseURL: process.env.BETTER_AUTH_URL ?? (isProductionBuild ? "http://localhost:3000" : undefined),
  secret:
    process.env.BETTER_AUTH_SECRET ??
    (isProductionBuild ? "build-only-placeholder-secret-not-for-runtime" : undefined),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
    },
  }),
  user: {
    additionalFields: {
      crmUserId: { type: "string", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 3600,
    sendResetPassword: async ({ user, url }) => {
      // A deactivated or archived account gets no link; the form answers the same either way.
      if (!(await isActiveAccount(user.id))) return;
      void sendPasswordResetEmail({ email: user.email, resetUrl: url }).catch((error) =>
        logError("Password reset email failed", error, {
          operation: "password_reset_email",
        }),
      );
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins,
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          if (!(await isActiveAccount(session.userId)))
            throw new APIError("FORBIDDEN", {
              message: "This account is deactivated. Contact your administrator.",
            });
        },
        // A new session is a sign-in; record it for "Last sign-in". Never block the sign-in on it.
        after: async (session) => {
          try {
            const [link] = await db
              .select({ crmUserId: authUser.crmUserId })
              .from(authUser)
              .where(eq(authUser.id, session.userId))
              .limit(1);
            if (link?.crmUserId)
              await db
                .update(users)
                .set({ lastLoginAt: new Date() })
                .where(eq(users.id, link.crmUserId));
          } catch (error) {
            logError("Last sign-in update failed", error, { operation: "last_login_update" });
          }
        },
      },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    // Nginx Proxy Manager sets X-Real-IP; the host firewall only lets the proxy reach port 3004.
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  },
  plugins: [nextCookies()],
});
