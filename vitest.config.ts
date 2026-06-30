import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', '**/*.test.ts', '**/*.test.mts', '**/*.spec.ts', '**/*.spec.mts'],
    exclude: ['node_modules', 'dist', 'runtime', 'coverage'],
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'auto-apply/**/*.ts',
        'file-cleaner/**/*.ts',
        'capability-router/**/*.ts',
        'security/**/*.ts',
        'memory-store/**/*.ts',
        'scripts/validate-*.mts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        '**/types.ts',
        // CLI/interactive entry points — not unit-test friendly
        'auto-apply/smart_runner.ts',
        'file-cleaner/cli.ts',
        'scripts/capability-router-cli.ts',
      ],
      thresholds: {
        // Tightened from 65/50/60 baseline as more tests landed.
        // Stub-heavy executors are still excluded, so we keep
        // functions at 55 to avoid forcing fake tests for stubs.
        lines: 70,
        statements: 70,
        functions: 55,
        branches: 65,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});