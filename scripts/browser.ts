import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The nix-store chromium, when there is one. Empty on every other platform. */
export function resolveChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dir = readdirSync(root).find((entry) => entry.startsWith('chromium-'));
  if (!dir) return undefined;
  const binary = join(root, dir, 'chrome-linux64', 'chrome');
  return existsSync(binary) ? binary : undefined;
}
