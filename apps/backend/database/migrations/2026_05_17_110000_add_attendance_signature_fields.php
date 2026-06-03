<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->foreignId('guardian_id')->nullable()->after('check_out_signed_by_user_id')->constrained()->nullOnDelete();
            $table->foreignId('pickup_authorization_id')->nullable()->after('guardian_id')->constrained()->nullOnDelete();
            $table->string('signature_reference')->nullable()->after('device_id');
            $table->string('signature_hash')->nullable()->after('signature_reference');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->dropConstrainedForeignId('guardian_id');
            $table->dropConstrainedForeignId('pickup_authorization_id');
            $table->dropColumn(['signature_reference', 'signature_hash']);
        });
    }
};
