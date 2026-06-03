<?php

namespace App\Models;

class AttendanceCorrection extends BarbaariModel
{
    protected $casts = ['original_value' => 'array', 'corrected_value' => 'array', 'edited_at' => 'datetime'];
}
