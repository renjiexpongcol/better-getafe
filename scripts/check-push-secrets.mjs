import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export function outgoingEnvironmentFiles(base = 'origin/update-portal', cwd = root) {
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  const parent = git(['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim();
  const commits = git(['rev-list', `${parent}..HEAD`]).trim().split('\n').filter(Boolean);
  const findings = [];
  for (const commit of commits) {
    for (const file of git(['ls-tree', '-r', '--name-only', '-z', commit]).split('\0').filter(Boolean)) {
      const name = path.posix.basename(file);
      if (/^\.env(?:\.|$)/.test(name) && !['.env.example', '.env.sample', '.env.template'].includes(name)) findings.push({ commit, file });
    }
  }
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const findings = outgoingEnvironmentFiles(process.argv[2]);
    for (const { commit, file } of findings) console.error(`[Push] ${commit.slice(0, 8)}:${file} contains a runtime environment file. Remove it from the introducing commit, not only the latest tree.`);
    if (findings.length) process.exitCode = 1;
    else console.info('[Push] No runtime environment files in outgoing commits. Run the credential scan before pushing.');
  } catch {
    console.error('[Push] Could not inspect outgoing commits. Fetch the intended remote branch and pass its ref explicitly.');
    process.exitCode = 1;
  }
}
