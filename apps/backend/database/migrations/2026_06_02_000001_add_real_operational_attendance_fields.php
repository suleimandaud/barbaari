<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            if (! Schema::hasColumn('organizations', 'organization_code')) {
                $table->string('organization_code', 16)->nullable()->unique()->after('name');
            }
            if (! Schema::hasColumn('organizations', 'attendance_radius_meters')) {
                $table->unsignedInteger('attendance_radius_meters')->default(100)->after('checkin_radius_meters');
            }
        });

        Schema::table('attendance_records', function (Blueprint $table) {
            if (! Schema::hasColumn('attendance_records', 'check_in_latitude')) {
                $table->decimal('check_in_latitude', 10, 7)->nullable()->after('location_flagged');
            }
            if (! Schema::hasColumn('attendance_records', 'check_in_longitude')) {
                $table->decimal('check_in_longitude', 10, 7)->nullable()->after('check_in_latitude');
            }
            if (! Schema::hasColumn('attendance_records', 'check_in_distance_meters')) {
                $table->unsignedInteger('check_in_distance_meters')->nullable()->after('check_in_longitude');
            }
            if (! Schema::hasColumn('attendance_records', 'check_out_latitude')) {
                $table->decimal('check_out_latitude', 10, 7)->nullable()->after('check_in_distance_meters');
            }
            if (! Schema::hasColumn('attendance_records', 'check_out_longitude')) {
                $table->decimal('check_out_longitude', 10, 7)->nullable()->after('check_out_latitude');
            }
            if (! Schema::hasColumn('attendance_records', 'check_out_distance_meters')) {
                $table->unsignedInteger('check_out_distance_meters')->nullable()->after('check_out_longitude');
            }
            if (! Schema::hasColumn('attendance_records', 'location_verified')) {
                $table->boolean('location_verified')->default(false)->after('check_out_distance_meters');
            }
            if (! Schema::hasColumn('attendance_records', 'location_rejection_reason')) {
                $table->string('location_rejection_reason')->nullable()->after('location_verified');
            }
        });

        Schema::table('guardians', function (Blueprint $table) {
            if (! Schema::hasColumn('guardians', 'status')) {
                $table->string('status')->default('active')->index()->after('can_pickup');
            }
            if (! Schema::hasColumn('guardians', 'pin_hash')) {
                $table->string('pin_hash')->nullable()->after('status');
            }
        });

        if (Schema::hasColumn('organizations', 'attendance_radius_meters')) {
            DB::table('organizations')
                ->whereNull('attendance_radius_meters')
                ->update(['attendance_radius_meters' => 100]);
        }
    }

    public function down(): void
    {
        Schema::table('guardians', function (Blueprint $table) {
            foreach (['status', 'pin_hash'] as $column) {
                if (Schema::hasColumn('guardians', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::table('attendance_records', function (Blueprint $table) {
            $columns = [
                'check_in_latitude',
                'check_in_longitude',
                'check_in_distance_meters',
                'check_out_latitude',
                'check_out_longitude',
                'check_out_distance_meters',
                'location_verified',
                'location_rejection_reason',
            ];
            foreach ($columns as $column) {
                if (Schema::hasColumn('attendance_records', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::table('organizations', function (Blueprint $table) {
            foreach (['organization_code', 'attendance_radius_meters'] as $column) {
                if (Schema::hasColumn('organizations', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
