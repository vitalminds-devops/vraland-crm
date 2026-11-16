export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startSystemMonitoring } = await import("./src/lib/system/metrics");
  startSystemMonitoring();

  // Test fixtures share a dedicated database; the global worker must not mutate
  // organizations outside the current test's ownership.
  if (process.env.PLAYWRIGHT_TEST_SERVER !== "1") {
    const { startLeadExpiry } = await import("./src/features/deals/lib/expire-stale-leads");
    startLeadExpiry();
    const { startScheduledCampaigns } =
      await import("./src/features/marketing/lib/campaign-delivery");
    startScheduledCampaigns();
  }
}
