'use strict'

import fs = require('fs');

import {basename, dirname} from 'path';
import * as path from 'path';

// var esprima = require('esprima');
import * as babylon from 'babylon'

interface Location {
    line: number
    column: number
}

export class ItBlock {
    name: string
    file: string
    start: Location
    end: Location

    updateWithNode(node: any){
        this.start = node.loc.start
        this.end = node.loc.end
        this.name = node.expression.arguments[0].value
    }
}

export class TestFileParser {

    itBlocks: ItBlock[]

    async run(file: string): Promise<any> {
        let data = await this.generateAST(file)
        this.itBlocks = []
        this.findItBlocksInBody(data["program"])
        return data
    }

    foundItNode(node){
        let it = new ItBlock()
        it.updateWithNode(node)
        this.itBlocks.push(it)
    }

    isAnIt(node) {
        return (
            node.type === "ExpressionStatement" &&
            node.expression.type === "CallExpression"
        ) 
        &&
        (
            node.expression.callee.name === "it" ||
            node.expression.callee.name === "test"
        ) 
    }

     isADescribe(node) {
        return node.type === "ExpressionStatement" &&
        node.expression.type === "CallExpression" &&
        node.expression.callee.name === "describe"
    }

    findItBlocksInBody(root) {
        for (var node in root.body) {
            if (root.body.hasOwnProperty(node)) {
                var element = root.body[node];
                if (this.isADescribe(element)){
                    if (element.expression.arguments.length == 2) {
                        let newBody = element.expression.arguments[1].body
                        this.findItBlocksInBody(newBody);
                    }
                }
                if (this.isAnIt(element)) {
                    this.foundItNode(element)
                }        
            }
        }
    }

    generateAST(file: string): Promise<babylon.Node> {
        return new Promise((resolve, reject) =>{
            var parentDir = path.resolve(process.cwd(), '..');

            fs.readFile(file, "utf8", (err, data) => {
                if (err) { return reject(err.message) }
                resolve(babylon.parse(data, { sourceType:"module", plugins: ["jsx", "flow"] }))
            })  
        })
    }
}