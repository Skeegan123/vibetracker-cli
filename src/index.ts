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
import {
  ApiError,
  fetchModelSentimentDetails,
  isModelSentimentDetails,
  type ModelSentimentDetails,
  type OpinionInput,
  submitOpinion,
} from './http.js';
import {
  buildOptionsListResult,
  getOpinionOptions,
  tryResolveModelIdentifier,
  tryResolveOpinionInput,
  type OptionListType,
} from './opinionOptions.js';
import { buildSkillInstallCommand, formatCommand, runSkillInstallCommand } from './skillInstall.js';

const program = new Command();

program
  .name('vtcli')
  .description('Vibetracker CLI for opinion submission and local auth config.')
  .version('0.1.1');

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

const optionsCommand = program.command('options').description('List supported models and submission context values.');

const modelCommand = program.command('model').description('Inspect Vibetracker model data.');

const skillCommand = program.command('skill').description('Install and inspect Vibetracker agent skills.');

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
  .option('--json', 'Print JSON output')
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

      const resolvedInput = await tryResolveOpinionInput(input);
      const response = await submitOpinion(resolvedInput);
      const responseSentiment = readResponseCurrentSentiment(response);
      const currentSentiment =
        responseSentiment === undefined ? await tryFetchModelSentimentDetails(resolvedInput.model) : responseSentiment;

      if (options.json) {
        console.log(JSON.stringify(withCurrentSentiment(response, currentSentiment), null, 2));
        return;
      }

      printOpinionSuccess(response);
      printCurrentSentiment(currentSentiment);
    },
  );

modelCommand
  .command('sentiment')
  .description('Fetch current sentiment details for a model.')
  .requiredOption('--model <model>', 'Model slug, for example gpt-5.4')
  .option('--json', 'Print the raw JSON response')
  .action(async (options: { model: string; json?: boolean }) => {
    const model = await tryResolveModelIdentifier(options.model);
    const details = await fetchModelSentimentDetails(model);

    if (options.json) {
      console.log(JSON.stringify(details, null, 2));
      return;
    }

    printModelSentimentDetails(details);
  });

optionsCommand
  .command('list')
  .description('List supported models, interfaces, use cases, or tools.')
  .requiredOption('--type <type>', 'Option type: model, interface, tool, or use-case', parseOptionListType)
  .option('--interface <interfaceName>', 'Filter tools to a specific interface')
  .option('--search <query>', 'Search within model options')
  .option('--json', 'Print raw JSON output')
  .action(async (options: { type: OptionListType; interface?: string; search?: string; json?: boolean }) => {
    if (options.search && options.type !== 'model') {
      throw new Error('--search is currently supported only with `--type model`.');
    }

    let opinionOptions;

    try {
      opinionOptions = await getOpinionOptions();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw new Error('This Vibetracker server does not support `vtcli options list` yet.');
      }

      throw error;
    }

    const result = buildOptionsListResult(opinionOptions, options.type, options.interface, options.search);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    printOptionsList(result);
  });

skillCommand
  .command('install')
  .description('Install the vibetracker-rate agent skill through the open skills installer.')
  .option('-g, --global', 'Install globally instead of into the current project')
  .option('-a, --agent <agent>', 'Target a specific agent; repeat for multiple agents', collectOptionValues, [])
  .option('--copy', 'Copy skill files instead of using the installer default')
  .option('--source <source>', 'Skill source URL or owner/repo, useful for testing a fork')
  .option('--dry-run', 'Print the installer command without running it')
  .option('-y, --yes', 'Skip installer confirmation prompts')
  .action(
    async (options: {
      agent?: string[];
      copy?: boolean;
      dryRun?: boolean;
      global?: boolean;
      source?: string;
      yes?: boolean;
    }) => {
      const command = buildSkillInstallCommand(options);

      console.log(`Running: ${formatCommand(command)}`);

      if (options.dryRun) {
        return;
      }

      await runSkillInstallCommand(command);
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

function parseOptionListType(value: string): OptionListType {
  if (value === 'model' || value === 'interface' || value === 'tool' || value === 'use-case') {
    return value;
  }

  throw new InvalidArgumentError('Type must be one of: model, interface, tool, use-case.');
}

function collectOptionValues(value: string, previous: string[]) {
  previous.push(value);
  return previous;
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

function readResponseCurrentSentiment(response: unknown): ModelSentimentDetails | null | undefined {
  if (typeof response !== 'object' || response === null || !('currentSentiment' in response)) {
    return undefined;
  }

  const currentSentiment = (response as { currentSentiment?: unknown }).currentSentiment;

  if (currentSentiment === null) {
    return null;
  }

  return isModelSentimentDetails(currentSentiment) ? currentSentiment : null;
}

async function tryFetchModelSentimentDetails(model: string): Promise<ModelSentimentDetails | null> {
  try {
    return await fetchModelSentimentDetails(model);
  } catch {
    return null;
  }
}

function withCurrentSentiment(response: unknown, currentSentiment: ModelSentimentDetails | null) {
  if (typeof response !== 'object' || response === null || 'currentSentiment' in response) {
    return response;
  }

  return {
    ...response,
    currentSentiment,
  };
}

function printCurrentSentiment(currentSentiment: ModelSentimentDetails | null) {
  if (currentSentiment === null) {
    console.log('Current sentiment: unavailable.');
    return;
  }

  printModelSentimentDetails(currentSentiment, {
    includeModelLine: false,
  });
}

function printModelSentimentDetails(
  details: ModelSentimentDetails,
  options: {
    includeModelLine?: boolean;
  } = {},
) {
  const { model, sentiment } = details;

  if (options.includeModelLine !== false) {
    console.log(`Model: ${model.displayName} (${model.fullSlug})`);
  }

  console.log(`Current sentiment: ${sentiment.label} (${formatSignedPercent(sentiment.netSentiment)})`);
  console.log(
    `Recent ratings: ${formatCount(sentiment.totalSubmissions, 'rating')} (${sentiment.positiveCount} positive, ${sentiment.neutralCount} neutral, ${sentiment.negativeCount} negative)`,
  );
  console.log(
    `Share: ${formatPercent(sentiment.positiveShare)} positive, ${formatPercent(sentiment.neutralShare)} neutral, ${formatPercent(sentiment.negativeShare)} negative`,
  );

  if (sentiment.baselineSentiment !== null) {
    console.log(
      `Trend: ${formatSignedPercent(sentiment.recentDelta)} recent delta; baseline ${formatSignedPercent(sentiment.baselineSentiment)}`,
    );
  }
}

function formatSignedPercent(value: number) {
  const percent = Math.round(value * 100);
  const prefix = percent > 0 ? '+' : '';
  return `${prefix}${percent}%`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCount(value: number, singular: string) {
  const formattedValue = value.toLocaleString('en-US');
  return `${formattedValue} ${value === 1 ? singular : `${singular}s`}`;
}

function printOptionsList(result: unknown) {
  if (typeof result !== 'object' || result === null || !('type' in result) || typeof result.type !== 'string') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const record = result as Record<string, unknown>;

  if (result.type === 'model' && Array.isArray(record.options)) {
    const options = record.options as Array<{ fullSlug: string; displayName: string; shortSlug: string }>;
    const totalCount = typeof record.totalCount === 'number' ? record.totalCount : options.length;
    const search = typeof record.search === 'string' ? record.search : null;

    if (search && options.length === 0) {
      console.log(`No models matched "${search}".`);
      return;
    }

    if (!search && options.length > 100) {
      console.log(`${totalCount} active models available.`);
      console.log('Use `vtcli options list --type model --search <query>` to narrow the results.');

      for (const option of options.slice(0, 10)) {
        console.log(`${option.fullSlug}\t${option.displayName}\tshort: ${option.shortSlug}`);
      }

      return;
    }

    for (const option of options) {
      console.log(`${option.fullSlug}\t${option.displayName}\tshort: ${option.shortSlug}`);
    }

    return;
  }

  if ((result.type === 'interface' || result.type === 'use-case') && Array.isArray(record.options)) {
    const options = record.options as Array<{ value: string; label: string }>;

    for (const option of options) {
      console.log(`${option.value}\t${option.label}`);
    }

    return;
  }

  if (result.type === 'tool') {
    const toolResult = result as {
      interface?: string;
      options?: Array<{ value: string; label: string }>;
      interfaces?: Array<{ value: string; label: string }>;
      optionsByInterface?: Record<string, Array<{ value: string; label: string }>>;
    };

    if (toolResult.interface && Array.isArray(toolResult.options)) {
      console.log(`Interface: ${toolResult.interface}`);

      for (const option of toolResult.options) {
        console.log(`${option.value}\t${option.label}`);
      }

      return;
    }

    if (Array.isArray(toolResult.interfaces) && toolResult.optionsByInterface) {
      for (const interfaceOption of toolResult.interfaces) {
        console.log(`${interfaceOption.value}\t${interfaceOption.label}`);

        for (const toolOption of toolResult.optionsByInterface[interfaceOption.value] ?? []) {
          console.log(`  ${toolOption.value}\t${toolOption.label}`);
        }
      }

      return;
    }
  }

  console.log(JSON.stringify(result, null, 2));
}
