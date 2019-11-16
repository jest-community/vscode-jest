class VSCodeJestReporter {
  onRunStart(_results) {
    // tslint:disable-next-line: no-console
    console.log('onRunStart')
  }
  onRunComplete(_contexts, _results) {
    // tslint:disable-next-line: no-console
    console.log('onRunComplete')
  }
}

module.exports = VSCodeJestReporter
