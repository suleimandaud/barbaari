<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('absence_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('child_id')->constrained()->cascadeOnDelete();
            $table->foreignId('classroom_id')->nullable()->constrained()->nullOnDelete();
            $table->date('absence_date')->index();
            $table->string('absence_type')->default('unexcused');
            $table->string('reason')->nullable();
            $table->text('notes')->nullable();
            $table->string('status')->default('recorded');
            $table->foreignId('entered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['organization_id', 'child_id', 'absence_date']);
            $table->index(['organization_id', 'absence_date', 'status']);
            $table->index(['organization_id', 'classroom_id', 'absence_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('absence_records');
    }
};
