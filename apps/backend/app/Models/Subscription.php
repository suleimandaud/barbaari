<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Subscription extends BarbaariModel
{
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
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function pricingPlan(): BelongsTo { return $this->belongsTo(PricingPlan::class); }
    public function platformInvoices(): HasMany { return $this->hasMany(PlatformInvoice::class); }
}
