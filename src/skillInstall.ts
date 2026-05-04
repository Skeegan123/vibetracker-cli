import { spawn } from 'node:child_process';

export const vibetrackerSkillName = 'vibetracker-rate';
export const defaultVibetrackerSkillSource = 'https://github.com/Skeegan123/vibetracker-rate';

export type SkillInstallOptions = {
  agent?: string[];
  copy?: boolean;
  dryRun?: boolean;
  global?: boolean;
  source?: string;
  yes?: boolean;
};

export type SkillInstallCommand = {
  command: string;
  args: string[];
};

export function buildSkillInstallCommand(options: SkillInstallOptions = {}): SkillInstallCommand {
  const source = options.source?.trim() || defaultVibetrackerSkillSource;
  const args = ['--yes', 'skills', 'add', source, '--skill', vibetrackerSkillName];

  if (options.global) {
    args.push('--global');
  }

  for (const agent of options.agent ?? []) {
    const normalizedAgent = agent.trim();

    if (normalizedAgent) {
      args.push('--agent', normalizedAgent);
    }
  }

  if (options.copy) {
    args.push('--copy');
  }

  if (options.yes) {
    args.push('--yes');
  }

  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args,
  };
}

export async function runSkillInstallCommand(command: SkillInstallCommand) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      reject(new Error(`Could not start the skills installer: ${error.message}`));
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (typeof code === 'number') {
        reject(new Error(`The skills installer exited with code ${code}.`));
        return;
      }

      reject(new Error(`The skills installer exited because of signal ${signal ?? 'unknown'}.`));
    });
  });
}

export function formatCommand(command: SkillInstallCommand) {
  return [command.command, ...command.args].map(formatShellArg).join(' ');
}

function formatShellArg(value: string) {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}
