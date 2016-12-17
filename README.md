## The Aim

A comprehensive experience when using [Facebook's Jest](https://github.com/facebook/jest) within a project.

* Useful IDE based Feedback
* Session based test watching

![Screenshot](https://github.com/orta/vscode-jest/raw/master/images/vscode-jest.gif)

## Features

* Starts Jest automatically when you're in a project with Jest installed.
* Show individual fail / passes inline.
* Show fails inside the problem inspector.
* Highlights the errors next to the `expect` functions.
* Adds syntax highlighting to snapshot files.
* A one button update for failed snapshots.

## How to get it?

Open up VS Code, go search for the extension "Jest"

## How to get it set up?

This project has the expectation that you would run something like `npm run test` which _just_ looks like `jest` in the `package.json`. So, please keep your configuration inside the `package.json` as opposed to using command line arguments.

Also, you should use Jest 17+, however 16 works - it will just offer a warning.

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
cd ..
git clone https://github.com/facebook/jest.git
cd jest
yarn install
```

Then go back into vscode, and edit the dependency in `package.json` to `"jest-editor-support": "file:../jest/packages/jest-editor-support",`. 

Do one more `yarn install` in the vscode-jest dir and now you're using those files directly from master of Jest.

Yeah, it's a bit of a process, but we'll be sharing code with the nuclide team and that's worth it IMO.
