<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            if (! Schema::hasColumn('organizations', 'legal_name')) {
                $table->string('legal_name')->nullable()->after('name');
            }
            if (! Schema::hasColumn('organizations', 'website')) {
                $table->string('website')->nullable()->after('email');
            }
            if (! Schema::hasColumn('organizations', 'address')) {
                $table->string('address')->nullable()->after('website');
            }
            if (! Schema::hasColumn('organizations', 'country')) {
                $table->string('country')->nullable()->after('state');
            }
            if (! Schema::hasColumn('organizations', 'timezone')) {
                $table->string('timezone')->default('Africa/Nairobi')->after('country');
            }
            if (! Schema::hasColumn('organizations', 'license_status')) {
                $table->string('license_status')->default('not_provided')->after('license_number')->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            foreach (['legal_name', 'website', 'address', 'country', 'timezone', 'license_status'] as $column) {
                if (Schema::hasColumn('organizations', $column)) {
                    if ($column === 'license_status') {
                        $table->dropIndex(['license_status']);
                    }
                    $table->dropColumn($column);
                }
            }
        });
    }
};
