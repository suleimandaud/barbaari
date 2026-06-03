<?php

namespace App\Mail;

use App\Models\Subscription;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SubscriptionActivatedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $organizationName;
    public string $planName;
    public string $billingCycle;
    public string $dashboardUrl;

    public function __construct(Subscription $subscription)
    {
        $this->organizationName = $subscription->organization?->name ?? 'Your organization';
        $this->planName = $subscription->pricingPlan?->name ?? 'Barbaari';
        $this->billingCycle = ucfirst($subscription->billing_cycle ?? 'monthly');
        $this->dashboardUrl = rtrim(config('app.frontend_url', 'http://localhost:5173'), '/').'/';
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Your Barbaari subscription is now active",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.subscription-activated',
        );
    }
}
