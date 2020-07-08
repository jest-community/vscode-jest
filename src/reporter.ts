// Custom Jest reporter used by jest-vscode extension
class VSCodeJestReporter {
  onRunStart() {
    // tslint:disable-next-line: no-console
    console.log('onRunStart');
  }
  onRunComplete() {
    // tslint:disable-next-line: no-console
    console.log('onRunComplete');
  }
}

module.exports = VSCodeJestReporter;
