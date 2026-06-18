<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facility_registration_applications', function (Blueprint $table) {
            if (! Schema::hasColumn('facility_registration_applications', 'owner_user_id')) {
                $table->foreignId('owner_user_id')->nullable()->after('owner_email')->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('facility_registration_applications', function (Blueprint $table) {
            if (Schema::hasColumn('facility_registration_applications', 'owner_user_id')) {
                $table->dropConstrainedForeignId('owner_user_id');
            }
        });
    }
};
