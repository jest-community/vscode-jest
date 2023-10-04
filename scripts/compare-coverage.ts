import * as fs from 'fs-extra';

interface JestCoverageData {
  statementMap: Record<string, { start: { line: number } }>;
  s: Record<string, number>;
}

interface ComparisonData {
  metrics: {
    [metric: string]: {
      oldCoverage: number;
      newCoverage: number;
      diff: number;
    };
  };
  lostLines: number[];
}

async function readCoverageData(directory: string): Promise<Record<string, JestCoverageData>> {
  const filePath = `${directory}/coverage-final.json`;
  if (!fs.existsSync(filePath)) {
    console.error(`File ${filePath} does not exist.`);
    process.exit(1);
  }
  const rawData = await fs.readJSON(filePath);
  return rawData;
}

function findLostCoverage(oldData: JestCoverageData, newData: JestCoverageData): number[] {
  const lostLines: number[] = [];

  for (const [id, oldCount] of Object.entries(oldData.s)) {
    const newCount = newData.s[id];
    if (oldCount > 0 && (newCount === undefined || newCount === 0)) {
      lostLines.push(oldData.statementMap[id].start.line);
    }
  }

  return lostLines;
}

function generateHTMLReport(
  comparisonData: Record<string, ComparisonData>,
  totalOldCoverage: number,
  totalNewCoverage: number
): void {
  let html = '<html><head><title>Coverage Comparison</title>';
  // Add some CSS styles for padding and selective centering
  html += '<style>td, th { padding: 8px; } td.center, th.center { text-align: center; }</style>';
  html += '</head><body>';
  html += '<h1>Coverage Comparison Report</h1>';

  // Total coverage change summary
  const totalDiff = totalNewCoverage - totalOldCoverage;
  const summaryColor = totalDiff < 0 ? 'red' : totalDiff > 0 ? 'green' : 'black';
  html += '<h2>Summary</h2>';
  html +=
    '<table border="1"><tr><th class="center">Metric</th><th class="center">Old Coverage</th><th class="center">New Coverage</th><th class="center">Change</th></tr>';
  html += `<tr><td class="center">Total Coverage</td><td class="center">${totalOldCoverage.toFixed(
    2
  )}%</td><td class="center">${totalNewCoverage.toFixed(
    2
  )}%</td><td class="center" style="color:${summaryColor};">${totalDiff.toFixed(2)}%</td></tr>`;
  html += '</table>';

  // Table for all files
  html += '<h2>All Files</h2>';
  html +=
    '<table border="1"><tr><th>File</th><th class="center">Old Coverage</th><th class="center">New Coverage</th><th class="center">Diff</th></tr>';

  for (const [filePath, data] of Object.entries(comparisonData) as [string, ComparisonData][]) {
    const diff = data.metrics['Statement Coverage'].diff;
    const color = diff < 0 ? 'red' : diff > 0 ? 'green' : 'black';
    html += `<tr style="color:${color};"><td>${filePath}</td><td class="center">${data.metrics[
      'Statement Coverage'
    ].oldCoverage.toFixed(2)}%</td><td class="center">${data.metrics[
      'Statement Coverage'
    ].newCoverage.toFixed(2)}%</td><td class="center">${data.metrics[
      'Statement Coverage'
    ].diff.toFixed(2)}%</td></tr>`;
  }

  html += '</table>';

  // Table for files that lost coverage
  html += '<h2>Files That Lost Overall Coverage</h2>';
  html += '<table border="1"><tr><th>File</th><th class="center">Lost Lines</th></tr>';

  for (const [filePath, data] of Object.entries(comparisonData) as [string, ComparisonData][]) {
    if (data.metrics['Statement Coverage'].diff < 0) {
      // Only include files with overall loss in coverage
      if (data.lostLines.length > 0) {
        html += `<tr><td>${filePath}</td><td class="center">${data.lostLines.join(', ')}</td></tr>`;
      }
    }
  }

  html += '</table>';
  html += '</body></html>';

  fs.writeFileSync('coverage_comparison_report.html', html);
}

async function main(): Promise<void> {
  const oldDir = process.argv[2];
  const newDir = process.argv[3];

  if (!oldDir || !newDir) {
    console.log('Usage: ts-node script.ts <old_coverage_dir> <new_coverage_dir>');
    return;
  }

  const oldData = await readCoverageData(oldDir);
  const newData = await readCoverageData(newDir);

  const comparisonData: Record<string, ComparisonData> = {};

  let totalOldCoverage = 0;
  let totalNewCoverage = 0;
  let fileCount = 0;

  for (const [filePath, oldCoverage] of Object.entries(oldData)) {
    const newCoverage = newData[filePath];
    if (!newCoverage) {
      console.log(`File ${filePath} is missing in the new coverage data.`);
      continue;
    }

    const lostLines = findLostCoverage(oldCoverage, newCoverage);

    const oldStatementCoverage =
      (Object.values(oldCoverage.s).filter((v) => v > 0).length /
        Object.keys(oldCoverage.s).length) *
      100;
    const newStatementCoverage =
      (Object.values(newCoverage.s).filter((v) => v > 0).length /
        Object.keys(newCoverage.s).length) *
      100;
    const statementDiff = newStatementCoverage - oldStatementCoverage;

    comparisonData[filePath] = {
      metrics: {
        'Statement Coverage': {
          oldCoverage: oldStatementCoverage,
          newCoverage: newStatementCoverage,
          diff: statementDiff,
        },
      },
      lostLines,
    };

    totalOldCoverage += oldStatementCoverage;
    totalNewCoverage += newStatementCoverage;
    fileCount++;
  }

  totalOldCoverage /= fileCount;
  totalNewCoverage /= fileCount;

  generateHTMLReport(comparisonData, totalOldCoverage, totalNewCoverage);
}

main().catch((error) => {
  console.error('An error occurred:', error);
});
