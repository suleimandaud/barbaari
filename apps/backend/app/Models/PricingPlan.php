<?php

namespace App\Models;

class PricingPlan extends BarbaariModel
{
    protected $casts = ['features' => 'array', 'featured' => 'boolean'];
}
