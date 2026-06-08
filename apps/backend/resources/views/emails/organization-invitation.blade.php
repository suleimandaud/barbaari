<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Barbaari Invitation</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 40px 20px; color: #1e293b; }
  .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
  .header { background: #2563eb; padding: 32px 40px; }
  .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 700; }
  .header p { color: #bfdbfe; margin: 8px 0 0; font-size: 14px; }
  .body { padding: 32px 40px; }
  .body p { line-height: 1.6; color: #475569; margin: 0 0 16px; }
  .info-box { background: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
  .info-box p { margin: 4px 0; font-size: 14px; }
  .info-box strong { color: #1e293b; }
  .btn { display: inline-block; background: #2563eb; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0; }
  .btn:hover { background: #1d4ed8; }
  .footer { padding: 24px 40px; border-top: 1px solid #e2e8f0; }
  .footer p { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.5; }
  .url-fallback { word-break: break-all; font-size: 12px; color: #64748b; margin-top: 8px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Barbaari</h1>
    <p>Attendance &amp; Management Platform</p>
  </div>
  <div class="body">
    <p>Hi {{ $recipientName }},</p>
    <p>You have been invited to join <strong>{{ $organizationName }}</strong> on Barbaari as a <strong>{{ $role }}</strong>.</p>
    <p>Create your password to continue setup. After login, Barbaari will guide you through subscription payment if it is still pending.</p>
    <div class="info-box">
      <p><strong>Organization:</strong> {{ $organizationName }}</p>
      <p><strong>Facility type:</strong> {{ $facilityType }}</p>
      <p><strong>Role:</strong> {{ $role }}</p>
      <p><strong>This invitation expires in 14 days.</strong></p>
    </div>
    <a href="{{ $inviteUrl }}" class="btn">Create Password &amp; Continue Setup</a>
    <p class="url-fallback">If the button does not work, copy and paste this link into your browser:<br>{{ $inviteUrl }}</p>
  </div>
  <div class="footer">
    <p>This invitation was sent by a Barbaari administrator. If you did not expect this email, you can safely ignore it.<br>
    &copy; {{ date('Y') }} Barbaari. All rights reserved.</p>
  </div>
</div>
</body>
</html>
