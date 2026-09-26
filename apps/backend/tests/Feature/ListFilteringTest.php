<?php

namespace Tests\Feature;

use App\Models\AbsenceRecord;
use App\Models\AttendanceAuditLog;
use App\Models\AttendanceRecord;
use App\Models\Child;
use App\Models\Notification;
use App\Models\Organization;
use App\Models\PricingPlan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The daycare dashboard/attendance/reports pages request only the dates they display, using
 * these filters. Omitting every filter must keep returning the full history, exactly as before.
 */
class ListFilteringTest extends TestCase
{
    use RefreshDatabase;

    private Organization $org;

    private User $admin;

    private Child $child;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-09-26 14:00:00');
        $plan = PricingPlan::create(['name' => 'Starter', 'code' => 'starter-'.Str::random(6), 'monthly_price' => 49, 'status' => 'active']);
        $this->org = Organization::create(['name' => 'Filter Org', 'organization_code' => 'FLT01', 'facility_type' => 'center_daycare', 'status' => 'active', 'plan' => 'Starter']);
        Subscription::create(['organization_id' => $this->org->id, 'pricing_plan_id' => $plan->id, 'billing_cycle' => 'monthly', 'status' => 'active', 'provider' => 'manual']);
        $this->admin = User::factory()->create(['organization_id' => $this->org->id, 'role' => 'daycare_admin', 'status' => 'active']);
        $this->child = Child::create(['organization_id' => $this->org->id, 'first_name' => 'Filter', 'last_name' => 'Kid', 'status' => 'active']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_attendance_date_range_and_open_filters(): void
    {
        $today = $this->record('2026-09-26', closed: false);
        $yesterdayOpen = $this->record('2026-09-25', closed: false);
        $lastWeek = $this->record('2026-09-19', closed: true);

        $ids = fn (array $query) => collect($this->actingAs($this->admin, 'sanctum')->getJson('/api/manager/attendance?'.http_build_query($query))->assertOk()->json('attendance'))->pluck('id')->sort()->values()->all();

        $this->assertSame([(string) $today->id], $ids(['date' => '2026-09-26']));
        $this->assertSame([(string) $today->id, (string) $yesterdayOpen->id], $ids(['from' => '2026-09-25', 'to' => '2026-09-26']));
        $this->assertSame([(string) $today->id, (string) $yesterdayOpen->id], $ids(['open' => 1]));
        $this->assertSame(collect([$today, $yesterdayOpen, $lastWeek])->pluck('id')->map(fn ($id) => (string) $id)->sort()->values()->all(), $ids([]));
    }

    public function test_absence_date_range_filters(): void
    {
        foreach (['2026-09-26', '2026-09-20'] as $date) {
            AbsenceRecord::create(['organization_id' => $this->org->id, 'child_id' => $this->child->id, 'absence_date' => $date, 'absence_type' => 'sick', 'status' => 'recorded', 'entered_by' => $this->admin->id]);
        }

        $count = fn (array $query) => count($this->actingAs($this->admin, 'sanctum')->getJson('/api/absence-records?'.http_build_query($query))->assertOk()->json('absence_records'));

        $this->assertSame(1, $count(['date' => '2026-09-26']));
        $this->assertSame(1, $count(['from' => '2026-09-21', 'to' => '2026-09-26']));
        $this->assertSame(2, $count([]));
    }

    public function test_attendance_audit_logs_by_record_and_limit(): void
    {
        $recordA = $this->record('2026-09-26', closed: true);
        $recordB = $this->record('2026-09-25', closed: true);
        foreach ([$recordA, $recordA, $recordB] as $i => $record) {
            AttendanceAuditLog::create(['attendance_record_id' => $record->id, 'action' => 'check_in', 'reason' => 'r'.$i, 'edited_by_user_id' => $this->admin->id, 'edited_at' => now()->subMinutes($i)]);
        }

        $forA = $this->actingAs($this->admin, 'sanctum')->getJson("/api/attendance/audit-logs?attendance_record_id={$recordA->id}")->assertOk()->json('audit_logs');
        $this->assertCount(2, $forA);
        $this->assertTrue(collect($forA)->every(fn ($log) => (int) $log['attendance_record_id'] === $recordA->id));

        $limited = $this->actingAs($this->admin, 'sanctum')->getJson('/api/attendance/audit-logs?limit=1')->assertOk()->json('audit_logs');
        $this->assertCount(1, $limited);
        $this->assertSame('r0', $limited[0]['reason'], 'limit must keep the newest entries');

        $this->assertCount(3, $this->actingAs($this->admin, 'sanctum')->getJson('/api/attendance/audit-logs')->assertOk()->json('audit_logs'));
    }

    public function test_notification_list_is_capped_to_the_newest_entries_but_unread_count_is_not(): void
    {
        foreach (range(1, 205) as $i) {
            Notification::create(['organization_id' => $this->org->id, 'user_id' => null, 'type' => 'announcement', 'title' => "N$i", 'created_at' => now()->subMinutes(300 - $i)]);
        }

        $list = $this->actingAs($this->admin, 'sanctum')->getJson('/api/notifications')->assertOk()->json('notifications');
        $this->assertCount(200, $list);
        $this->assertSame('N205', $list[0]['title']);
        $this->assertCount(205, $this->actingAs($this->admin, 'sanctum')->getJson('/api/notifications?limit=1000')->json('notifications'));
        $this->assertSame(205, $this->actingAs($this->admin, 'sanctum')->getJson('/api/notifications/unread-count')->json('unread_count'));
    }

    public function test_dashboard_attendance_trend_counts_each_of_the_last_five_days(): void
    {
        $second = Child::create(['organization_id' => $this->org->id, 'first_name' => 'Second', 'last_name' => 'Kid', 'status' => 'active']);
        $this->record('2026-09-26', closed: true);
        $this->record('2026-09-26', closed: true, child: $second);
        $this->record('2026-09-24', closed: true);
        $this->record('2026-09-10', closed: true); // outside the 5-day window

        $trend = $this->actingAs($this->admin, 'sanctum')->getJson('/api/manager/dashboard')->assertOk()->json('attendanceTrend');

        $this->assertSame([0, 0, 1, 0, 2], array_column($trend, 'present'));
        $this->assertSame([2, 2, 1, 2, 0], array_column($trend, 'absent'));
    }

    private function record(string $date, bool $closed, ?Child $child = null): AttendanceRecord
    {
        return AttendanceRecord::create([
            'organization_id' => $this->org->id,
            'child_id' => ($child ?? $this->child)->id,
            'date' => $date,
            'check_in_time' => $date.' 08:00:00',
            'check_out_time' => $closed ? $date.' 16:00:00' : null,
            'signer_name' => 'Staff',
            'signer_type' => 'staff',
            'verification_method' => 'secure_login',
        ]);
    }
}
