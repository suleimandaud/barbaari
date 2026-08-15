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
