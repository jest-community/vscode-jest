const loaderUtils = require('loader-utils');

/**
 * A custom Webpack loader to strip unnecessary dependencies within the jest-snapshot package.
 *
 * This loader targets two main loading scenarios:
 * 1. Dynamic require calls, aka "requireOutside", for specific packages that are not necessary for our use
 *    but may cause runtime errors if they are missing.
 * 2. Direct require calls for specific packages that are not necessary for our use but may cause runtime errors if they are missing.
 *
 * [Motivation]:
 * Since the jest-snapshot package (in v30) is already Webpack bundled, normal Webpack parsing/alias resolution will not work.
 * Therefore, we use this loader to modify the "source" code before it's processed by Webpack.
 *
 * A related jest issue: https://github.com/facebook/jest/issues/11894 regarding requireOutside.
 *
 * @param {string} source - The source code to be transformed.
 */
module.exports = function (source) {
  this.cacheable();
  const options = loaderUtils.getOptions(this);
  const replacements = options.replacements;

  let replacedSource = source;

  replacements.forEach(({ packageName, replacement }) => {
    const regex = new RegExp(
      `require\\(require\\.resolve\\(['"]${packageName}['"],\\s*{[^}]*}\\)\\)`,
      'g'
    );
    if (regex.test(replacedSource)) {
      replacedSource = replacedSource.replace(regex, `require('${replacement}')`);
    }

    // Also replace direct require statements
    const directRequireRegex = new RegExp(`__webpack_require__\\(['"]${packageName}['"]\\)`, 'g');
    if (directRequireRegex.test(replacedSource)) {
      replacedSource = replacedSource.replace(directRequireRegex, `require('${replacement}')`);
    }
  });

  return replacedSource;
};
