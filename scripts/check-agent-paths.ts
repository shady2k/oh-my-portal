#!/usr/bin/env node
/**
 * What an agent may write in the content repository — publishing design §3.
 *
 * This lives in the *engine* repository on purpose. The agent's token reaches
 * the content repository only, so a rule kept here is one it cannot edit. A
 * rule kept beside the articles could be rewritten by the same token that
 * writes them, and the boundary would exist only in the paperwork.
 *
 * One refusal, not an allowlist (publishing design §3, decided 2026-09-11):
 * every other change reaches production only through the maintainer's merge,
 * and the pipeline is the one place where a branch's change takes effect before
 * anyone merges it.
 *
 * Usage: `git diff --name-only <base>...<head> | node scripts/check-agent-paths.ts`
 */

/** Why each refusal is a refusal. A rule without its reason gets deleted in a year. */
const REFUSED: [RegExp, string][] = [
  [
    /^\.github\//,
    'the pipeline itself — a branch runs its own workflows with the repository secrets, so an agent that can edit them can grant itself the storage keys in one commit',
  ],
];

export function offLimits(files: string[]): string[] {
  return files.filter(Boolean).flatMap((file) => {
    const refusal = REFUSED.find(([rule]) => rule.test(file));
    return refusal ? [`${file}: ${refusal[1]}`] : [];
  });
}

if (process.argv[1]?.endsWith('check-agent-paths.ts')) {
  const { readFileSync } = await import('node:fs');
  const files = readFileSync(0, 'utf8')
    .split('\n')
    .map((s) => s.trim());
  const problems = offLimits(files);
  if (problems.length) {
    console.error(`${problems.length} path(s) an agent may not write:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${files.filter(Boolean).length} changed path(s), none in the pipeline.`);
}
