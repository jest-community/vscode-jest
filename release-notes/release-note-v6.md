# vscode-jest v6.x Releases <!-- omit in toc --> 

Release Notes
---
- [Release Notes](#release-notes)
- [v6.0.0 (pre-release)](#v600-pre-release)
  - [Main Features](#main-features)
    - [1. Virtual Folders](#1-virtual-folders)
    - [2. Support spawning jest with dashed arguments](#2-support-spawning-jest-with-dashed-arguments)
    - [3. control extension activation within each folder](#3-control-extension-activation-within-each-folder)
    - [4. Auto clear output upon test run](#4-auto-clear-output-upon-test-run)
  - [Fixes](#fixes)
  - [CHANGELOG](#changelog)

---

## v6.0.0 (pre-release)

This major release introduces the 'Virtual Folders' feature. Much like a VSCode workspace folder, a 'Virtual Folder' allows you to manage a custom Jest runtime environment, each configurable with its own resource-level settings. This is particularly useful for projects with multiple Jest configurations or monorepo structures. While we've ensured backward compatibility, the introduction of 'Virtual Folders' involved significant internal changes that prompted a major version bump. 

### Main Features
#### 1. Virtual Folders 

Supporting multiple jest configs is a common use cases for monorepo projects and projects with multiple test environments, such as unit and integration tests. We introduced monorepo support with vscode multi-root workspaces a few years ago. While it works well for most use cases, it fell short for multi-test-environment that share the same code base (folder). This version will close this gap with the [Virtual Folders](README.md#virtualfolders).

For example, the unit vs. integration tests can now be set up as the following:
```json
// <project>/.vscode/settings.json
{
     "jest.virtualFolders": [
       {
        "name": "unit-tests", 
        "jestCommandLine": "--config=jest.unit.config.js", 
        "autoRun": "watch"
      },
      {
        "name": "integration-tests", 
        "jestCommandLine": "--config=jest.integration.config.js", 
        "autoRun": "off"
      }
     ]
   }
```

And yes you can indeed use virtual folders with monorepo projects. For example, the following configuration will run tests for each package in a monorepo project:
```json
// <project>/.vscode/settings.json 
{
 "jest.virtualFolders": [
   {"name": "package1", "rootPath": "packages/package1"},
   {"name": "package2", "rootPath": "packages/package2"}
 ]
}
```

So when to use multi-root workspaces vs. virtual folders? In short, if you created a multi-root workspace simply for running different jest config - you could probably just use `"jest.virtualFolders"` instead. If you do require different non-jest vscode settings for each folder, continue to use multi-root workspace. More details in [Virtual Folders](README.md#virtualfolders).


- [#1035](https://github.com/jest-community/vscode-jest/pull/1035) - @connectdotz

#### 2. Support spawning jest with dashed arguments

In light of Angular's decision to drop support for CamelCase arguments, we've been hearing a lot of you asking for a switch to dashed-arguments when running Jest commands. Therefore, a new optional setting `"jest.useDashedArgs"` is introduced.

However, bear in mind that you might encounter compatibility issue with other tools/systems. For instance, we've identified an issue in react-script where `"watch-all"=false` (an argument the extension appended) isn't recognized (see facebook/react-script#12801 for more details). Please report them if you encounter any.

See [Customization](README.md#customization) for more details.


<!-- cSpell:ignore mjamin -->
- [jest-community/jest-editor-support#103](https://github.com/jest-community/jest-editor-support/pull/103) - @mjamin
- [#1034](https://github.com/jest-community/vscode-jest/pull/1034) - @connectdotz

#### 3. control extension activation within each folder
A new setting`"jest.enable"` is added as a quick way to turn off the extension feature for the given folder/virtual-folder without uninstall/disable completely in vscode. 

This is indeed similar to `"jest.disabledWorkspaceFolders"`, which is a "window" level setting (on the root of the workspace). Given the target is the folder itself, we believe it makes more sense to put the control `"jest.enable"` in folder level instead. It could also provide better extensibility down the road, such as "deferred-activation". We hope `"jest.enable"` will eventually replace `"jest.disabledWorkspaceFolders"`.

See [Customization](README.md#customization) for more details.

- [#1009](https://github.com/jest-community/vscode-jest/pull/1009) - @connectdotz

#### 4. Auto clear output upon test run

Introduced a new setting - `"jest.autoClearOutput"` - to clear the output terminal before each test run. Default is false for backward compatibility. This is useful when you want to see only the last run output. 

See [Customization](README.md#customization) for more details.

<!-- cSpell:ignore jgillick -->
- [#1014](https://github.com/jest-community/vscode-jest/pull/1014) - @jgillick

### Fixes
<!-- cSpell:ignore adrianisk Jazzkid0 ykray -->
- Fixed v2 debug config variable substitution for multi-variable in a given argument. ([#1040](https://github.com/jest-community/vscode-jest/pull/1040) - @adrianisk)
- Fixed a source code parsing error for nonLiteralName. ([#1024](https://github.com/jest-community/vscode-jest/pull/1024) - @connectdotz)
- Various documentation fixes 
  - [#1016](https://github.com/jest-community/vscode-jest/pull/1016) - @Jazzkid0 
  - [#1023](https://github.com/jest-community/vscode-jest/pull/1023) - @connectdotz 
  - [#1032](https://github.com/jest-community/vscode-jest/pull/1032) - @Ryan-Dia
  - [#1038](https://github.com/jest-community/vscode-jest/pull/1038) - @ykray (epic work!)
- Address security vulnerability with dependencies. ([#1011](https://github.com/jest-community/vscode-jest/pull/1011))

### CHANGELOG 
- [v6.0.0](https://github.com/jest-community/vscode-jest/releases/tag/v6.0.0)
  
---


