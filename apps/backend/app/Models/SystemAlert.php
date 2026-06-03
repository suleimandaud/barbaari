<?php

namespace App\Models;

class SystemAlert extends BarbaariModel
{
    protected $casts = ['resolved_at' => 'datetime'];
}
