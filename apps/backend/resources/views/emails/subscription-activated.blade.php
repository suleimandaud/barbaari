<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Subscription Activated</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 40px 20px; color: #1e293b; }
  .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
  .header { background: #16a34a; padding: 32px 40px; }
  .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 700; }
  .header p { color: #bbf7d0; margin: 8px 0 0; font-size: 14px; }
  .body { padding: 32px 40px; }
  .body p { line-height: 1.6; color: #475569; margin: 0 0 16px; }
  .info-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
  .info-box p { margin: 4px 0; font-size: 14px; }
  .info-box strong { color: #15803d; }
  .btn { display: inline-block; background: #16a34a; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0; }
  .footer { padding: 24px 40px; border-top: 1px solid #e2e8f0; }
  .footer p { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.5; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Subscription Activated</h1>
    <p>Barbaari Attendance Platform</p>
  </div>
  <div class="body">
    <p>Great news! Your Barbaari subscription for <strong>{{ $organizationName }}</strong> is now active.</p>
    <div class="info-box">
      <p><strong>Plan:</strong> {{ $planName }}</p>
      <p><strong>Billing Cycle:</strong> {{ $billingCycle }}</p>
      <p><strong>Status:</strong> Active ✓</p>
    </div>
    <p>You can now access your full attendance dashboard and all platform features.</p>
    <a href="{{ $dashboardUrl }}" class="btn">Go to Dashboard</a>
  </div>
  <div class="footer">
    <p>&copy; {{ date('Y') }} Barbaari. All rights reserved.</p>
  </div>
</div>
</body>
</html>
