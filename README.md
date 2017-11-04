# vscode-jest [![Build Status](https://travis-ci.org/orta/vscode-jest.svg?branch=master)](https://travis-ci.org/orta/vscode-jest)

## The Aim

A comprehensive experience when using [Facebook's Jest](https://github.com/facebook/jest) within a project.

* Useful IDE based Feedback
* Session based test watching

<img src="https://github.com/orta/vscode-jest/raw/master/images/vscode-jest.gif" alt="Screenshot of the tool" width="100%">

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
    "onCommand:io.orta.jest.start"
  ],
```

These are the things that will trigger the extension loading. If one of these applies, and you're not seeing the "Jest" in the bottom bar, run the command `Open Developer Tools` and see if something has crashed, we'd love to know what that is, and ideally a project we can run against.

## Want to Contribute?

The extension is in two parts, one is _this_ repo. It contains all the VS Code specific work.

```js
git clone https://github.com/orta/vscode-jest
cd vscode-jest
yarn install
code .
```

The other part is inside the [Jest source code](http://github.com/facebook/jest/). It's a node module called "[jest-editor-support](https://github.com/facebook/jest/tree/master/packages/jest-editor-support)".

It's very possible that you're going to want to make changes inside here, if you're doing something that touches the test runner process or file parsers. To get that set up to work I'd recommend doing this:

```
# set up jest
cd ..
git clone https://github.com/facebook/jest.git
cd jest
yarn install

# link jest-editor-support
cd packages/jest-editor-support
yarn link

# set up vscode-jest to use the real jest-editor-support
cd ../../..
cd vscode-jest
yarn link jest-editor-support


# go back and start the jest build watcher
cd ..
cd jest
yarn watch
```

With that installed, you want to use a custom `jest-editor-support` by going into `cd packages/jest-editor-support` and running `yarn link`.

Go back to vscode-jest, and do one more `yarn link "jest-editor-support"` and now you're using those files directly from master of Jest.

As `jest-editor-support` requires running through Babel, you can run the Babel watcher for all Jest files by running `yarn run watch` inside the Jest root directory.

Yeah, it's a bit of a process, but we'll be sharing code with the nuclide team and that's worth it IMO.
