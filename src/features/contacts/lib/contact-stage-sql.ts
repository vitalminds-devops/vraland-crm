import { sql } from "drizzle-orm";
import { contacts } from "@/db/schema";

const contactDealStage = (column: unknown) => sql`(
  select ${column}
  from deal_contacts dc
  join deals d on d.id = dc.deal_id and d.deleted_at is null
  join pipeline_stages ps on ps.id = d.stage_id
  where dc.contact_id = ${contacts.id}
  order by dc.is_primary desc, d.created_at asc
  limit 1
)`;

/** Name of the pipeline stage the contact's deal currently sits in. */
export const contactStageName = sql<string | null>`${contactDealStage(sql`ps.name`)}`;

export const contactStagePosition = sql<number | null>`${contactDealStage(sql`ps.position`)}`;

export const contactStageProbability = sql<
  number | null
>`${contactDealStage(sql`ps.default_probability::float`)}`;

/**
 * An active lead: not marked Inactive and not yet converted. New contacts default to Active client,
 * so a null lifecycle counts too. The dashboard and reports share this one rule.
 */
export const activeLead = sql<boolean>`((${contacts.lifecycleStage} is null or ${contacts.lifecycleStage} <> 'inactive') and ${contacts.convertedAt} is null)`;
