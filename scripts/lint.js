const { Linter, Configuration } = require('tslint');
const fs = require('fs');
const glob = require('glob');

const linter = new Linter({
    formatter: 'prose',
});
const configuration = Configuration.findConfiguration(null, './').results;

glob.sync('**/*.ts', { ignore: ['**/*.d.ts', 'node_modules/**'] }).forEach(file => {
    const fileContents = fs.readFileSync(file, 'utf8');
    linter.lint(file, fileContents, configuration);
});

const results = linter.getResult();
console.error(results.output);
process.exit((results.failures.length + results.fixes.length) === 0 ? 0 : 1);
