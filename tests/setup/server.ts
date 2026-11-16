import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { SMTPServer } from "smtp-server";
import { verifyDatabase } from "../helpers/environment";
await verifyDatabase();
const messages: { to: string[]; raw: string }[] = [];
const smtp = new SMTPServer({
  secure: false,
  disabledCommands: ["STARTTLS"],
  onAuth(_auth, _session, callback) {
    callback(null, { user: "playwright" });
  },
  onData(stream, session, callback) {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => {
      messages.push({
        to: session.envelope.rcptTo.map((r) => r.address),
        raw: Buffer.concat(chunks).toString("utf8"),
      });
      callback();
    });
  },
});
await new Promise<void>((resolve, reject) => {
  smtp.once("error", reject);
  smtp.listen(3102, "127.0.0.1", resolve);
});
const mailbox = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3101");
  const to = url.searchParams.get("to");
  if (url.pathname !== "/messages" || !to?.endsWith("@example.invalid")) {
    response.writeHead(400).end();
    return;
  }
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(messages.filter((m) => m.to.includes(to))));
});
await new Promise<void>((resolve, reject) => {
  mailbox.once("error", reject);
  mailbox.listen(3101, "127.0.0.1", resolve);
});
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  PLAYWRIGHT_TEST_SERVER: "1",
  BETTER_AUTH_URL: "http://127.0.0.1:3100",
  BETTER_AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:3100",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
  BETTER_AUTH_SECRET: "isolated-playwright-local-test-secret-2026",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "3102",
  SMTP_SECURE: "false",
  SMTP_USER: "playwright",
  SMTP_PASSWORD: "test-only-password",
  SMTP_FROM: "playwright@example.invalid",
  RESEND_API_KEY: "",
  RESEND_FROM_EMAIL: "",
};
execFileSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: environment,
});
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"],
  { stdio: "inherit", env: environment },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  smtp.close();
  mailbox.close();
  process.exit(code ?? 1);
});
