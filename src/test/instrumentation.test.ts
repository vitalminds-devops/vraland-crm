import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ monitoring: vi.fn(), expiry: vi.fn(), campaigns: vi.fn() }));
vi.mock("../lib/system/metrics", () => ({ startSystemMonitoring: mocks.monitoring }));
vi.mock("../features/deals/lib/expire-stale-leads", () => ({ startLeadExpiry: mocks.expiry }));
vi.mock("../features/marketing/lib/campaign-delivery", () => ({
  startScheduledCampaigns: mocks.campaigns,
}));
import { register } from "../../instrumentation";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("does not start the global expiry worker in the isolated Playwright server", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("PLAYWRIGHT_TEST_SERVER", "1");
  await register();
  expect(mocks.monitoring).toHaveBeenCalledOnce();
  expect(mocks.expiry).not.toHaveBeenCalled();
  expect(mocks.campaigns).not.toHaveBeenCalled();
});
it("retains normal server startup expiry behavior", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("PLAYWRIGHT_TEST_SERVER", "");
  await register();
  expect(mocks.expiry).toHaveBeenCalledOnce();
  expect(mocks.campaigns).toHaveBeenCalledOnce();
});
