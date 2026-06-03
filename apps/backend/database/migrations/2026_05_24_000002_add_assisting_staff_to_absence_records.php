<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('absence_records', function (Blueprint $table) {
            $table->foreignId('assisting_staff_id')->nullable()->after('entered_by')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('absence_records', function (Blueprint $table) {
            $table->dropConstrainedForeignId('assisting_staff_id');
        });
    }
};
