<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PinVerificationLog extends BarbaariModel
{
    protected $casts = [
        'success' => 'boolean',
        'verified_at' => 'datetime',
        'used_at' => 'datetime',
    ];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
}
