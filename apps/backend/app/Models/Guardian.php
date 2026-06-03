<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Guardian extends BarbaariModel
{
    protected $hidden = ['pin_hash'];

    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function children(): BelongsToMany { return $this->belongsToMany(Child::class, 'child_guardians')->withPivot(['primary_contact', 'pickup_authorized'])->withTimestamps(); }
    public function invoices(): HasMany { return $this->hasMany(Invoice::class); }
}
