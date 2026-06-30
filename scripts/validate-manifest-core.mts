#!/usr/bin/env node
/**
 * validate-manifest-core.mts
 *
 * Pure logic for validating JSON manifests against their schemas.
 * Has no I/O side effects at the top level — everything is exported.
 */

import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

export interface ValidationResult {
  file: string;
  valid: boolean;
  errors: string[];
}

export function loadJson(fullPath: string): unknown {
  const raw = readFileSync(fullPath, 'utf8');
  return JSON.parse(raw);
}

export function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) return [];
  return errors.map((e) => `${e.instancePath || '<root>'}: ${e.message} (${e.keyword})`);
}

export function validateFile(
  ajv: Ajv,
  schema: object,
  data: unknown,
  targetRel: string,
  strict = true
): ValidationResult {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return {
    file: targetRel,
    valid: !strict || !!valid,
    errors: valid ? [] : formatErrors(validate.errors),
  };
}

export interface ManifestTarget {
  schemaRel: string;
  targetRel: string;
  label: string;
}

export interface RunResult {
  results: ValidationResult[];
  allValid: boolean;
  printed: string[];
}

export function runManifestValidation(
  repoRoot: string,
  ajv: Ajv,
  targets: ManifestTarget[],
  loadJsonFn: (fullPath: string) => unknown = loadJson
): RunResult {
  const results: ValidationResult[] = [];
  const printed: string[] = [];

  for (const { schemaRel, targetRel, label } of targets) {
    const schema = loadJsonFn(resolve(repoRoot, schemaRel));
    const data = loadJsonFn(resolve(repoRoot, targetRel));
    const result = validateFile(ajv, schema as object, data, targetRel);
    results.push(result);
    if (result.valid) {
      const line = `[ok]   ${label.padEnd(28)} ${targetRel}`;
      console.log(line);
      printed.push(line);
    } else {
      const line = `[FAIL] ${label.padEnd(28)} ${targetRel}`;
      console.error(line);
      printed.push(line);
      for (const err of result.errors) {
        const errLine = `       - ${err}`;
        console.error(errLine);
        printed.push(errLine);
      }
    }
  }

  const allValid = results.every((r) => r.valid);
  console.log('');
  console.log(`Validated ${results.length} manifest(s) from ${relative(repoRoot, repoRoot)}`);
  console.log(`Result: ${allValid ? 'PASS' : 'FAIL'}`);
  printed.push('');
  printed.push(`Validated ${results.length} manifest(s) from ${relative(repoRoot, repoRoot)}`);
  printed.push(`Result: ${allValid ? 'PASS' : 'FAIL'}`);

  return { results, allValid, printed };
}
