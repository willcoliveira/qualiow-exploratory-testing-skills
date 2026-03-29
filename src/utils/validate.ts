import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ZodError, type ZodSchema } from 'zod';
import { TargetConfigSchema } from '../schemas/target.schema.js';
import { KnowledgeEntrySchema } from '../schemas/knowledge-entry.schema.js';
import { DomainConfigSchema } from '../schemas/domain-config.schema.js';
import type { ValidationResult } from '../types/index.js';
import { globSync } from 'glob';

function validateYamlFile(
  filePath: string,
  schema: ZodSchema,
): ValidationResult {
  const absPath = resolve(filePath);
  try {
    const raw = readFileSync(absPath, 'utf-8');
    const data = parseYaml(raw);
    schema.parse(data);
    return { file: absPath, valid: true };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        file: absPath,
        valid: false,
        errors: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };
    }
    return {
      file: absPath,
      valid: false,
      errors: [
        {
          path: '',
          message:
            err instanceof Error ? err.message : 'Unknown parsing error',
        },
      ],
    };
  }
}

export function validateTargetConfig(filePath: string): ValidationResult {
  return validateYamlFile(filePath, TargetConfigSchema);
}

export function validateKnowledgeEntry(filePath: string): ValidationResult {
  return validateYamlFile(filePath, KnowledgeEntrySchema);
}

export function validateDomainConfig(filePath: string): ValidationResult {
  return validateYamlFile(filePath, DomainConfigSchema);
}

export function validateAllConfigs(dataDir: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  const absDir = resolve(dataDir);

  // Validate target configs
  const targetFiles = globSync(join(absDir, 'targets', '*.yml'));
  for (const file of targetFiles) {
    results.push(validateTargetConfig(file));
  }

  // Validate knowledge entries
  const entryFiles = globSync(
    join(absDir, 'knowledge', 'releases', '**', 'entries', '*.yml'),
  );
  for (const file of entryFiles) {
    results.push(validateKnowledgeEntry(file));
  }

  return results;
}
