import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions/authorization", () => ({ getAuthorizationContext: vi.fn() }));
vi.mock("@/lib/permissions/policy", () => ({ hasPermission: vi.fn() }));
vi.mock("@/features/properties/queries/property-floor-unit.queries", () => ({
  getPropertiesForDevelopment: vi.fn(),
  getFloorsForProperty: vi.fn(),
  getUnitsForFloor: vi.fn(),
  countUnitsOnFloor: vi.fn(),
}));

import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { hasPermission } from "@/lib/permissions/policy";
import * as queries from "@/features/properties/queries/property-floor-unit.queries";
import { GET as properties } from "../../app/api/properties/route";
import { GET as floors } from "../../app/api/properties/floors/route";
import { GET as units } from "../../app/api/properties/units/route";

beforeEach(() => vi.resetAllMocks());

for (const [route, parameter, handler, query] of [
  ["/api/properties", "developmentId", properties, queries.getPropertiesForDevelopment],
  ["/api/properties/floors", "buildingId", floors, queries.getFloorsForProperty],
  ["/api/properties/units", "floorId", units, queries.getUnitsForFloor],
] as const) {
  it(`${route} rejects missing and malformed identifiers before querying`, async () => {
    for (const value of [null, "", "not-a-uuid", "../etc", "12345678"]) {
      const url = new URL(route, "http://localhost");
      if (value !== null) url.searchParams.set(parameter, value);
      const response = await handler(new NextRequest(url));
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("error");
    }
    expect(getAuthorizationContext).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it(`${route} still requires authentication for valid identifiers`, async () => {
    vi.mocked(getAuthorizationContext).mockResolvedValue(null);
    const response = await handler(
      new NextRequest(`http://localhost${route}?${parameter}=12345678-1234-4234-8234-123456789abc`),
    );
    expect(response.status).toBe(401);
    expect(hasPermission).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
}
