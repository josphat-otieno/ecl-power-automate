#!/usr/bin/env node

/**
 * validate-solution-env.js
 * 
 * Validates that an environment configuration file contains all 12 required
 * environment variables for the ECL Meeting Summary solution with correct types.
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_ENV_VARS = [
  { name: 'ecl_GraphBaseUrl', type: 'string', pattern: /^https?:\/\// },
  { name: 'ecl_TranscriptInitialDelayMinutes', type: 'number', min: 1 },
  { name: 'ecl_TranscriptRetryDelayMinutes', type: 'number', min: 1 },
  { name: 'ecl_TranscriptMaximumAttempts', type: 'number', min: 1 },
  { name: 'ecl_TranscriptChunkMaximumCharacters', type: 'number', min: 1000 },
  { name: 'ecl_LlmEndpoint', type: 'string', pattern: /^https?:\/\// },
  { name: 'ecl_LlmModelDeployment', type: 'string' },
  { name: 'ecl_LlmSecretName', type: 'string' },
  { name: 'ecl_KeyVaultName', type: 'string' },
  { name: 'ecl_SharePointSiteUrl', type: 'string', pattern: /^https?:\/\// },
  { name: 'ecl_ProcessingListName', type: 'string' },
  { name: 'ecl_SummaryLibraryName', type: 'string' }
];

function validateEnvironmentConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Configuration must be a valid JSON object'], warnings: [] };
  }

  const envList = config.solution?.environmentVariables || config.environmentVariables;
  const envMap = envList 
    ? (Array.isArray(envList) 
        ? Object.fromEntries(envList.map(e => [e.name, e.value !== undefined ? e.value : e.default]))
        : envList)
    : config;

  for (const def of REQUIRED_ENV_VARS) {
    const rawVal = envMap[def.name] ?? envMap[def.name.replace(/^ecl_/, '')];
    if (rawVal === undefined || rawVal === null || rawVal === '') {
      errors.push(`Missing required environment variable: "${def.name}"`);
      continue;
    }

    const val = (def.type === 'number' && typeof rawVal === 'string') ? Number(rawVal) : rawVal;

    if (typeof val !== def.type || (def.type === 'number' && isNaN(val))) {
      errors.push(`Type mismatch on "${def.name}": expected ${def.type}, got ${typeof rawVal}`);
      continue;
    }

    if (def.pattern && !def.pattern.test(String(val))) {
      errors.push(`Invalid format on "${def.name}": value "${val}" does not match required URL format`);
    }

    if (def.min !== undefined && val < def.min) {
      errors.push(`Value too low on "${def.name}": minimum value is ${def.min}`);
    }

    // Security check: ensure API keys or passwords are not accidentally stored as values
    if (def.name === 'ecl_LlmSecretName' && (String(val).length > 60 || /Bearer/i.test(String(val)))) {
      errors.push('CRITICAL: "ecl_LlmSecretName" looks like an actual secret value instead of a Key Vault secret name!');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// CLI Support
if (require.main === module) {
  const args = process.argv.slice(2);
  const configFile = args[0];

  if (!configFile) {
    console.error('Usage: node scripts/validate-solution-env.js <env-config.json>');
    process.exit(1);
  }

  if (!fs.existsSync(configFile)) {
    console.error(`File not found: ${configFile}`);
    process.exit(1);
  }

  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const result = validateEnvironmentConfig(config);

    console.log(`\n--- Validating Environment Configuration (${configFile}) ---`);
    if (result.valid) {
      console.log('✅ Configuration Status: ALL 12 ENVIRONMENT VARIABLES VALID');
      process.exit(0);
    } else {
      console.log('❌ Configuration Status: INVALID');
      result.errors.forEach(err => console.error(`  - ERROR: ${err}`));
      result.warnings.forEach(w => console.warn(`  - WARNING: ${w}`));
      process.exit(1);
    }
  } catch (err) {
    console.error(`Failed to parse configuration JSON: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { validateEnvironmentConfig, REQUIRED_ENV_VARS };
