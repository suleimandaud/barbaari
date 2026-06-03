<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class BarbaariSmokeCommand extends Command
{
    protected $signature = 'barbaari {--to= : Optional recipient override for email smoke tests}';

    protected $description = 'Run the local Barbaari smoke checks that do not require external services.';

    public function handle(): int
    {
        $this->call('barbaari:email-smoke', array_filter([
            '--to' => $this->option('to'),
        ], fn ($value) => $value !== null && $value !== ''));

        return self::SUCCESS;
    }
}
