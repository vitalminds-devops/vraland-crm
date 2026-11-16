import "../../config/load-environment";
import { eq } from "drizzle-orm";
import { closeDatabaseConnection, db } from "../client";
import { contacts, organizations } from "../schema";
import { groupDuplicates, type DuplicateGroup } from "@/features/contacts/lib/contact-duplicates";

async function rowsForOrganization(organizationId: string) {
  return db
    .select({
      id: contacts.id,
      contactCode: contacts.contactCode,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.emailNormalized,
      mobilePhoneNormalized1: contacts.mobilePhoneNormalized1,
      mobilePhoneNormalized2: contacts.mobilePhoneNormalized2,
      mobilePhoneNormalized3: contacts.mobilePhoneNormalized3,
    })
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId));
}

function printGroup(group: DuplicateGroup, organizationName: string) {
  console.info(
    `\n  [${group.field}] ${group.value} — ${group.contacts.length} contacts (${organizationName})`,
  );
  for (const contact of group.contacts)
    console.info(`    ${contact.contactCode}  ${contact.firstName} ${contact.lastName}`);
}

try {
  const organizationRows = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations);

  if (organizationRows.length === 0) {
    console.info("No organizations found.");
  }

  let totalGroups = 0;
  for (const organization of organizationRows) {
    const rows = await rowsForOrganization(organization.id);
    const groups = groupDuplicates(rows);
    totalGroups += groups.length;
    console.info(
      `\n${organization.name}: ${rows.length} active contact(s), ${groups.length} duplicate group(s).`,
    );
    for (const group of groups) printGroup(group, organization.name);
  }

  console.info(
    `\nReport complete: ${totalGroups} duplicate group(s) across ${organizationRows.length} organization(s).`,
  );
  if (totalGroups > 0)
    console.info(
      "Resolve the groups above, then re-run db:migrate so the unique email index can be created.",
    );
} finally {
  await closeDatabaseConnection();
}
