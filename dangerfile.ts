import { danger, fail } from 'danger'
import * as fs from 'fs'

const pr = danger.github.pr
const modified = danger.git.modified_files
const bodyAndTitle = (pr.body + pr.title).toLowerCase()
const trivialPR = bodyAndTitle.includes('#trivial')

const typescriptOnly = (file: string) => file.includes('.ts')
const filesOnly = (file: string) => fs.existsSync(file) && fs.lstatSync(file).isFile()

// Custom subsets of known files
const modifiedAppFiles = modified.filter(p => p.includes('src/')).filter(p => filesOnly(p) && typescriptOnly(p))

// Rules

// When there are app-changes and it's not a PR marked as trivial, expect
// there to be CHANGELOG changes.
const changelogChanges = modified.includes('CHANGELOG.md')
if (modifiedAppFiles.length > 0 && !trivialPR && !changelogChanges) {
  fail(
    '**No CHANGELOG added.** If this is a small PR, or a bug-fix for an unreleased bug add `#trivial` to your PR message and re-run CI.'
  )
}
