<?php

namespace App\Mail;

use App\Models\PlatformInvoice;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PlatformInvoiceMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $organizationName;
    public string $invoiceNumber;
    public string $totalAmount;
    public string $dueDate;
    public string $currency;
    public string $billingUrl;

    public function __construct(PlatformInvoice $invoice)
    {
        $this->organizationName = $invoice->organization?->name ?? 'Your organization';
        $this->invoiceNumber = $invoice->invoice_number;
        $this->totalAmount = number_format((float) $invoice->total_amount, 2);
        $this->dueDate = $invoice->due_date?->format('F j, Y') ?? 'N/A';
        $this->currency = $invoice->currency ?? 'USD';
        $this->billingUrl = rtrim(config('app.frontend_url', 'http://localhost:5173'), '/').'/subscription-payment';
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Barbaari Invoice {$this->invoiceNumber} — {$this->currency} {$this->totalAmount} due",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.platform-invoice',
        );
    }
}
