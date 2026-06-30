#!/usr/bin/env node
/**
 * validate-plugin-manifest.mts
 *
 * CLI entry point: validate .cursor-plugin/plugin.json and app-manifest.json
 * against their JSON schemas. Fails with exit code 1 on violation.
 *
 * The pure logic lives in `./validate-manifest-core.mts` for testability.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { runManifestValidation, loadJson } from './validate-manifest-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function main(): void {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const { allValid } = runManifestValidation(
    repoRoot,
    ajv,
    [
      { schemaRel: 'schemas/cursor-plugin.schema.json', targetRel: '.cursor-plugin/plugin.json', label: 'Cursor plugin manifest' },
      { schemaRel: 'schemas/app-manifest.schema.json', targetRel: 'app-manifest.json', label: 'App manifest' },
    ],
    loadJson
  );

  process.exit(allValid ? 0 : 1);
}

main();