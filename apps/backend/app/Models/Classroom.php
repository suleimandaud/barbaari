<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Classroom extends BarbaariModel
{
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function children(): HasMany { return $this->hasMany(Child::class); }
    public function staffProfiles(): HasMany { return $this->hasMany(StaffProfile::class); }
}
