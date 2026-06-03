<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StaffProfile extends BarbaariModel
{
    protected $casts = ['hired_on' => 'date'];
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function classroom(): BelongsTo { return $this->belongsTo(Classroom::class); }
}
