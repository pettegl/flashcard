/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Audit rules for the standalone build (FR-01, DEVSPEC §II.3): BLD-01 checks and the PKG-09 matrix.
const SCRIPT = resolve(__dirname, '../../scripts/audit-standalone.mjs');

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

type Files = Record<string, string>;

const CLEAN_INDEX =
  '<!doctype html><html><head><script defer src="./js/main.1234.js"></script>' +
  '<link href="./css/main.1234.css" rel="stylesheet"></head><body><div id="root"></div></body></html>';

function cleanProject(): Files {
  return {
    'dist/standalone/index.html': CLEAN_INDEX,
    'dist/standalone/js/main.1234.js': '(()=>{var e={};e.p="./";console.log("ok")})();',
    'dist/standalone/css/main.1234.css': '.a{background:url(./img/x.png)}',
    'package.json': JSON.stringify({
      dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
      devDependencies: { webpack: '^5.0.0' },
    }),
    'package-lock.json': JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'flashcard' },
        'node_modules/react': { version: '18.3.1' },
        'node_modules/sockjs/node_modules/uuid': { version: '8.3.2', dev: true },
      },
    }),
    'src/index.tsx': 'export {};',
  };
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'flashcard-audit-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function runAudit(files: Files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  const result = spawnSync(process.execPath, [SCRIPT, join(root, 'dist/standalone'), '--root', root], {
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function withJs(js: string): Files {
  return { ...cleanProject(), 'dist/standalone/js/main.1234.js': js };
}

describe('audit:standalone', () => {
  it('passes a clean bundle (PKG-09a); dev-only lockfile packages are ignored', () => {
    const { status, output } = runAudit(cleanProject());
    expect(output).toContain('OK');
    expect(status).toBe(0);
  });

  it.each(FORBIDDEN_STRINGS)('fails when the bundle contains "%s" (PKG-09b)', (needle) => {
    const { status, output } = runAudit(withJs(`(()=>{var x="${needle}";})();`));
    expect(status).toBe(1);
    expect(output).toContain(`forbidden string "${needle}"`);
  });

  it.each([
    ['dependencies', '@sentry/browser'],
    ['devDependencies', 'firebase'],
    ['devDependencies', 'uuid'],
    ['dependencies', '@statsig/js-client'],
  ])('fails on a forbidden %s entry "%s"', (field, name) => {
    const files = cleanProject();
    const pkg = JSON.parse(files['package.json']);
    pkg[field] = { ...pkg[field], [name]: '1.0.0' };
    const { status, output } = runAudit({ ...files, 'package.json': JSON.stringify(pkg) });
    expect(status).toBe(1);
    expect(output).toContain(`forbidden dependency "${name}"`);
  });

  it('fails on a runtime dependency other than react/react-dom', () => {
    const files = cleanProject();
    const pkg = JSON.parse(files['package.json']);
    pkg.dependencies.lodash = '4.0.0';
    const { status, output } = runAudit({ ...files, 'package.json': JSON.stringify(pkg) });
    expect(status).toBe(1);
    expect(output).toContain('runtime dependency "lodash" not allowed');
  });

  it('fails on a forbidden package in the runtime part of the lockfile', () => {
    const files = cleanProject();
    const lock = JSON.parse(files['package-lock.json']);
    lock.packages['node_modules/uuid'] = { version: '9.0.0' };
    const { status, output } = runAudit({ ...files, 'package-lock.json': JSON.stringify(lock) });
    expect(status).toBe(1);
    expect(output).toContain('forbidden runtime package "uuid"');
  });

  it('allows caches only in src/platform/loadBinary.ts', () => {
    const allowed = runAudit({ ...cleanProject(), 'src/platform/loadBinary.ts': 'caches.open("x");' });
    expect(allowed.status).toBe(0);

    rmSync(root, { recursive: true, force: true });
    root = mkdtempSync(join(tmpdir(), 'flashcard-audit-'));
    const denied = runAudit({ ...cleanProject(), 'src/platform/preload.ts': 'caches.open("x");' });
    expect(denied.status).toBe(1);
    expect(denied.output).toContain('src/platform/preload.ts: Cache Storage used outside');
  });

  it.each<[string, Files, string]>([
    ['a .map file', { 'dist/standalone/js/main.1234.js.map': '{}' }, 'source map shipped'],
    ['an inline <script>', { 'dist/standalone/index.html': CLEAN_INDEX.replace('</body>', '<script>x()</script></body>') }, 'inline <script>'],
    ['an inline <style>', { 'dist/standalone/index.html': CLEAN_INDEX.replace('</head>', '<style>a{}</style></head>') }, 'inline <style>'],
    ['a style="" attribute', { 'dist/standalone/index.html': CLEAN_INDEX.replace('<div id="root">', '<div id="root" style="color:red">') }, 'style="" attribute'],
    ['a root-absolute script src', { 'dist/standalone/index.html': CLEAN_INDEX.replace('./js/', '/js/') }, 'root-absolute URL'],
    ['a CDN script', { 'dist/standalone/index.html': CLEAN_INDEX.replace('./js/main.1234.js', 'https://example.org/a.js') }, 'non-relative URL'],
    ['eval in the bundle', withJs('(()=>{eval("1")})();'), 'eval('],
    ['new Function in the bundle', withJs('(()=>{new Function("return this")})();'), 'new Function('],
    ['webpack publicPath "/"', withJs('(()=>{var e={};e.p="/";})();'), 'publicPath "/"'],
    ['an absolute CSS url()', { 'dist/standalone/css/main.1234.css': '.a{background:url(/img/x.png)}' }, 'non-relative url(/img/x.png)'],
    ['a sourceMappingURL comment', withJs('x();\n//# sourceMappingURL=main.js.map'), 'sourceMappingURL'],
  ])('fails on %s (BLD-01)', (_label, overrides, expected) => {
    const { status, output } = runAudit({ ...cleanProject(), ...overrides });
    expect(status).toBe(1);
    expect(output).toContain(expected);
  });

  it('fails when index.html or the extracted CSS is missing', () => {
    const files = cleanProject();
    delete files['dist/standalone/index.html'];
    expect(runAudit(files).output).toContain('index.html missing');

    rmSync(root, { recursive: true, force: true });
    root = mkdtempSync(join(tmpdir(), 'flashcard-audit-'));
    const noCss = cleanProject();
    delete noCss['dist/standalone/css/main.1234.css'];
    expect(runAudit(noCss).output).toContain('no extracted CSS file found');
  });
});
