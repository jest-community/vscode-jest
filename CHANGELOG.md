### 1.6.4

* Allow updating the inline dots when you have multiple panes of code - orta

### 1.6.3

* config file improvements - luizbon
* Warning message copy improvements - orta

### 1.6.2

* Adds an option that allows you to use an external config json file - luizbon

### 1.6.1

* More windows improvements - KalleOtt 

### 1.6.0

* Separation of VS Code specific code from the extension by creating a lib directory, 
  in prepration for moving to the Jest repo - https://github.com/facebook/jest/issues/2183 - orta
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
