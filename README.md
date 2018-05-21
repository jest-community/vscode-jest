# vscode-jest [![Build Status](https://travis-ci.org/jest-community/vscode-jest.svg?branch=master)](https://travis-ci.org/jest-community/vscode-jest)

## The Aim

A comprehensive experience when using [Facebook's Jest](https://github.com/facebook/jest) within a project.

* Useful IDE based Feedback
* Session based test watching

<img src="https://github.com/jest-community/vscode-jest/raw/master/images/vscode-jest.gif" alt="Screenshot of the tool" width="100%">

## Maintainers

Orta Therox ([@orta](https://github.com/orta)), Sean Poulter ([@seanpoulter](https://github.com/seanpoulter)), Vincent Voyer ([@vvo](https://github.com/vvo)) & ConnectDotz ([@connectdotz](https://github.com/connectdotz)).

## Features

* Starts Jest automatically when you're in a root folder project with Jest installed.
* Show individual fail / passes inline.
* Show fails inside the problem inspector.
* Highlights the errors next to the `expect` functions.
* Adds syntax highlighting to snapshot files.
* A one button update for failed snapshots.
* Show coverage information in files being tested. (_requires coverage to be collected by your jest config_)

## How to get it?

Open up VS Code, go search for the extension "Jest".

## How to get it set up?

This project has the expectation that you would run something like `npm run test` which _just_ looks like `jest` in the `package.json`. So, please keep your configuration inside the `package.json` as opposed to using command line arguments.

If have a more complex setup, it can probably be supported, check out the settings. They are all prefixed with `jest`.

Also, you should use Jest 17+, however 16 works - it will just offer a warning. We're aiming to try and do current Jest version - 1, but won't specifically drop support for older versions unless we're forced into it.


## How to start the Jest?

The extension will start Jest for you when:

* we find Jest configuration files in the workspace: `jest.config.js` or `jest.json`
* we find Jest installed in the workspace: `node_modules/.bin/jest`
* we find the workspace has been bootstrapped with create-react-app: `node_modules/react-scripts/node_modules/.bin/jest`
  - `node_modules/react-native-scripts`
* you run the **Jest: Start Runner** command


## How do I debug tests?

The simplest use cases should be supported out-of-the-box, but at the latest when VS Code displays errors about the attribute `program` or `runtimeExecutable` not being available, you have to create your own debug configuration within `launch.json`.

This plugin provides blueprints for debugging plain Jest setups or projects bootstrapped by `create-react-app`. (In the latter case you may have to edit the `runtimeExecutable` to reflect the used `react-scripts` package.) If those don't match your setup, you can modify the blueprints or create a completely new debug configuration, but keep in mind, that the `type` has to be `node` and that the configuration has to be named `"vscode-jest-tests"`. In order to learn more about debug/launch configurations in general, visit [VS Code Docs: Debugging](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations).

Starting with debugging is possible by clicking on the `debug` CodeLense above appendant `it` tests, but you can also debug all tests at once by starting debugging of `"vscode-jest-tests"` within the VS Code Debug Side Bar.

### Notes for troubleshooting

In contrast to previous versions of this plugin the debug settings are now independent from VS Code's `jest.pathToJest` and `jest.pathToConfig` setting. If you had to modify one of these, you pretty surely have to create a custom debug configuration and modify its path. This especially includes cases, in which `jest` isn't at its default location.


## How do I show code coverage?

To show code coverage in the VS Code, you will need to:

- Configure Jest to collect coverage information using [the config](https://facebook.github.io/jest/docs/en/configuration.html#collectcoverage-boolean) or [command line options](https://facebook.github.io/jest/docs/en/cli.html#coverage)
- Show the coverage overlay:
  - Run the **Jest: Toggle Coverage Overlay** command to show the overlay once
  - To configure the extension to show the coverage overlay when your workspace loads, add the following setting:
    ```json
    {
        "jest.showCoverageOnLoad": true
    }
    ```

<!--
### TODO: Change overlay format
Use a setting that's one of "", "", etc.
```json
{
    "jest.?": ""
}
```

Screenshots:
* Default
* Gutters
-->

## Inspiration

I'd like to give a shout out to [Wallaby.js](https://wallabyjs.com), which is a significantly more comprehensive and covers a lot more editors, if this extension interests you - check out that too.


## Wanted

Someone to take responsibility for ensuring that the default setup for create-react-app is always working. All the current authors use TypeScript and React/React Native and so have very little familiarity with changes to CRA. _Apply via PRs :D_.


## Troubleshooting

If you don't use the root of your project for your JS with Jest tests, do not worry, you can still use this project. You will need to use the "Start Jest Runner" command, and maybe have to configure your own `jest.pathToJest` setting inside the `.vscode/settings.json` to whatever you would use.

These are the [activation events](https://code.visualstudio.com/docs/extensionAPI/activation-events) which trigger the runner to start:

```json
  "activationEvents": [
    "workspaceContains:node_modules/.bin/jest",
    "workspaceContains:node_modules/react-scripts/node_modules/.bin/jest",
    "workspaceContains:node_modules/react-native-scripts",
    "onCommand:io.orta.jest.start"
  ],
```

These are the things that will trigger the extension loading. If one of these applies, and you're not seeing the "Jest" in the bottom bar, run the command `Open Developer Tools` and see if something has crashed, we'd love to know what that is, and ideally a project we can run against.


## Want to Contribute?

Thanks for considering! Check [here](CONTRIBUTING.md) for useful tips and guidelines.
