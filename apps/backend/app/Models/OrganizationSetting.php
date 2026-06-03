<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrganizationSetting extends BarbaariModel
{
    protected $casts = ['attendance_policy' => 'array', 'billing_settings' => 'array', 'notification_settings' => 'array'];
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
}
