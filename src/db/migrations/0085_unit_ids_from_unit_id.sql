-- An opportunity's units are its unit_ids. Older rows kept their one unit only in unit_id; copy it
-- over so nothing reads unit_id any more. unit_id stays (0043, 0071 and 0080 read it). Safe to run again.
UPDATE "deals" SET "unit_ids" = ARRAY["unit_id"]
WHERE "unit_id" IS NOT NULL AND cardinality("unit_ids") = 0;
