import { danger, fail } from 'danger';
import * as fs from 'fs';

const isForkedRepo = (): boolean => {
  const headRepoName = danger.github.pr.head.repo.full_name;
  const baseRepoName = danger.github.pr.base.repo.full_name;

  if (headRepoName !== baseRepoName) {
    // This is shown inline in the output and also integrates with the GitHub
    // Action reporting UI and produces a warning
    console.log(
      "::warning::Running from a forked repo. Danger won't be able to post comments, you will most likely see a 403 error below..."
    );
    return true;
  }
  return false;
};

const pr = danger.github.pr;
const modified = danger.git.modified_files;
const bodyAndTitle = (pr.body + pr.title).toLowerCase();
const trivialPR = bodyAndTitle.includes('#trivial');

const typescriptOnly = (file: string) => file.includes('.ts');
const filesOnly = (file: string) => fs.existsSync(file) && fs.lstatSync(file).isFile();

// Custom subsets of known files
const modifiedAppFiles = modified
  .filter((p) => p.includes('src/'))
  .filter((p) => filesOnly(p) && typescriptOnly(p));

// Rules

// When there are app-changes and it's not a PR marked as trivial, expect
// there to be CHANGELOG changes.
const changelogChanges = modified.includes('CHANGELOG.md');
if (modifiedAppFiles.length > 0 && !trivialPR && !changelogChanges) {
  const message =
    '**No CHANGELOG added.** If this is a small PR, or a bug-fix for an unreleased bug add `#trivial` to your PR message and re-run CI.';
  if (isForkedRepo()) {
    console.log(`::error::${message}`);
  }
  fail(message);
}
