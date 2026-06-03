<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->string('recipient_role')->nullable()->after('user_id');
            $table->string('related_model_type')->nullable()->after('type');
            $table->unsignedBigInteger('related_model_id')->nullable()->after('related_model_type');
            $table->timestamp('delivered_at')->nullable()->after('read_at');
            $table->string('delivery_channel')->default('in_app')->after('delivered_at');
            $table->string('delivery_status')->default('delivered')->after('delivery_channel');
            $table->string('priority')->default('normal')->after('delivery_status');
            $table->foreignId('created_by')->nullable()->after('priority')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn([
                'recipient_role',
                'related_model_type',
                'related_model_id',
                'delivered_at',
                'delivery_channel',
                'delivery_status',
                'priority',
            ]);
        });
    }
};
