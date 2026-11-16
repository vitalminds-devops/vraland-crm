import { Client } from "pg";
import { verifyDatabase } from "./environment";

export async function withDatabase<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  await verifyDatabase();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

export async function seedStages(organizationId: string) {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string; slug: string }>(
      `insert into pipeline_stages(organization_id,name,slug,position,default_probability,is_won_stage,is_lost_stage,requires_approval)
       values ($1,'Leads','leads',1,10,false,false,false),
       ($1,'Opportunity','opportunity',2,40,false,false,false),
       ($1,'Reservation','reservation',3,60,false,false,false),
       ($1,'CTS Signed - Won','closed-won',4,100,true,false,true),
       ($1,'Closed - Lost','closed-lost',5,0,false,true,false) returning id,slug`,
      [organizationId],
    );
    return rows;
  });
}

/** A legacy-compatible bill/payment fixture for tests of stage policy, not bill editing. */
export async function seedReservation(organizationId: string, dealId: string) {
  return withDatabase(async (client) => {
    const {
      rows: [bill],
    } = await client.query(
      "insert into bills(organization_id,deal_id,unit_label,unit_price,miscellaneous_fee) values($1,$2,$3,100000,0) returning id",
      [organizationId, dealId, "Stage policy fixture"],
    );
    await client.query(
      "insert into payments(organization_id,bill_id,amount,paid_on,method,classification) values($1,$2,5000,current_date,'cash','reservation')",
      [organizationId, bill.id],
    );
  });
}

/** Everything a lead needs before it may enter Opportunity, including a priced building and unit. */
export async function seedOpportunityDetails(organizationId: string, dealId: string) {
  return withDatabase(async (client) => {
    const {
      rows: [development],
    } = await client.query(
      "insert into developments(organization_id,code,name) values($1,$2,'Fixture development') returning id",
      [organizationId, `fixture-${dealId}`],
    );
    const {
      rows: [building],
    } = await client.query(
      "insert into properties(organization_id,development_id,property_code,title,property_type,asking_price,parking_price,parking_spaces) values($1,$2,$3,'Fixture building','condominium',1000000,100000,2) returning id",
      [organizationId, development.id, `fixture-${dealId}`],
    );
    const {
      rows: [floor],
    } = await client.query(
      "insert into floors(building_id,level,label) values($1,1,'1st Floor') returning id",
      [building.id],
    );
    const {
      rows: [unit],
    } = await client.query(
      "insert into units(building_id,floor_id,code,status) values($1,$2,'1A','available') returning id",
      [building.id, floor.id],
    );
    await client.query(
      "update deals set development_id=$2,property_id=$3,unit_id=$4,amount=1000000 where id=$1",
      [dealId, development.id, building.id, unit.id],
    );
    let {
      rows: [link],
    } = await client.query(
      "select contact_id from deal_contacts where deal_id=$1 and is_primary limit 1",
      [dealId],
    );
    if (!link) {
      const {
        rows: [contact],
      } = await client.query(
        "insert into contacts(organization_id,contact_code,first_name,last_name) values($1,$2,'FIXTURE','BUYER') returning id as contact_id",
        [organizationId, `fixture-${dealId}`],
      );
      await client.query(
        "insert into deal_contacts(deal_id,contact_id,role,is_primary) values($1,$2,'buyer',true)",
        [dealId, contact.contact_id],
      );
      link = contact;
    }
    await client.query(
      "update contacts set financing_preference='cash',tin_number='123-456-789',preferred_development_id=$2,preferred_unit_ids=$3 where id=$1",
      [link.contact_id, development.id, [unit.id]],
    );
    for (const [name, type] of [
      ["Valid government-issued ID", "valid_id"],
      ["Client appointment form", "client_appointment_form"],
    ])
      await client.query(
        "insert into documents(organization_id,contact_id,deal_id,name,document_type,storage_key) values($1,$2,$3,$4,$5,$6)",
        [organizationId, link.contact_id, dealId, name, type, `fixture/${dealId}/${type}`],
      );
  });
}
