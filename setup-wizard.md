# Extension Setup Wizard (Beta) <!-- omit in toc -->


This is an interactive tool to help users set up vscode-jest extension if the default configuration is not sufficient. 

_(As in v4, wizard is released as a beta product. We appreciate you trying out and help improving it so it can be more useful for the community 👍)_


---

- [Overview](#overview)
- [How to run it](#how-to-run-it)
- [How does it work](#how-does-it-work)
  - [Jest command line](#jest-command-line)
  - [Debug Config](#debug-config)
- [FAQ](#faq)

---
## Overview

It helps users to set up the essential configurations of the extension via a simple UI. While the extension provides default configurations that work for the common standard environments, such as CRA and plain jest, the more sophisticated projects are most likely needed to customize the extension for their environments. And this is where the setup wizard comes in.

The wizard asks questions and collects answers to update user's workspace `settings.json` and `launch.json` accordingly ( [How does it work ?](#how-does-it-work)). It works for single and multi-root workspaces. It creates an OUTPUT channel `vscode-jest Setup` with progress, instructions and status, which also will be handy for reporting and diagnosis issues.

Users can run the wizard any time they want ([How to run it ?](how-to-run-it)) and safely abort if desired. 

The wizard tries its best to create accurate configurations but it will not be able to cover all the use cases out there. However, it always strikes for transparency, and shows where and what the configuration will be updated so users can easily modify it if needed.

_(Note: the wizard is not to set up [jest](https://jestjs.io) itself. Actually, a working jest environment (such as you can run jest tests in terminal) is a prerequisite of running `vscode-jest` extension.)_
## How to run it
in v4.0, there are multiple ways you can activate the setup wizard

1. via [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette): one can launch the wizard on-demand via vscode command palette `"Jest: Setup Extension"` 
2. via the setup button in various message panels, such as when jest process failed to start or when detecting missing debug config.

## How does it work 
The wizard provides 2 main setup tasks:
1. [jest command line](#jest-command-line): used by the extension to kick off jest test run on behave of users. 
2. [vscode debug config](#debug-config): to enable debugging individual jest test via the debug codeLens.
   
The wizard setup is workspace bound. For multi-root projects, user will be prompt to select a workspace folder to work with.

### Jest command line
The extension start jest tests process on behave of the users by issuing the same test command they otherwise run in terminal. Therefore it needs to know the command to start jest process. The wizard will examine the existing settings, looking for `"jest.jestCommandLine"` or the deprecated `"jest.pathToJest"` and `"jest.pathToConfig"`. If found, it will let users to [migrate](#note-1)/edit it; if not found, it will ask user to manually input the command line.

Please be aware that all relative paths in the settings are resolved against the `rootPath`, which by default is the current workspace folder unless you customize it with `"jest.rootPath"`.

This command line is required to configure the debug config below. 

### Debug Config
When clicked on the debug codeLens, the extension will look for a debug config named `"vscode-jest-tests"`, and append the additional arguments (such as `--testNamePattern`) when launching the debugger.

If there is no existing `"jest.jestCommandLine"`, it will suggest to set one up before proceed, after all, a working jest environment is the prerequisite of this extension.

The wizard will examine the `launch.json` for existing config. If found, users can choose to use it as it is, replace (rename the old one and generate a new one) or manually editing it; if not found, wizard will try to [generate](#note-2) a new one. 

The debug config is saved in `launch.json` in workspace folder and shown at the end of the setup for review/adjustment. If you choose "replace" the existing config, the old configure will be renamed to `vscode-jest-tests-xxxxx` for reference purpose only, which can be safely deleted if you don't need it.

The generated config probably work fine for most projects, but could require further adjustment for some other projects including but not limited to
- projects use different jest config between debug and regular test run
- projects with [platform specific properties](#note-3). 

Check out [here](#note-4) if you are having problem running vscode-jest debug codeLens.
## FAQ

- <a id="note-1">**What does jestCommandLine migration process do?**</a> 

  The wizard will combine `jest.PathToJest` and `jest.pathToConfig` into a single command line `jest.jestCommandLine` , e.g. 
  ```
  //example 1
  jest.PathToJest = 'yarn test'
  jest.PathToConfig = '../../shared-jest.json'
  ==> jest.jestCommandLine = 'yarn test --config ../../shared-jest.json' 


  // example 2
  jest.PathToJest = '../../node_modules/.bin/jest '
  jest.PathToConfig = './jest-config.json'
  ==> jest.jestCommandLine = '../../node_modules/.bin/jest --config ./jest-config.json' 
  ```

  The `jest.jestCommandLine` setting will be saved in the workspace folder's local "settings.json" file.

- <a id="note-2">**How is debug config generated?**</a>
  The process goes like this:
  - parse `jest.jestCommandLine` into command and arguments. Resolve relative command path based on `jest.rootPath` if defined otherwise uses vscode variable `"${workspaceFolder}"`.
  - obtain a debug template from `DebugConfigurationProvider`
  - merge the jest command and arguments with the template.
    - if the command is `npm` or `yarn` it updates `runtimeExecutable` property; otherwise updates `program`
    - the arguments will be added to the `args` property, plus jest debug specific flag such as `--runInBand`.
  - update `cwd` property with either `jest.rootPath` if defined, otherwise the vscode variable `"${workspaceFolder}"`

  
- <a id="note-3">**How is platform specific properties handled in DebugConfig generation?**</a>
  
  Currently the wizard does not generate platform specific properties. Users will need to manually maintain them in `lauch.json` file. 

  For example, for a different jest command under windows, add the `windows.program` section in `launch.json`:

  ```
  // launch.json
  "configurations": [
    ...
     {
       type: "node",
       name: "vscode-jest-tests",
       ...
       program = "${workspaceFolder}/node_modules/.bin/jest",
       windows = {
         program: '${workspaceFolder}/node_modules/jest/bin/jest',
       },
     },
  ]
  ```
  See more details and examples in [vscode: platform specific properties](https://code.visualstudio.com/docs/editor/debugging#_platformspecific-properties).
  
  The wizard can preserve the existing platform specific properties while merging the new `jest.jestCommandLine` but does not guarantee they are consistent. Therefore, it is advise to always double check the debug config upon `jest.jestCommandLine` changes.  

- <a id="note-4">**vscode-jest debug codeLens failed, now what?**</a>
  
  If your regular jest run was fine but you can't debug the test with debug codeLens after running wizard. There should be some error message in your terminal that might help you pinpoint the culprit. There are many information online about how to setup vscode debug config for specific environments/frameworks, you might also find the following helpful:
  - [vscode debug config properties](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_launch-configuration-properties) 
  - [Launch configurations for common scenarios](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_launch-configurations-for-common-scenarios)
  - [vscode-recipes for debug jest tests](https://github.com/microsoft/vscode-recipes/tree/master/debugging-jest-tests)
  
  If you think your use case is quite common, feel free to create a discussion/issue for enhancing the wizard or contribute your example debug config.

 
 

  