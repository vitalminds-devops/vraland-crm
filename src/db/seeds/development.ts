import "../../config/load-environment";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { manilaDate, startOfManilaDay } from "../../lib/utils/manila-time";
import { and, asc, eq } from "drizzle-orm";

import { closeDatabaseConnection, db } from "../client";
import {
  agents,
  authAccount,
  authUser,
  contactCategories,
  contacts,
  dealContacts,
  deals,
  dealStageHistory,
  developments,
  floors,
  lostReasons,
  pipelineStages,
  properties,
  units,
  userRoles,
  users,
} from "../schema";
import { floorLevelSequence } from "../../features/properties/lib/floor-levels";
import { floorLabel, unitCode } from "../../features/properties/lib/unit-codes";
import { roleLabels, rolePermissionDefaults, type RoleSlug } from "../../lib/permissions/catalog";
import { seedPipelineStages } from "./pipeline-stages";
import { seedReferenceData } from "./reference";

if (process.env.NODE_ENV === "production")
  throw new Error("Development seed is disabled in production.");

if (process.env.ALLOW_DEVELOPMENT_SEED !== "true")
  throw new Error(
    "Refusing to run the development seed. Set ALLOW_DEVELOPMENT_SEED=true to confirm that demo accounts, contacts, deals and inventory will be inserted.",
  );

if (!process.env.DEV_SEED_PASSWORD)
  throw new Error(
    "DEV_SEED_PASSWORD environment variable is required. Set it to define the password for all development accounts.",
  );

const seededUserNames: Partial<Record<RoleSlug, { firstName: string; lastName: string }>> = {
  broker: { firstName: "Ana", lastName: "Santos" },
  "master-broker": { firstName: "Liza", lastName: "Reyes" },
  agent: { firstName: "Juan", lastName: "Cruz" },
};
const developmentPassword = process.env.DEV_SEED_PASSWORD;
const passwordHash = await hashPassword(developmentPassword);

/** Drizzle transaction handle, so the seeded inventory shares the seed's transaction. */
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function seedFloorsAndUnits(
  tx: DbTransaction,
  building: {
    id: string;
    developmentId: string | null;
    floorCount: number;
    unitsPerFloor: number;
  },
): Promise<Map<string, string>> {
  await tx
    .insert(floors)
    .values(
      floorLevelSequence(building.floorCount).map((level) => ({
        buildingId: building.id,
        level,
        label: floorLabel(level),
      })),
    )
    .onConflictDoNothing({ target: [floors.buildingId, floors.level] });

  const allFloors = await tx
    .select({ id: floors.id, level: floors.level })
    .from(floors)
    .where(eq(floors.buildingId, building.id))
    .orderBy(asc(floors.level));

  await tx
    .insert(units)
    .values(
      allFloors.flatMap((floor) =>
        Array.from({ length: building.unitsPerFloor }, (_, index) => ({
          developmentId: building.developmentId,
          buildingId: building.id,
          floorId: floor.id,
          code: unitCode(floor.level, index + 1),
        })),
      ),
    )
    .onConflictDoNothing({ target: [units.floorId, units.code] });

  const rows = await tx
    .select({ id: units.id, code: units.code })
    .from(units)
    .where(eq(units.buildingId, building.id));
  return new Map(rows.map((row) => [row.code, row.id]));
}

await db.transaction(async (tx) => {
  const { organization, rolesBySlug } = await seedReferenceData(tx, {
    organizationName: process.env.ORGANIZATION_NAME ?? "Real Estate CRM (Development)",
    organizationCode: process.env.ORGANIZATION_CODE ?? "CRM-DEV",
  });

  // Three accounts per executive role for testing team selection; one per other role.
  for (const slug of Object.keys(rolePermissionDefaults) as RoleSlug[]) {
    const role = rolesBySlug[slug];

    if (slug === "super-administrator") {
      const [legacySeedUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.organizationId, organization.id), eq(users.email, "admin@dev.example.com")),
        )
        .limit(1);
      if (legacySeedUser)
        await tx
          .update(users)
          .set({
            status: "inactive",
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(users.id, legacySeedUser.id), eq(users.organizationId, organization.id)));
      continue;
    }

    for (
      let sample = 1;
      sample <=
      (["sales-executive", "sales-executive-ih", "sales-executive-ind"].includes(slug) ? 3 : 1);
      sample++
    ) {
      const email = sample === 1 ? `${slug}@dev.example.com` : `${slug}-${sample}@dev.example.com`;
      const personName = seededUserNames[slug] ?? {
        firstName: roleLabels[slug].split(" ")[0],
        lastName: "User",
      };
      const [crmUser] = await tx
        .insert(users)
        .values({
          organizationId: organization.id,
          email,
          firstName: personName.firstName,
          lastName: personName.lastName,
          status: "active",
          emailVerifiedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [users.organizationId, users.email],
          set: {
            firstName: personName.firstName,
            lastName: personName.lastName,
            status: "active",
            deletedAt: null,
          },
        })
        .returning();
      await tx
        .insert(userRoles)
        .values({ userId: crmUser.id, roleId: role.id })
        .onConflictDoNothing();

      const [existingIdentity] = await tx
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.email, email))
        .limit(1);
      const identityId = existingIdentity?.id ?? randomUUID();
      if (existingIdentity)
        await tx
          .update(authUser)
          .set({
            crmUserId: crmUser.id,
            name: `${personName.firstName} ${personName.lastName}`,
            emailVerified: true,
            updatedAt: new Date(),
          })
          .where(eq(authUser.id, identityId));
      else
        await tx.insert(authUser).values({
          id: identityId,
          crmUserId: crmUser.id,
          name: `${personName.firstName} ${personName.lastName}`,
          email,
          emailVerified: true,
        });

      const [existingAccount] = await tx
        .select({ id: authAccount.id })
        .from(authAccount)
        .where(and(eq(authAccount.userId, identityId), eq(authAccount.providerId, "credential")))
        .limit(1);
      if (existingAccount)
        await tx
          .update(authAccount)
          .set({ password: passwordHash, updatedAt: new Date() })
          .where(eq(authAccount.id, existingAccount.id));
      else
        await tx.insert(authAccount).values({
          id: randomUUID(),
          issuer: "local:credential",
          accountId: identityId,
          providerId: "credential",
          userId: identityId,
          password: passwordHash,
        });
    }
  }
  const [brokerUser] = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.organizationId, organization.id), eq(users.email, "broker@dev.example.com")),
    )
    .limit(1);
  const [agentUser] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.organizationId, organization.id), eq(users.email, "agent@dev.example.com")))
    .limit(1);
  if (brokerUser && agentUser) {
    await tx
      .update(users)
      .set({ brokerId: brokerUser.id, updatedAt: new Date() })
      .where(and(eq(users.id, agentUser.id), eq(users.organizationId, organization.id)));
    await tx
      .insert(agents)
      .values({
        organizationId: organization.id,
        userId: agentUser.id,
        license: "Real Estate Broker",
      })
      .onConflictDoUpdate({
        target: agents.userId,
        set: {
          organizationId: organization.id,
          license: "Real Estate Broker",
          updatedAt: new Date(),
        },
      });
  }
  await seedPipelineStages(tx, organization.id);
  const lostReasonSeeds = [
    {
      name: "Price too high",
      description: "The client considered the property or offer outside their budget.",
    },
    {
      name: "Financing declined",
      description: "The buyer or tenant could not secure the required financing.",
    },
    {
      name: "Chose another property",
      description: "The client selected a competing property.",
    },
    {
      name: "Chose another agent",
      description: "The client continued the transaction with another agent or brokerage.",
    },
    {
      name: "Property unavailable",
      description: "The property was sold, rented, withdrawn, or otherwise became unavailable.",
    },
    {
      name: "Terms not accepted",
      description: "The parties could not agree on price, contingencies, or other terms.",
    },
    {
      name: "Client unresponsive",
      description: "The client stopped responding after reasonable follow-up attempts.",
    },
    {
      name: "Timeline changed",
      description: "The client postponed or cancelled their real-estate plans.",
    },
    {
      name: "Location mismatch",
      description: "The available property location did not meet the client's requirements.",
    },
    {
      name: "Property condition",
      description: "The property condition did not meet the client's expectations.",
    },
    {
      name: "Duplicate or invalid lead",
      description: "The opportunity originated from a duplicate or invalid lead.",
    },
    {
      name: "Other",
      description:
        "A reason not represented by the standard options; explain it in the loss notes.",
    },
  ];
  await tx
    .insert(lostReasons)
    .values(
      lostReasonSeeds.map((reason) => ({
        organizationId: organization.id,
        ...reason,
      })),
    )
    .onConflictDoUpdate({
      target: [lostReasons.organizationId, lostReasons.name],
      set: { isActive: true },
    });
  for (const name of ["Buyer", "Seller / Owner", "Agent", "Broker"]) {
    const slug = name
      .toLowerCase()
      .replaceAll(/\s+|\//g, "-")
      .replaceAll(/-+/g, "-");
    const existing = await tx
      .select({ id: contactCategories.id })
      .from(contactCategories)
      .where(
        and(
          eq(contactCategories.organizationId, organization.id),
          eq(contactCategories.slug, slug),
        ),
      )
      .limit(1);
    if (!existing.length)
      await tx.insert(contactCategories).values({ organizationId: organization.id, name, slug });
  }

  const inventory: {
    development: { code: string; name: string; status: string };
    buildings: {
      code: string;
      title: string;
      propertyType: string;
      floorCount?: number;
      unitsPerFloor?: number;
    }[];
  }[] = [
    {
      development: {
        code: "DEV-FAIRFIELD",
        name: "Fairfield Heights",
        status: "active",
      },
      buildings: [
        {
          code: "PROP-FH-T1",
          title: "Tower 1",
          propertyType: "condominium",
          floorCount: 20,
          unitsPerFloor: 20,
        },
        { code: "PROP-FH-T2", title: "Tower 2", propertyType: "condominium" },
        { code: "PROP-FH-T3", title: "Tower 3", propertyType: "condominium" },
      ],
    },
    {
      development: { code: "DEV-SOTERA", name: "Sotera", status: "active" },
      buildings: [
        {
          code: "PROP-SOT-COMM",
          title: "Sotera Commercial",
          propertyType: "commercial",
        },
        {
          code: "PROP-SOT-HILLS",
          title: "Sotera Hills",
          propertyType: "house_and_lot",
        },
        {
          code: "PROP-SOT-TOWERS",
          title: "Sotera Towers",
          propertyType: "condominium",
        },
        { code: "PROP-SOT-OTHERS", title: "Others", propertyType: "other" },
      ],
    },
  ];

  const developmentIdByCode = new Map<string, string>();
  const unitIdsByBuildingCode = new Map<string, Map<string, string>>();

  for (const entry of inventory) {
    const [development] = await tx
      .insert(developments)
      .values({
        organizationId: organization.id,
        code: entry.development.code,
        name: entry.development.name,
        status: entry.development.status,
      })
      .onConflictDoUpdate({
        target: [developments.organizationId, developments.code],
        set: {
          name: entry.development.name,
          status: entry.development.status,
        },
      })
      .returning({ id: developments.id });
    developmentIdByCode.set(entry.development.code, development.id);
    for (const building of entry.buildings) {
      const configuration = {
        floorCount: building.floorCount ?? null,
        unitsPerFloor: building.unitsPerFloor ?? null,
      };
      const [inserted] = await tx
        .insert(properties)
        .values({
          organizationId: organization.id,
          developmentId: development.id,
          propertyCode: building.code,
          title: building.title,
          propertyType: building.propertyType,
          listingType: "sale",
          status: "active",
          ...configuration,
          createdBy: agentUser?.id || null,
          updatedBy: agentUser?.id || null,
        })
        .onConflictDoUpdate({
          target: [properties.organizationId, properties.propertyCode],
          set: {
            developmentId: development.id,
            title: building.title,
            propertyType: building.propertyType,
            ...configuration,
            updatedBy: agentUser?.id || null,
          },
        })
        .returning({ id: properties.id });

      if (!configuration.floorCount || !configuration.unitsPerFloor) continue;

      unitIdsByBuildingCode.set(
        building.code,
        await seedFloorsAndUnits(tx, {
          id: inserted.id,
          developmentId: development.id,
          floorCount: configuration.floorCount,
          unitsPerFloor: configuration.unitsPerFloor,
        }),
      );
    }
  }

  const sampleContacts = [
    {
      contactCode: "CON-1001",
      preferredDevelopmentCode: "DEV-FAIRFIELD",
      firstName: "John",
      middleName: "Q",
      lastName: "Doe",
      email: "john.doe@example.com",
      mobilePhone1: "+639000000001",
      whatsappNumber: "+639000000001",
      preferredContactMethods: ["email", "phone", "whatsapp"],
      lifecycleStage: "inactive",
      employmentType: "Freelancer",
      annualIncome: "480000.00",
      budgetMin: "4000000.00",
      budgetMax: "6000000.00",
      notes: "Interested in a 2-bedroom unit.",
      marketingConsent: false,
      approvalStatus: "pending",
    },
    {
      contactCode: "CON-1002",
      preferredDevelopmentCode: "DEV-SOTERA",
      firstName: "Jane",
      middleName: "P",
      lastName: "Smith",
      email: "jane.smith@example.com",
      mobilePhone1: "+639000000002",
      viberNumber: "+639000000007",
      preferredContactMethods: ["email", "phone", "viber"],
      lifecycleStage: "past_client",
      employmentType: "Private Company Employee",
      annualIncome: "480000.00",
      budgetMin: null,
      budgetMax: "2299999.00",
      notes: "Interested in a 2-bedroom unit.",
      marketingConsent: true,
      approvalStatus: "approved",
    },
    {
      contactCode: "CON-1003",
      preferredDevelopmentCode: "DEV-SOTERA",
      firstName: "Robert",
      middleName: "R",
      lastName: "Johnson",
      email: null,
      mobilePhone1: "+639000000008",
      preferredContactMethods: ["phone"],
      lifecycleStage: "past_client",
      employmentType: "Self-Employed",
      annualIncome: "480000.00",
      budgetMin: "2500000.00",
      budgetMax: "3999999.00",
      notes: null,
      marketingConsent: true,
      approvalStatus: "approved",
    },
    {
      contactCode: "CON-1004",
      preferredDevelopmentCode: "DEV-FAIRFIELD",
      firstName: "Emily",
      middleName: "S",
      lastName: "Williams",
      email: "emily.williams@example.com",
      mobilePhone1: "+639000000003",
      mobilePhone2: "+639000000004",
      preferredContactMethods: ["email", "phone"],
      lifecycleStage: "inactive",
      employmentType: "Private Company Employee",
      annualIncome: "1500000.00",
      budgetMin: null,
      budgetMax: "2299999.00",
      notes: "Looking for a lot near the highway.",
      marketingConsent: true,
      approvalStatus: "approved",
    },
    {
      contactCode: "CON-1005",
      preferredDevelopmentCode: "DEV-SOTERA",
      firstName: "Michael",
      middleName: "T",
      lastName: "Brown",
      email: "michael.brown@example.com",
      mobilePhone1: "+639000000005",
      instagramHandle: "@michaelbrown",
      facebookHandle: "michael.brown.ph",
      preferredContactMethods: ["phone", "instagram", "facebook"],
      lifecycleStage: "past_client",
      employmentType: "OFW (Overseas Filipino Worker)",
      annualIncome: "480000.00",
      budgetMin: null,
      budgetMax: "2299999.00",
      notes: "Interested in a 2-bedroom unit.",
      marketingConsent: false,
      approvalStatus: "approved",
    },
  ];

  for (const { preferredDevelopmentCode, ...contact } of sampleContacts) {
    await tx
      .insert(contacts)
      .values({
        organizationId: organization.id,
        assignedUserId: agentUser?.id || null,
        brokerUserId: agentUser ? brokerUser?.id || null : null,
        preferredDevelopmentId: preferredDevelopmentCode
          ? (developmentIdByCode.get(preferredDevelopmentCode) ?? null)
          : null,
        ...contact,
        approvedAt: contact.approvalStatus === "approved" ? new Date() : null,
        approvedBy: contact.approvalStatus === "approved" ? brokerUser?.id || null : null,
      })
      .onConflictDoNothing();
  }

  // Seed sample deals for the sales pipeline
  const stages = await tx
    .select({ id: pipelineStages.id, slug: pipelineStages.slug })
    .from(pipelineStages)
    .where(eq(pipelineStages.organizationId, organization.id));

  const closeDateFromNow = (days: number) => manilaDate(startOfManilaDay(new Date(), days));

  const sampleDeals: {
    dealCode: string;
    developmentCode: string;
    title: string;
    contactCode: string;
    unit?: { buildingCode: string; code: string };
    stageSlug: string;
    probability: number;
    amount: string;
    expectedCloseInDays: number;
  }[] = [
    {
      dealCode: "DEAL-1001",
      developmentCode: "DEV-FAIRFIELD",
      title: "John Doe - 2-Bedroom Unit Interest",
      contactCode: "CON-1001",
      unit: { buildingCode: "PROP-FH-T1", code: "12A" },
      stageSlug: "leads",
      probability: 10,
      amount: "7500000.00",
      expectedCloseInDays: 30,
    },
    {
      dealCode: "DEAL-1002",
      developmentCode: "DEV-SOTERA",
      title: "Jane Smith - 2-Bedroom Unit",
      contactCode: "CON-1002",
      stageSlug: "opportunity",
      probability: 40,
      amount: "4000000.00",
      expectedCloseInDays: 14,
    },
    {
      dealCode: "DEAL-1003",
      developmentCode: "DEV-SOTERA",
      title: "Robert Johnson - Commercial Property",
      contactCode: "CON-1003",
      stageSlug: "closed-won",
      probability: 100,
      amount: "5000000.00",
      expectedCloseInDays: -7,
    },
    {
      dealCode: "DEAL-1004",
      developmentCode: "DEV-FAIRFIELD",
      title: "Emily Williams - Lot Near Highway",
      contactCode: "CON-1004",
      unit: { buildingCode: "PROP-FH-T1", code: "5B" },
      stageSlug: "opportunity",
      probability: 40,
      amount: "4000000.00",
      expectedCloseInDays: 21,
    },
    {
      dealCode: "DEAL-1005",
      developmentCode: "DEV-SOTERA",
      title: "Michael Brown - 2-Bedroom Unit",
      contactCode: "CON-1005",
      stageSlug: "opportunity",
      probability: 60,
      amount: "4000000.00",
      expectedCloseInDays: 10,
    },
  ];

  for (const deal of sampleDeals) {
    const [contact] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, organization.id),
          eq(contacts.contactCode, deal.contactCode),
        ),
      )
      .limit(1);

    const stage = stages.find((s) => s.slug === deal.stageSlug);
    if (!contact || !stage) continue;

    const expectedCloseDate = closeDateFromNow(deal.expectedCloseInDays);
    const isWon = stage.slug === "closed-won";

    const unitId = deal.unit
      ? (unitIdsByBuildingCode.get(deal.unit.buildingCode)?.get(deal.unit.code) ?? null)
      : null;

    const [inserted] = await tx
      .insert(deals)
      .values({
        organizationId: organization.id,
        dealCode: deal.dealCode,
        title: deal.title,
        developmentId: developmentIdByCode.get(deal.developmentCode) ?? null,
        unitId,
        stageId: stage.id,
        status: isWon ? "won" : "open",
        primaryAgentUserId: agentUser?.id || null,
        amount: deal.amount,
        probability: String(deal.probability),
        expectedCloseDate,
        actualCloseDate: isWon ? expectedCloseDate : null,
        createdBy: agentUser?.id || null,
        updatedBy: agentUser?.id || null,
      })
      .onConflictDoNothing({ target: [deals.organizationId, deals.dealCode] })
      .returning({ id: deals.id });

    if (!inserted) continue;

    // Link the deal to its contact through the junction table the board reads.
    await tx
      .insert(dealContacts)
      .values({
        dealId: inserted.id,
        contactId: contact.id,
        role: "buyer",
        isPrimary: true,
      })
      .onConflictDoNothing();

    // Seed the initial stage-history entry for parity with createDeal().
    await tx.insert(dealStageHistory).values({
      dealId: inserted.id,
      toStageId: stage.id,
      changedBy: agentUser?.id || null,
      note: "Deal seeded",
    });
  }
});

console.info(
  `Development reference data, role test users, sample contacts, and sales pipeline seeded in organization ${process.env.ORGANIZATION_CODE ?? "CRM-DEV"}. Users are only visible when signed into this organization. See README for local-only credentials.`,
);
await closeDatabaseConnection();
