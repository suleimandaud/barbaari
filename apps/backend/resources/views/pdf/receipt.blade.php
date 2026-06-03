<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Receipt {{ $payment->invoice?->invoice_number }} #{{ $payment->id }}</title>
<style>
  body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 0; padding: 0; }
  .container { max-width: 700px; margin: 0 auto; padding: 40px; }
  .header { border-bottom: 2px solid #2a7b88; padding-bottom: 20px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { font-size: 24px; font-weight: 700; color: #2a7b88; }
  .brand small { display: block; font-size: 11px; font-weight: 400; color: #64748b; margin-top: 2px; }
  .meta { text-align: right; }
  .meta h2 { margin: 0 0 6px; font-size: 20px; color: #1e293b; }
  .meta p { margin: 2px 0; color: #64748b; font-size: 11px; }
  .section { margin-bottom: 24px; }
  .section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin: 0 0 8px; }
  .section p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin: 18px 0 22px; }
  th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }
  td { padding: 10px; border-bottom: 1px solid #f1f5f9; }
  .paid { color: #15803d; font-weight: 700; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: #dcfce7; color: #15803d; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <div class="brand">Barbaari<small>Attendance &amp; Management Platform</small></div>
    </div>
    <div class="meta">
      <h2>RECEIPT</h2>
      <p><strong>{{ $payment->invoice?->invoice_number }}</strong></p>
      <p>Receipt #: {{ $payment->id }}</p>
      <p>Paid: {{ $payment->paid_at?->format('F j, Y') ?? 'N/A' }}</p>
      <span class="badge">Paid</span>
    </div>
  </div>

  <div style="display: flex; justify-content: space-between; margin-bottom: 28px;">
    <div class="section" style="width: 48%;">
      <h3>Received From</h3>
      <p><strong>{{ $payment->organization?->name }}</strong></p>
      @if($payment->organization?->email)
        <p>{{ $payment->organization->email }}</p>
      @endif
      @if($payment->organization?->city)
        <p>{{ $payment->organization->city }}{{ $payment->organization?->state ? ', '.$payment->organization->state : '' }}</p>
      @endif
    </div>
    <div class="section" style="width: 48%;">
      <h3>Subscription</h3>
      <p><strong>{{ $payment->invoice?->subscription?->pricingPlan?->name ?? 'Barbaari' }}</strong></p>
      <p>Billing cycle: {{ ucfirst($payment->invoice?->subscription?->billing_cycle ?? 'monthly') }}</p>
      <p>Period: {{ $payment->invoice?->billing_period_start?->format('M j') ?? '—' }} — {{ $payment->invoice?->billing_period_end?->format('M j, Y') ?? '—' }}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Method</th>
        <th>Reference</th>
        <th style="text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Platform subscription payment</td>
        <td>{{ ucfirst(str_replace('_', ' ', $payment->method ?? 'manual')) }}</td>
        <td>{{ $payment->reference ?? '—' }}</td>
        <td style="text-align: right;" class="paid">{{ $payment->currency }} {{ number_format((float)$payment->amount, 2) }}</td>
      </tr>
    </tbody>
  </table>

  <div class="section">
    <h3>Invoice Summary</h3>
    <p>Total: {{ $payment->invoice?->currency }} {{ number_format((float)($payment->invoice?->total_amount ?? 0), 2) }}</p>
    <p>Paid to date: {{ $payment->invoice?->currency }} {{ number_format((float)($payment->invoice?->amount_paid ?? 0), 2) }}</p>
    <p>Balance due: {{ $payment->invoice?->currency }} {{ number_format((float)($payment->invoice?->balance_due ?? 0), 2) }}</p>
    <p>Status: {{ strtoupper($payment->invoice?->status ?? 'unknown') }}</p>
  </div>

  <div class="footer">
    <p>Barbaari — Daycare Attendance &amp; Management Platform &bull; Generated {{ now()->format('F j, Y \a\t g:i A') }}</p>
    <p>Questions? Contact support@barbaari.app</p>
  </div>
</div>
</body>
</html>
