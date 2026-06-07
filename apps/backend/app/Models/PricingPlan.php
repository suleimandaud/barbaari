<?php

namespace App\Models;

class PricingPlan extends BarbaariModel
{
    protected $casts = [
        'features' => 'array',
        'featured' => 'boolean',
        'available_for_family_child_care' => 'boolean',
        'available_for_center_daycare' => 'boolean',
    ];
}
