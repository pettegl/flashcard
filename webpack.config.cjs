const path = require('node:path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// STANDALONE (container) build is the only supported target today (DEVSPEC §III.2).
const STANDALONE = (process.env.STANDALONE ?? 'true') === 'true';
if (!STANDALONE) {
  throw new Error('[flashcard] Only the STANDALONE=true build is supported.');
}

module.exports = (_env, argv) => {
  const isProd = argv.mode !== 'development';

  return {
    mode: isProd ? 'production' : 'development',
    entry: './src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist/standalone'),
      // FR-01 / CR§2.1: every asset reference must be relative.
      publicPath: './',
      filename: isProd ? 'js/[name].[contenthash:8].js' : 'js/[name].js',
      clean: true,
    },
    // FR-01: no .map files; no eval-based devtool in shipped output.
    devtool: isProd ? false : 'cheap-module-source-map',
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: 'babel-loader',
        },
        {
          test: /\.css$/,
          // FR-01: CSS extracted to a file, never injected as <style>.
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },
    // Keep webpack from emitting a `new Function('return this')` global shim.
    node: { global: false },
    plugins: [
      new webpack.DefinePlugin({ __STANDALONE__: JSON.stringify(STANDALONE) }),
      new HtmlWebpackPlugin({
        template: './src/index.html',
        inject: 'head',
        scriptLoading: 'defer',
      }),
      new MiniCssExtractPlugin({
        filename: isProd ? 'css/[name].[contenthash:8].css' : 'css/[name].css',
      }),
      new CopyWebpackPlugin({
        patterns: [{ from: 'src/assets/fonts', to: 'fonts' }],
      }),
    ],
    performance: { hints: isProd ? 'warning' : false },
    devServer: {
      port: 8080,
      host: 'localhost',
      // FR-02: dev serves the engine with fixture content merged at the root.
      static: [{ directory: path.resolve(__dirname, 'fixtures/content'), publicPath: '/', watch: false }],
      client: { overlay: true },
      hot: false,
      liveReload: true,
    },
  };
};
