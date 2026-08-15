<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Child;
use App\Models\Classroom;
use App\Models\Organization;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ChildPayloadQueryCountTest extends TestCase
{
    use RefreshDatabase;

    public function test_eager_loading_latest_attendance_record_avoids_n_plus_1(): void
    {
        $org = Organization::create([
            'name' => 'N+1 Check Center',
            'organization_code' => 'NPO'.random_int(10000, 99999),
            'facility_type' => 'center_daycare',
            'status' => 'active',
        ]);
        $classroom = Classroom::create(['organization_id' => $org->id, 'name' => 'Room A']);
        $children = collect(range(1, 8))->map(fn ($i) => Child::create([
            'organization_id' => $org->id,
            'classroom_id' => $classroom->id,
            'first_name' => 'Child',
            'last_name' => (string) $i,
            'status' => 'active',
        ]));
        foreach ($children as $child) {
            foreach (range(1, 3) as $day) {
                AttendanceRecord::create([
                    'child_id' => $child->id,
                    'organization_id' => $org->id,
                    'classroom_id' => $classroom->id,
                    'date' => now()->subDays($day)->toDateString(),
                    'check_in_time' => now()->subDays($day),
                    'signer_name' => 'Tester',
                    'signer_type' => 'staff',
                    'verification_method' => 'manual',
                ]);
            }
        }

        DB::enableQueryLog();
        $loaded = Child::with('classroom', 'guardians', 'organization', 'latestAttendanceRecord')
            ->where('organization_id', $org->id)
            ->get();
        foreach ($loaded as $child) {
            $child->latestAttendanceRecord;
        }
        $queryCount = count(DB::getQueryLog());
        DB::disableQueryLog();

        // Fixed query count regardless of child count proves this doesn't scale with the
        // number of children — the N+1 this test guards against.
        $this->assertLessThan(10, $queryCount, "Expected a small fixed query count, got {$queryCount}");
        $this->assertCount(8, $loaded);
    }
}
