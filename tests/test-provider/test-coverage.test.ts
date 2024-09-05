jest.unmock('../../src/test-provider/test-coverage');

import * as vscode from 'vscode';
import { JestFileCoverage, JestTestCoverageProvider } from '../../src/test-provider/test-coverage';
import { createFileCoverage } from 'istanbul-lib-coverage';

const createFileCoverageMock = (): any => ({
  path: '/path/to/file',
  toSummary: jest.fn().mockReturnValue({
    lines: { covered: 10, total: 20 },
    branches: { covered: 5, total: 10 },
    functions: { covered: 3, total: 5 },
  }),
  statementMap: {
    '1': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
    '2': { start: { line: 2, column: 0 }, end: { line: 2, column: 20 } },
  },
  s: { '1': 5, '2': 3, '3': 2 },
  branchMap: {
    '1': {
      locations: [
        { start: { line: 1, column: 0 }, end: { line: 1, column: 5 } },
        { start: { line: 2, column: 10 }, end: { line: 2, column: 15 } },
      ],
      type: 'if',
    },
  },
  b: { '1': [1, 0] },
  fnMap: {
    '1': {
      name: 'testFunction',
      loc: { start: { line: 1, column: 0 }, end: { line: 3, column: 10 } },
    },
  },
  f: { '1': 2 },
});

describe('test-coverage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    vscode.Uri.file = jest.fn().mockImplementation((path) => ({ fsPath: path }));
    (vscode.TestCoverageCount as jest.Mocked<any>).mockImplementation((covered, total) => ({
      covered,
      total,
    }));
    (vscode.Range as jest.Mocked<any>).mockImplementation((sl, sc, el, ec) => ({
      start: { line: sl, column: sc },
      end: { line: el, column: ec },
    }));
    (vscode.StatementCoverage as jest.Mocked<any>).mockImplementation(
      (count, location, branches) => ({
        count,
        location,
        branches: branches ?? [],
      })
    );
    (vscode.BranchCoverage as jest.Mocked<any>).mockImplementation((count, location, label) => ({
      count,
      location,
      label,
    }));
    (vscode.DeclarationCoverage as jest.Mocked<any>).mockImplementation(
      (name, count, location) => ({
        name,
        count,
        location,
      })
    );
    (createFileCoverage as jest.Mocked<any>).mockImplementation((data) => {
      return data;
    });
  });

  describe('JestFileCoverage', () => {
    let jestFileCoverage: JestFileCoverage;
    let fileCoverageMock: any;

    beforeEach(() => {
      fileCoverageMock = createFileCoverageMock();

      jestFileCoverage = new JestFileCoverage(fileCoverageMock);
    });

    it('is an instance of vscode.FileCoverage', () => {
      expect(jestFileCoverage).toBeInstanceOf(JestFileCoverage);
      expect(vscode.FileCoverage).toHaveBeenCalledWith(
        vscode.Uri.file(fileCoverageMock.path),
        new vscode.TestCoverageCount(10, 20),
        new vscode.TestCoverageCount(5, 10),
        new vscode.TestCoverageCount(3, 5)
      );
    });

    it('should return the raw coverage', () => {
      expect(jestFileCoverage.rawCoverage).toEqual(fileCoverageMock);
    });

    describe('loadDetails', () => {
      it('should return the details if already loaded', () => {
        const detailsMock = [new vscode.StatementCoverage(5, new vscode.Range(0, 0, 0, 10))];
        jestFileCoverage['details'] = detailsMock;

        const details = jestFileCoverage.loadDetails();

        expect(details).toEqual(detailsMock);
      });

      it('should load and return the details', () => {
        const details = jestFileCoverage.loadDetails();

        expect(details).toEqual([
          new vscode.StatementCoverage(5, new vscode.Range(0, 0, 0, 10), [
            new vscode.BranchCoverage(true, new vscode.Range(0, 0, 0, 5), '"IF" (ID: 1, Path: 1)'),
          ]),
          new vscode.StatementCoverage(3, new vscode.Range(1, 0, 1, 20), [
            new vscode.BranchCoverage(
              false,
              new vscode.Range(1, 10, 1, 15),
              '"IF" (ID: 1, Path: 2)'
            ),
          ]),
          new vscode.DeclarationCoverage('testFunction', 2, new vscode.Range(0, 0, 2, 10)),
        ]);
      });

      describe('handle invalid data', () => {
        it('if statementMap location has no end column, it should use the start column', () => {
          fileCoverageMock = createFileCoverageMock();
          fileCoverageMock.statementMap['3'] = {
            start: { line: 3, column: 0 },
            end: { line: 3, column: null },
          };
          jestFileCoverage = new JestFileCoverage(fileCoverageMock);
          const details = jestFileCoverage.loadDetails();
          const statement: any = details.find((d: any) => d.location.start.line === 2);
          expect(statement.location.end.column).toBe(statement.location.start.column);
        });
        it('if branchMap location has no end column, it should use the eol from statement coverage', () => {
          fileCoverageMock = createFileCoverageMock();
          fileCoverageMock.branchMap['1'].locations[0].end.column = null;
          jestFileCoverage = new JestFileCoverage(fileCoverageMock);
          const details = jestFileCoverage.loadDetails();
          const branch: any = details.find((d: any) => d.branches?.[0].location.start.line === 0);

          // statement line 1's end column is 10
          expect(branch.location.end.column).toBe(10);
        });
        it('if function location has no end column, it should use the eol from statement coverage', () => {
          fileCoverageMock = createFileCoverageMock();
          fileCoverageMock.fnMap['1'].loc.end.column = null;
          jestFileCoverage = new JestFileCoverage(fileCoverageMock);
          const details = jestFileCoverage.loadDetails();
          const func: any = details.find((d: any) => d.location.start.line === 0);

          // statement line 1's end column is 10
          expect(func.location.end.column).toBe(10);
        });
      });
      it('if exception occurs, it will returns empty array', () => {
        (vscode.Range as jest.Mocked<any>).mockImplementation(() => {
          throw new Error('Test error');
        });
        const saved = console.error;
        console.error = jest.fn();

        fileCoverageMock = createFileCoverageMock();
        jestFileCoverage = new JestFileCoverage(fileCoverageMock);
        expect(jestFileCoverage.loadDetails()).toEqual([]);
        expect(console.error).toHaveBeenCalled();
        console.error = saved;
      });
      describe('will skip empty ranges', () => {
        it('for statements', () => {
          fileCoverageMock = createFileCoverageMock();
          fileCoverageMock.statementMap['3'] = {
            start: {},
            end: {},
          };
          jestFileCoverage = new JestFileCoverage(fileCoverageMock);
          jestFileCoverage.loadDetails();
          expect(vscode.StatementCoverage).toHaveBeenCalledTimes(2);
        });
        it('for branches', () => {
          fileCoverageMock = createFileCoverageMock();
          fileCoverageMock.branchMap['1'].locations[1] = { start: {}, end: {} };
          jestFileCoverage = new JestFileCoverage(fileCoverageMock);
          jestFileCoverage.loadDetails();
          expect(vscode.BranchCoverage).toHaveBeenCalledTimes(1);
        });
        it('for functions', () => {
          fileCoverageMock = createFileCoverageMock();
          fileCoverageMock.fnMap['1'].loc = { start: {}, end: {} };
          jestFileCoverage = new JestFileCoverage(fileCoverageMock);
          jestFileCoverage.loadDetails();
          expect(vscode.DeclarationCoverage).toHaveBeenCalledTimes(0);
        });
      });
    });
  });

  describe('JestTestCoverageProvider', () => {
    const createMockRun = () => ({ addCoverage: jest.fn() });
    let mockEvents: any;
    let mockSubscription: any;
    let mockRun: any;
    beforeEach(() => {
      mockRun = createMockRun();
      mockSubscription = { dispose: jest.fn() };
      mockEvents = {
        onTestDataAvailable: { event: jest.fn().mockReturnValue(mockSubscription) },
      };
    });

    describe('handle test data available event', () => {
      it('register for the event upon creation', () => {
        new JestTestCoverageProvider(mockEvents);
        expect(mockEvents.onTestDataAvailable.event).toHaveBeenCalled();
      });
      it('will dispose the subscription on dispose', () => {
        const provider = new JestTestCoverageProvider(mockEvents);
        provider.dispose();
        expect(mockSubscription.dispose).toHaveBeenCalled();
      });
      describe('onTestDataAvailable', () => {
        describe('extract coverage data from test data and add to run', () => {
          it.each`
            case | hasCoverage | process                                   | doNothing
            ${1} | ${false}    | ${{}}                                     | ${true}
            ${2} | ${false}    | ${{ userData: {} }}                       | ${true}
            ${3} | ${false}    | ${{ userData: { run: createMockRun() } }} | ${true}
            ${4} | ${true}     | ${{}}                                     | ${true}
            ${5} | ${true}     | ${{ userData: {} }}                       | ${true}
            ${6} | ${true}     | ${{ userData: { run: createMockRun() } }} | ${false}
          `('case $case', ({ hasCoverage, process, doNothing }) => {
            const data = hasCoverage ? { coverageMap: { '1': createFileCoverageMock() } } : {};
            const event: any = {
              data,
              process,
            };
            new JestTestCoverageProvider(mockEvents);
            const onTestDataAvailable = mockEvents.onTestDataAvailable.event.mock.calls[0][0];
            onTestDataAvailable(event);
            if (doNothing) {
              expect(vscode.FileCoverage).not.toHaveBeenCalled();
              expect(mockRun.addCoverage).not.toHaveBeenCalled();
            } else {
              expect(vscode.FileCoverage).toHaveBeenCalledTimes(1);
              expect(process.userData.run.addCoverage).toHaveBeenCalledTimes(1);
            }
          });
        });
      });
    });
    describe('loadDetailedCoverage', () => {
      it('expect a JestFileCoverage', async () => {
        expect.hasAssertions();

        const provider = new JestTestCoverageProvider(mockEvents);
        await expect(provider.loadDetailedCoverage({} as any)).rejects.toThrow(
          /Invalid file coverage object/
        );
      });
      it('should return the details', async () => {
        const provider = new JestTestCoverageProvider(mockEvents);
        const fileCoverage = new JestFileCoverage(createFileCoverageMock());
        const details = await provider.loadDetailedCoverage(fileCoverage);
        expect(details.length > 0).toBeTruthy();
      });
    });
  });
});
