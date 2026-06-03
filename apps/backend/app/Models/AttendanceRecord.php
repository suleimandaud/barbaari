<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AttendanceRecord extends BarbaariModel
{
    protected $casts = [
        'date' => 'date',
        'check_in_time' => 'datetime',
        'check_out_time' => 'datetime',
        'corrected' => 'boolean',
        'location_flagged' => 'boolean',
        'location_verified' => 'boolean',
    ];
    public function child(): BelongsTo { return $this->belongsTo(Child::class); }
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function classroom(): BelongsTo { return $this->belongsTo(Classroom::class); }
    public function device(): BelongsTo { return $this->belongsTo(Device::class); }
    public function guardian(): BelongsTo { return $this->belongsTo(Guardian::class); }
    public function assistingStaff(): BelongsTo { return $this->belongsTo(User::class, 'assisting_staff_id'); }
    public function auditLogs(): HasMany { return $this->hasMany(AttendanceAuditLog::class); }
    public function corrections(): HasMany { return $this->hasMany(AttendanceCorrection::class); }
}
