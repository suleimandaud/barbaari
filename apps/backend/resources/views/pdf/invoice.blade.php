<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice {{ $invoice->invoice_number }}</title>
<style>
  body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 0; padding: 0; }
  .container { max-width: 700px; margin: 0 auto; padding: 40px; }
  .header { border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-start; }
  .brand { font-size: 24px; font-weight: 700; color: #2563eb; }
  .brand small { display: block; font-size: 11px; font-weight: 400; color: #64748b; margin-top: 2px; }
  .invoice-meta { text-align: right; }
  .invoice-meta h2 { margin: 0 0 6px; font-size: 20px; color: #1e293b; }
  .invoice-meta p { margin: 2px 0; color: #64748b; font-size: 11px; }
  .section { margin-bottom: 24px; }
  .section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin: 0 0 8px; }
  .section p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; border-bottom: 1px solid #e2e8f0; }
  tbody td { padding: 10px; border-bottom: 1px solid #f1f5f9; }
  .totals { margin-top: 20px; }
  .totals table { width: 260px; margin-left: auto; }
  .totals td { padding: 6px 10px; font-size: 12px; }
  .totals .total-row td { font-weight: 700; font-size: 14px; color: #1e293b; border-top: 2px solid #2563eb; padding-top: 10px; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
  .status-paid { background: #dcfce7; color: #16a34a; }
  .status-open { background: #fef9c3; color: #ca8a04; }
  .status-overdue { background: #fee2e2; color: #dc2626; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <div>
      <div class="brand">Barbaari<small>Attendance &amp; Management Platform</small></div>
    </div>
    <div class="invoice-meta">
      <h2>INVOICE</h2>
      <p><strong>{{ $invoice->invoice_number }}</strong></p>
      <p>Issued: {{ $invoice->created_at?->format('F j, Y') }}</p>
      <p>Due: {{ $invoice->due_date?->format('F j, Y') ?? 'N/A' }}</p>
      <span class="status-badge status-{{ $invoice->status }}">{{ strtoupper($invoice->status) }}</span>
    </div>
  </div>

  <div style="display: flex; justify-content: space-between; margin-bottom: 28px;">
    <div class="section" style="width: 48%;">
      <h3>Billed To</h3>
      <p><strong>{{ $invoice->organization?->name }}</strong></p>
      @if($invoice->organization?->address)
        <p>{{ $invoice->organization->address }}</p>
      @endif
      @if($invoice->organization?->city)
        <p>{{ $invoice->organization->city }}{{ $invoice->organization?->state ? ', '.$invoice->organization->state : '' }}</p>
      @endif
      @if($invoice->organization?->email)
        <p>{{ $invoice->organization->email }}</p>
      @endif
    </div>
    <div class="section" style="width: 48%;">
      <h3>Plan</h3>
      <p><strong>{{ $invoice->subscription?->pricingPlan?->name ?? 'Barbaari' }}</strong></p>
      <p>Billing cycle: {{ ucfirst($invoice->subscription?->billing_cycle ?? 'monthly') }}</p>
      <p>Period: {{ $invoice->billing_period_start?->format('M j') ?? '—' }} — {{ $invoice->billing_period_end?->format('M j, Y') ?? '—' }}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          {{ $invoice->subscription?->pricingPlan?->name ?? 'Barbaari' }} Subscription<br>
          <small style="color: #64748b;">{{ $invoice->billing_period_start?->format('M j, Y') ?? '—' }} — {{ $invoice->billing_period_end?->format('M j, Y') ?? '—' }}</small>
        </td>
        <td style="text-align: right;">{{ $invoice->currency }} {{ number_format((float)$invoice->subtotal, 2) }}</td>
      </tr>
      @if((float)$invoice->tax_amount > 0)
      <tr>
        <td>Tax</td>
        <td style="text-align: right;">{{ $invoice->currency }} {{ number_format((float)$invoice->tax_amount, 2) }}</td>
      </tr>
      @endif
      @if((float)$invoice->discount_amount > 0)
      <tr>
        <td>Discount</td>
        <td style="text-align: right; color: #16a34a;">- {{ $invoice->currency }} {{ number_format((float)$invoice->discount_amount, 2) }}</td>
      </tr>
      @endif
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <td>Subtotal</td>
        <td style="text-align: right;">{{ $invoice->currency }} {{ number_format((float)$invoice->subtotal, 2) }}</td>
      </tr>
      <tr>
        <td>Total</td>
        <td style="text-align: right;">{{ $invoice->currency }} {{ number_format((float)$invoice->total_amount, 2) }}</td>
      </tr>
      <tr>
        <td>Amount Paid</td>
        <td style="text-align: right; color: #16a34a;">{{ $invoice->currency }} {{ number_format((float)$invoice->amount_paid, 2) }}</td>
      </tr>
      <tr class="total-row">
        <td>Balance Due</td>
        <td style="text-align: right;">{{ $invoice->currency }} {{ number_format((float)$invoice->balance_due, 2) }}</td>
      </tr>
    </table>
  </div>

  <div class="footer">
    <p>Barbaari — Daycare Attendance &amp; Management Platform &bull; Generated {{ now()->format('F j, Y \a\t g:i A') }}</p>
    <p>Questions? Contact support@barbaari.app</p>
  </div>

</div>
</body>
</html>
