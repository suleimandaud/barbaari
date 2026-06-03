<?php

namespace App\Models;

class Payment extends BarbaariModel
{
    protected $casts = ['paid_at' => 'datetime'];
}
