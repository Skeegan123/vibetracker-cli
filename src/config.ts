import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type CliConfig = {
  apiKey?: string;
  baseUrl?: string;
  authType?: 'manual-api-key' | 'browser-api-key';
  apiKeyName?: string;
  apiKeyExpiresAt?: number;
  authenticatedEmail?: string;
};

export type StoredApiKeyMetadata = Pick<CliConfig, 'authType' | 'apiKeyName' | 'apiKeyExpiresAt' | 'authenticatedEmail'>;

const defaultBaseUrl = 'https://vibetracker.app';
const configDirPath = path.join(os.homedir(), '.vtcli');
const configFilePath = path.join(configDirPath, 'config.json');

export function getConfigFilePath() {
  return configFilePath;
}

export function getDefaultBaseUrl() {
  return defaultBaseUrl;
}

export async function loadConfig(): Promise<CliConfig> {
  try {
    const raw = await readFile(configFilePath, 'utf8');
    const parsed = JSON.parse(raw) as CliConfig;
    return sanitizeConfig(parsed);
  } catch (error) {
    if (isMissingFileError(error)) {
      return {};
    }

    throw new Error(`Could not read config at ${configFilePath}.`);
  }
}

export async function saveConfig(config: CliConfig) {
  const nextConfig = sanitizeConfig(config);

  await mkdir(configDirPath, { recursive: true, mode: 0o700 });
  await writeFile(configFilePath, `${JSON.stringify(nextConfig, null, 2)}\n`, { mode: 0o600 });
  await chmod(configDirPath, 0o700);
  await chmod(configFilePath, 0o600);
}

export async function updateConfig(updater: (config: CliConfig) => CliConfig | Promise<CliConfig>) {
  const current = await loadConfig();
  const next = await updater(current);
  await saveConfig(next);
}

export async function setApiKey(apiKey: string, metadata: StoredApiKeyMetadata = { authType: 'manual-api-key' }) {
  const normalized = apiKey.trim();

  if (normalized.length === 0) {
    throw new Error('API key cannot be empty.');
  }

  const nextMetadata = sanitizeStoredApiKeyMetadata(metadata);

  await updateConfig((current) => ({
    ...current,
    apiKey: normalized,
    authType: nextMetadata.authType,
    apiKeyName: nextMetadata.apiKeyName,
    apiKeyExpiresAt: nextMetadata.apiKeyExpiresAt,
    authenticatedEmail: nextMetadata.authenticatedEmail,
    ...nextMetadata,
  }));
}

export async function clearApiKey() {
  await updateConfig((current) => {
    const next = { ...current };
    delete next.apiKey;
    delete next.authType;
    delete next.apiKeyName;
    delete next.apiKeyExpiresAt;
    delete next.authenticatedEmail;
    return next;
  });
}

export async function setBaseUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);

  await updateConfig((current) => ({
    ...current,
    baseUrl: normalized,
  }));
}

export async function resolveBaseUrl() {
  const envBaseUrl = process.env.VTCLI_BASE_URL?.trim();

  if (envBaseUrl) {
    return normalizeBaseUrl(envBaseUrl);
  }

  const config = await loadConfig();
  return normalizeBaseUrl(config.baseUrl ?? defaultBaseUrl);
}

export async function resolveApiKey() {
  const envApiKey = process.env.VTCLI_API_KEY?.trim();

  if (envApiKey) {
    return envApiKey;
  }

  const config = await loadConfig();
  return config.apiKey?.trim() || null;
}

function sanitizeConfig(config: CliConfig): CliConfig {
  const next: CliConfig = {};

  if (typeof config.apiKey === 'string' && config.apiKey.trim()) {
    next.apiKey = config.apiKey.trim();
  }

  if (typeof config.baseUrl === 'string' && config.baseUrl.trim()) {
    next.baseUrl = normalizeBaseUrl(config.baseUrl);
  }

  if (config.authType === 'manual-api-key' || config.authType === 'browser-api-key') {
    next.authType = config.authType;
  }

  if (typeof config.apiKeyName === 'string' && config.apiKeyName.trim()) {
    next.apiKeyName = config.apiKeyName.trim();
  }

  if (typeof config.apiKeyExpiresAt === 'number' && Number.isFinite(config.apiKeyExpiresAt) && config.apiKeyExpiresAt > 0) {
    next.apiKeyExpiresAt = config.apiKeyExpiresAt;
  }

  if (typeof config.authenticatedEmail === 'string' && config.authenticatedEmail.trim()) {
    next.authenticatedEmail = config.authenticatedEmail.trim();
  }

  return next;
}

function sanitizeStoredApiKeyMetadata(metadata: StoredApiKeyMetadata) {
  const next: StoredApiKeyMetadata = {};

  if (metadata.authType === 'manual-api-key' || metadata.authType === 'browser-api-key') {
    next.authType = metadata.authType;
  }

  if (typeof metadata.apiKeyName === 'string' && metadata.apiKeyName.trim()) {
    next.apiKeyName = metadata.apiKeyName.trim();
  }

  if (typeof metadata.apiKeyExpiresAt === 'number' && Number.isFinite(metadata.apiKeyExpiresAt) && metadata.apiKeyExpiresAt > 0) {
    next.apiKeyExpiresAt = metadata.apiKeyExpiresAt;
  }

  if (typeof metadata.authenticatedEmail === 'string' && metadata.authenticatedEmail.trim()) {
    next.authenticatedEmail = metadata.authenticatedEmail.trim();
  }

  return next;
}

function normalizeBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, '');

  if (!normalized) {
    throw new Error('Base URL cannot be empty.');
  }

  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Invalid base URL: ${value}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Base URL must use http or https.');
  }

  return parsed.toString().replace(/\/+$/, '');
}

function isMissingFileError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
