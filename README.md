# vtcli

A command-line tool for submitting opinions about AI models to [Vibetracker](https://vibetracker.app). Rate models, leave comments, and track sentiment -- all from your terminal.

## Install

```bash
npm install -g vtcli
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
