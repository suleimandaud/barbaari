<?php

namespace App\Console\Commands;

use App\Mail\OrganizationInvitationMail;
use App\Mail\PlatformInvoiceMail;
use App\Mail\SubscriptionActivatedMail;
use App\Models\Organization;
use App\Models\OrganizationInvitation;
use App\Models\PlatformInvoice;
use App\Models\Subscription;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

class BillingEmailSmokeCommand extends Command
{
    protected $signature = 'barbaari:email-smoke {--to= : Optional recipient override for all smoke emails}';

    protected $description = 'Queue Barbaari billing and onboarding smoke-test emails using current demo data.';

    public function handle(): int
    {
        $to = $this->option('to');

        $invitation = OrganizationInvitation::with('organization')->latest()->first();
        $invoice = PlatformInvoice::with('organization', 'subscription.pricingPlan')
            ->whereHas('organization', fn ($query) => $query->where('name', 'Little Lantern Daycare'))
            ->latest()
            ->first()
            ?? PlatformInvoice::with('organization', 'subscription.pricingPlan')->latest()->first();
        $subscription = Subscription::with('organization.users', 'pricingPlan')
            ->whereHas('organization', fn ($query) => $query->where('name', 'Little Lantern Daycare'))
            ->latest()
            ->first()
            ?? Subscription::with('organization.users', 'pricingPlan')->latest()->first();

        if (! $invoice || ! $subscription) {
            $this->error('Missing platform invoice or subscription demo data. Run php artisan barbaari:demo-reset first.');
            return self::FAILURE;
        }

        if (! $invitation) {
            $organization = Organization::first();
            if (! $organization) {
                $this->error('Missing organization demo data. Run php artisan barbaari:demo-reset first.');
                return self::FAILURE;
            }

            $invitation = OrganizationInvitation::create([
                'organization_id' => $organization->id,
                'email' => 'email-smoke@barbaari.test',
                'name' => 'Email Smoke Test',
                'role' => 'daycare_admin',
                'token' => Str::random(64),
                'status' => 'pending',
                'expires_at' => now()->addDays(7),
            ])->load('organization');
        }

        Mail::to($to ?: $invitation->email)->queue(new OrganizationInvitationMail($invitation));
        Mail::to($to ?: ($invoice->organization?->email ?: $invitation->email))->queue(new PlatformInvoiceMail($invoice));

        $adminEmail = $subscription->organization?->users()
            ->whereIn('role', ['daycare_admin', 'manager'])
            ->where('status', 'active')
            ->value('email');
        $adminEmail ??= \App\Models\User::whereIn('role', ['daycare_admin', 'manager'])
            ->where('status', 'active')
            ->value('email');
        Mail::to($to ?: ($adminEmail ?: $invitation->email))->queue(new SubscriptionActivatedMail($subscription));

        $passwordResetAccountEmail = $adminEmail ?: $invitation->email;
        $passwordResetRecipient = $to ?: $passwordResetAccountEmail;
        Password::sendResetLink(
            ['email' => $passwordResetAccountEmail],
            function ($user, string $token) use ($passwordResetRecipient) {
                $resetUrl = rtrim(config('app.frontend_url', 'http://localhost:5173'), '/')
                    .'/reset-password?token='.$token.'&email='.urlencode($user->email);

                Mail::send('emails.password-reset', ['resetUrl' => $resetUrl], function ($message) use ($passwordResetRecipient) {
                    $message->to($passwordResetRecipient)->subject('Reset your Barbaari password');
                });
            }
        );

        $this->info('Queued organization invitation, platform invoice, subscription activated, and password reset smoke emails.');
        $this->line('Mailer: '.config('mail.default'));
        $this->line('Queue: '.config('queue.default'));
        $this->line('Recipient override: '.($to ?: 'not used'));
        $this->line('Password reset token generated: '.(DB::table('password_reset_tokens')->where('email', $passwordResetAccountEmail)->exists() ? 'yes' : 'no'));

        return self::SUCCESS;
    }
}
