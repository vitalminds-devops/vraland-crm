import { expect, it } from "vitest";
import { propertyTypes, propertyTransactionTypes } from "@/features/properties/lib/constants";
import { label } from "@/features/properties/lib/helpers";
import { propertySchema } from "@/features/properties/schemas/property.schema";
import { contactDealSchema } from "@/features/deals/schemas/deal.schema";
import { purchaseTypeLabels } from "../lib/contact-options";
import { contactSchema } from "./contact.schema";

it.each(propertyTypes)("accepts and labels %s consistently for contacts and properties", (type) => {
  expect(contactSchema.shape.purchaseType.safeParse(type).success).toBe(true);
  expect(propertySchema.shape.propertyType.safeParse(type).success).toBe(true);
  expect(purchaseTypeLabels[type]).toBe(label(type));
});

it.each(propertyTransactionTypes)(
  "accepts %s for contact deals and property transactions",
  (type) => {
    expect(contactDealSchema.shape.dealType.safeParse(type).success).toBe(true);
    expect(propertySchema.shape.listingType.safeParse(type).success).toBe(true);
  },
);

it("keeps saved residential preferences valid and rejects unknown choices", () => {
  expect(contactSchema.shape.purchaseType.safeParse("residential").success).toBe(true);
  expect(contactSchema.shape.purchaseType.safeParse("unknown").success).toBe(false);
  expect(contactDealSchema.shape.dealType.safeParse("unknown").success).toBe(false);
});
