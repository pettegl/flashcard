#!/usr/bin/env node
// Standalone-build audit (DEVSPEC FR-01, §II.3; TESTSPEC BLD-01, PKG-09).
// Usage: node scripts/audit-standalone.mjs [bundleDir] [--root <projectRoot>]
// Exits 1 and lists every violation when the bundle or project breaks a container rule.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_STRINGS = [
  'statsig',
  'googletagmanager',
  'gtag',
  'sentry',
  'workbox',
  'serviceWorker.register',
  'firebase',
  'mixpanel',
  'fbevents',
  'cdn.jsdelivr',
];
const FORBIDDEN_DEPENDENCY = /statsig|googletagmanager|gtag|sentry|workbox|firebase|mixpanel|fbevents|^uuid$/i;
const ALLOWED_RUNTIME_DEPENDENCIES = ['react', 'react-dom'];
// `caches` may only appear in the http branch of the binary loader (DEVSPEC §II.3).
const CACHES_ALLOWED_IN = 'src/platform/loadBinary.ts';
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.txt', '.svg']);

function parseArgs(argv) {
  const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let root = scriptRoot;
  let dir;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = resolve(argv[++i]);
    else dir = resolve(argv[i]);
  }
  return { root, dir: dir ?? join(root, 'dist', 'standalone') };
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

const posix = (p) => p.split('\\').join('/');

function auditBundle(dir, violations) {
  const files = listFiles(dir);
  const rel = (f) => posix(relative(dir, f));
  const indexPath = join(dir, 'index.html');

  if (!existsSync(indexPath)) {
    violations.push(`index.html missing at bundle root (${posix(dir)})`);
    return;
  }

  for (const f of files.filter((f) => f.endsWith('.map'))) violations.push(`source map shipped: ${rel(f)}`);

  const jsFiles = files.filter((f) => extname(f) === '.js');
  const cssFiles = files.filter((f) => extname(f) === '.css');
  if (jsFiles.length === 0) violations.push('no JavaScript bundle found');
  if (cssFiles.length === 0) violations.push('no extracted CSS file found');

  const html = readFileSync(indexPath, 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(m[1]) || m[2].trim() !== '') violations.push('index.html: inline <script>');
  }
  if (/<style\b/i.test(html)) violations.push('index.html: inline <style>');
  if (/\sstyle\s*=/i.test(html)) violations.push('index.html: style="" attribute');
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']?([^"'\s>]+)/gi)) {
    const url = m[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url) && !/^data:/i.test(url)) {
      violations.push(`index.html: non-relative URL ${url}`);
    } else if (url.startsWith('/')) violations.push(`index.html: root-absolute URL ${url}`);
  }
  for (const css of cssFiles) {
    if (!html.includes(rel(css))) violations.push(`index.html does not link ${rel(css)} relatively`);
  }

  for (const f of files) {
    if (!TEXT_EXTENSIONS.has(extname(f))) continue;
    const text = readFileSync(f, 'utf8');
    const lower = text.toLowerCase();
    for (const needle of FORBIDDEN_STRINGS) {
      if (lower.includes(needle.toLowerCase())) violations.push(`${rel(f)}: forbidden string "${needle}"`);
    }
    if (/sourceMappingURL=/.test(text)) violations.push(`${rel(f)}: sourceMappingURL reference`);

    if (extname(f) === '.js') {
      if (/(?<![\w$.])eval\s*\(/.test(text)) violations.push(`${rel(f)}: eval(`);
      if (/new\s+Function\s*\(/.test(text)) violations.push(`${rel(f)}: new Function(`);
      if (/\.p\s*=\s*["']\/["']/.test(text)) violations.push(`${rel(f)}: webpack publicPath "/" (must be "./")`);
    }
    if (extname(f) === '.css') {
      for (const m of text.matchAll(/url\(\s*["']?([^"')\s]+)/gi)) {
        const url = m[1];
        if (url.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
          if (!/^data:/i.test(url)) violations.push(`${rel(f)}: non-relative url(${url})`);
        }
      }
      if (/@import/i.test(text)) violations.push(`${rel(f)}: @import`);
    }
  }
}

function auditDependencies(root, violations) {
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) {
    violations.push('package.json missing');
    return;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (!ALLOWED_RUNTIME_DEPENDENCIES.includes(name)) {
      violations.push(`package.json: runtime dependency "${name}" not allowed (only react, react-dom)`);
    }
  }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (FORBIDDEN_DEPENDENCY.test(name)) violations.push(`package.json ${field}: forbidden dependency "${name}"`);
    }
  }

  // Lockfile: every package that can reach the runtime (i.e. not dev-only) is checked.
  const lockPath = join(root, 'package-lock.json');
  if (!existsSync(lockPath)) {
    violations.push('package-lock.json missing');
    return;
  }
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    if (!path || meta.dev) continue;
    const name = meta.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (FORBIDDEN_DEPENDENCY.test(name)) violations.push(`package-lock.json: forbidden runtime package "${name}"`);
  }
}

function auditSource(root, violations) {
  for (const f of listFiles(join(root, 'src'))) {
    if (!/\.(ts|tsx|js|jsx)$/.test(f)) continue;
    const relPath = posix(relative(root, f));
    const text = readFileSync(f, 'utf8');
    if (/\bcaches\s*[.[]/.test(text) && relPath !== CACHES_ALLOWED_IN) {
      violations.push(`${relPath}: Cache Storage used outside ${CACHES_ALLOWED_IN}`);
    }
    if (/serviceWorker/.test(text)) violations.push(`${relPath}: serviceWorker reference`);
  }
}

function main() {
  const { root, dir } = parseArgs(process.argv.slice(2));
  const violations = [];
  auditBundle(dir, violations);
  auditDependencies(root, violations);
  auditSource(root, violations);

  if (violations.length > 0) {
    console.error(`[audit:standalone] FAILED with ${violations.length} violation(s):`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`[audit:standalone] OK: ${posix(relative(root, dir)) || '.'} is container-compliant`);
}

main();
