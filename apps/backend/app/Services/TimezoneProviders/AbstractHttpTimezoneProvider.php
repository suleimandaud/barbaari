<?php

namespace App\Services\TimezoneProviders;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Shared HTTP request/retry/logging/validation plumbing for the timezone providers that
 * are plain JSON REST APIs (TimeAPI, GeoNames, Google). Each concrete provider only needs
 * to describe its endpoint, query params, and how to pull an IANA timezone out of a
 * decoded response — everything else (timeouts, exponential backoff, redirect/HTML/
 * Cloudflare-block handling via strict JSON parsing, structured logging with secrets
 * redacted, and IANA validation) is centralized here so every provider gets it uniformly.
 */
abstract class AbstractHttpTimezoneProvider implements TimezoneProviderInterface
{
    private const MAX_LOGGED_BODY_LENGTH = 500;

    abstract protected function endpoint(): string;

    abstract protected function query(float $latitude, float $longitude): array;

    /**
     * Query parameter keys (of the array returned by query()) whose values must never
     * appear in logs — API keys, usernames, tokens.
     */
    protected function secretQueryKeys(): array
    {
        return [];
    }

    /**
     * Pull the IANA timezone string out of a successfully-decoded JSON body, or return
     * null if the shape doesn't contain a usable one (missing field, provider-specific
     * error status embedded in an otherwise-200 response, etc).
     */
    abstract protected function extractTimezone(array $decoded): ?string;

    protected function connectTimeoutSeconds(): int
    {
        return 3;
    }

    protected function requestTimeoutSeconds(): int
    {
        return 6;
    }

    protected function totalAttempts(): int
    {
        // Laravel's retry() takes total attempts, not a retry count — 2 here means 1
        // retry (2 attempts total) per provider. Kept low because the outer fallback
        // chain across providers is the primary resilience mechanism — hammering a
        // provider that's genuinely down just adds latency before the next provider
        // gets a turn.
        return 2;
    }

    public function resolve(float $latitude, float $longitude): string
    {
        $endpoint = $this->endpoint();
        $query = $this->query($latitude, $longitude);
        $requestUrl = $endpoint.'?'.http_build_query($this->redact($query));

        Log::info('Timezone provider request starting.', [
            'provider' => $this->name(),
            'request_url' => $requestUrl,
            'latitude' => $latitude,
            'longitude' => $longitude,
        ]);

        try {
            $response = Http::acceptJson()
                ->withHeaders(['User-Agent' => $this->userAgent()])
                ->connectTimeout($this->connectTimeoutSeconds())
                ->timeout($this->requestTimeoutSeconds())
                ->retry($this->totalAttempts(), function (int $attempt) {
                    // Exponential backoff: 400ms, 800ms, 1600ms, capped at 2000ms.
                    return min(400 * (2 ** ($attempt - 1)), 2000);
                }, throw: false)
                ->get($endpoint, $query);
        } catch (ConnectionException $exception) {
            $this->fail('connection_failure', [
                'request_url' => $requestUrl,
                'failure_category' => $this->categorizeConnectionFailure($exception->getMessage()),
                'exception_class' => $exception::class,
                'error' => $exception->getMessage(),
            ], $exception);
        } catch (\Throwable $exception) {
            $this->fail('unexpected_exception', [
                'request_url' => $requestUrl,
                'exception_class' => $exception::class,
                'error' => $exception->getMessage(),
            ], $exception);
        }

        return $this->handleResponse($response, $requestUrl);
    }

    private function handleResponse(Response $response, string $requestUrl): string
    {
        $rawBody = $response->body();
        $truncatedBody = $this->truncate($rawBody);

        if (! $response->successful()) {
            $this->fail($response->status() === 429 ? 'rate_limited' : 'http_error_status', [
                'request_url' => $requestUrl,
                'http_status' => $response->status(),
                'response_body' => $truncatedBody,
            ]);
        }

        // Deliberately strict: this is what protects against redirects landing on an HTML
        // page, a Cloudflare/WAF interstitial challenge page, or any other non-JSON body
        // that a 2xx status alone would not catch. Any of those fail json_decode() cleanly.
        $decoded = json_decode($rawBody, true);
        if (json_last_error() !== JSON_ERROR_NONE || ! is_array($decoded)) {
            $this->fail('invalid_json', [
                'request_url' => $requestUrl,
                'http_status' => $response->status(),
                'response_body' => $truncatedBody,
                'json_error' => json_last_error_msg(),
            ]);
        }

        $timezone = $this->extractTimezone($decoded);
        if ($timezone === null) {
            $this->fail('missing_or_unusable_timezone_field', [
                'request_url' => $requestUrl,
                'http_status' => $response->status(),
                'response_body' => $truncatedBody,
                'decoded_json' => $decoded,
            ]);
        }

        if (! is_string($timezone) || ! in_array($timezone, timezone_identifiers_list(), true)) {
            $this->fail('invalid_iana_timezone', [
                'request_url' => $requestUrl,
                'http_status' => $response->status(),
                'response_body' => $truncatedBody,
                'parsed_timezone' => $timezone,
            ]);
        }

        Log::info('Timezone provider succeeded.', [
            'provider' => $this->name(),
            'request_url' => $requestUrl,
            'http_status' => $response->status(),
            'parsed_timezone' => $timezone,
        ]);

        return $timezone;
    }

    private function fail(string $reason, array $context, ?\Throwable $previous = null): never
    {
        Log::warning('Timezone provider failed.', [
            'provider' => $this->name(),
            'reason' => $reason,
            ...$context,
        ]);

        throw new TimezoneProviderException($this->name(), $reason, $context, previous: $previous);
    }

    private function redact(array $query): array
    {
        foreach ($this->secretQueryKeys() as $key) {
            if (array_key_exists($key, $query)) {
                $query[$key] = '***redacted***';
            }
        }

        return $query;
    }

    private function truncate(string $body): string
    {
        if (strlen($body) <= self::MAX_LOGGED_BODY_LENGTH) {
            return $body;
        }

        return substr($body, 0, self::MAX_LOGGED_BODY_LENGTH).'... (truncated, '.strlen($body).' bytes total)';
    }

    private function userAgent(): string
    {
        return trim(config('app.name', 'Barbaari').'/timezone-lookup '.config('app.url'));
    }

    private function categorizeConnectionFailure(string $message): string
    {
        $lower = strtolower($message);

        return match (true) {
            str_contains($lower, 'ssl') || str_contains($lower, 'certificate') => 'ssl',
            str_contains($lower, 'could not resolve host') || str_contains($lower, 'name or service not known') => 'dns',
            str_contains($lower, 'timed out') || str_contains($lower, 'timeout') => 'timeout',
            str_contains($lower, 'connection refused') => 'connection_refused',
            default => 'unknown_connectivity',
        };
    }
}
