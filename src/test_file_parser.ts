'use strict'

import fs = require('fs');

import {basename, dirname} from 'path';
import * as path from 'path';

// var esprima = require('./esprima.js');
// import esprima from 'esprima'
var esprima = require('esprima');

// var esprima = require("src/esprima.ts")


export default class TestFileParser {
    run(file: string): Promise<any> {
        return new Promise((resolve, reject) =>{
            console.log( process.cwd() )

            var parentDir = path.resolve(process.cwd(), '..');

            fs.readFile(file, "utf8", (err, data) => {
                if (err) { return reject(err.message) }
                resolve(JSON.stringify(esprima.parse(data)))
            })  
        })
    }
}