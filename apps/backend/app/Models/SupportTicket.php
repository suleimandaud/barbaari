<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupportTicket extends BarbaariModel
{
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function openedBy(): BelongsTo { return $this->belongsTo(User::class, 'opened_by'); }
    public function assignee(): BelongsTo { return $this->belongsTo(User::class, 'assigned_to'); }
    public function comments(): HasMany { return $this->hasMany(SupportTicketComment::class); }
}
