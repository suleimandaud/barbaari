<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Device extends BarbaariModel
{
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function classroom(): BelongsTo { return $this->belongsTo(Classroom::class); }
}
