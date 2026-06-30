/**
 * Unit tests for validate-manifest-core.mts (pure logic)
 */

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { validateFile, formatErrors, runManifestValidation, loadJson } from './validate-manifest-core';

describe('formatErrors', () => {
  it('returns empty array for null/undefined', () => {
    expect(formatErrors(null)).toEqual([]);
    expect(formatErrors(undefined)).toEqual([]);
  });

  it('formats each error with path, message, and keyword', () => {
    const errors = [
      { instancePath: '/name', message: 'must be string', keyword: 'type' },
      { instancePath: '', message: 'must have required property', keyword: 'required' },
    ];
    expect(formatErrors(errors)).toEqual([
      '/name: must be string (type)',
      '<root>: must have required property (required)',
    ]);
  });
});

describe('validateFile', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  it('returns valid=true when data matches schema', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] };
    const data = { name: 'ok' };
    const result = validateFile(ajv, schema, data, 'test.json');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns valid=false with errors when data does not match', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] };
    const data = { name: 123 };
    const result = validateFile(ajv, schema, data, 'test.json');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('respects strict=false (still returns errors but does not fail)', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    const data = { name: 123 };
    const result = validateFile(ajv, schema, data, 'test.json', false);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('runManifestValidation', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  it('returns allValid=true when all targets pass', () => {
    const fakeLoader = (path: string): unknown => {
      if (path.endsWith('schema.json')) return { type: 'object', properties: { x: { type: 'string' } } };
      return { x: 'ok' };
    };
    const { allValid, results } = runManifestValidation(
      '/tmp',
      ajv,
      [
        { schemaRel: 'schema.json', targetRel: 'a.json', label: 'A' },
        { schemaRel: 'schema.json', targetRel: 'b.json', label: 'B' },
      ],
      fakeLoader
    );
    expect(allValid).toBe(true);
    expect(results).toHaveLength(2);
  });

  it('returns allValid=false when any target fails', () => {
    const fakeLoader = (path: string): unknown => {
      if (path.endsWith('schema.json')) return { type: 'object', required: ['x'], properties: { x: { type: 'string' } } };
      if (path.endsWith('a.json')) return { x: 'ok' };
      return { wrong: 'field' }; // b.json fails
    };
    const { allValid, results } = runManifestValidation(
      '/tmp',
      ajv,
      [
        { schemaRel: 'schema.json', targetRel: 'a.json', label: 'A' },
        { schemaRel: 'schema.json', targetRel: 'b.json', label: 'B' },
      ],
      fakeLoader
    );
    expect(allValid).toBe(false);
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
  });

  it('captures printed output for inspection', () => {
    const fakeLoader = (path: string): unknown => {
      if (path.endsWith('schema.json')) return { type: 'object' };
      return {};
    };
    const { printed } = runManifestValidation(
      '/tmp',
      ajv,
      [{ schemaRel: 'schema.json', targetRel: 'a.json', label: 'A' }],
      fakeLoader
    );
    expect(printed.some((l) => l.includes('[ok]'))).toBe(true);
    expect(printed.some((l) => l.includes('Result: PASS'))).toBe(true);
  });
});

describe('loadJson (integration with real repo files)', () => {
  it('loads the real plugin manifest', () => {
    // This is a smoke test that the bundled manifest is readable
    const path = require('node:path').resolve(__dirname, '..', '.cursor-plugin', 'plugin.json');
    const data = loadJson(path);
    expect(data).toBeDefined();
  });
});