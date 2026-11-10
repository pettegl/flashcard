// Jest globalSetup: generate fixtures once, before any worker starts, so test files never race
// to regenerate them (TESTSPEC §6 step 1).
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

module.exports = async () => {
  const root = path.resolve(__dirname, '..');
  if (existsSync(path.join(root, 'fixtures', 'content', 'decks'))) return;
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'make-fixtures.mjs')], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`npm run fixtures failed:\n${result.stderr}`);
};
