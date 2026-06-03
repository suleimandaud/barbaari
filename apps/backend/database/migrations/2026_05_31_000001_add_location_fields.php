<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            if (! Schema::hasColumn('organizations', 'latitude')) {
                $table->decimal('latitude', 10, 7)->nullable()->after('address');
            }
            if (! Schema::hasColumn('organizations', 'longitude')) {
                $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            }
            if (! Schema::hasColumn('organizations', 'checkin_radius_meters')) {
                $table->unsignedInteger('checkin_radius_meters')->default(300)->after('longitude');
            }
        });

        Schema::table('attendance_records', function (Blueprint $table) {
            if (! Schema::hasColumn('attendance_records', 'latitude')) {
                $table->decimal('latitude', 10, 7)->nullable()->after('corrected');
            }
            if (! Schema::hasColumn('attendance_records', 'longitude')) {
                $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            }
            if (! Schema::hasColumn('attendance_records', 'distance_meters')) {
                $table->unsignedInteger('distance_meters')->nullable()->after('longitude');
            }
            if (! Schema::hasColumn('attendance_records', 'location_flagged')) {
                $table->boolean('location_flagged')->default(false)->after('distance_meters');
            }
        });
    }

    public function down(): void
    {
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'distance_meters', 'location_flagged']);
        });
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'checkin_radius_meters']);
        });
    }
};
