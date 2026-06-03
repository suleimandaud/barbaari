<?php

namespace App\Models;

class PaymentProviderEvent extends BarbaariModel
{
    protected $casts = [
        'payload' => 'array',
        'processed_at' => 'datetime',
    ];
}
