<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Barbaari Invoice</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 40px 20px; color: #1e293b; }
  .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
  .header { background: #7c3aed; padding: 32px 40px; }
  .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 700; }
  .header p { color: #ddd6fe; margin: 8px 0 0; font-size: 14px; }
  .body { padding: 32px 40px; }
  .body p { line-height: 1.6; color: #475569; margin: 0 0 16px; }
  .invoice-box { background: #faf5ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
  .invoice-box p { margin: 4px 0; font-size: 14px; }
  .invoice-box strong { color: #6d28d9; }
  .amount { font-size: 32px; font-weight: 700; color: #1e293b; margin: 8px 0; }
  .btn { display: inline-block; background: #7c3aed; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0; }
  .footer { padding: 24px 40px; border-top: 1px solid #e2e8f0; }
  .footer p { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.5; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Invoice {{ $invoiceNumber }}</h1>
    <p>Barbaari Platform Subscription</p>
  </div>
  <div class="body">
    <p>Hi, a new invoice is available for <strong>{{ $organizationName }}</strong>.</p>
    <div class="invoice-box">
      <p><strong>Invoice Number:</strong> {{ $invoiceNumber }}</p>
      <p><strong>Amount Due:</strong></p>
      <p class="amount">{{ $currency }} ${{ $totalAmount }}</p>
      <p><strong>Due Date:</strong> {{ $dueDate }}</p>
    </div>
    <p>Please log in to your Barbaari account to pay this invoice and keep your subscription active.</p>
    <a href="{{ $billingUrl }}" class="btn">View &amp; Pay Invoice</a>
  </div>
  <div class="footer">
    <p>&copy; {{ date('Y') }} Barbaari. All rights reserved.</p>
  </div>
</div>
</body>
</html>
