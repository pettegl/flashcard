// Browser targets come from the "browserslist" field in package.json (NFR-07).
// Jest runs under Node, so tests target the current Node version instead.
module.exports = (api) => {
  const isTest = api.env('test');
  api.cache.using(() => isTest);
  return {
    presets: [
      [
        '@babel/preset-env',
        isTest ? { targets: { node: 'current' } } : { bugfixes: true, modules: false },
      ],
      ['@babel/preset-react', { runtime: 'automatic' }],
      '@babel/preset-typescript',
    ],
  };
};
