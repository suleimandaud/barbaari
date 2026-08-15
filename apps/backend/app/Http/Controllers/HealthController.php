<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

/**
 * A deeper health check than Laravel's built-in `/up` (which only confirms the app booted
 * and can render a response — it never touches the database, cache, queue, or filesystem).
 * Intended for a load balancer's health probe during blue-green cutover and for external
 * uptime monitoring, so each check is deliberately cheap and side-effect-free once it
 * returns (any probe data it writes, it also deletes).
 *
 * "critical" checks gate the overall HTTP status (503 takes the instance out of rotation);
 * "warn" checks are surfaced but never fail the overall response, because the app can still
 * correctly serve HTTP traffic even if, say, outbound mail is misconfigured — pulling a
 * healthy web instance out of the load balancer for a queue/mail problem would make an
 * unrelated outage worse, not better.
 */
class HealthController extends Controller
{
    public function check()
    {
        $checks = [
            'database' => $this->checkDatabase(),
            'cache' => $this->checkCache(),
            'filesystem' => $this->checkFilesystem(),
            'queue' => $this->checkQueue(),
            'mail' => $this->checkMail(),
            'environment' => $this->checkEnvironment(),
        ];

        $critical = array_filter($checks, fn ($check) => $check['critical']);
        $healthy = ! in_array('fail', array_column($critical, 'status'), true);

        return response()->json([
            'status' => $healthy ? 'ok' : 'down',
            'timestamp' => now()->toIso8601String(),
            'checks' => $checks,
        ], $healthy ? 200 : 503);
    }

    private function checkDatabase(): array
    {
        try {
            DB::select('select 1');

            return $this->pass(true);
        } catch (Throwable $e) {
            Log::error('Health check: database unreachable.', ['error' => $e->getMessage()]);

            return $this->fail(true, 'Database unreachable.');
        }
    }

    private function checkCache(): array
    {
        $key = 'health-check:'.Str::random(8);

        try {
            Cache::put($key, 'ok', 5);
            $ok = Cache::get($key) === 'ok';
            Cache::forget($key);

            return $ok ? $this->pass(true) : $this->fail(true, 'Cache write succeeded but read-back did not match.');
        } catch (Throwable $e) {
            Log::error('Health check: cache unavailable.', ['error' => $e->getMessage()]);

            return $this->fail(true, 'Cache unavailable.');
        }
    }

    private function checkFilesystem(): array
    {
        $disk = config('filesystems.default', 'local');
        $path = 'health-check/'.Str::random(8).'.txt';

        try {
            Storage::disk($disk)->put($path, 'ok');
            $ok = Storage::disk($disk)->get($path) === 'ok';
            Storage::disk($disk)->delete($path);

            return $ok ? $this->pass(true) : $this->fail(true, "Disk [{$disk}] write succeeded but read-back did not match.");
        } catch (Throwable $e) {
            Log::error('Health check: filesystem unavailable.', ['disk' => $disk, 'error' => $e->getMessage()]);

            return $this->fail(true, "Disk [{$disk}] unavailable.");
        }
    }

    private function checkQueue(): array
    {
        // Non-critical: the queue backs async work (email, notifications), not the request
        // path itself — a stalled queue shouldn't pull an otherwise-healthy web instance out
        // of the load balancer. The `database` driver is the only one this app actually
        // uses in practice, so that's the one meaningful check; other drivers just confirm
        // the connection resolves without throwing.
        try {
            if (config('queue.default') === 'database') {
                DB::table(config('queue.connections.database.table', 'jobs'))->limit(1)->count();
            } else {
                app('queue')->connection();
            }

            return $this->pass(false);
        } catch (Throwable $e) {
            Log::warning('Health check: queue backend unavailable.', ['error' => $e->getMessage()]);

            return $this->warn(false, 'Queue backend unavailable.');
        }
    }

    private function checkMail(): array
    {
        // Does not send an email — only confirms the configured mailer resolves. Actual
        // delivery failures (bad SMTP creds, provider outage) surface through the mail-send
        // try/catch sites already in the codebase, not here.
        try {
            app('mail.manager')->mailer(config('mail.default'));

            return $this->pass(false, config('mail.default'));
        } catch (Throwable $e) {
            Log::warning('Health check: mail configuration invalid.', ['error' => $e->getMessage()]);

            return $this->warn(false, 'Mail configuration invalid.');
        }
    }

    private function checkEnvironment(): array
    {
        if (empty(config('app.key'))) {
            return $this->fail(true, 'APP_KEY is not set.');
        }

        return $this->pass(true, config('app.env'));
    }

    private function pass(bool $critical, ?string $detail = null): array
    {
        return array_filter([
            'status' => 'pass',
            'critical' => $critical,
            'detail' => $detail,
        ], fn ($v) => $v !== null);
    }

    private function warn(bool $critical, string $message): array
    {
        return ['status' => 'warn', 'critical' => $critical, 'message' => $message];
    }

    private function fail(bool $critical, string $message): array
    {
        return ['status' => 'fail', 'critical' => $critical, 'message' => $message];
    }
}
