<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IncidentReport extends BarbaariModel
{
    protected $casts = ['occurred_at' => 'datetime'];
    public function child(): BelongsTo { return $this->belongsTo(Child::class); }
    public function classroom(): BelongsTo { return $this->belongsTo(Classroom::class); }
    public function staff(): BelongsTo { return $this->belongsTo(User::class, 'staff_user_id'); }
}
