import { describe, expect, it } from "vitest";

import { findMissingColumns } from "./schema-drift";

describe("findMissingColumns", () => {
  it("reports missing tables and columns, and ignores extra ones", () => {
    const actual = new Map([["public.developments", new Set(["id", "code"])]]);

    expect(
      findMissingColumns(
        [
          {
            table: "public.developments",
            columns: ["id", "cover_image_storage_key"],
          },
          { table: "public.properties", columns: ["id"] },
        ],
        actual,
      ),
    ).toEqual(["public.developments.cover_image_storage_key", "public.properties"]);
  });

  it("returns nothing when every table and column exists", () => {
    const actual = new Map([["public.users", new Set(["id", "email"])]]);

    expect(findMissingColumns([{ table: "public.users", columns: ["id"] }], actual)).toEqual([]);
  });
});
