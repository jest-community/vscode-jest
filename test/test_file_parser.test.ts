// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as myExtension from '../src/extension';

import Parser from '../src/test_file_parser'

suite("File Parsing", () => {

    test("Something 1", async () => {
        let parser = new Parser()
        const ast = await parser.run(__dirname + "/../../test/fixtures/jest-repl-test.jstest.js")
        assert.equal(ast, {});
    });
});