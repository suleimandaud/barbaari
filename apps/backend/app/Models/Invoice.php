<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Invoice extends BarbaariModel
{
    protected $casts = ['due_date' => 'date', 'amount' => 'decimal:2'];
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function child(): BelongsTo { return $this->belongsTo(Child::class); }
    public function guardian(): BelongsTo { return $this->belongsTo(Guardian::class); }
    public function items(): HasMany { return $this->hasMany(InvoiceItem::class); }
    public function payments(): HasMany { return $this->hasMany(Payment::class); }
}
