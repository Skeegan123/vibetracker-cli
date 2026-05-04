# vtcli

A command-line tool for submitting opinions about AI models to [Vibetracker](https://vibetracker.app). Rate models, leave comments, and track sentiment -- all from your terminal.

## Install

```bash
npm install -g vibetracker-cli
```

Requires Node.js 18 or later.

## Quick start

Sign in through your browser:

```bash
vtcli auth login
```

This opens a browser window where you approve the CLI. Once confirmed, you're authenticated and ready to go.

Submit an opinion:

```bash
vtcli opinion add --model gpt-4o --score 1
```

Scores are `-1` (negative), `0` (neutral), or `1` (positive).

Install the Vibetracker agent skill for Codex, Claude Code, Cursor, OpenCode, and other skill-compatible agents:

```bash
vtcli skill install
```

## Commands

### `vtcli auth`

| Command | Description |
|---|---|
| `vtcli auth login` | Sign in via browser |
| `vtcli auth login --api-key <key>` | Authenticate with an API key (useful for CI) |
| `vtcli auth logout` | Remove stored credentials |
| `vtcli auth status` | Show current auth info |

### `vtcli opinion`

| Command | Description |
|---|---|
| `vtcli opinion add --model <slug> --score <-1\|0\|1>` | Submit an opinion |

Optional flags for `opinion add`:

| Flag | Description |
|---|---|
| `--use-case <value>` | What you were doing (e.g. `coding`) |
| `--interface <value>` | How you used the model (e.g. `api`) |
| `--tool-id <value>` | Tool identifier (e.g. `openai-api`) |
| `--comment <text>` | Free-text comment |
| `--json` | Output raw JSON instead of a summary |
| `--update-optional-context` | Update context on an existing opinion |

Validation behavior:

- `--model` accepts either a canonical full slug like `openai/gpt-4o` or an unambiguous short slug like `gpt-4o`
- `--model` also accepts punctuation-only separator variants like `claude-sonnet-4-6` when they map to exactly one active model
- invalid or ambiguous model slugs return clear errors
- `--interface` and `--tool-id` are checked against the server's active option catalog when available
- `--tool-name-other` is only valid together with `--tool-id other`

Example with full context:

```bash
vtcli opinion add \
  --model gpt-4o \
  --score -1 \
  --use-case coding \
  --interface api \
  --tool-id openai-api \
  --comment "Regression in tool calls after the latest deploy."
```

### `vtcli options`

| Command | Description |
|---|---|
| `vtcli options list --type model --search <query>` | Search active model slugs |
| `vtcli options list --type interface` | List valid interface values |
| `vtcli options list --type use-case` | List valid use-case values |
| `vtcli options list --type tool` | List tools grouped by interface |
| `vtcli options list --type tool --interface <value>` | List tools for one interface |

Add `--json` to any `options list` command for machine-readable output.
Without `--search`, the model list command shows a summary instead of dumping the full catalog in human-readable mode.

### `vtcli skill`

| Command | Description |
|---|---|
| `vtcli skill install` | Install the `vibetracker-rate` agent skill through the open `skills` installer |
| `vtcli skill install --global` | Install the skill globally instead of into the current project |
| `vtcli skill install --agent codex` | Install to a specific agent; repeat `--agent` for multiple agents |
| `vtcli skill install --source <url>` | Install from a fork or alternate source |

The command delegates to `npx skills add`, so the existing skills installer still handles agent detection, install scope, symlink/copy behavior, and prompts.

### `vtcli config`

| Command | Description |
|---|---|
| `vtcli config show` | Show current configuration |
| `vtcli config set-base-url <url>` | Point the CLI at a different server |

## Configuration

Credentials and settings are stored in `~/.vtcli/config.json` with restricted file permissions.

Environment variables override the config file:

| Variable | Purpose |
|---|---|
| `VTCLI_API_KEY` | Use this API key instead of the stored one |
| `VTCLI_BASE_URL` | Use this base URL instead of the default |

## Development

```bash
git clone <repo-url>
cd vibetracker-cli
npm install
```

Run without building:

```bash
npm run dev -- --help
```

Build and link globally:

```bash
npm run build
npm link
vtcli --help
```

## License

See [LICENSE](LICENSE) for details.
