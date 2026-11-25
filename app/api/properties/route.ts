import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPropertiesForDevelopment } from "@/features/properties/queries/property-floor-unit.queries";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { hasPermission } from "@/lib/permissions/policy";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const developmentId = searchParams.get("developmentId");

  if (!developmentId) {
    return NextResponse.json({ error: "developmentId is required" }, { status: 400 });
  }
  if (!z.uuid().safeParse(developmentId).success) {
    return NextResponse.json({ error: "developmentId must be a valid UUID" }, { status: 400 });
  }

  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }
  if (!hasPermission(context, "properties.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(await getPropertiesForDevelopment(context, developmentId));
  } catch (error) {
    logError("Development properties read failed", error, {
      operation: "api_development_properties",
      developmentId,
    });
    return NextResponse.json({ error: "Couldn't load properties." }, { status: 500 });
  }
}
