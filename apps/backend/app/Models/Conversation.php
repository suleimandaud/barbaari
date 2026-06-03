<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

class Conversation extends BarbaariModel
{
    public function messages(): HasMany { return $this->hasMany(Message::class); }
}
