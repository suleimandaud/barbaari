<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends BarbaariModel
{
    protected $casts = ['changes' => 'array'];

    public function actor(): BelongsTo { return $this->belongsTo(User::class, 'actor_id'); }
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
}
