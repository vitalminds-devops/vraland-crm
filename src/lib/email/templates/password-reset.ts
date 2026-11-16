type PasswordResetTemplateProps = {
  resetUrl: string;
  expiryHours?: number;
  appName?: string;
};

/**
 * HTML template for password reset email
 */
export function getPasswordResetHtmlTemplate({
  resetUrl,
  expiryHours = 1,
  appName = "VRA Land CRM",
}: PasswordResetTemplateProps): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 30px;
    }
    .content h2 {
      color: #333;
      font-size: 20px;
      margin-top: 0;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      padding: 12px 30px;
      border-radius: 5px;
      font-weight: 600;
      margin: 20px 0;
    }
    .button:hover {
      opacity: 0.9;
    }
    .warning {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${appName}</h1>
    </div>
    <div class="content">
      <h2>Reset Your Password</h2>
      <p>We received a request to reset your password for your ${appName} account.</p>
      
      <p>Click the button below to set a new password:</p>
      
      <a href="${resetUrl}" class="button">Reset Password</a>
      
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #667eea; font-size: 14px;">${resetUrl}</p>
      
      <div class="warning">
        <strong>Important:</strong> This link will expire in ${expiryHours} hour${expiryHours > 1 ? "s" : ""}. After that, you'll need to request a new password reset.
      </div>
      
      <p>If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
      <p>This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Plain text template for password reset email
 */
export function getPasswordResetTextTemplate({
  resetUrl,
  expiryHours = 1,
  appName = "VRA Land CRM",
}: PasswordResetTemplateProps): string {
  return `
Reset Your Password - ${appName}

We received a request to reset your password for your ${appName} account.

To set a new password, visit this link:
${resetUrl}

Important: This link will expire in ${expiryHours} hour${expiryHours > 1 ? "s" : ""}. After that, you'll need to request a new password reset.

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.

© ${new Date().getFullYear()} ${appName}. All rights reserved.
This is an automated email. Please do not reply.
  `.trim();
}
