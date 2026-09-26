<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Additive, non-destructive indexes only (no column/data changes), each backing a specific
 * hot query:
 *
 * - attendance_records (organization_id, date): the dashboard "present today" count, the
 *   5-day attendance trend, tablet bootstrap, and the attendance list's date/from/to
 *   filters all filter by organization + date.
 * - notifications (organization_id, created_at): the notification list is ordered by
 *   created_at and capped, per organization.
 * - audit_logs (created_at): the platform audit log list is ordered by created_at and capped.
 * - platform_payments (provider_payment_id) / (reference): every Stripe confirm/webhook
 *   checks these for an already-recorded payment before recording one.
 *
 * Secondary-index creation is an online operation on MySQL/InnoDB (no table lock), and
 * each index is skipped if it already exists so the migration is safe to re-run.
 */
return new class extends Migration
{
    private array $indexes = [
        'attendance_records' => [['organization_id', 'date'], 'attendance_records_org_date_index'],
        'notifications' => [['organization_id', 'created_at'], 'notifications_org_created_at_index'],
        'audit_logs' => [['created_at'], 'audit_logs_created_at_index'],
        'platform_payments' => [
            [['provider_payment_id'], 'platform_payments_provider_payment_id_index'],
            [['reference'], 'platform_payments_reference_index'],
        ],
    ];

    public function up(): void
    {
        foreach ($this->definitions() as [$table, $columns, $name]) {
            if (Schema::hasTable($table) && ! Schema::hasIndex($table, $name)) {
                Schema::table($table, fn (Blueprint $blueprint) => $blueprint->index($columns, $name));
            }
        }
    }

    public function down(): void
    {
        foreach ($this->definitions() as [$table, , $name]) {
            if (Schema::hasTable($table) && Schema::hasIndex($table, $name)) {
                Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropIndex($name));
            }
        }
    }

    /** @return list<array{0: string, 1: list<string>, 2: string}> */
    private function definitions(): array
    {
        $definitions = [];
        foreach ($this->indexes as $table => $spec) {
            foreach (is_array($spec[0][0] ?? null) ? $spec : [$spec] as [$columns, $name]) {
                $definitions[] = [$table, $columns, $name];
            }
        }

        return $definitions;
    }
};
