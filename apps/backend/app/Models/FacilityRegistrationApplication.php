<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FacilityRegistrationApplication extends BarbaariModel
{
    protected $casts = [
        'reviewed_at' => 'datetime',
        'address_validated_at' => 'datetime',
        'geocoded_at' => 'datetime',
    ];

    public function pricingPlan(): BelongsTo { return $this->belongsTo(PricingPlan::class); }
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function ownerUser(): BelongsTo { return $this->belongsTo(User::class, 'owner_user_id'); }
    public function reviewer(): BelongsTo { return $this->belongsTo(User::class, 'reviewed_by'); }
}
