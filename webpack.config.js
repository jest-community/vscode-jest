'use strict';

const path = require('path');
// const IgnoreDynamicRequire = require('webpack-ignore-dynamic-require');

/**@returns {import('webpack').Configuration}*/
module.exports = () => {
  /**@type {any} */
  const externals = [
    { 'jest-config': 'root {}' }, // the jest-config module isn't utilized in this plugin, compiling it would result in unnecessary overhead and errors
    { vscode: 'commonjs vscode' }, // the vscode-module is created on-the-fly and must be excluded.
    'fsevents', // extension will not need to do any 'watch' directly, no need for this library
    'typescript',
  ];

  return {
    context: __dirname,
    target: 'node',
    entry: {
      extension: './src/extension.ts',
      reporter: './src/reporter.ts',
    },
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

      // jest (espeically jest-snapshot) 27.x mark some dependency to be external, such as @babel/traverse, which
      // conflict with the tool-chain like this one that all dependency will need to be resolved and bundled.
      // Fortunatelly we do not need those part of the system (via jest-editor-support), therefore can skip
      // the troublesome dependency as a workaround for now. Also helped reduce the bundle size.
      // related jest issues: https://github.com/facebook/jest/issues/11894

      alias: {
        '@jest/transform': false,
        './InlineSnapshots': false,
        'babel-preset-current-node-syntax': false,
      },
    },
    module: {
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
