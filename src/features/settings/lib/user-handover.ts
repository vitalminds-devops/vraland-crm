import "server-only";

import { and, count, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { db } from "@/db";
import {
  auditLogs,
  calendarEventUsers,
  contacts,
  dealAgents,
  deals,
  propertyViewings,
  roles,
  tasks,
  userRoles,
  users,
} from "@/db/schema";
import { eligibleAgent } from "@/features/contacts/lib/assignment";
import { activeLead } from "@/features/contacts/lib/contact-stage-sql";
import { brokerIdTargetRoleSlugs, masterBrokerRoleSlug } from "@/lib/permissions/catalog";
import { allowsTeamMember, reportsToMasterBroker } from "@/lib/permissions/team-assignment";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Open tasks: the ones still to do. */
const openTask = and(inArray(tasks.status, ["todo", "in_progress"]), isNull(tasks.deletedAt));
/** Viewings still ahead, by their event's start. */
const upcomingViewing = (now: Date) =>
  and(
    inArray(propertyViewings.status, ["scheduled", "confirmed"]),
    sql`exists (select 1 from "calendar_events" e where e."id" = ${propertyViewings.eventId} and e."start_at" >= ${now})`,
  );

/**
 * What a user still carries: open leads they own or broker (converted and inactive contacts stay
 * with them, as history), open deals, agents under them, open tasks and upcoming viewings.
 */
async function openWork(tx: Tx, organizationId: string, userId: string) {
  // One query at a time: a transaction is a single connection.
  const [owned] = await tx
    .select({ n: count() })
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, organizationId),
        isNull(contacts.deletedAt),
        activeLead,
        or(eq(contacts.assignedUserId, userId), eq(contacts.brokerUserId, userId)),
      ),
    );
  const [working] = await tx
    .select({ n: count() })
    .from(deals)
    .where(
      and(
        eq(deals.organizationId, organizationId),
        isNull(deals.deletedAt),
        eq(deals.status, "open"),
        or(
          eq(deals.primaryAgentUserId, userId),
          eq(deals.brokerUserId, userId),
          // Co-agents too; exists keeps it one count per deal.
          sql`exists (select 1 from "deal_agents" a where a."deal_id" = ${deals.id} and a."user_id" = ${userId})`,
        ),
      ),
    );
  const [team] = await tx
    .select({ n: count() })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        isNull(users.deletedAt),
        eq(users.brokerId, userId),
        ne(users.id, userId),
      ),
    );
  const [todo] = await tx
    .select({ n: count() })
    .from(tasks)
    .where(
      and(eq(tasks.organizationId, organizationId), eq(tasks.assignedUserId, userId), openTask),
    );
  const [ahead] = await tx
    .select({ n: count() })
    .from(propertyViewings)
    .where(and(eq(propertyViewings.agentUserId, userId), upcomingViewing(new Date())));
  return {
    contacts: owned.n,
    deals: working.n,
    team: team.n,
    tasks: todo.n,
    viewings: ahead.n,
  };
}

function openWorkMessage(work: Awaited<ReturnType<typeof openWork>>) {
  const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
  const parts = [
    work.contacts && plural(work.contacts, "contact"),
    work.deals && plural(work.deals, "open opportunity", "open opportunities"),
    work.team && plural(work.team, "team member"),
    work.tasks && plural(work.tasks, "open task"),
    work.viewings && plural(work.viewings, "upcoming viewing"),
  ].filter(Boolean);
  return parts.length ? `Choose who takes over their ${parts.join(", ")}.` : null;
}

/** Thrown inside a transaction to roll it back with a message for the person. */
export class HandoverError extends Error {}

/**
 * Whether the leaver's team may report to the receiver: each member's role must suit the receiver's
 * (the same rules as editing a team), and the receiver must not report up to one of them.
 */
async function checkTeamHandover(
  tx: Tx,
  organizationId: string,
  fromUserId: string,
  toUserId: string,
) {
  const people = await tx
    .select({ id: users.id, brokerId: users.brokerId })
    .from(users)
    .where(eq(users.organizationId, organizationId));
  const members = people
    .filter(
      (person) =>
        person.brokerId === fromUserId && person.id !== fromUserId && person.id !== toUserId,
    )
    .map((person) => person.id);
  const roleRows = await tx
    .select({ userId: userRoles.userId, slug: roles.slug })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(inArray(userRoles.userId, [toUserId, ...members]));
  const slugsOf = (id: string) =>
    roleRows.filter((row) => row.userId === id).map((row) => row.slug.toLowerCase());
  const receiverSlugs = slugsOf(toUserId);
  const fits = (member: string) =>
    receiverSlugs.includes(masterBrokerRoleSlug)
      ? reportsToMasterBroker(slugsOf(member))
      : receiverSlugs.some((slug) =>
          (brokerIdTargetRoleSlugs as readonly string[]).includes(slug),
        ) && allowsTeamMember(receiverSlugs, slugsOf(member));
  if (!members.every(fits))
    throw new HandoverError(
      "Some of their team can't report to the person taking over. Reassign them first, or choose someone else.",
    );
  // Walk up from the receiver: reaching one of the members would make a reporting loop.
  const brokerOf = new Map(people.map((person) => [person.id, person.brokerId]));
  const seen = new Set<string>();
  let next = brokerOf.get(toUserId) ?? null;
  while (next && next !== fromUserId && !seen.has(next)) {
    if (members.includes(next))
      throw new HandoverError(
        "The person taking over reports to someone in their team. Choose someone else.",
      );
    seen.add(next);
    next = brokerOf.get(next) ?? null;
  }
}

/** Whether the user brokers an open lead or open deal that someone else works. One read. */
async function brokersOthersWork(tx: Tx, organizationId: string, userId: string) {
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        sql`(exists (select 1 from ${contacts} where ${contacts.organizationId} = ${organizationId}
          and ${contacts.deletedAt} is null and ${activeLead} and ${contacts.brokerUserId} = ${userId}
          and ${contacts.assignedUserId} is distinct from ${userId})
        or exists (select 1 from ${deals} where ${deals.organizationId} = ${organizationId}
          and ${deals.deletedAt} is null and ${deals.status} = 'open' and ${deals.brokerUserId} = ${userId}
          and ${deals.primaryAgentUserId} is distinct from ${userId}))`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Before a user is deactivated or archived: refuse while they still own work, unless `toUserId`
 * is given, in which case that work moves to them.
 */
export async function handOverWork(
  tx: Tx,
  organizationId: string,
  actorUserId: string,
  fromUserId: string,
  toUserId: string | null | undefined,
) {
  // Assignments lock the assignee FOR SHARE, so none can land on the leaver while this runs.
  await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, fromUserId), eq(users.organizationId, organizationId)))
    .for("update");
  const work = await openWork(tx, organizationId, fromUserId);
  const pending = openWorkMessage(work);
  if (!pending) return null;
  if (!toUserId) throw new HandoverError(pending);
  if (toUserId === fromUserId) throw new HandoverError("Choose someone else to take over.");
  // The same people normal assignment accepts, plus whether they hold a broker-type role.
  const [receiver] = await tx
    .select({
      id: users.id,
      brokerId: users.brokerId,
      canBroker: sql<boolean>`exists (select 1 from ${userRoles} inner join ${roles} on ${roles.id} = ${userRoles.roleId}
        where ${userRoles.userId} = ${users.id} and ${roles.organizationId} = ${organizationId}
        and ${inArray(sql`lower(${roles.slug})`, [...brokerIdTargetRoleSlugs, masterBrokerRoleSlug])})`,
    })
    .from(users)
    .where(and(eq(users.id, toUserId), eligibleAgent(organizationId)))
    .limit(1);
  if (!receiver)
    throw new HandoverError("The person taking over must be an active agent or broker.");
  // A team member taking over stops reporting to the person leaving; nobody is their own broker.
  const receiverBrokerId = receiver.brokerId === fromUserId ? null : receiver.brokerId;
  if (work.team) await checkTeamHandover(tx, organizationId, fromUserId, toUserId);
  // Records the leaver only brokers make the receiver their broker.
  if (
    (work.contacts || work.deals) &&
    !receiver.canBroker &&
    (await brokersOthersWork(tx, organizationId, fromUserId))
  )
    throw new HandoverError(
      "The person taking over can't be a broker for their records. Choose a broker.",
    );

  const now = new Date();
  // Records follow the receiver, with the receiver's broker, as when an agent is assigned anywhere else.
  const brokerForReceiver = receiverBrokerId ?? toUserId;
  const assigned = await tx
    .update(contacts)
    .set({ assignedUserId: toUserId, brokerUserId: brokerForReceiver, updatedAt: now })
    .where(
      and(
        eq(contacts.organizationId, organizationId),
        isNull(contacts.deletedAt),
        activeLead,
        eq(contacts.assignedUserId, fromUserId),
      ),
    )
    .returning({ id: contacts.id });
  // Records where the leaver was only the broker go to the receiver, who now leads that team.
  const brokered = await tx
    .update(contacts)
    .set({ brokerUserId: toUserId, updatedAt: now })
    .where(
      and(
        eq(contacts.organizationId, organizationId),
        isNull(contacts.deletedAt),
        activeLead,
        eq(contacts.brokerUserId, fromUserId),
      ),
    )
    .returning({ id: contacts.id });
  // One audit insert per kind of record moved.
  const audit = async (
    entityType: string,
    entries: { entityId: string; oldValues: unknown; newValues: unknown }[],
  ) => {
    if (entries.length)
      await tx.insert(auditLogs).values(
        entries.map((entry) => ({
          organizationId,
          actorUserId,
          action: "update",
          entityType,
          ...entry,
        })),
      );
  };
  // An UPDATE returns new values, so an assigned contact's old broker isn't known here.
  await audit("contact", [
    ...assigned.map((contact) => ({
      entityId: contact.id,
      oldValues: { assignedUserId: fromUserId },
      newValues: { assignedUserId: toUserId, brokerUserId: brokerForReceiver },
    })),
    ...brokered.map((contact) => ({
      entityId: contact.id,
      oldValues: { brokerUserId: fromUserId },
      newValues: { brokerUserId: toUserId },
    })),
  ]);
  const openDeal = and(
    eq(deals.organizationId, organizationId),
    isNull(deals.deletedAt),
    eq(deals.status, "open"),
  );
  const worked = await tx
    .select({ id: deals.id, brokerUserId: deals.brokerUserId })
    .from(deals)
    .where(and(openDeal, eq(deals.primaryAgentUserId, fromUserId)));
  if (worked.length) {
    const ids = worked.map((deal) => deal.id);
    await tx
      .update(deals)
      .set({
        primaryAgentUserId: toUserId,
        brokerUserId: brokerForReceiver,
        updatedBy: actorUserId,
        updatedAt: now,
      })
      .where(inArray(deals.id, ids));
    // The deal's agent list names the primary agent too; the same swap as moveOpenDeals.
    await tx
      .delete(dealAgents)
      .where(and(inArray(dealAgents.dealId, ids), eq(dealAgents.role, "primary")));
    await tx
      .insert(dealAgents)
      .values(ids.map((dealId) => ({ dealId, userId: toUserId, role: "primary" })))
      .onConflictDoNothing();
    await audit(
      "deal",
      worked.map((deal) => ({
        entityId: deal.id,
        oldValues: { primaryAgentUserId: fromUserId, brokerUserId: deal.brokerUserId },
        newValues: { primaryAgentUserId: toUserId, brokerUserId: brokerForReceiver },
      })),
    );
  }
  const brokeredDeals = await tx
    .update(deals)
    .set({ brokerUserId: toUserId, updatedBy: actorUserId, updatedAt: now })
    .where(and(openDeal, eq(deals.brokerUserId, fromUserId)))
    .returning({ id: deals.id });
  await audit(
    "deal",
    brokeredDeals.map((deal) => ({
      entityId: deal.id,
      oldValues: { brokerUserId: fromUserId },
      newValues: { brokerUserId: toUserId },
    })),
  );
  // Co-agents on open deals: the receiver takes the leaver's place with the same role and split,
  // unless already on the deal, when the leaver's row just goes.
  const coAgentRow = and(
    eq(dealAgents.userId, fromUserId),
    ne(dealAgents.role, "primary"),
    sql`exists (select 1 from ${deals} where ${deals.id} = ${dealAgents.dealId} and ${openDeal})`,
  );
  const swapped = await tx
    .update(dealAgents)
    .set({ userId: toUserId })
    .where(
      and(
        coAgentRow,
        sql`not exists (select 1 from "deal_agents" o where o."deal_id" = ${dealAgents.dealId} and o."user_id" = ${toUserId})`,
      ),
    )
    .returning({ dealId: dealAgents.dealId, role: dealAgents.role });
  const dropped = await tx
    .delete(dealAgents)
    .where(coAgentRow)
    .returning({ dealId: dealAgents.dealId, role: dealAgents.role });
  await audit("deal", [
    ...swapped.map((row) => ({
      entityId: row.dealId,
      oldValues: { agentUserId: fromUserId, role: row.role },
      newValues: { agentUserId: toUserId, role: row.role },
    })),
    ...dropped.map((row) => ({
      entityId: row.dealId,
      oldValues: { agentUserId: fromUserId, role: row.role },
      newValues: null,
    })),
  ]);
  await tx
    .update(users)
    .set({ brokerId: toUserId, updatedAt: now })
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.brokerId, fromUserId),
        ne(users.id, fromUserId),
        ne(users.id, toUserId),
      ),
    );
  if (receiver.brokerId === fromUserId)
    await tx.update(users).set({ brokerId: null, updatedAt: now }).where(eq(users.id, toUserId));
  const movedTasks = await tx
    .update(tasks)
    .set({ assignedUserId: toUserId, updatedAt: now })
    .where(
      and(eq(tasks.organizationId, organizationId), eq(tasks.assignedUserId, fromUserId), openTask),
    )
    .returning({ id: tasks.id });
  await audit(
    "task",
    movedTasks.map((task) => ({
      entityId: task.id,
      oldValues: { assignedUserId: fromUserId },
      newValues: { assignedUserId: toUserId },
    })),
  );
  const viewings = await tx
    .update(propertyViewings)
    .set({ agentUserId: toUserId, updatedAt: now })
    .where(and(eq(propertyViewings.agentUserId, fromUserId), upcomingViewing(now)))
    .returning({ id: propertyViewings.id, eventId: propertyViewings.eventId });
  await audit(
    "property_viewing",
    viewings.map((viewing) => ({
      entityId: viewing.id,
      oldValues: { agentUserId: fromUserId },
      newValues: { agentUserId: toUserId },
    })),
  );
  if (viewings.length) {
    const eventIds = viewings.map((viewing) => viewing.eventId);
    // The agent is also the event's attendee, which is how it shows on their calendar.
    await tx
      .delete(calendarEventUsers)
      .where(
        and(
          inArray(calendarEventUsers.eventId, eventIds),
          eq(calendarEventUsers.userId, fromUserId),
        ),
      );
    await tx
      .insert(calendarEventUsers)
      .values(
        eventIds.map((eventId) => ({ eventId, userId: toUserId, attendeeStatus: "accepted" })),
      )
      .onConflictDoNothing();
  }
  return { ...work, toUserId };
}
