<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Document extends BarbaariModel
{
    public function child(): BelongsTo { return $this->belongsTo(Child::class); }
}
