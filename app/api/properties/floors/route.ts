import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { floorImageUrl } from "@/features/properties/lib/floor-image";
import { getFloorsForProperty } from "@/features/properties/queries/property-floor-unit.queries";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { hasPermission } from "@/lib/permissions/policy";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const propertyId = searchParams.get("buildingId");

  if (!propertyId) {
    return NextResponse.json({ error: "buildingId is required" }, { status: 400 });
  }
  if (!z.uuid().safeParse(propertyId).success) {
    return NextResponse.json({ error: "buildingId must be a valid UUID" }, { status: 400 });
  }

  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }
  if (!hasPermission(context, "properties.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const floorsData = await getFloorsForProperty(context, propertyId);

    return NextResponse.json(
      floorsData.map((floor) => ({
        id: floor.id,
        level: floor.level,
        label: floor.label,
        imageUrl: floorImageUrl(floor),
      })),
    );
  } catch (error) {
    logError("Floor list read failed", error, {
      operation: "api_property_floors",
      propertyId: propertyId,
    });
    return NextResponse.json({ error: "Couldn't load floors." }, { status: 500 });
  }
}
