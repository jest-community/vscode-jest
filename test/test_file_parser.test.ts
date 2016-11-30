// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

import { TestFileParser } from '../src/lib/test_file_parser';

suite("File Parsing", () => {

    test("For the simplest global case", async () => {
        let parser = new TestFileParser();
        await parser.run(__dirname + "/../../test/fixtures/global_its.js");
        assert.equal(parser.itBlocks.length, 2);
        
        let firstIt = parser.itBlocks[0];
        assert.equal(firstIt.name, "works with old functions");
        assert.notStrictEqual(firstIt.start, { line: 1, column: 0 });
        assert.notStrictEqual(firstIt.end, { line: 3, column: 0 });

        let secondIt = parser.itBlocks[1];
        assert.equal(secondIt.name, "works with new functions");
        assert.notStrictEqual(secondIt.start, { line: 5, column: 0 });
        assert.notStrictEqual(secondIt.end, { line: 7, column: 0 });
    });
    
    test("For its inside describes", async () => {
        let parser = new TestFileParser();
        await parser.run(__dirname + "/../../test/fixtures/nested_its.js");
        assert.equal(parser.itBlocks.length, 3);
        
        let firstIt = parser.itBlocks[0];
        assert.equal(firstIt.name, "1");
        assert.deepEqual(firstIt.start, { line: 2, column: 4 });
        assert.deepEqual(firstIt.end, { line: 3, column: 6 });

        let secondIt = parser.itBlocks[1];
        assert.equal(secondIt.name, "2");
        assert.deepEqual(secondIt.start, { line: 4, column: 4 });
        assert.deepEqual(secondIt.end, { line: 5, column: 6 });

        let thirdIt = parser.itBlocks[2];
        assert.equal(thirdIt.name, "3");
        assert.deepEqual(thirdIt.start, { line: 9, column: 4 });
        assert.deepEqual(thirdIt.end, { line: 10, column: 6 });
    });

    test("For a danger test file (which has flow annotations)", async () => {
        let parser = new TestFileParser();
        await parser.run(__dirname + "/../../test/fixtures/dangerjs/travis-ci.jstest.js");
        assert.equal(parser.itBlocks.length, 7);
    });

    test("For a metaphysics test file", async () => {
        let parser = new TestFileParser();
        await parser.run(__dirname + "/../../test/fixtures/metaphysics/partner_show.js");
        assert.equal(parser.itBlocks.length, 8);
    });

    test("For a danger flow test file ", async () => {
        let parser = new TestFileParser();
        await parser.run(__dirname + "/../../test/fixtures/dangerjs/github.jstest.js");
        assert.equal(parser.itBlocks.length, 2);
    });
});