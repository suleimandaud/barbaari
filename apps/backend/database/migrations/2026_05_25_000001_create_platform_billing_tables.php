<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pricing_plans', function (Blueprint $table) {
            if (! Schema::hasColumn('pricing_plans', 'code')) {
                $table->string('code')->nullable()->unique()->after('name');
            }
            if (! Schema::hasColumn('pricing_plans', 'currency')) {
                $table->string('currency', 3)->default('USD')->after('yearly_price');
            }
            if (! Schema::hasColumn('pricing_plans', 'device_limit')) {
                $table->unsignedInteger('device_limit')->nullable()->after('staff_limit');
            }
            if (! Schema::hasColumn('pricing_plans', 'stripe_product_id')) {
                $table->string('stripe_product_id')->nullable()->after('featured');
            }
            if (! Schema::hasColumn('pricing_plans', 'stripe_monthly_price_id')) {
                $table->string('stripe_monthly_price_id')->nullable()->after('stripe_product_id');
            }
            if (! Schema::hasColumn('pricing_plans', 'stripe_yearly_price_id')) {
                $table->string('stripe_yearly_price_id')->nullable()->after('stripe_monthly_price_id');
            }
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            if (! Schema::hasColumn('subscriptions', 'billing_cycle')) {
                $table->string('billing_cycle')->default('monthly')->after('pricing_plan_id');
            }
            if (! Schema::hasColumn('subscriptions', 'current_period_start')) {
                $table->timestamp('current_period_start')->nullable()->after('status');
            }
            if (! Schema::hasColumn('subscriptions', 'current_period_end')) {
                $table->timestamp('current_period_end')->nullable()->after('current_period_start');
            }
            if (! Schema::hasColumn('subscriptions', 'canceled_at')) {
                $table->timestamp('canceled_at')->nullable()->after('trial_ends_at');
            }
            if (! Schema::hasColumn('subscriptions', 'paused_at')) {
                $table->timestamp('paused_at')->nullable()->after('canceled_at');
            }
            if (! Schema::hasColumn('subscriptions', 'next_invoice_at')) {
                $table->timestamp('next_invoice_at')->nullable()->after('paused_at');
            }
            if (! Schema::hasColumn('subscriptions', 'stripe_customer_id')) {
                $table->string('stripe_customer_id')->nullable()->after('next_invoice_at');
            }
            if (! Schema::hasColumn('subscriptions', 'provider')) {
                $table->string('provider')->default('manual')->after('stripe_subscription_id');
            }
            if (! Schema::hasColumn('subscriptions', 'notes')) {
                $table->text('notes')->nullable()->after('provider');
            }
        });

        Schema::create('platform_invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subscription_id')->nullable()->constrained('subscriptions')->nullOnDelete();
            $table->string('invoice_number')->unique();
            $table->date('billing_period_start')->nullable();
            $table->date('billing_period_end')->nullable();
            $table->date('due_date');
            $table->string('currency', 3)->default('USD');
            $table->decimal('subtotal', 10, 2)->default(0);
            $table->decimal('tax_amount', 10, 2)->default(0);
            $table->decimal('discount_amount', 10, 2)->default(0);
            $table->decimal('total_amount', 10, 2)->default(0);
            $table->decimal('amount_paid', 10, 2)->default(0);
            $table->decimal('balance_due', 10, 2)->default(0);
            $table->string('status')->default('open')->index();
            $table->string('payment_method')->nullable();
            $table->string('stripe_invoice_id')->nullable();
            $table->string('stripe_payment_intent_id')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('platform_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained('platform_invoices')->cascadeOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('currency', 3)->default('USD');
            $table->string('method')->default('manual');
            $table->string('reference')->nullable();
            $table->string('provider_payment_id')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('payment_provider_events', function (Blueprint $table) {
            $table->id();
            $table->string('provider')->default('stripe');
            $table->string('mode')->default('test');
            $table->string('event_id')->nullable()->index();
            $table->string('event_type')->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->string('status')->default('received');
            $table->text('error_message')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_provider_events');
        Schema::dropIfExists('platform_payments');
        Schema::dropIfExists('platform_invoices');
    }
};
