<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('pin_hash')->nullable()->after('pin');
            $table->unsignedTinyInteger('pin_failed_attempts')->default(0)->after('pin_hash');
            $table->timestamp('pin_locked_until')->nullable()->after('pin_failed_attempts');
        });

        DB::table('users')->whereNotNull('pin')->orderBy('id')->get(['id', 'pin'])->each(function ($user) {
            DB::table('users')->where('id', $user->id)->update([
                'pin_hash' => Hash::make((string) $user->pin),
                'pin' => null,
                'updated_at' => now(),
            ]);
        });

        Schema::create('pin_verification_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('organization_id')->nullable()->constrained()->nullOnDelete();
            $table->string('email')->nullable();
            $table->boolean('success')->default(false);
            $table->string('purpose')->default('staff_quick_access');
            $table->string('failure_reason')->nullable();
            $table->string('ip_address')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('used_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'success', 'verified_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pin_verification_logs');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['pin_hash', 'pin_failed_attempts', 'pin_locked_until']);
        });
    }
};
