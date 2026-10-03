#!/usr/bin/env node
// check-credentials.mjs (I-44f): every credential the committed workflows reference must exist in n8n before any
// workflow is activated. n8n checks credentials per workflow at activation and at the webhook pre-execution check:
// ONE missing credential blocks the WHOLE workflow, including its GET verify webhooks (RUN-LOCAL-NO-DOCKER.md 4c).
//
// Required list: scanned from automation/W*.json (node.credentials: {<type>: {name}}), the same scan
// automation/local/CREDENTIALS.md is tested against (automation/tests/credentials.test.mjs).
// Present list: "name<TAB>type" lines on stdin, NAMES AND TYPES ONLY (never the encrypted data column):
//   docker compose ... exec -T postgres sh -c 'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
//     -c "select name || chr(9) || type from credentials_entity"' | node automation/vps/check-credentials.mjs
// Used by provision.sh step 7 (after the restore, before n8n starts and activates anything) and on the laptop.
//   node automation/vps/check-credentials.mjs --list      # print the required list (TSV: type, name, workflows)
// Exit 0 = all present; 1 = something missing (each line names the type, the credential and the workflows it blocks).
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTOMATION = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = (type, name) => `${type}\t${name}`;

/** Map "type<TAB>name" -> sorted workflow ids (W01..) that reference it. */
export function requiredCredentials(dir = AUTOMATION) {
  const req = new Map();
  for (const f of readdirSync(dir).filter((x) => /^W\d\d\.json$/.test(x)).sort()) {
    const wf = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const n of wf.nodes || []) {
      for (const [type, c] of Object.entries(n.credentials || {})) {
        if (!c || !c.name) continue;
        const k = KEY(type, c.name);
        if (!req.has(k)) req.set(k, new Set());
        req.get(k).add(f.slice(0, 3));
      }
    }
  }
  return new Map([...req].sort(([a], [b]) => a.localeCompare(b)).map(([k, s]) => [k, [...s].sort()]));
}

/** Parse "name<TAB>type" lines (psql -At output) into a Set of "type<TAB>name". */
export function parsePresent(text) {
  const out = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const i = line.lastIndexOf('\t');
    if (i < 0) continue;
    out.add(KEY(line.slice(i + 1).trim(), line.slice(0, i)));
  }
  return out;
}

/** Required entries missing from the present set: [{ type, name, workflows }]. */
export function missingCredentials(required, present) {
  const miss = [];
  for (const [k, workflows] of required) {
    if (present.has(k)) continue;
    const [type, name] = k.split('\t');
    miss.push({ type, name, workflows });
  }
  return miss;
}

async function main(argv) {
  const required = requiredCredentials();
  if (argv.includes('--list')) {
    for (const [k, w] of required) process.stdout.write(`${k}\t${w.join(',')}\n`);
    return 0;
  }
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const miss = missingCredentials(required, parsePresent(input));
  if (!miss.length) { console.log(`credentials OK: ${required.size}/${required.size} present (name + type)`); return 0; }
  for (const m of miss) console.log(`MISSING credential: ${m.type} "${m.name}" (blocks ${m.workflows.join(', ')})`);
  console.log(`credentials: ${miss.length} of ${required.size} missing. Create them in the n8n UI from .env (automation/local/CREDENTIALS.md), then re-run.`);
  return 1;
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 2; });
}
