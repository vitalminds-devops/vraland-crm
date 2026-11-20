import { beforeEach, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";
import { notify } from "@/components/ui/toast";
import { authClient } from "@/lib/auth/client";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (value: unknown) => [value, vi.fn()],
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/ui/toast", () => ({ notify: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { signIn: { email: vi.fn() } } }));

beforeEach(() => vi.clearAllMocks());
async function submit() {
  const form = new FormData();
  form.set("email", "demo@example.invalid");
  form.set("password", "Synthetic-password-123");
  await LoginForm().props.action(form);
}

it("keeps invalid credentials to one short message without revealing which field is wrong", async () => {
  vi.mocked(authClient.signIn.email).mockResolvedValue({
    error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
    data: null,
  } as never);
  await submit();
  expect(notify).toHaveBeenCalledWith("Invalid email or password", "error", "sign-in");
  expect(router.replace).not.toHaveBeenCalled();
});

it("preserves the server explanation for other login failures", async () => {
  vi.mocked(authClient.signIn.email).mockResolvedValue({
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many attempts. Please wait before trying again.",
    },
    data: null,
  } as never);
  await submit();
  expect(notify).toHaveBeenCalledWith(
    "Too many attempts. Please wait before trying again.",
    "error",
    "sign-in",
  );
});

it("replaces the previous error notification when sign-in succeeds", async () => {
  vi.mocked(authClient.signIn.email).mockResolvedValue({ error: null, data: {} } as never);
  await submit();
  expect(notify).toHaveBeenCalledWith("Signed in.", "success", "sign-in");
  expect(router.replace).toHaveBeenCalledWith("/dashboard");
});
