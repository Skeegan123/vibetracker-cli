import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

import { getConfigFilePath, resolveBaseUrl, setApiKey } from './config.js';

const execFileAsync = promisify(execFile);

type StartLoginResponse = {
  publicId: string;
  pollToken: string;
  userCode: string;
  expiresAt: number;
  intervalMs: number;
  approvalUrl: string;
  apiKeyName: string;
  apiKeyExpiresAt: number | null;
};

type PollLoginResponse =
  | {
      status: 'pending';
      expiresAt: number;
    }
  | {
      status: 'expired';
      expiresAt: number;
    }
  | {
      status: 'consumed';
      expiresAt: number;
      claimedAt: number | null;
    }
  | {
      status: 'completed';
      expiresAt: number;
      apiKey: {
        plaintextKey: string;
        name: string;
        createdAt: number;
        expiresAt: number | null;
      };
    };

export async function loginWithBrowser() {
  const baseUrl = await resolveBaseUrl();
  const start = await postJson<StartLoginResponse>(`${baseUrl}/api/cli-auth/start`, {
    hostname: os.hostname(),
    platform: `${process.platform}-${process.arch}`,
  });

  console.log('Starting browser login...');
  console.log(`Verification code: ${start.userCode}`);

  if (await tryOpenBrowser(start.approvalUrl)) {
    console.log('Opened your browser to approve the login.');
  } else {
    console.log('Open this URL to continue:');
    console.log(start.approvalUrl);
  }

  console.log('Waiting for approval...');

  const result = await waitForCompletion(baseUrl, start);

  await setApiKey(result.apiKey.plaintextKey, {
    authType: 'browser-api-key',
    apiKeyName: result.apiKey.name,
    apiKeyExpiresAt: result.apiKey.expiresAt ?? undefined,
  });

  return {
    configPath: getConfigFilePath(),
    apiKeyName: result.apiKey.name,
    apiKeyExpiresAt: result.apiKey.expiresAt,
  };
}

async function waitForCompletion(baseUrl: string, start: StartLoginResponse) {
  while (true) {
    const result = await postJson<PollLoginResponse>(`${baseUrl}/api/cli-auth/poll`, {
      publicId: start.publicId,
      pollToken: start.pollToken,
    });

    switch (result.status) {
      case 'completed':
        return result;
      case 'expired':
        throw new Error('The browser login request expired. Run `vtcli auth login` again.');
      case 'consumed':
        throw new Error('This browser login request was already used. Run `vtcli auth login` again.');
      case 'pending': {
        const remainingMs = result.expiresAt - Date.now();

        if (remainingMs <= 0) {
          throw new Error('The browser login request expired. Run `vtcli auth login` again.');
        }

        await sleep(Math.min(start.intervalMs, remainingMs));
        break;
      }
    }
  }
}

async function postJson<TResponse>(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, `Request failed with status ${response.status}.`));
  }

  return payload as TResponse;
}

async function tryOpenBrowser(url: string) {
  try {
    if (process.platform === 'darwin') {
      await execFileAsync('open', [url]);
      return true;
    }

    if (process.platform === 'win32') {
      await execFileAsync('cmd', ['/c', 'start', '', url]);
      return true;
    }

    await execFileAsync('xdg-open', [url]);
    return true;
  } catch {
    return false;
  }
}

async function parseJson(response: Response) {
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

function readErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string') {
    return payload.error;
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  return fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
