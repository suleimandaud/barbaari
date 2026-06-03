<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            if (! Schema::hasColumn('organizations', 'stripe_customer_id')) {
                $table->string('stripe_customer_id')->nullable()->after('checkin_radius_meters');
            }
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            if (! Schema::hasColumn('subscriptions', 'current_period_ends_at')) {
                // Already exists from earlier migration, guard it
            }
            if (! Schema::hasColumn('subscriptions', 'cancel_at_period_end')) {
                $table->boolean('cancel_at_period_end')->default(false)->after('canceled_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            if (Schema::hasColumn('subscriptions', 'cancel_at_period_end')) {
                $table->dropColumn('cancel_at_period_end');
            }
        });
        Schema::table('organizations', function (Blueprint $table) {
            if (Schema::hasColumn('organizations', 'stripe_customer_id')) {
                $table->dropColumn('stripe_customer_id');
            }
        });
    }
};
