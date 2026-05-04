import { type OpinionInput, type OpinionOptions, fetchOpinionOptions } from './http.js';

export type OptionListType = 'model' | 'interface' | 'tool' | 'use-case';

export async function tryResolveOpinionInput(input: OpinionInput) {
  let options: OpinionOptions;

  try {
    options = await fetchOpinionOptions();
  } catch {
    return input;
  }

  return resolveOpinionInput(input, options);
}

export async function tryResolveModelIdentifier(model: string) {
  let options: OpinionOptions;

  try {
    options = await fetchOpinionOptions();
  } catch {
    return normalizeOptionValue(model, '--model');
  }

  return resolveModelIdentifier(model, options);
}

export async function getOpinionOptions() {
  return await fetchOpinionOptions();
}

export function resolveModelIdentifier(model: string, options: OpinionOptions) {
  return resolveModelSlug(model, options);
}

export function resolveOpinionInput(input: OpinionInput, options: OpinionOptions): OpinionInput {
  const nextInput: OpinionInput = {
    ...input,
    model: resolveModelSlug(input.model, options),
  };

  if (nextInput.useCase) {
    nextInput.useCase = normalizeOptionValue(nextInput.useCase, '--use-case');
    validateUseCase(nextInput.useCase, options);
  }

  if (nextInput.interface) {
    nextInput.interface = normalizeOptionValue(nextInput.interface, '--interface');
    validateInterface(nextInput.interface, options);
  }

  if (nextInput.toolId) {
    nextInput.toolId = normalizeOptionValue(nextInput.toolId, '--tool-id');
  }

  if (nextInput.toolNameOther) {
    nextInput.toolNameOther = nextInput.toolNameOther.trim();
  }

  validateToolContext(nextInput, options);
  return nextInput;
}

export function buildOptionsListResult(
  options: OpinionOptions,
  type: OptionListType,
  interfaceValue?: string,
  search?: string,
) {
  if (type === 'model') {
    const normalizedSearch = normalizeSearchQuery(search);

    return {
      type,
      search: normalizedSearch,
      totalCount: options.models.length,
      options: normalizedSearch ? findClosestModelSuggestions(normalizedSearch, options).slice(0, 25) : options.models,
    };
  }

  if (type === 'interface') {
    return {
      type,
      options: options.interfaces,
    };
  }

  if (type === 'use-case') {
    return {
      type,
      options: options.useCases,
    };
  }

  const normalizedInterface = interfaceValue?.trim().toLowerCase();

  if (normalizedInterface) {
    validateInterface(normalizedInterface, options);

    return {
      type,
      interface: normalizedInterface,
      options: options.toolsByInterface[normalizedInterface] ?? [],
    };
  }

  return {
    type,
    interfaces: options.interfaces,
    optionsByInterface: options.toolsByInterface,
  };
}

function resolveModelSlug(model: string, options: OpinionOptions) {
  const normalizedModel = normalizeOptionValue(model, '--model');

  if (normalizedModel.includes('/')) {
    const exactMatch = options.models.find((option) => option.fullSlug === normalizedModel);

    if (exactMatch) {
      return exactMatch.fullSlug;
    }

    const aliasMatches = options.models.filter((option) => normalizeModelAlias(option.fullSlug) === normalizeModelAlias(normalizedModel));

    if (aliasMatches.length === 1) {
      return aliasMatches[0]!.fullSlug;
    }

    if (aliasMatches.length > 1) {
      throw new Error(buildSeparatorAmbiguousModelMessage(normalizedModel, aliasMatches));
    }

    throw new Error(buildInvalidModelMessage(normalizedModel, options));
  }

  const matches = options.models.filter((option) => option.shortSlug === normalizedModel);

  if (matches.length === 1) {
    return matches[0]!.fullSlug;
  }

  if (matches.length > 1) {
    const fullSlugs = matches
      .map((option) => option.fullSlug)
      .sort((left, right) => left.localeCompare(right))
      .join(', ');

    throw new Error(`Model slug "${normalizedModel}" is ambiguous. Use one of: ${fullSlugs}.`);
  }

  const aliasMatches = options.models.filter((option) => normalizeModelAlias(option.shortSlug) === normalizeModelAlias(normalizedModel));

  if (aliasMatches.length === 1) {
    return aliasMatches[0]!.fullSlug;
  }

  if (aliasMatches.length > 1) {
    throw new Error(buildSeparatorAmbiguousModelMessage(normalizedModel, aliasMatches));
  }

  throw new Error(buildInvalidModelMessage(normalizedModel, options));
}

function validateUseCase(useCase: string, options: OpinionOptions) {
  const validUseCases = new Set(options.useCases.map((option) => option.value));

  if (validUseCases.has(useCase)) {
    return;
  }

  throw new Error(
    `Invalid use case "${useCase}". Use \`vtcli options list --type use-case\` to inspect supported values.`,
  );
}

function validateInterface(interfaceValue: string, options: OpinionOptions) {
  const validInterfaces = new Set(options.interfaces.map((option) => option.value));

  if (validInterfaces.has(interfaceValue)) {
    return;
  }

  throw new Error(
    `Invalid interface "${interfaceValue}". Use \`vtcli options list --type interface\` to inspect supported values.`,
  );
}

function validateToolContext(input: OpinionInput, options: OpinionOptions) {
  if (!input.interface) {
    if (input.toolId || input.toolNameOther) {
      throw new Error('--interface is required when --tool-id or --tool-name-other is provided.');
    }

    return;
  }

  if (!input.toolId) {
    if (input.toolNameOther) {
      throw new Error('--tool-name-other can only be provided when --tool-id other is set.');
    }

    return;
  }

  const validTools = new Set((options.toolsByInterface[input.interface] ?? []).map((option) => option.value));

  if (!validTools.has(input.toolId)) {
    throw new Error(
      `Invalid tool "${input.toolId}" for interface "${input.interface}". Use \`vtcli options list --type tool --interface ${input.interface}\` to inspect supported values.`,
    );
  }

  if (input.toolId === 'other') {
    if (!input.toolNameOther) {
      throw new Error('--tool-name-other is required when --tool-id other is set.');
    }

    return;
  }

  if (input.toolNameOther) {
    throw new Error('--tool-name-other can only be provided when --tool-id other is set.');
  }
}

function buildInvalidModelMessage(model: string, options: OpinionOptions) {
  const suggestions = findClosestModelSuggestions(model, options)
    .map((option) => option.fullSlug)
    .slice(0, 5);

  if (suggestions.length === 0) {
    return `Model "${model}" is not available for submissions. Use \`vtcli options list --type model --search <query>\` to inspect available models.`;
  }

  return `Model "${model}" is not available for submissions. Closest matches: ${suggestions.join(', ')}. Use \`vtcli options list --type model --search <query>\` to inspect available models.`;
}

function buildSeparatorAmbiguousModelMessage(
  model: string,
  matches: Array<Pick<OpinionOptions['models'][number], 'fullSlug'>>,
) {
  const matchingFullSlugs = matches
    .map((match) => match.fullSlug)
    .sort((left, right) => left.localeCompare(right))
    .join(', ');

  return `Model "${model}" matched multiple active models after ignoring punctuation-only differences. Use one of: ${matchingFullSlugs}.`;
}

function findClosestModelSuggestions(model: string, options: OpinionOptions) {
  const normalizedQuery = model.toLowerCase();

  return options.models
    .map((option) => ({
      option,
      score: scoreModelOption(normalizedQuery, option),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.option.displayName.localeCompare(right.option.displayName) ||
        left.option.fullSlug.localeCompare(right.option.fullSlug),
    )
    .map((candidate) => candidate.option);
}

function scoreModelOption(query: string, option: OpinionOptions['models'][number]) {
  const searchableValues = [option.fullSlug, option.shortSlug, option.displayName, option.providerSlug ?? '', option.providerName ?? ''];
  let bestScore = 0;

  for (const rawValue of searchableValues) {
    const value = rawValue.toLowerCase();

    if (!value) {
      continue;
    }

    if (value === query) {
      bestScore = Math.max(bestScore, 100);
      continue;
    }

    if (value.startsWith(query)) {
      bestScore = Math.max(bestScore, 80);
      continue;
    }

    if (value.includes(query)) {
      bestScore = Math.max(bestScore, 60);
      continue;
    }

    const distance = getLevenshteinDistance(query, value);

    if (distance <= 2) {
      bestScore = Math.max(bestScore, 40 - distance * 10);
    }
  }

  return bestScore;
}

function normalizeOptionValue(value: string, flagName: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    throw new Error(`${flagName} cannot be empty.`);
  }

  return normalized;
}

function normalizeSearchQuery(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeModelAlias(value: string) {
  return value.toLowerCase().replace(/[.\-_\s]+/g, '');
}

function getLevenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let previousDiagonal = previousRow[0]!;
    previousRow[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const previousAbove = previousRow[rightIndex + 1]!;
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;

      previousRow[rightIndex + 1] = Math.min(
        previousRow[rightIndex]! + 1,
        previousAbove + 1,
        previousDiagonal + substitutionCost,
      );
      previousDiagonal = previousAbove;
    }
  }

  return previousRow[right.length]!;
}
