<?php

namespace App\Mail;

use App\Models\OrganizationInvitation;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OrganizationInvitationMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $inviteUrl;
    public string $organizationName;
    public string $recipientName;
    public string $role;
    public string $facilityType;

    public function __construct(OrganizationInvitation $invitation)
    {
        $this->inviteUrl = rtrim(config('app.daycare_web_url', 'http://localhost:5173'), '/').'/invite/'.$invitation->token;
        $this->organizationName = $invitation->organization?->name ?? 'Barbaari';
        $this->recipientName = $invitation->name;
        $this->role = str_replace('_', ' ', ucwords($invitation->role, '_'));
        $this->facilityType = str_replace('_', ' ', ucwords($invitation->organization?->facility_type ?? 'center_daycare', '_'));
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "You've been invited to join {$this->organizationName} on Barbaari",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.organization-invitation',
        );
    }
}
