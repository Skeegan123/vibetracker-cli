import { resolveApiKey, resolveBaseUrl } from './config.js';

const STACK_FRAME_PATTERN = /\s+at\s+(?:async\s+)?[A-Za-z0-9_$.[\]<>-]+\s*\([^)]*:\d+:\d+\)/;
const UNCAUGHT_ERROR_PREFIX_PATTERN = /^(?:Uncaught Error:\s*)+/;
const CONVEX_SERVER_ERROR_PREFIX_PATTERN = /^(?:\[Request ID:[^\]]+\]\s*)?Server Error\s*/;

export type AiOption = {
  value: string;
  label: string;
};

export type ModelOption = {
  displayName: string;
  fullSlug: string;
  providerName: string | null;
  providerSlug: string | null;
  shortSlug: string;
};

export type OpinionOptions = {
  models: ModelOption[];
  useCases: AiOption[];
  interfaces: AiOption[];
  toolsByInterface: Record<string, AiOption[]>;
};

export type OpinionInput = {
  model: string;
  score: -1 | 0 | 1;
  updateOptionalContext?: boolean;
  useCase?: string;
  interface?: string;
  toolId?: string;
  toolNameOther?: string;
  comment?: string;
};

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function submitOpinion(input: OpinionInput) {
  const apiKey = await resolveApiKey();

  if (!apiKey) {
    throw new Error('No API key configured. Run `vtcli auth login --api-key <key>` or set VTCLI_API_KEY.');
  }

  const baseUrl = await resolveBaseUrl();
  const response = await fetch(buildApiUrl(baseUrl, '/api/v1/opinions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const data = await parseResponse(response);

  if (!response.ok) {
    throw new ApiError(readApiErrorMessage(data, response.status), response.status, data);
  }

  return data;
}

export async function fetchOpinionOptions() {
  const baseUrl = await resolveBaseUrl();
  const response = await fetch(buildApiUrl(baseUrl, '/api/v1/options'));
  const data = await parseResponse(response);

  if (!response.ok) {
    throw new ApiError(readApiErrorMessage(data, response.status), response.status, data);
  }

  if (!isOpinionOptions(data)) {
    throw new Error('Unexpected response from /api/v1/options.');
  }

  return data;
}

function buildApiUrl(baseUrl: string, pathname: string) {
  return new URL(pathname, `${baseUrl}/`).toString();
}

async function parseResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readApiErrorMessage(data: unknown, status: number) {
  const rawMessage = extractErrorMessage(data);

  if (rawMessage !== null) {
    const sanitizedMessage = sanitizeApiErrorMessage(rawMessage);

    if (sanitizedMessage.length > 0) {
      return sanitizedMessage;
    }
  }

  return `Request failed with status ${status}.`;
}

function sanitizeApiErrorMessage(message: string) {
  const withoutPrefix = message
    .trim()
    .replace(CONVEX_SERVER_ERROR_PREFIX_PATTERN, '')
    .replace(UNCAUGHT_ERROR_PREFIX_PATTERN, '');
  const stackFrameIndex = withoutPrefix.search(STACK_FRAME_PATTERN);

  if (stackFrameIndex === -1) {
    return withoutPrefix;
  }

  return withoutPrefix.slice(0, stackFrameIndex).trim();
}

function extractErrorMessage(error: unknown): string | null {
  return extractErrorMessageInternal(error, new Set<object>(), 0);
}

function extractErrorMessageInternal(error: unknown, visited: Set<object>, depth: number): string | null {
  if (depth > 5) {
    return null;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    if (typeof error.message === 'string' && error.message.trim().length > 0) {
      return error.message;
    }

    const causeMessage = extractErrorMessageInternal((error as Error & { cause?: unknown }).cause, visited, depth + 1);

    return causeMessage;
  }

  if (typeof error === 'object' && error !== null) {
    if (visited.has(error)) {
      return null;
    }

    visited.add(error);
    const record = error as Record<string, unknown>;

    for (const key of ['message', 'error', 'errorMessage']) {
      const value = record[key];

      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    for (const key of ['data', 'cause', 'error', 'details', 'result']) {
      const nestedMessage = extractErrorMessageInternal(record[key], visited, depth + 1);

      if (nestedMessage !== null) {
        return nestedMessage;
      }
    }

    if (Array.isArray(error)) {
      for (const item of error) {
        const nestedMessage = extractErrorMessageInternal(item, visited, depth + 1);

        if (nestedMessage !== null) {
          return nestedMessage;
        }
      }
    } else {
      for (const value of Object.values(record)) {
        const nestedMessage = extractErrorMessageInternal(value, visited, depth + 1);

        if (nestedMessage !== null) {
          return nestedMessage;
        }
      }
    }
  }

  return null;
}

function isOpinionOptions(value: unknown): value is OpinionOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    Array.isArray(record.models) &&
    Array.isArray(record.useCases) &&
    Array.isArray(record.interfaces) &&
    typeof record.toolsByInterface === 'object' &&
    record.toolsByInterface !== null
  );
}
