<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Child extends BarbaariModel
{
    protected $casts = ['allergies' => 'array', 'date_of_birth' => 'date'];
    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function classroom(): BelongsTo { return $this->belongsTo(Classroom::class); }
    public function guardians(): BelongsToMany { return $this->belongsToMany(Guardian::class, 'child_guardians')->withPivot(['primary_contact', 'pickup_authorized'])->withTimestamps(); }
    public function attendanceRecords(): HasMany { return $this->hasMany(AttendanceRecord::class); }
    public function absenceRecords(): HasMany { return $this->hasMany(AbsenceRecord::class); }
    public function invoices(): HasMany { return $this->hasMany(Invoice::class); }
    public function incidentReports(): HasMany { return $this->hasMany(IncidentReport::class); }
    public function dailyNotes(): HasMany { return $this->hasMany(DailyChildNote::class); }
}
