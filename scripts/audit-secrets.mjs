import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

// Offline history scan. Only locations and hashes leave this process.
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['provider-api-key', /\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|AIza[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['credential-url', /\b(?:postgres(?:ql)?|rediss?):\/\/[^\s:@'"`]+:([^\s@'"`]{8,})@[^\s'"`]+/g],
  ['azure-account-key', /AccountKey=([A-Za-z0-9+/]{64,}={0,2})/gi],
  ['assigned-secret', /\b(?:AUTH_SESSION_SECRET|CMS_SESSION_SECRET|SETTINGS_ENCRYPTION_KEY|B2_APPLICATION_KEY|GOOGLE_CLIENT_SECRET|SMTP_PASSWORD)\s*[:=]\s*['"]?([A-Za-z0-9_+\/.=-]{24,})/g],
];
const ignored = /fixture|example|replace|change-this|test-secret|your-|\$\{|process\.env|undefined/i;
const output = [];
let commit = '', file = '', line = 0;
const scan = (text, source, history = false) => {
  for (const value of text.split('\n')) {
    if (history) {
      if (value.startsWith('SCAN_COMMIT ')) { commit=value.slice(12).trim(); continue; }
      if (value.startsWith('+++ b/')) { file=value.slice(6); continue; }
      if (value.startsWith('@@')) { line=Number(value.match(/\+(\d+)/)?.[1] || 0); continue; }
      if (!value.startsWith('+') || value.startsWith('+++')) { if (!value.startsWith('-')) line++; continue; }
    } else { file=source; line++; }
    for (const [rule, pattern] of rules) {
      pattern.lastIndex=0;
      for (const match of value.matchAll(pattern)) {
        const credential=match[1] || match[0];
        if (ignored.test(credential)) continue;
        output.push({ rule, file, line, commit: history ? commit : 'working-tree', fingerprint:createHash('sha256').update(credential).digest('hex').slice(0,16), fixturePossible:/test|example|docs|\.md$/.test(file) });
      }
    }
    if (history) line++;
  }
};
const hasGit = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', windowsHide: true }).status === 0;
const files = [];
if (hasGit) {
  const history=execFileSync('git',['log','--all','--format=SCAN_COMMIT %H','-p','--no-ext-diff','--unified=0','--','.',' :(exclude)package-lock.json'.trim(),':(exclude)artifacts/**'],{encoding:'utf8',maxBuffer:256*1024*1024,windowsHide:true});
  scan(history,'git-history',true);
  files.push(...execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean));
} else {
  // Uploaded build sources intentionally omit Git metadata and private env files.
  async function walk(directory = '.') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (['node_modules', '.git', '.vercel', 'dist', 'build', 'artifacts', '.cache'].includes(entry.name)) continue;
      if (directory === '.' && ['data', 'uploads', 'tmp', 'temp'].includes(entry.name)) continue;
      if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
      const file = directory === '.' ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  await walk();
}
const textFiles = files.filter(file=>/\.(?:js|mjs|jsx|json|md|sql|ya?ml|env|txt|example)$|(?:^|\/)\.env/.test(file) && !file.startsWith('artifacts/'));
for (const path of textFiles) { try { const data=await fs.readFile(path,'utf8'); if(data.length<2000000) {line=0;scan(data,path);} } catch { /* A concurrent working-tree deletion is not a scanned file. */ } }
const unique=[...new Map(output.map(row=>[JSON.stringify(row),row])).values()];
await fs.mkdir('artifacts/production-readiness',{recursive:true});
await fs.writeFile('artifacts/production-readiness/secret-scan.json',JSON.stringify({scope:hasGit ? 'all reachable Git history plus tracked and unignored working-tree text files; heuristic scan' : 'uploaded source text files; Git history unavailable in this build; heuristic scan',commits:hasGit ? Number(execFileSync('git',['rev-list','--all','--count'],{encoding:'utf8'})) : null,candidates:unique},null,2));
console.log(JSON.stringify({candidates:unique.length,nonFixtureCandidates:unique.filter(item=>!item.fixturePossible).length,report:'artifacts/production-readiness/secret-scan.json'}));
