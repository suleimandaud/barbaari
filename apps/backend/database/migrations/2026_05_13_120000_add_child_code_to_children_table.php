<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('children', function (Blueprint $table) {
            if (! Schema::hasColumn('children', 'child_code')) {
                $table->string('child_code')->nullable()->after('classroom_id');
            }
        });

        $organizations = DB::table('organizations')->select('id', 'name')->get();

        foreach ($organizations as $organization) {
            $prefix = $this->organizationPrefix($organization->name);
            $children = DB::table('children')
                ->where('organization_id', $organization->id)
                ->whereNull('child_code')
                ->orderBy('id')
                ->get();

            $sequence = 1;
            foreach ($children as $child) {
                do {
                    $code = sprintf('%s-CH-%04d', $prefix, $sequence++);
                    $exists = DB::table('children')
                        ->where('organization_id', $organization->id)
                        ->where('child_code', $code)
                        ->exists();
                } while ($exists);

                DB::table('children')->where('id', $child->id)->update(['child_code' => $code]);
            }
        }

        Schema::table('children', function (Blueprint $table) {
            $table->unique(['organization_id', 'child_code'], 'children_org_child_code_unique');
        });
    }

    public function down(): void
    {
        Schema::table('children', function (Blueprint $table) {
            $table->dropUnique('children_org_child_code_unique');
            $table->dropColumn('child_code');
        });
    }

    private function organizationPrefix(?string $name): string
    {
        $words = collect(preg_split('/\s+/', trim((string) $name)) ?: [])
            ->filter()
            ->map(fn ($word) => Str::upper(Str::substr(preg_replace('/[^A-Za-z]/', '', $word), 0, 1)))
            ->filter()
            ->take(3)
            ->implode('');

        return strlen($words) >= 2 ? str_pad($words, 3, 'C') : 'BAR';
    }
};
