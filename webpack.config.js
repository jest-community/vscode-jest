'use strict';

const path = require('path');
const IgnoreDynamicRequire = require('webpack-ignore-dynamic-require');

/**@returns {import('webpack').Configuration}*/
module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isDevelopment = !isProduction;

  /**@type {any} */
  const externals = [
    { 'jest-config': 'root {}' }, // the jest-config module isn't utilized in this plugin, compiling it would result in unnecessary overhead and errors
    { vscode: 'commonjs vscode' }, // the vscode-module is created on-the-fly and must be excluded.
    { fsevents: 'fsevents' }, // extension will not need to do any 'watch' directly, no need for this library
    'typescript',
  ];

  // during development keep the largest external dependencies out of the bundle in order to speed up build time
  if (isDevelopment) {
    externals.push('typescript');
  }
  return {
    context: __dirname,
    target: 'node',
    entry: {
      extension: './src/extension.ts',
      reporter: './src/reporter.ts',
    },
    plugins: [new IgnoreDynamicRequire()],
    output: {
      path: path.resolve(__dirname, 'out'),
      filename: '[name].js',
      libraryTarget: 'commonjs2',
      devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    devtool: 'source-map',
    externals,
    resolve: {
      extensions: ['.ts', '.js'],
    },
    module: {
      noParse: [/babel-preset-current-node-syntax\/src\/index\.js/],
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [{ loader: 'ts-loader' }],
        },
        {
          test: /\.svg$/,
          use: [{ loader: 'raw-loader' }],
        },
      ],
    },
  };
};
