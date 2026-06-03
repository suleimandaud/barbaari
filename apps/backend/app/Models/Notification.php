<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends BarbaariModel
{
    protected $casts = ['read_at' => 'datetime', 'delivered_at' => 'datetime'];

    public function recipient(): BelongsTo { return $this->belongsTo(User::class, 'user_id'); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
