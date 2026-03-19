import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

export async function promptForValue(message: string) {
  const rl = createInterface({ input, output });

  try {
    return (await rl.question(message)).trim();
  } finally {
    rl.close();
  }
}
