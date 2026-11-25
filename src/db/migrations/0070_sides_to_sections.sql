-- Odd and even side names (e.g. Sunset for 201, 203… and Sunrise for 202, 204…) become sections
-- covering every floor. Only properties with no sections yet, so it is safe to run again.
UPDATE "properties" p SET "floor_groups" = (
  SELECT jsonb_agg(section) FROM (
    SELECT jsonb_build_object(
      'id', 'odd-' || p."id", 'name', p."odd_side_name", 'color', 'violet', 'side', 'odd',
      'floorIds', (SELECT jsonb_agg(f."id") FROM "floors" f WHERE f."building_id" = p."id")
    ) AS section WHERE p."odd_side_name" IS NOT NULL AND btrim(p."odd_side_name") <> ''
    UNION ALL
    SELECT jsonb_build_object(
      'id', 'even-' || p."id", 'name', p."even_side_name", 'color', 'orange', 'side', 'even',
      'floorIds', (SELECT jsonb_agg(f."id") FROM "floors" f WHERE f."building_id" = p."id")
    ) WHERE p."even_side_name" IS NOT NULL AND btrim(p."even_side_name") <> ''
  ) sections
)
WHERE p."floor_groups" = '[]'::jsonb
  AND (btrim(coalesce(p."odd_side_name", '')) <> '' OR btrim(coalesce(p."even_side_name", '')) <> '')
  AND EXISTS (SELECT 1 FROM "floors" f WHERE f."building_id" = p."id");
