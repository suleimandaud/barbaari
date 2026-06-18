<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facility_registration_applications', function (Blueprint $table) {
            if (! Schema::hasColumn('facility_registration_applications', 'address_line1')) {
                $table->string('address_line1')->nullable()->after('address');
            }
            if (! Schema::hasColumn('facility_registration_applications', 'address_line2')) {
                $table->string('address_line2')->nullable()->after('address_line1');
            }
            if (! Schema::hasColumn('facility_registration_applications', 'postal_code')) {
                $table->string('postal_code', 20)->nullable()->after('state');
            }
            if (! Schema::hasColumn('facility_registration_applications', 'standardized_address')) {
                $table->string('standardized_address')->nullable()->after('postal_code');
            }
            if (! Schema::hasColumn('facility_registration_applications', 'address_validated_at')) {
                $table->timestamp('address_validated_at')->nullable()->after('attendance_radius_meters');
            }
            if (! Schema::hasColumn('facility_registration_applications', 'geocoded_at')) {
                $table->timestamp('geocoded_at')->nullable()->after('address_validated_at');
            }
            if (! Schema::hasColumn('facility_registration_applications', 'geocoding_provider')) {
                $table->string('geocoding_provider')->nullable()->after('geocoded_at');
            }
        });

        Schema::table('organizations', function (Blueprint $table) {
            if (! Schema::hasColumn('organizations', 'address_line1')) {
                $table->string('address_line1')->nullable()->after('address');
            }
            if (! Schema::hasColumn('organizations', 'address_line2')) {
                $table->string('address_line2')->nullable()->after('address_line1');
            }
            if (! Schema::hasColumn('organizations', 'postal_code')) {
                $table->string('postal_code', 20)->nullable()->after('state');
            }
            if (! Schema::hasColumn('organizations', 'standardized_address')) {
                $table->string('standardized_address')->nullable()->after('postal_code');
            }
            if (! Schema::hasColumn('organizations', 'address_validated_at')) {
                $table->timestamp('address_validated_at')->nullable()->after('attendance_radius_meters');
            }
            if (! Schema::hasColumn('organizations', 'geocoded_at')) {
                $table->timestamp('geocoded_at')->nullable()->after('address_validated_at');
            }
            if (! Schema::hasColumn('organizations', 'geocoding_provider')) {
                $table->string('geocoding_provider')->nullable()->after('geocoded_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            foreach (['geocoding_provider', 'geocoded_at', 'address_validated_at', 'standardized_address', 'postal_code', 'address_line2', 'address_line1'] as $column) {
                if (Schema::hasColumn('organizations', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::table('facility_registration_applications', function (Blueprint $table) {
            foreach (['geocoding_provider', 'geocoded_at', 'address_validated_at', 'standardized_address', 'postal_code', 'address_line2', 'address_line1'] as $column) {
                if (Schema::hasColumn('facility_registration_applications', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
