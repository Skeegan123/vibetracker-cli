#!/usr/bin/env node

import { Command, InvalidArgumentError } from 'commander';

import {
  clearApiKey,
  getConfigFilePath,
  getDefaultBaseUrl,
  loadConfig,
  resolveApiKey,
  resolveBaseUrl,
  setApiKey,
  setBaseUrl,
} from './config.js';
import { loginWithBrowser } from './browserAuth.js';
import { type OpinionInput, submitOpinion } from './http.js';

const program = new Command();

program
  .name('vtcli')
  .description('Vibetracker CLI for opinion submission and local auth config.')
  .version('0.1.0');

const authCommand = program.command('auth').description('Manage CLI authentication.');

authCommand
  .command('login')
  .description('Sign in with your browser or store an API key locally.')
  .option('--api-key <apiKey>', 'API key to store locally')
  .action(async (options: { apiKey?: string }) => {
    if (!options.apiKey) {
      const result = await loginWithBrowser();

      console.log(`Saved API key to ${result.configPath}`);
      console.log(`Credential: ${result.apiKeyName}`);

      if (typeof result.apiKeyExpiresAt === 'number') {
        console.log(`Expires at: ${new Date(result.apiKeyExpiresAt).toISOString()}`);
      }

      return;
    }

    const apiKey = options.apiKey;

    if (!apiKey.trim()) {
      throw new Error('API key cannot be empty.');
    }

    await setApiKey(apiKey, {
      authType: 'manual-api-key',
    });
    console.log(`Saved API key to ${getConfigFilePath()}`);
  });

authCommand
  .command('logout')
  .description('Remove the locally stored API key.')
  .action(async () => {
    await clearApiKey();
    console.log('Removed stored API key.');
  });

authCommand
  .command('status')
  .description('Show auth and config status.')
  .action(async () => {
    const config = await loadConfig();
    const apiKey = await resolveApiKey();
    const baseUrl = await resolveBaseUrl();
    const apiKeySource = process.env.VTCLI_API_KEY?.trim() ? 'env' : config.apiKey ? 'config' : 'missing';
    const baseUrlSource = process.env.VTCLI_BASE_URL?.trim() ? 'env' : config.baseUrl ? 'config' : 'default';
    const authType = process.env.VTCLI_API_KEY?.trim() ? 'env-api-key' : config.authType ?? 'manual-api-key';

    console.log(`API key: ${apiKey ? `configured (${apiKeySource})` : 'missing'}`);
    console.log(`Auth type: ${apiKey ? authType : 'none'}`);

    if (apiKeySource === 'config' && config.apiKeyName) {
      console.log(`Credential: ${config.apiKeyName}`);
    }

    if (apiKeySource === 'config' && typeof config.apiKeyExpiresAt === 'number') {
      console.log(`Credential expires at: ${new Date(config.apiKeyExpiresAt).toISOString()}`);
    }

    console.log(`Base URL: ${baseUrl} (${baseUrlSource})`);
    console.log(`Config path: ${getConfigFilePath()}`);
  });

const configCommand = program.command('config').description('Manage CLI configuration.');

configCommand
  .command('set-base-url')
  .description(`Persist a Vibetracker base URL (default: ${getDefaultBaseUrl()}).`)
  .argument('<baseUrl>', 'Base URL for the Vibetracker API')
  .action(async (baseUrl: string) => {
    await setBaseUrl(baseUrl);
    console.log(`Saved base URL: ${await resolveBaseUrl()}`);
  });

configCommand
  .command('show')
  .description('Show the resolved CLI configuration.')
  .action(async () => {
    const apiKey = await resolveApiKey();
    const baseUrl = await resolveBaseUrl();

    console.log(
      JSON.stringify(
        {
          baseUrl,
          apiKeyConfigured: Boolean(apiKey),
          configPath: getConfigFilePath(),
        },
        null,
        2,
      ),
    );
  });

const opinionCommand = program.command('opinion').description('Submit and inspect opinions.');

opinionCommand
  .command('add')
  .description('Submit an opinion to Vibetracker.')
  .requiredOption('--model <model>', 'Model slug, for example gpt-5.4')
  .requiredOption('--score <score>', 'Opinion score: -1, 0, or 1', parseScore)
  .option('--use-case <useCase>', 'Optional use case tag')
  .option('--interface <interfaceName>', 'Optional interface tag')
  .option('--tool-id <toolId>', 'Optional tool identifier')
  .option('--tool-name-other <toolNameOther>', 'Optional freeform tool name')
  .option('--comment <comment>', 'Optional comment text')
  .option('--update-optional-context', 'Overwrite existing optional context fields')
  .option('--json', 'Print the raw JSON response')
  .action(
    async (options: {
      model: string;
      score: OpinionInput['score'];
      useCase?: string;
      interface?: string;
      toolId?: string;
      toolNameOther?: string;
      comment?: string;
      updateOptionalContext?: boolean;
      json?: boolean;
    }) => {
      const input: OpinionInput = {
        model: options.model,
        score: options.score,
      };

      if (options.useCase) {
        input.useCase = options.useCase;
      }

      if (options.interface) {
        input.interface = options.interface;
      }

      if (options.toolId) {
        input.toolId = options.toolId;
      }

      if (options.toolNameOther) {
        input.toolNameOther = options.toolNameOther;
      }

      if (options.comment) {
        input.comment = options.comment;
      }

      if (options.updateOptionalContext) {
        input.updateOptionalContext = true;
      }

      const response = await submitOpinion(input);

      if (options.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      printOpinionSuccess(response);
    },
  );

void program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error.';
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});

function parseScore(value: string): OpinionInput['score'] {
  const score = Number(value);

  if (score === -1 || score === 0 || score === 1) {
    return score;
  }

  throw new InvalidArgumentError('Score must be -1, 0, or 1.');
}

function printOpinionSuccess(response: unknown) {
  if (typeof response !== 'object' || response === null) {
    console.log('Opinion submitted.');
    return;
  }

  const result = response as {
    opinionId?: string;
    createdNewOpinion?: boolean;
    model?: { displayName?: string; fullSlug?: string };
    score?: number;
    moderationStatus?: string;
    cooldownEndsAt?: number;
  };

  console.log(`${result.createdNewOpinion ? 'Created' : 'Updated'} opinion for ${result.model?.fullSlug ?? 'model'}.`);

  if (result.opinionId) {
    console.log(`Opinion ID: ${result.opinionId}`);
  }

  if (typeof result.score === 'number') {
    console.log(`Score: ${result.score}`);
  }

  if (result.moderationStatus) {
    console.log(`Moderation: ${result.moderationStatus}`);
  }

  if (typeof result.cooldownEndsAt === 'number') {
    console.log(`Cooldown ends at: ${new Date(result.cooldownEndsAt).toISOString()}`);
  }
}
