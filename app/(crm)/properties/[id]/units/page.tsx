import { redirect } from "next/navigation";

// The old address of the access page; links and bookmarks to it still land on the right place.
export default async function PropertyUnitsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ user?: string }>;
}) {
  const [{ id }, { user }] = await Promise.all([params, searchParams]);
  redirect(`/properties/${id}/access${user ? `?user=${encodeURIComponent(user)}` : ""}`);
}
