<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pricing_plans', function (Blueprint $table) {
            if (! Schema::hasColumn('pricing_plans', 'yearly_price')) {
                $table->decimal('yearly_price', 10, 2)->default(0)->after('monthly_price');
            }
            if (! Schema::hasColumn('pricing_plans', 'staff_limit')) {
                $table->unsignedInteger('staff_limit')->nullable()->after('child_limit');
            }
            if (! Schema::hasColumn('pricing_plans', 'status')) {
                $table->string('status')->default('active')->after('features')->index();
            }
            if (! Schema::hasColumn('pricing_plans', 'featured')) {
                $table->boolean('featured')->default(false)->after('status');
            }
        });

        Schema::table('support_tickets', function (Blueprint $table) {
            if (! Schema::hasColumn('support_tickets', 'assigned_to')) {
                $table->foreignId('assigned_to')->nullable()->after('opened_by')->constrained('users')->nullOnDelete();
            }
        });

        Schema::create('support_ticket_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('support_ticket_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->timestamps();
        });

        Schema::table('system_alerts', function (Blueprint $table) {
            if (! Schema::hasColumn('system_alerts', 'type')) {
                $table->string('type')->default('general')->after('severity')->index();
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_ticket_comments');
    }
};
