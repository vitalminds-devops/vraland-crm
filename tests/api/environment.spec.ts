import { test, expect } from "@playwright/test";
import { verifyDatabase } from "../helpers/environment";

test("database guard fails closed for a non-test database and missing configuration", async () => {
  const original = process.env.DATABASE_URL;
  try {
    for (const address of [
      "postgresql://unused:unused@localhost:5432/production",
      "postgresql://unused:unused@localhost:5432/vra_test_backup",
      "postgresql://unused:unused@localhost:5432/",
      "not a url",
      "",
    ]) {
      process.env.DATABASE_URL = address;
      await expect(verifyDatabase()).rejects.toThrow(/does not end in _test|missing or invalid/);
    }
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  }
});
