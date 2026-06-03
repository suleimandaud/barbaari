<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AbsenceRecord extends BarbaariModel
{
    protected $casts = ['absence_date' => 'date'];

    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function child(): BelongsTo { return $this->belongsTo(Child::class); }
    public function classroom(): BelongsTo { return $this->belongsTo(Classroom::class); }
    public function enteredBy(): BelongsTo { return $this->belongsTo(User::class, 'entered_by'); }
    public function assistingStaff(): BelongsTo { return $this->belongsTo(User::class, 'assisting_staff_id'); }
}
