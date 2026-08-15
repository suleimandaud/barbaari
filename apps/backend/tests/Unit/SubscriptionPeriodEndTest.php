<?php

namespace Tests\Unit;

use App\Models\Subscription;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

/**
 * Every paid billing period must be an exact 30-day duration — never calendar-month
 * arithmetic ("same day next month", "last day of next month"), which silently changes
 * length depending on which months a period crosses. These dates were picked because
 * calendar-month math breaks (or gets clamped) on each of them; Subscription::periodEnd()
 * must not.
 */
class SubscriptionPeriodEndTest extends TestCase
{
    /**
     * @dataProvider thirtyDayStartDates
     */
    public function test_monthly_period_end_is_exactly_thirty_days_after_start(string $start, string $expectedEnd): void
    {
        $end = Subscription::periodEnd('monthly', Carbon::parse($start));

        $this->assertSame($expectedEnd, $end->toDateString());
        $this->assertEqualsWithDelta(30, Carbon::parse($start)->diffInDays($end), 0.0);
    }

    public static function thirtyDayStartDates(): array
    {
        return [
            'July 10 (31-day month)' => ['2026-07-10', '2026-08-09'],
            'January 31 (month-end overflow)' => ['2026-01-31', '2026-03-02'],
            'February 1 (28-day month)' => ['2026-02-01', '2026-03-03'],
            'February 28, non-leap year' => ['2026-02-28', '2026-03-30'],
            'February 29, leap year' => ['2024-02-29', '2024-03-30'],
            'May 31 (31-day month)' => ['2026-05-31', '2026-06-30'],
        ];
    }

    public function test_null_billing_cycle_defaults_to_the_thirty_day_monthly_duration(): void
    {
        $start = Carbon::parse('2026-07-10');

        $this->assertSame(
            Subscription::periodEnd('monthly', $start)->toDateString(),
            Subscription::periodEnd(null, $start)->toDateString()
        );
    }

    public function test_yearly_billing_cycle_runs_a_calendar_year_not_thirty_days(): void
    {
        $start = Carbon::parse('2026-07-10');

        $this->assertSame('2027-07-10', Subscription::periodEnd('yearly', $start)->toDateString());
    }

    public function test_renewal_chains_another_exact_thirty_day_period_from_the_prior_period_end(): void
    {
        $firstStart = Carbon::parse('2026-01-31');
        $firstEnd = Subscription::periodEnd('monthly', $firstStart);
        $this->assertSame('2026-03-02', $firstEnd->toDateString());

        // Renewal: the next period starts exactly where the prior one ended.
        $secondEnd = Subscription::periodEnd('monthly', $firstEnd);
        $this->assertEqualsWithDelta(30, $firstEnd->diffInDays($secondEnd), 0.0);
        $this->assertSame('2026-04-01', $secondEnd->toDateString());
    }

    public function test_period_end_does_not_mutate_the_start_instance(): void
    {
        $start = Carbon::parse('2026-07-10');
        Subscription::periodEnd('monthly', $start);

        $this->assertSame('2026-07-10', $start->toDateString());
    }
}
