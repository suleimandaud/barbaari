<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset Your Password</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 40px 20px; color: #1e293b; }
  .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
  .header { background: #7c3aed; padding: 32px 40px; }
  .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 700; }
  .header p { color: #ddd6fe; margin: 8px 0 0; font-size: 14px; }
  .body { padding: 32px 40px; }
  .body p { line-height: 1.6; color: #475569; margin: 0 0 16px; }
  .btn { display: inline-block; background: #7c3aed; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0; }
  .url-fallback { word-break: break-all; font-size: 12px; color: #64748b; margin-top: 8px; }
  .footer { padding: 24px 40px; border-top: 1px solid #e2e8f0; }
  .footer p { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.5; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Reset your password</h1>
    <p>Barbaari Attendance Platform</p>
  </div>
  <div class="body">
    <p>Hi,</p>
    <p>You are receiving this email because we received a password reset request for your Barbaari account.</p>
    <a href="{{ $resetUrl }}" class="btn">Reset Password</a>
    <p class="url-fallback">If the button does not work, copy and paste this link:<br>{{ $resetUrl }}</p>
    <p>This link will expire in 60 minutes. If you did not request a password reset, no action is required.</p>
  </div>
  <div class="footer">
    <p>&copy; {{ date('Y') }} Barbaari. All rights reserved.</p>
  </div>
</div>
</body>
</html>
