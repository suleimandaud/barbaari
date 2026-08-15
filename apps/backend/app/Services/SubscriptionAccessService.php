<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\Subscription;
use App\Models\User;

class SubscriptionAccessService
{
    public function isBypassUser(?User $user): bool
    {
        return $user !== null && in_array($user->role, ['super_admin', 'support_staff'], true);
    }

    public function latestSubscriptionForOrganization(Organization|int|null $organization): ?Subscription
    {
        $organizationId = $organization instanceof Organization ? $organization->id : $organization;

        if (! $organizationId) {
            return null;
        }

        return Subscription::where('organization_id', $organizationId)->latest()->first();
    }

    public function isSubscriptionActiveForAccess(Organization|int|null $organization): bool
    {
        return ! $this->requiresPayment($organization);
    }

    public function requiresPayment(Organization|int|Subscription|null $target): bool
    {
        $subscription = $target instanceof Subscription
            ? $target
            : $this->latestSubscriptionForOrganization($target);

        if (! $subscription) {
            return true;
        }

        if ($subscription->status === 'active') {
            // `status` is only updated by an external event (a Stripe webhook, a manual
            // status change) — nothing flips it the instant a 30-day period elapses. The
            // period end itself is therefore the authoritative expiration check: a
            // subscription whose current_period_end/current_period_ends_at has already
            // passed must not keep granting access just because no webhook has landed yet
            // to say so. A subscription with no period end recorded (e.g. lifetime/manual
            // grants) is treated as active with no expiration.
            $periodEnd = $subscription->current_period_end ?? $subscription->current_period_ends_at;

            return $periodEnd ? $periodEnd->isPast() : false;
        }

        if ($subscription->status === 'trialing') {
            return $subscription->trial_ends_at ? $subscription->trial_ends_at->isPast() : false;
        }

        return in_array($subscription->status, [
            'pending_activation',
            'pending_payment',
            'past_due',
            'suspended',
            'canceled',
        ], true);
    }

    public function getPaymentGateReason(Organization|int|Subscription|null $target): array
    {
        $subscription = $target instanceof Subscription
            ? $target
            : $this->latestSubscriptionForOrganization($target);

        if (! $subscription) {
            return [
                'requires_payment' => true,
                'subscription_status' => 'none',
                'reason' => 'No organization subscription exists.',
            ];
        }

        if ($subscription->status === 'trialing' && $subscription->trial_ends_at?->isPast()) {
            return [
                'requires_payment' => true,
                'subscription_status' => $subscription->status,
                'reason' => 'Trial period has expired.',
            ];
        }

        if ($subscription->status === 'active') {
            $periodEnd = $subscription->current_period_end ?? $subscription->current_period_ends_at;
            if ($periodEnd?->isPast()) {
                return [
                    'requires_payment' => true,
                    'subscription_status' => $subscription->status,
                    'reason' => 'Subscription period has expired.',
                ];
            }
        }

        return [
            'requires_payment' => $this->requiresPayment($subscription),
            'subscription_status' => $subscription->status,
            'reason' => $this->reasonForStatus($subscription->status),
        ];
    }

    private function reasonForStatus(?string $status): string
    {
        return match ($status) {
            'active' => 'Subscription is active.',
            'trialing' => 'Trial subscription is active.',
            'pending_activation' => 'Subscription is pending invite acceptance.',
            'pending_payment' => 'Subscription is pending payment.',
            'past_due' => 'Subscription payment is past due.',
            'suspended' => 'Subscription is suspended.',
            'canceled' => 'Subscription is canceled.',
            default => 'Subscription requires payment.',
        };
    }
}
