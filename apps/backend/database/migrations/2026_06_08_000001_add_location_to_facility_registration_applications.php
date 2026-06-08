<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facility_registration_applications', function (Blueprint $table) {
            if (! Schema::hasColumn('facility_registration_applications', 'latitude')) {
                $table->decimal('latitude', 10, 7)->nullable()->after('address');
            }
            if (! Schema::hasColumn('facility_registration_applications', 'longitude')) {
                $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            }
            if (! Schema::hasColumn('facility_registration_applications', 'attendance_radius_meters')) {
                $table->unsignedInteger('attendance_radius_meters')->nullable()->after('longitude');
            }
        });
    }

    public function down(): void
    {
        Schema::table('facility_registration_applications', function (Blueprint $table) {
            foreach (['attendance_radius_meters', 'longitude', 'latitude'] as $column) {
                if (Schema::hasColumn('facility_registration_applications', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
