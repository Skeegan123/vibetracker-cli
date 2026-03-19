# vtcli

`vtcli` is a small TypeScript CLI for Vibetracker. It can sign in through your browser, store the resulting local credential, and submit opinions to `/api/v1/opinions`.

## Why this shape

- standalone npm package
- written in TypeScript
- uses Node's built-in `fetch`
- stores a local Vibetracker credential in a simple config file
- keeps manual API keys available for automation and CI
- leaves room for future agent-oriented commands

## Local development

```bash
npm install
npm run build
```

Run directly during development:

```bash
npm run dev -- --help
```

Link it into your shell for local testing:

```bash
npm link
vtcli --help
```

## Configuration

The CLI stores config in `~/.vtcli/config.json`.

You can also override config with env vars:

- `VTCLI_API_KEY`
- `VTCLI_BASE_URL`

## Commands

Start browser login:

```bash
vtcli auth login
```

Store an API key manually instead:

```bash
vtcli auth login --api-key vbt_ak_your_prefix_your_secret
```

Check status:

```bash
vtcli auth status
```

Point the CLI at local or preview environments:

```bash
vtcli config set-base-url http://localhost:3000
```

Submit an opinion:

```bash
vtcli opinion add --model gpt-4o --score 1
```

Submit with extra context:

```bash
vtcli opinion add \
  --model gpt-4o \
  --score -1 \
  --use-case coding \
  --interface api \
  --tool-id openai-api \
  --comment "Regression in tool calls after the latest deploy." \
  --update-optional-context
```

Raw JSON output:

```bash
vtcli opinion add --model gpt-4o --score 1 --json
```

## Next likely additions

- `models` lookup helpers
- machine-readable output and exit codes for agent integrations
- `mcp` or similar agent-facing commands once that contract is clearer
