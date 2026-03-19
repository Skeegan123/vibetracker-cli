import { resolveApiKey, resolveBaseUrl } from './config.js';

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

export async function submitOpinion(input: OpinionInput) {
  const apiKey = await resolveApiKey();

  if (!apiKey) {
    throw new Error('No API key configured. Run `vtcli auth login --api-key <key>` or set VTCLI_API_KEY.');
  }

  const baseUrl = await resolveBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/opinions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(readApiErrorMessage(data, response.status));
  }

  return data;
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
  if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
    return data.error;
  }

  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  return `Request failed with status ${status}.`;
}
