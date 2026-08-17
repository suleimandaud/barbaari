<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class Subscription extends BarbaariModel
{
    // A monthly billing period is exactly 30 days — a real elapsed duration, never
    // "same day next month" or "end of next month". Calendar-month arithmetic silently
    // changes length depending on which months a period crosses (28/29/30/31 days), which
    // both overcharges/undercharges access time and makes expiration inconsistent between
    // organizations that happened to subscribe on different dates. 30 days is fixed and
    // predictable regardless of which month(s) the period spans.
    public const MONTHLY_PERIOD_DAYS = 30;

    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function pricingPlan(): BelongsTo { return $this->belongsTo(PricingPlan::class); }
    public function platformInvoices(): HasMany { return $this->hasMany(PlatformInvoice::class); }

    /**
     * The single source of truth for a billing period's end. Monthly cycles run a fixed
     * 30-day duration from $start (Subscription::MONTHLY_PERIOD_DAYS); yearly cycles run a
     * calendar year, which has no analogous "which month" ambiguity.
     */
    public static function periodEnd(?string $billingCycle, Carbon $start): Carbon
    {
        return $billingCycle === 'yearly'
            ? $start->copy()->addYear()
            : $start->copy()->addDays(self::MONTHLY_PERIOD_DAYS);
    }

    /**
     * Called whenever a subscription-linked invoice is paid in full — the single place
     * every payment-completion path (test payment, Stripe Checkout one-time payment,
     * Stripe PaymentIntent/invoice webhooks) converges on before this method exists.
     *
     * A subscription whose period has already lapsed (or was never dated) gets a fresh
     * period anchored at *now* — the customer is paying today, so today is when their new
     * access should start, regardless of how long the old period has been expired.
     *
     * A subscription that still has time remaining is left completely untouched. That
     * invoice is simply confirming/settling a period that's already correctly dated (the
     * common case: paying within days of signing up, well before the period elapses) —
     * touching the dates here must never shorten access the org already has, and doing
     * nothing trivially guarantees that.
     *
     * This must never run for a real Stripe-managed recurring subscription's own period —
     * but it never needs to check for that explicitly: Stripe keeps that subscription's
     * current_period_end in the future via its own webhooks (customer.subscription.updated),
     * so by the time this method could run for one, the "still has time remaining" branch
     * above already protects it.
     */
    public function renewPeriodIfExpired(): void
    {
        $periodEnd = $this->current_period_end ?? $this->current_period_ends_at;
        $isExpiredOrUnset = ! $periodEnd || $periodEnd->isPast();
        if (! $isExpiredOrUnset) {
            return;
        }

        $newStart = now();
        $newEnd = self::periodEnd($this->billing_cycle, $newStart);

        $this->update([
            'current_period_start' => $newStart,
            'current_period_end' => $newEnd,
            'current_period_ends_at' => $newEnd,
            'next_invoice_at' => $newEnd,
        ]);
    }

    protected $casts = [
        'trial_ends_at' => 'datetime',
        'current_period_ends_at' => 'datetime',
        'current_period_start' => 'datetime',
        'current_period_end' => 'datetime',
        'canceled_at' => 'datetime',
        'paused_at' => 'datetime',
        'next_invoice_at' => 'datetime',
        'cancel_at_period_end' => 'boolean',
    ];
}
