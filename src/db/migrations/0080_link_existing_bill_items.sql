-- Links bill lines saved before 0079 to their unit or slot. Safe to run again.
-- Link the lines already saved: a line named the way the CRM names it ("Unit 2A · Tower 1 ·
-- ..." or "Parking P1 · Tower 1") gets that unit or slot of its own opportunity. Lines typed
-- differently in Billing stay unlinked and keep matching by label.
UPDATE "bill_items" bi SET "unit_id" = u."id"
FROM "bills" b
JOIN "deals" d ON d."id" = b."deal_id"
JOIN "units" u ON u."id" = d."unit_id" OR u."id" = ANY(d."unit_ids")
WHERE bi."bill_id" = b."id"
  AND bi."unit_id" IS NULL AND bi."parking_slot_id" IS NULL
  AND (bi."unit_label" = 'Unit ' || u."code"
    OR left(bi."unit_label", length('Unit ' || u."code" || ' · ')) = 'Unit ' || u."code" || ' · ');

UPDATE "bill_items" bi SET "parking_slot_id" = s."id"
FROM "bills" b
JOIN "deals" d ON d."id" = b."deal_id"
JOIN "parking_slots" s ON s."id" = ANY(d."parking_slot_ids")
WHERE bi."bill_id" = b."id"
  AND bi."unit_id" IS NULL AND bi."parking_slot_id" IS NULL
  AND (bi."unit_label" = 'Parking ' || s."code"
    OR left(bi."unit_label", length('Parking ' || s."code" || ' · ')) = 'Parking ' || s."code" || ' · ');
