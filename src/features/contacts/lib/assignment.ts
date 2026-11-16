import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { roles, userRoles, users } from "@/db/schema";
import { agentRoleNames, agentRoleSlugs } from "./contact-options";

// Keep dropdown options and server-side assignment validation consistent.
export function eligibleAgent(organizationId: string) {
  return and(
    eq(users.organizationId, organizationId),
    eq(users.status, "active"),
    isNull(users.deletedAt),
    sql`exists (select 1 from ${userRoles} inner join ${roles} on ${roles.id} = ${userRoles.roleId}
      where ${userRoles.userId} = ${users.id} and ${roles.organizationId} = ${organizationId}
      and ${or(inArray(sql`lower(${roles.slug})`, [...agentRoleSlugs]), inArray(sql`lower(trim(${roles.name}))`, [...agentRoleNames]))})`,
  );
}
