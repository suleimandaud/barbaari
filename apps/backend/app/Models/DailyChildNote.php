<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DailyChildNote extends BarbaariModel
{
    protected $casts = ['date' => 'date'];

    public function child(): BelongsTo { return $this->belongsTo(Child::class); }
}
