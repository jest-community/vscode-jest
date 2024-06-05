'use strict';

const path = require('path');
const glob = require('glob');

/**@returns {import('webpack').Configuration}*/
module.exports = (env) => {
  /**@type {any} */
  const externals = [
    { 'jest-config': 'root {}' }, // the jest-config module isn't utilized in this plugin, compiling it would result in unnecessary overhead and errors
    { vscode: 'commonjs vscode' }, // the vscode-module is created on-the-fly and must be excluded.
    'fsevents', // extension will not need to do any 'watch' directly, no need for this library
    'typescript',
  ];

  // Function to find files matching a pattern within a specific package
  function addMatchingFiles(packageName, filePattern) {
    const files = glob.sync(`node_modules/**/${packageName}/${filePattern}`, { absolute: true });
    return files;
  }

  const replacements = [
    { packageName: '@babel/generator', replacement: path.resolve(__dirname, './dummy-module.js') },
    { packageName: '@babel/core', replacement: path.resolve(__dirname, './dummy-module.js') },
    {
      packageName: './src/InlineSnapshots.ts',
      replacement: path.resolve(__dirname, './dummy-module.js'),
    },
  ];

  const tsConfigFile = env.production ? 'tsconfig.prod.json' : 'tsconfig.json';

  return {
    context: path.resolve(__dirname, '..'), // Adjusted to point to the root of the project
    target: 'node',
    entry: {
      extension: path.resolve(__dirname, '../src/extension.ts'),
      reporter: path.resolve(__dirname, '../src/reporter.ts'),
    },
    output: {
      path: path.resolve(__dirname, '../out'), // Adjusted to ensure output is correct
      filename: '[name].js',
      libraryTarget: 'commonjs2',
      devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    devtool: 'source-map',
    externals,
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@jest/transform': false,
        'babel-preset-current-node-syntax': false,
      },
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                configFile: path.resolve(__dirname, `../${tsConfigFile}`),
              },
            },
          ],
        },
        {
          test: /\.svg$/,
          use: [{ loader: 'raw-loader' }],
        },
        {
          test: /\.js$/,
          include: [...addMatchingFiles('jest-snapshot', '**/*.js')],
          use: [
            {
              loader: path.resolve(__dirname, './jest-snapshot-loader.js'),
              options: { replacements },
            },
          ],
        },
      ],
    },
  };
};
