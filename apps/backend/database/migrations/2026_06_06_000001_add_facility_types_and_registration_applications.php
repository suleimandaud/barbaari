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
            if (! Schema::hasColumn('organizations', 'facility_type')) {
                $table->string('facility_type')->default('center_daycare')->after('organization_code')->index();
            }
        });

        if (Schema::hasColumn('organizations', 'facility_type')) {
            DB::table('organizations')->whereNull('facility_type')->update(['facility_type' => 'center_daycare']);
        }

        Schema::table('pricing_plans', function (Blueprint $table) {
            if (! Schema::hasColumn('pricing_plans', 'available_for_family_child_care')) {
                $table->boolean('available_for_family_child_care')->default(true)->after('featured');
            }
            if (! Schema::hasColumn('pricing_plans', 'available_for_center_daycare')) {
                $table->boolean('available_for_center_daycare')->default(true)->after('available_for_family_child_care');
            }
        });

        Schema::create('facility_registration_applications', function (Blueprint $table) {
            $table->id();
            $table->string('facility_type')->index();
            $table->string('business_name');
            $table->string('legal_name')->nullable();
            $table->string('owner_name');
            $table->string('owner_email')->index();
            $table->string('phone')->nullable();
            $table->string('city')->nullable();
            $table->string('state')->nullable();
            $table->string('country')->nullable();
            $table->string('address')->nullable();
            $table->string('timezone')->nullable();
            $table->string('license_number')->nullable();
            $table->string('license_status')->default('not_provided')->index();
            $table->foreignId('pricing_plan_id')->nullable()->constrained()->nullOnDelete();
            $table->string('billing_cycle')->default('monthly');
            $table->text('notes')->nullable();
            $table->string('status')->default('pending')->index();
            $table->text('review_notes')->nullable();
            $table->foreignId('organization_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('facility_registration_applications');

        Schema::table('pricing_plans', function (Blueprint $table) {
            foreach (['available_for_center_daycare', 'available_for_family_child_care'] as $column) {
                if (Schema::hasColumn('pricing_plans', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::table('organizations', function (Blueprint $table) {
            if (Schema::hasColumn('organizations', 'facility_type')) {
                $table->dropColumn('facility_type');
            }
        });
    }
};
