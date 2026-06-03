<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Organization extends BarbaariModel
{
    public function settings(): HasOne { return $this->hasOne(OrganizationSetting::class); }
    public function users(): HasMany { return $this->hasMany(User::class); }
    public function classrooms(): HasMany { return $this->hasMany(Classroom::class); }
    public function children(): HasMany { return $this->hasMany(Child::class); }
    public function guardians(): HasMany { return $this->hasMany(Guardian::class); }
    public function invoices(): HasMany { return $this->hasMany(Invoice::class); }
    public function subscriptions(): HasMany { return $this->hasMany(Subscription::class); }
    public function platformInvoices(): HasMany { return $this->hasMany(PlatformInvoice::class); }
    public function platformPayments(): HasMany { return $this->hasMany(PlatformPayment::class); }
}
