import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getUnitsForFloor } from "@/features/properties/queries/property-floor-unit.queries";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { hasPermission } from "@/lib/permissions/policy";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const floorId = searchParams.get("floorId");

  if (!floorId) {
    return NextResponse.json({ error: "floorId is required" }, { status: 400 });
  }
  if (!z.uuid().safeParse(floorId).success) {
    return NextResponse.json({ error: "floorId must be a valid UUID" }, { status: 400 });
  }

  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }
  if (!hasPermission(context, "properties.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const units = await getUnitsForFloor(context, floorId);
    return NextResponse.json({ units });
  } catch (error) {
    logError("Unit list read failed", error, {
      operation: "api_property_units",
      floorId,
    });
    return NextResponse.json({ error: "Couldn't load units." }, { status: 500 });
  }
}
