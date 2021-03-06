# vscode-jest 

[![Build Status](https://travis-ci.org/jest-community/vscode-jest.svg?branch=master)](https://travis-ci.org/jest-community/vscode-jest) [![Coverage Status](https://coveralls.io/repos/github/jest-community/vscode-jest/badge.svg?branch=master)](https://coveralls.io/github/jest-community/vscode-jest?branch=master) [![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/Orta.vscode-jest?color=success&label=Visual%20Studio%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=Orta.vscode-jest) 

---
## v4 Pre-Release <!-- omit in toc -->

We are actively working on our next major release [v4](#576) that fixes many of the nagging issues many of you have asked, such as inconsistent test status indicator, high CPU usage, more granular control of when to run which tests, missing coverage, not recognize parameterized tests, frustrating start up failure etc. 

The latest release is [v4.0.0-alpha.4](https://github.com/jest-community/vscode-jest/releases/tag/v4.0.0-alpha.4). 

We would love to have as many people try it as possible so we can shake out the bugs and get to the final release sooner. If you experience any issue with the production version, please try the alpha and let us know if it did not fix your issue so we can fast track your issue...

---

Content
- [vscode-jest](#vscode-jest)
  - [The Aim](#the-aim)
  - [Features](#features)
  - [How To ...](#how-to-)
    - [How to get it?](#how-to-get-it)
    - [How to get it set up?](#how-to-get-it-set-up)
    - [How to start Jest?](#how-to-start-jest)
    - [How to trigger the test run?](#how-to-trigger-the-test-run)
      - [fully automated](#fully-automated)
      - [interactive mode](#interactive-mode)
    - [How to debug tests?](#how-to-debug-tests)
    - [How to use code coverage?](#how-to-use-code-coverage)
    - [How to use the extension with monorepo projects?](#how-to-use-the-extension-with-monorepo-projects)
    - [How to read the StatusBar?](#how-to-read-the-statusbar)
  - [Customization](#customization)
    - [Settings](#settings)
    - [Debug Config](#debug-config)
    - [Reference](#reference)
  - [Commands](#commands)
  - [Menu](#menu)
  - [Troubleshooting](#troubleshooting)
  - [Want to Contribute?](#want-to-contribute)
  - [Maintainers](#maintainers)
  - [License](#license)

---



## The Aim

A comprehensive experience when using [Facebook's Jest](https://github.com/facebook/jest) within a project.

* Useful IDE based Feedback
* Session based test watching

<img src="https://github.com/jest-community/vscode-jest/raw/master/images/vscode-jest.gif" alt="Screenshot of the tool" width="100%">

## Features

* Starts Jest automatically when you're in a root folder project with Jest installed.
* Show individual fail / passes inline.
* Show fails inside the problem inspector.
* Highlights the errors next to the `expect` functions.
* Adds syntax highlighting to snapshot files.
* A one button update for failed snapshots.
* Show coverage information in files being tested. 
* Help debug jest tests in vscode.
* Supports multiple test run modes (automated, manual, and hybrid onSave) to meet user's preferred development experience. 
* Track and shows overall workspace/project test stats

## How To ...
### How to get it?

Simply open [Jest - Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=Orta.vscode-jest) and click "Install".
Alternatively open Visual Studio Code, go to the extension view and search for "Jest".
 
For detailed releases and migration help, please see [releases](https://github.com/jest-community/vscode-jest/releases).

### How to get it set up?

This extension runs on top of your Jest installation. Upon starting, it has the expectation that the Jest environment is properly set up, i.e. jest can be executed in VS Code's terminal.

Out of the box, this extension should work for most simple/standard jest and react projects. However, if you have a more sophisticated project or custom jest command, the default configuration might not be sufficient. In v4 and on, a [setup wizard](setup-wizard.md) can be used to configure the essential settings for the extension. 

 but you can easily customize it with various [settings](#customization). 

Check out the [customization settings](#customization) below should you encounter any issue or prefer different behaviors. Please do not hesitate to [ask](https://github.com/jest-community/vscode-jest/issues), we have an active community that you might find helpful.  

### How to start Jest? 

The extension will start Jest for you when:

* we find Jest configuration files in the workspace: `jest.config.js` or `jest.json`
* we find Jest installed in the workspace: `node_modules/.bin/jest`
* we find the workspace has been bootstrapped with create-react-app: `node_modules/react-scripts/node_modules/.bin/jest`
  - `node_modules/react-native-scripts`
* you run jest through [commands](#commands) such as **Jest: Start Runner** 

You can also customize many aspects of how the extension should run jest tests for you, see [customization](#customization) for more details.

### How to trigger the test run?
This extension supports multiple execution models through setting [jest.autoRun](#settings-auto-run)
#### fully automated 
Basically running jest with `--watch` or `--watchAll`. The change is determined by a separate process [watchman](https://facebook.github.io/watchman/) behind the scene, which triggers related tests run for any source or test file changes. This is the default mode prior to v4. Example:
```
"jest.autoRun": {"watch": true}
```
will start the jest with the watch flag and leave all tests at "unknown" state until changes are detected.
```
"jest.autoRun": {"watch": true, "onStartup": ["all-tests"]}
```
will start running all tests upon project launch to update overall project test stats, followed by the jest watch for changes.

#### interactive mode
This is introduced in v4, which added new [commands](#commands) and [menu](#menu) to run tests by-file or by-workspace on demand. 
- fully manual
  - there will be no automatic test run, users will trigger test run by either command or context-menu.
  - Example: `"jest.autoRun": "off"`
- automatically run tests when test file changed
  - the extension will trigger test run for the given test file upon save.
  - Example: "jest.autoRun": `{"watch": false, "onSave": "test-file"}` 
- automatically run tests when either test or source file changed:
  - the extension will trigger test run for the given test or source file upon save.
  - Example: "jest.autoRun": `{"watch": false, "onSave": "test-src-file"}` 

Other than the "off" mode, users can specify the "onStartup" option for any "jest.autoRun" config, for example: `{"watch": false, "onSave": "test-file", "onStartup": ["all-tests"]}` 

### How to debug tests?

The simplest use cases should be supported out-of-the-box, but at the latest when VS Code displays errors about the attribute `program` or `runtimeExecutable` not being available, you can either use [setup wizard]() to help or create your own debug configuration within `launch.json`. See more details in [Customization - Debug Config](#debug-config).

Starting with debugging is possible by clicking on the `debug` CodeLens above the tests, but you can also debug all tests at once by starting debugging of `"vscode-jest-tests"` within the VS Code Debug Side Bar.

For parameterized tests, you might see debug codeLens like `Debug (2)`, which indicated there are 2 test candidates can be debugged. In such case, you will be prompted to choose when clicking the debug codeLens. All failed test results will appear in both the hovering message panel and the `PROBLEMS` area.

![debug-screen-shot](images/debug-screen-shot.png)

You can customize when to show debug codelens etc, see [customization](#customization) for more details.

### How to use code coverage?

Starting from [v3.1](https://github.com/jest-community/vscode-jest/releases/tag/v3.1.0), code coverage can be easily turned on/off at runtime without customization. 

To toggle the coverage mode: go to [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and select **Jest: Toggle Coverage Overlay** command. 

The coverage mode, along with watch mode, are shown in StatusBar:

![status-bar-modes](images/status-bar-watch-coverage.png)

In addition to the coverage summary that is shown on the top of the file, each line will be marked by its coverage status according to the coverage formatter configured. There are 3 types of coverage you might see in your source code, distinguished by colors: 

- "covered": if the code is covered. Marked as <span style="color:green">"green"</span> by default. 
- "not-covered": if the code is not covered. Marked as <span style="color:red">"red"</span> by default.
- "partially-covered": Usually this mean the branch (such as if, switch statements) only partially tested. Marked as <span style="color:yellow">"yellow"</span> by default.
  - _Please note, istanbuljs (the library jest used to generate coverage info) reports switch branch coverage with the first "case" statement instead of the "switch" statement._

![coverage-screen-shot](images/coverage-screen-shot.png)


⚠️ In rare cases, coverage info might be less than what it actual is in "watch" mode (with `--watch` flag), where only changed files/tests are run (see facebook/jest#1284). 

You can customize coverage start up behavior, style and colors, see [customization](#customization) for more details.

### How to use the extension with monorepo projects?
The recommended approach is to setup the monorepo project as a [multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces) in vscode, which each sub package is a "folder". While you can use jest `projects` to run all tests without multi-root workspaces, you won't be able to take advantage a more fine grained control such as toggle coverage for a specific package instead of all packages. 

You can customize how the extension works in multi-root workspaces, see [customization](#customization) for more details.

### How to read the StatusBar?
<img src='images/status-bar-manual.png' width="600" />

`Jest` shows the active workspace's mode and state
`Jest-WS` shows the total test suite stats for all workspaces.

<img src='images/status-bar-watch-coverage.png' width="600" />
shows the active workspace has coverage on.
<img src='images/status-bar-save-test-unsync.png' width="600" />

shows the active workspace has onSave for test file only, and that the workspace stats is out of sync with the code, such as when the source file is changed but the related tests are not run yet. 

<img src='images/status-bar-save-all.png' width="600" />

shows the autoRun will be triggered by either test or source file changes.

Note: When hovering over the status bar item, the tooltip popup will show brief description as well.
## Customization
### Settings
Users can use the following settings to tailor the extension for their environments. 
- All settings are prefixed with `jest` and saved in standard `.vscode/settings.json`. 
- settings crossed out are to be deprecated in the future
- settings marked with 💼 apply to the whole project, otherwise per workspace. 


|setting|description|default|example/notes|
|---|---|---|---|
|**Process**|
|autoEnable :x:|Automatically start Jest for this project|true|Please use `autoRun` instead|
|[jestCommandLine](#jestCommandLine)|The command line to start jest tests|undefined|`"jest.jestCommandLine": "npm test -"` or `"jest.jestCommandLine": "yarn test"` or `"jest.jestCommandLine": "node_modules/.bin/jest --config custom-config.js"`|
|[autoRun](#autoRun)|Controls when and what tests should be run|undefined|`"jest.autoRun": "off"` or `"jest.autoRun": {"watch": true, "onStartup": ["all-tests"]}` or `"jest.autoRun": false, onSave:"test-only"}`|
|pathToJest :x:|The path to the Jest binary, or an npm/yarn command to run tests|undefined|Please use `jestCommandLine` instead|
|pathToConfig :x:|The path to your Jest configuration file"|""|Please use `jestCommandLine` instead|
|[rootPath](#rootPath)|The path to your frontend src folder|""|`"jest.rootPath":"packages/app"` or `"jest.rootPath":"/apps/my-app"`| 
|runAllTestsFirst :x:| Run all tests before starting Jest in watch mode|true|Please use `autoRun` instead|
|**Editor**|
|enableInlineErrorMessages :x:| Whether errors should be reported inline on a file|false|It is recommended not to use the inline error message and in favor of vscode's hovering messages, especially for parameterized tests|
|**Snapshot**|
|enableSnapshotUpdateMessages|Whether snapshot update messages should show|true|`"jest.enableSnapshotUpdateMessages": false`|
|enableSnapshotPreviews 💼|Whether snapshot previews should show|true|`"jest.enableSnapshotPreviews": false`|
|restartJestOnSnapshotUpdate :x:| Restart Jest runner after updating the snapshots|false|This is no longer needed in v4|
|**Coverage**|
|showCoverageOnLoad|Show code coverage when extension starts|false|`"jest.showCoverageOnLoad": true`|
|[coverageFormatter](#coverageFormatter)|Determine the coverage overlay style|"DefaultFormatter"|`"jest.coverageFormatter": "GutterFormatter"`|
|[coverageColors](#coverageColors)|Coverage indicator color override|undefined|`"jest.coverageColors": { "uncovered": "rgba(255,99,71, 0.2)", "partially-covered": "rgba(255,215,0, 0.2)"}`|
|**Debug**|
|enableCodeLens 💼|Whether codelens for debugging should show|true|`"jest.enableCodeLens": false`|
|[debugCodeLens.showWhenTestStateIn](#showWhenTestStateIn) 💼|Show the debug CodeLens for the tests with the specified status. (window)|["fail", "unknown"]|`"jest.debugCodeLens.showWhenTestStateIn":["fail", "pass", "unknown"]`|
|**Misc**|
|debugMode|Enable debug mode to diagnose plugin issues. (see developer console)|false|`"jest.debugMode": true`|         
|disabledWorkspaceFolders 💼|Disabled workspace folders names in multiroot environment|[]|`"jest.disabledWorkspaceFolders": ["package-a", "package-b"]`|  

### Debug Config

This extension offers default debug config for common use cases, such as standard jest or projects bootstrapped by `create-react-app`. More sophisticated projects might need to customize the debug config. As mentioned earlier, you can use the [setup wizard](setup-wizard.md) to help create one, or edit it manually in the `launch.json` file, where a few jest specific debug config templates are offered, such as "Jest: Default jest configuration" or "Jest: create-react-app". To learn more about debug/launch configurations in general, visit [VS Code Docs: Debugging](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations).

There are many information online about how to setup vscode debug config for specific environments/frameworks, you might find the following helpful:
  - [vscode debug config properties](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_launch-configuration-properties) 
  - [Launch configurations for common scenarios](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_launch-configurations-for-common-scenarios)
  - [vscode-recipes for debug jest tests](https://github.com/microsoft/vscode-recipes/tree/master/debugging-jest-tests)

### Reference
- <a id="jestCommandLine"></a>**jestCommandLine**
This should be the command users used to kick off the jest tests in the terminal. However, since the extension will append additional options at run time, please make sure the command line can pass along these options, which usually just means if you uses npm, add an additional "--" at the end (e.g. `"npm run test --"`) if you haven't already in your script. 
It is recommended not to add the following options as they are managed by the extension: `--watch`, `--watchAll`, `--coverage`

- <a id="rootPath"></a>**rootPath**
If your project doesn't live in the root of your repository, you may want to customise the `jest.rootPath` setting to enlighten the extension as to where to look. For instance: `"jest.rootPath": "src/client-app"` will direct the extension to use the `src/client-app` folder as the root for Jest.

- <a id="showWhenTestStateIn"></a>**debugCodeLens.showWhenTestStateIn**
Possible status are: [ "fail", "pass", "skip", "unknown"]. Please note that this is a window level setting, i.e. its value will apply for all workspaces.

- <a id="coverageFormatter"></a>**coverageFormatter**
There are 2 formatters to choose from: 
  1. DefaultFormatter: high light uncovered and partially-covered code inlilne as well as on the right overview ruler. (this is the default)
  ![coverage-DefaultFormatter.png](./images/coverage-DefaultFormatter.png)

  2. GutterFormatter: render coverage status in the gutter as well as the overview ruler. 
  ![coverage-GutterFormatter.png](./images/coverage-GutterFormatter.png)
  _(Note, there is an known issue in vscode (microsoft/vscode#5923) that gutter decorators could interfere with debug breakpoints visibility. Therefore, you probably want to disable coverage before debugging or switch to DefaultFormatter)_

- <a id="coverageColors"></a>**coverageColors**
Besides the formatter, user can also customize the color via `jest.coverageColors` to change color for 3 coverage categories: `"uncovered", "covered", or "partially-covered"`, for example:
  ```
  "jest.coverageColors": {
    "uncovered": "rgba(255,99,71, 0.2)",
    "partially-covered": "rgba(255,215,0, 0.2)",
  }
  ```
  the default color scheme below, note the opacity might differ per formatter:
  ```
  "jest.coverageColors": {
    "covered": "rgba(9, 156, 65, 0.4)",
    "uncovered": "rgba(121, 31, 10, 0.4)",
    "partially-covered": "rgba(235, 198, 52, 0.4)",
  }
  ```
- <a id="autoRun"></a>**autoRun**
  - definition:
  ```
  AutoRun =
    | 'off'
    | { watch: true; onStartup?: ["all-tests"] }
    | {
        watch: false;
        onStartup?: ["all-tests"];
        onSave?: 'test-file' | 'test-src-file';
      }
  ```
  - examples
    - `"jest.autoRun": "off"` turn off auto run, users need to trigger tests run manually via [run commands](#commands-run) and [menus](#context-menu).
    - `"jest.autoRun": {"watch": true, "onStartup": ["all-tests"]}` run all the tests in the workspace upon extension startup, followed by jest watch run for subsequent test/src file changes.
    - `"jest.autoRun": {"watch": off, "onSave": "test-file"}` only run tests in the test file when the test file itself changed. It will not run all tests for the workspace upon start up, nor triggering any test run when the source file changed. 
    - `"jest.autoRun": {"watch": off, "onSave": "test-file", "onStartup": ["all-tests"]}` Like the one above but does run all tests upon extension start up.
  - migration from settings prior to v4
    -  if `"jest.autoEnabled" = false` => manual mode: `"jest.autoRun": "off"`
    -  if `"jest.runAllTestsFirst" = false` => `"jest.autoRun": {"watch": true }` 
    -  if no customization of the 2 settings and no `"jest.autoRun"` found => `"jest.autoRun": {"watch": true, "onStartup": ["all-tests"]}`  
## Commands
This extension contributes the following commands and can be accessed via [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette):
|command|description|availability|
|---|---|---|
|Jest: Start All Runners| start or restart all jest runners|always
|Jest: Stop All Runners| stop all jest runners |always
|Jest: Toggle Coverage| toggle coverage mode for all runners|always
|Jest: Start Runner (Select Workspace)| start or restart the jest runner for the selected workspace|multi-root workspace
|Jest: Stop Runner (Select Workspace)| stop jest runner for the selected workspace |multi-root workspace
|Jest: Toggle Coverage (Select Workspace)| toggle coverage mode for the selected workspace|multi-root workspace
|Jest: Run All Tests| run all tests for all the workspaces|interactive mode
|Jest: Run All Tests (Select Workspace)| run all tests for the selected workspace|interactive mode and multi-root workspace
|Jest: Run All Tests in Current Workspace| run all tests for the current workspace based on the active editor| interactive
|Jest: Toggle Coverage for Current Workspace| toggle coverage mode for the current workspace based on the active editor| interactive
|Jest: Setup Extension| start the setup wizard|always

## Menu
In inactive mode, text editor will show the following context-menu
|menu|description|
|---|---|
|Jest: Run Related Tests| if in test file, run all tests in the file; if in source file, run all tests with dependency to the file|

## Troubleshooting
Sorry you are having trouble with the extension. If your issue did not get resolved after checking out the [how-to](#how-to-) section and the tips below, feel free to [ask](https://github.com/jest-community/vscode-jest/issues) the community, chances are some one else had a similar experience and could help resolving it. 

- **I don't see "Jest" in the bottom status bar**
  This means the extension is not activated. 
  The extension should be automatically activated as described in [How to start jest](#how-to-start-jest). 
  If it failed because maybe you don't use the root of your project for jest tests, you can use [jest.rootPath](#rootPath) to point to that directory instead.

- **I got "Jest failed too many times..." error message**
  This usually mean the extension is not able to start jest process for you. First check the Jest OUTPUT channel or developer console to see what is the actual error (see [self-diagnosis](#self-diagnosis)). 

  If it is related to the run time environment, such as
  ```
  env: node: No such file or directory
  ```
  The issue is probably not related to this extension. If this only happened occasionally after launch or you saw vscode warning about shell start up slow, try to simplified the env files, restart vscode or reload windows. See [Resolving Shell Environment is Slow](https://code.visualstudio.com/docs/supporting/faq#_resolving-shell-environment-is-slow-error-warning).

  If you see error about not able to find `jest` or some other jest related runtime error: if you can run jest from terminal then you can use the "Run Setup Wizard" button in the error panel to help resolving the configuration issue. There could be other causes, such as jest test root path is different from the project's, which can be fixed by setting `jest.rootPath`. Feel free to check out the [customization](#customization) section to manually adjust the extension if needed. 

- **It seems to make my vscode sluggish or use lots of CPU**
  By default the extension will run all tests when it is launched followed by a jest watch process. If you have many resource extensive tests or source files that can trigger many tests when changed, this could be the reason. Check out [jest.autoRun](#autoRun) to see how you can change and control when and what tests should be run.

- <a id='self-diagnosis'></a>**The extension is not behaving as expected, what is going on?** 
If your can execute jest tests on command line but vscode-jest was not running as expected, here is what you can do to find out more information:
  - See jest process output in the "OUTPUT" channel, which is usually named after the workspace folder, such as `Jest (your-workspace-name)`. Or you can click on `Jest` label on status bar to show Jest Output window. This will show you the jest run output and the errors.
   <img src="https://github.com/jest-community/vscode-jest/raw/master/images/output-channel.png" alt="Screenshot of the tool" width="100%">
  - Turn on the debug mode to see more internal debugging message: 
    - set `"jest.debugMode": true` in `.vscode/settings.json` 
    - restart vscode-jest or reload the window (via `Reload Window` command)
    - open the developer tool (via `Help > Toggle Developer Tools` menu), you should see more information including how we extract jest config and spawn jest processes.

  Hopefully most issues would be pretty obvious after seeing these extra output, and you can probably fix most yourself by [customizing](#customization) the `jest.jestCommandLine` and others. 

## Want to Contribute?

Thanks for considering! Check [here](CONTRIBUTING.md) for useful tips and guidelines.

## Maintainers

Orta Therox ([@orta](https://github.com/orta)), Vincent Voyer ([@vvo](https://github.com/vvo)) & ConnectDotz ([@connectdotz](https://github.com/connectdotz)).

## License

vscode-jest is [MIT licensed.](LICENSE)
