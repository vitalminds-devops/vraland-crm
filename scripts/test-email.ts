import "../src/config/load-environment";

import { getEmailService } from "../src/lib/email/email-service";

async function testEmail() {
  console.log("🧪 Testing Email Configuration...\n");

  const emailService = getEmailService();

  // Check if SMTP is configured
  const isConfigured = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  );

  console.log(`SMTP Configured: ${isConfigured ? "✅ Yes" : "❌ No"}`);

  if (!isConfigured) {
    console.log(
      "\nℹ️  SMTP is not configured. Emails will be logged to console in development mode.",
    );
    console.log("📝 To configure SMTP, add these variables to your .env file:");
    console.log("   - SMTP_HOST");
    console.log("   - SMTP_PORT");
    console.log("   - SMTP_USER");
    console.log("   - SMTP_PASSWORD");
    console.log("   - SMTP_FROM");
    console.log("   - SMTP_FROM_NAME");
    console.log("\n📖 See docs/EMAIL_SETUP.md for detailed instructions.");
    return;
  }

  // Test SMTP connection
  console.log("\n🔌 Testing SMTP connection...");
  const isConnected = await emailService.verifyConnection();
  console.log(`Connection Status: ${isConnected ? "✅ Success" : "❌ Failed"}`);

  if (!isConnected) {
    console.log("\n❌ Cannot connect to SMTP server. Please check your credentials.");
    return;
  }

  // Send test email
  console.log("\n📧 Sending test email...");
  const testEmail = process.env.SMTP_USER || "test@example.com";

  try {
    await emailService.send({
      to: testEmail,
      subject: "Test Email - VRA Land CRM",
      html: `
        <h1>Test Email</h1>
        <p>This is a test email from VRA Land CRM.</p>
        <p><strong>If you received this, your email configuration is working correctly!</strong></p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      `,
      text: `
Test Email - VRA Land CRM

This is a test email from VRA Land CRM.

If you received this, your email configuration is working correctly!

Timestamp: ${new Date().toISOString()}
      `,
    });
    console.log(`✅ Test email sent successfully to ${testEmail}`);
    console.log("\n📬 Please check your inbox (and spam folder) to verify receipt.");
  } catch (error) {
    console.error("❌ Failed to send test email:", error);
  }
}

testEmail().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
