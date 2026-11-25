import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { deals } from "./deals";
import { organizations, users } from "./organization";
import { createdAt, updatedAt } from "./shared";
import type { UnitIdentifierStyle } from "@/features/properties/lib/unit-codes";
import type { UnitNumbering } from "@/features/properties/lib/unit-numbering";
import type { FloorGroup } from "@/features/properties/lib/floor-groups";
import type { ParkingType } from "@/features/properties/lib/parking-types";
import type { FloorLayout, UnitDesign } from "@/features/properties/lib/floor-layout";
import type { ParkingLayout } from "@/features/properties/lib/parking-layout";

export const developments = pgTable(
  "developments",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar({ length: 50 }).notNull(),
    name: varchar({ length: 180 }).notNull(),
    description: text(),
    coverImageStorageKey: text("cover_image_storage_key"),
    coverImageMimeType: varchar("cover_image_mime_type", { length: 100 }),
    status: varchar({ length: 30 }).default("active").notNull(),
    addressLine1: varchar("address_line1", { length: 255 }),
    barangay: varchar({ length: 120 }),
    city: varchar({ length: 120 }),
    province: varchar({ length: 120 }),
    postalCode: varchar("postal_code", { length: 30 }),
    latitude: numeric({ precision: 10, scale: 7 }),
    longitude: numeric({ precision: 10, scale: 7 }),
    launchDate: date("launch_date"),
    completionDate: date("completion_date"),
    createdAt,
    updatedAt,
  },
  (t) => [unique().on(t.organizationId, t.code)],
);

export const properties = pgTable(
  "properties",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    developmentId: uuid("development_id").references(() => developments.id, {
      onDelete: "set null",
    }),
    propertyCode: varchar("property_code", { length: 50 }).notNull(),
    title: varchar({ length: 220 }).notNull(),
    description: text(),
    coverImageStorageKey: text("cover_image_storage_key"),
    coverImageMimeType: varchar("cover_image_mime_type", { length: 100 }),
    propertyType: varchar("property_type", { length: 50 }).notNull(),
    listingType: varchar("listing_type", { length: 20 }).default("sale").notNull(),
    purchaseType: varchar("purchase_type", { length: 50 }),
    status: varchar({ length: 30 }).default("active").notNull(),
    currency: varchar({ length: 3 }).default("PHP").notNull(),
    askingPrice: numeric("asking_price", { precision: 18, scale: 2 }),
    monthlyRent: numeric("monthly_rent", { precision: 18, scale: 2 }),
    parkingPrice: numeric("parking_price", { precision: 18, scale: 2 }),
    reservationFee: numeric("reservation_fee", { precision: 18, scale: 2 }),
    /** Per parking slot, unless the slot sets its own. */
    parkingReservationFee: numeric("parking_reservation_fee", { precision: 18, scale: 2 }),
    commissionRate: numeric("commission_rate", { precision: 7, scale: 4 }),
    lotAreaSqm: numeric("lot_area_sqm", { precision: 12, scale: 2 }),
    floorAreaSqm: numeric("floor_area_sqm", { precision: 12, scale: 2 }),
    bedrooms: smallint(),
    bathrooms: numeric({ precision: 4, scale: 1 }),
    parkingSpaces: smallint("parking_spaces"),
    addressLine1: varchar("address_line1", { length: 255 }),
    addressLine2: varchar("address_line2", { length: 255 }),
    barangay: varchar({ length: 120 }),
    city: varchar({ length: 120 }),
    province: varchar({ length: 120 }),
    postalCode: varchar("postal_code", { length: 30 }),
    latitude: numeric({ precision: 10, scale: 7 }),
    longitude: numeric({ precision: 10, scale: 7 }),
    listedAt: timestamp("listed_at", { withTimezone: true }),
    availableFrom: date("available_from"),
    contractStartDate: date("contract_start_date"),
    contractEndDate: date("contract_end_date"),
    floorCount: smallint("floor_count"),
    unitsPerFloor: smallint("units_per_floor"),
    unitIdentifierStyle: varchar("unit_identifier_style", { length: 20 })
      .default("letter")
      .notNull()
      .$type<UnitIdentifierStyle>(),
    /** Chosen when floors are first set up; null keeps the old letters with floor 4 skipped. */
    unitNumbering: jsonb("unit_numbering").$type<UnitNumbering>(),
    /** Floors named together with a colour (e.g. Tower A, teal), shown on each of their units. */
    floorGroups: jsonb("floor_groups").$type<FloorGroup[]>().default([]).notNull(),
    /** Slot designs (size, price, reservation fee) dragged onto floors in Design floor. */
    parkingTypes: jsonb("parking_types").$type<ParkingType[]>().default([]).notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [unique().on(t.organizationId, t.propertyCode)],
);

export const propertyMedia = pgTable("property_media", {
  id: uuid().defaultRandom().primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  mediaType: varchar("media_type", { length: 20 }).notNull(),
  url: text().notNull(),
  thumbnailUrl: text("thumbnail_url"),
  title: varchar({ length: 180 }),
  sortOrder: integer("sort_order").default(0).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  createdAt,
});

export const propertyFeatures = pgTable(
  "property_features",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull(),
    valueType: varchar("value_type", { length: 20 }).default("boolean").notNull(),
    createdAt,
  },
  (t) => [unique().on(t.organizationId, t.name)],
);

export const propertyFeatureValues = pgTable(
  "property_feature_values",
  {
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => propertyFeatures.id, { onDelete: "cascade" }),
    booleanValue: boolean("boolean_value"),
    textValue: text("text_value"),
    numberValue: numeric("number_value", { precision: 18, scale: 4 }),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.featureId] })],
);

export const propertyStatusHistory = pgTable("property_status_history", {
  id: uuid().defaultRandom().primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" }),
  fromStatus: varchar("from_status", { length: 30 }),
  toStatus: varchar("to_status", { length: 30 }).notNull(),
  changedBy: uuid("changed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  note: text(),
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
});

/** A kind of unit in a property (e.g. "3 BR corner"): its size and price, shared by its units. */
export const unitTypes = pgTable(
  "unit_types",
  {
    id: uuid().defaultRandom().primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    name: varchar({ length: 60 }).notNull(),
    bedrooms: smallint(),
    floorArea: numeric("floor_area", { precision: 10, scale: 2 }),
    price: numeric({ precision: 18, scale: 2 }),
    /** Per unit of this type; null uses the property's. */
    reservationFee: numeric("reservation_fee", { precision: 18, scale: 2 }),
    monthlyAmortization: numeric("monthly_amortization", { precision: 18, scale: 2 }),
    /** The unit's top-view design: its outline and rooms. */
    layout: jsonb().$type<UnitDesign>(),
    createdAt,
    updatedAt,
  },
  (t) => [unique().on(t.propertyId, t.name)],
);

export const floors = pgTable(
  "floors",
  {
    id: uuid().defaultRandom().primaryKey(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    level: smallint().notNull(),
    label: varchar({ length: 60 }).notNull(),
    imageStorageKey: text("image_storage_key"),
    imageMimeType: varchar("image_mime_type", { length: 100 }),
    /** The designed top view: units placed on the floor and its shared spaces. */
    layout: jsonb().$type<FloorLayout>(),
    /** The designed parking: where each slot is, and the drive paths, ramps and pillars. */
    parkingLayout: jsonb("parking_layout").$type<ParkingLayout>(),
    createdAt,
    updatedAt,
  },
  (t) => [unique().on(t.buildingId, t.level)],
);

export const units = pgTable(
  "units",
  {
    id: uuid().defaultRandom().primaryKey(),
    developmentId: uuid("development_id").references(() => developments.id, {
      onDelete: "set null",
    }),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    floorId: uuid("floor_id")
      .notNull()
      .references(() => floors.id, { onDelete: "cascade" }),
    code: varchar({ length: 50 }).notNull(),
    status: varchar({ length: 20 }).default("available").notNull(),
    reservedDealId: uuid("reserved_deal_id").references((): AnyPgColumn => deals.id, {
      onDelete: "restrict",
    }),
    imageStorageKey: text("image_storage_key"),
    imageMimeType: varchar("image_mime_type", { length: 100 }),
    unitTypeId: uuid("unit_type_id").references(() => unitTypes.id, { onDelete: "set null" }),
    /** This unit's own size and price; empty uses its type's. */
    floorArea: numeric("floor_area", { precision: 10, scale: 2 }),
    price: numeric({ precision: 18, scale: 2 }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique().on(t.floorId, t.code),
    index("units_unit_type_idx").on(t.unitTypeId),
    index("units_building_status_idx").on(t.buildingId, t.status),
    index("units_development_idx").on(t.developmentId),
    index("units_reserved_deal_id_idx").on(t.reservedDealId),
  ],
);

/** One parking slot of a property, managed like its units. */
export const propertyParkingSlots = pgTable(
  "parking_slots",
  {
    id: uuid().defaultRandom().primaryKey(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    /** The floor this slot belongs to, when it is assigned to one. */
    floorId: uuid("floor_id").references(() => floors.id, { onDelete: "set null" }),
    code: varchar({ length: 50 }).notNull(),
    status: varchar({ length: 20 }).default("available").notNull(),
    /** This slot's own price and reservation fee; null uses the property's parking amounts. */
    price: numeric({ precision: 18, scale: 2 }),
    reservationFee: numeric("reservation_fee", { precision: 18, scale: 2 }),
    /** The parking type it was placed as; its price follows the type while it is available. */
    parkingTypeId: varchar("parking_type_id", { length: 40 }),
    reservedDealId: uuid("reserved_deal_id").references((): AnyPgColumn => deals.id, {
      onDelete: "restrict",
    }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique().on(t.buildingId, t.code),
    index("parking_slots_reserved_deal_id_idx").on(t.reservedDealId),
  ],
);

export const propertyAccessGrants = pgTable(
  "property_access_grants",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique().on(t.userId, t.propertyId),
    index("property_access_grants_property_idx").on(t.propertyId),
    index("property_access_grants_user_idx").on(t.userId),
  ],
);

export const propertyAccessGrantTargets = pgTable(
  "property_access_grant_targets",
  {
    id: uuid().defaultRandom().primaryKey(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => propertyAccessGrants.id, { onDelete: "cascade" }),
    floorId: uuid("floor_id").references(() => floors.id, {
      onDelete: "cascade",
    }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "cascade" }),
    parkingSlotId: uuid("parking_slot_id").references(() => propertyParkingSlots.id, {
      onDelete: "cascade",
    }),
    isExclusion: boolean("is_exclusion").notNull().default(false),
    createdAt,
  },
  (t) => [index("property_access_grant_targets_grant_idx").on(t.grantId)],
);
