# vscode-jest v5 Releases <!-- omit in toc --> 

---
- [v5.0.0 (pre-release)](#v500-pre-release)
  - [Features](#features)
    - [Output Terminals](#output-terminals)
    - [Login Shell Support](#login-shell-support)
    - [Long Run Monitor](#long-run-monitor)
    - [One-click disable non-jest folder for monorepo project](#one-click-disable-non-jest-folder-for-monorepo-project)
- [Fixes](#fixes)
    - [Deep Activation](#deep-activation)
    - [AutoRun Default Change](#autorun-default-change)
  - [Breaking Changes](#breaking-changes)

---
## v5.0.0 (pre-release)

After more than an year with the vscode TestExplorer, it has been proven stable and a preferred user-experience. In v5.0.0 we started to consolidate and clean up redundant legacy functions/UI in favor of TestExplorer, such as moving run output to Terminal, retire legacy test status decorators and settings.  

This release also aim to address some common pain points, such as slow and resource-intensive start-up (especially for large projects), shell env issue (cmd not found), shallow activation and "greedy" monorepo runs. 

### Features 

#### Output Terminals 

![v5-output-terminals](../images/v5-output-terminals.png)

Jest run will be shown in Terminal instead of OUTPUT tab to provide familiar run-in-terminal-like experience. We also fixed a few bugs that prevented the full output to be shown. It should be much easier to investigate when tests fail or not executed. 

We will no longer force "reveal" the last run output terminal. The new terminals will only be automatically "revealed" when encountered errors prevented tests to run. Therefore, we are retiring setting `"jest.showTerminalOnLaunch"`

(#910 - @connectdotz)

#### Login Shell Support

vscode process env doesn't always fully initialized, especially during restart. This usually manifest into command not found errors (exit code 127), such as `"env: node: No such file or directory"` or `"env: yarn: No such file or directory"` when running jest process. 

While there are many work arounds, we want to add one more option for users prefer launching jest in a login shell, which will initialize the shell env independent of vscode process env. This is accomplished by expanding the current ["jest.shell"](../README.md#shell) setting, for example:
```json
"jest.shell": {"path": "/bin/bash", "args": ["--login"]}
```

Note, the extra initialization might have some performance overhead, use this with caution.

(#874 - @connectdotz)

#### Long Run Monitor

In v5 we also added a long-run monitor to be proactive in helping users detect and potential workaround such situation. The threshold setting ["jest.monitorLongRun"](../README.md#monitorlongrun) default is 60 seconds: `"jest.monitorLongRun": 60000`, 

(#904 - @connectdotz)

#### One-click disable non-jest folder for monorepo project

The current monorepo jest detection is "greedy", it assumes all multi-root folders have jest tests. Indeed it's not ideal and we do plan to fix it. Until then, users can now one-click to "disable" the failed folders from the error message window. 

(#896 - @jonnytest1)

## Fixes

#### Deep Activation

The extension auto activated when it detects jest config files or modules under the project root. For more sophisticated projects that jest root !== project root, they will not be activation even if they set the `jest.rootPath`. In v5, we will look for jest config files in the whole project tree, except in node_modules for performance reason.

For projects do not meet any of the existing activation events, there is now a new activation event for  `".vscode-jest"` file, an empty marker file, anywhere in the project tree (however, prefer to be in jest root folder). 

(#907 - @connectdotz)

#### AutoRun Default Change

The `"jest.autoRun"` default used to be `{"watch": "true", "onStartup": ["all-tests"]}`. While this ensure no test would be "missing", it does take a toll for start up performance, especially for projects with many expensive tests. With TestExplorer provided complete test tree view, we believe it should be all right for most users to just starts with `{"watch": "true"}`, thus the change.

If you already have the `"jest.autoRun"` in your settings.json file, nothing will change. If you didn't have `"jest.autoRun"`, then you will probably notice a faster start-up, but maybe not all tests are run and marked as circle (unknown) instead. These are the files that have not checkout/changed therefore less risk of being broken (determined by watchman). Of course users can always run them explicitly or change the setting if desired.

(#906 - @connectdotz)

### Breaking Changes
- `"jest.showTerminalOnLaunch"` is deprecated. 
- `"jest.testExplorer"` 
  - can not be turned off any more. 
  - removed the "enable" and "showClassicStatus" attributes. The only valid attribute is "showInlineError".

---

[v5.0.0 pre-release](https://github.com/jest-community/vscode-jest/releases/tag/v5.0.0)