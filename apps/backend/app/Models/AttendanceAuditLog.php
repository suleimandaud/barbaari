<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendanceAuditLog extends BarbaariModel
{
    protected $casts = ['original_value' => 'array', 'corrected_value' => 'array', 'edited_at' => 'datetime'];

    public function attendanceRecord(): BelongsTo { return $this->belongsTo(AttendanceRecord::class); }
    public function editedBy(): BelongsTo { return $this->belongsTo(User::class, 'edited_by_user_id'); }
}
