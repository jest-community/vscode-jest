<!--

Please add your own contribution below inside the Master section
Bug-fixes within the same version aren't needed

## Master

* support template-literal-string test names by matching with location info from jest result - connectdotz
* fix race condition in multi-root projects - connectdotz
* add folder status bar support for multi-root projects - connectdotz
* paying down some tech debt, see PR#447 for detail.

* Add disableOptimisticBPs option to debug configuration. Fixes #400 - blikblum

* Adds "Jest: Restart Runner" command - vdh

* replaced deprecated vscode.previewHtml command with webview - qalex

* Support multi-root workspaces - escaton
  * multiroot workspace statusBar displays both active folder and workspace summary info - connectdotz

-->

### 2.9.1

* Prevent ANSI escape codes from appearing in test messages - seanpoulter

### 2.9.0

* Adds a setting to control when the debug CodeLens appears - seanpoulter
* Support the "Jest: Start/Stop" and "Show output" commands without an active
  text editor - seanpoulter
* Restart Jest with --watchAll when --watch is not supported without git/hg
  - seanpoulter
* Highlight error of failed test when assertion was made outside of test
* Fix regression in handling workspaces that have been bootstrapped with
  create-react-app - seanpoulter
* Run Jest on Windows in a shell when gathering settings, such that we don't
  have to deal with the .cmd extension anymore - stephtr
* upgrade to jest 23.3 - connectdotz
* enhanced error reporting and troubleshooting assistance - connectdotz
  * Added a `jest.debugMode` setting for self-diagnosis
  * expand README Troubleshooting area
  * expand issue template to include critical settings as well as debug output
* retired jestSettings and version lookup logic - connectdotz
* refactor diagnostics to defer some expensive operations to later when the file becomes active. This is to improve performance and correctness, especially for use cases in #349 or #334 - connectdotz

### 2.8.0

* Adds a setting to control when the debug CodeLens appears - seanpoulter
* Support the "Jest: Start/Stop" and "Show output" commands without an active
  text editor - seanpoulter
* Restart Jest with --watchAll when --watch is not supported without git/hg
  - seanpoulter

### 2.7.2

* Fix decorators showing corrupt values when two tests of the same name in one file (e.g. in different describe blocks) exist - ThomasRooney

### 2.7.1

* Add new coverage formatter named GutterFormatter (can be used by setting jest.coverageFormatter to GutterFormatter instead of DefaultFormatter) - Guymestef

### 2.7.0

* Add the ability to configure debugging of tests - stephtr, connectdotz

### 2.6.4

* Fixes debugging of tests on Windows (bug introduced in 2.6.2) - stephtr

### 2.6.3

* Even better detection logic for projects created by `create-react-app` - stephtr

### 2.6.2

* Adding `.cmd` in `pathToJest` on Windows isn't necessary anymore - stephtr
* Update settings at runtime - gcangussu
* Improved detection logic for projects created by `create-react-app` - stephtr
* Added `JestProcess` and `JestProcessManager` abstractions to simplify Jest process management - marcinczenko

### 2.6.1

* Strips testNames so they can be used as regex - BLamy
* Show "update snapshots" message when multiple snapshot tests failed - uucue2

### 2.6.0

* Adds ability to open snapshot file directly from test - bookman25
* Start automatically if jest.config.js or jest.json is in workspace - uucue2
* Use pathToJest setting to properly locate jest's package.json and read the version - uucue2
* Fix missing coverage overlay on Windows - seanpoulter
* Toggle coverage overlay without changing documents - seanpoulter

### 2.5.7-8

* Fix dot decoration display on Windows - seanpoulter

### 2.5.6

* Improve the dot decoration placement as we edit - seanpoulter
* Hide Debug CodeLens for skipped tests - seanpoulter
* Mute output from `console.warn` during tests - seanpoulter

### 2.5.5

* Improve where the Debug CodeLens is displayed - seanpoulter

### 2.5.4

* The debugger uses the setting `jest.pathToJest`  - seanpoulter

### 2.5.3

* Detect apps bootstrapped using react-scripts-ts  - seanpoulter

### 2.5.1-2

* Add option to disable codelens - goncharov

### 2.5.0

* Allow debugging non-successful tests - CzBuCHi

### 2.4.5

* Adds an option to not run all tests on launch - seanpoulter
* Never sends VS Code an invalid line number for an unexpected result - connectdotz

### 2.4.4

* Improvements for Create React Native App - anton-matosov

### 2.4.3

* Improvements for Create React App - seanpoulter

### 2.4.1-2

* Adds an option for `"jest.rootPath"` to let you choose the folder to run jest commands - garyxuehong

### 2.4.1

* Restart jest up to three times upon unexpected exit - connectdotz

### 2.4.0

* Fixes for Jest 21 - connectdotz
* Improvements to settings auto-completion - vvo
* Support toggling code coverage - bookman25
* Improve error reporting - bookman25

### 2.3.0

* Apply [prettier](https://github.com/prettier/prettier) to the codebase. - macklinu
* Adds coverage support - bookman25

### 2.2.1

* Jest related depenendency bumps. Should improve the inline messages and crash less. - orta

### 2.2.0

* Adds an option to not show errors inline in the editor - orta
* Adds an option to not snapshot update requests - orta
* Show channel command - orta
* Supports TS/TSX/JSX .snaps - orta
* Create React App fixes - orta
* Use "jest-test-typescript-parser" for our TypeScript parser - orta
* Bumps min VS code release - orta

Note: This release consolidates a lot of code with the Jest project, and so if you have a custom `testRegex` and use
      Jest below v20, chances are the decorators will not show. Everything else should be 👍 - orta

### 2.0.4

* New fancy spinner when running tests - bookman25
* Improved handling of expired test results - bookman25

### 2.0.3

* Improved underlining of failing expectations - bookman25

### 2.0.2

* Whitespace fixes for the error messages next to a fail - orta

### 2.0.1

* tsx support - orta/bookman25

### 2.0.0

* Move all of the Jest specific code into a new repo: [jest-editor-support](https://github.com/facebook/jest/tree/master/packages/jest-editor-support) where
  we can share the code with a nuclide implementation. This brings some changes to the development process (see the README) but should only affect users
  if we've missed something in moving over.

  - orta / bookman25 / cpojer

* Significant improvements to JavaScript parsers - bookman25
* Introduction of TypeScript support - bookman25

### 1.6.5

* Prepare for Jest 18 - orta

### 1.6.4

* Windows + Create React App improvements - brentatkins

### 1.6.3

* config file improvements - luizbon
* Warning message copy improvements - orta

### 1.6.2

* Adds an option that allows you to use an external config json file - luizbon

### 1.6.1

* More windows improvements - KalleOtt

### 1.6.0

* Separation of VS Code specific code from the extension by creating a lib directory,
  in preparation for moving to the Jest repo - https://github.com/facebook/jest/issues/2183 - orta
* Minor improvements for create-react users - orta
* Support for running Jest even in repos where Jest is not a direct dependency via the command `Start Jest Runner` - you will definitely need to set the per-project `.vscode/settings.json` to whatever would normally trigger a jest run - orta

### 1.5.1

* Use green empty circles for tests assumed to be good - gabro
* More windows improvements - bookman25

### 1.5.0

* Adds support for running the tests inside `create react` apps - orta

### 1.4.0

* When a Snapshot test has failed, it offers the chance to update your snapshots - orta

### 1.3.2

* Adds an error message if you're not using Jest 17 - orta

### 1.3.0 - 1.3.1

* Windows support - orta

### 1.2.0

* Adds syntax highlights for the JSX in `.js.snap` files - orta

### 1.1.0

* `import type` now shouldn't cause a parser error, and should be fine in test files - orta
* Adds an option to disable the initial loading of the runner on a project - orta
* You can start and stop the jest runner via the command pallette. - orta
* You can define your own path to the Jest test runner - orta
* Not a feature, but the code has been thoroughly commented - orta
* Improvements to parsing passing test files - orta
* Only run JS parser on files that match the Jest tesRegex - orta

### 1.0.3

* Uses all possible Babylon plugins when parsing a test file, should raise exceptions less - orta

### 1.0.2

* Removes unused commands - orta

### 1.0.1

#### Feature Complete, and rough polish pass

* Starts Jest automatically when you're in a project with Jest installed.
* Show individual fail / passes inline.
* Show fails inside the problem inspector.
* Highlights the errors next to the `expect` functions

- orta

### 0.0.6

* Show when the tests are running - orta
* Switch to use symbols in the status bar - orta

### 0.0.5

* All Tests in a file are marked red/green when we know whether the file passed - orta
* When we don't know test state yet, show an empty circle - orta

### 0.0.4

* Adds statusbar support - orta
* Adds fails to the problems section - orta

### 0.0.3

* Parses current file for it/test blocks - orta
