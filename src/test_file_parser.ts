'use strict';

import fs = require('fs');
import * as babylon from 'babylon';

interface Location {
    line: number;
    column: number;
}

export class ItBlock {
    name: string;
    file: string;
    start: Location;
    end: Location;

    updateWithNode(node: any){
        this.start = node.loc.start;
        this.end = node.loc.end;
        this.name = node.expression.arguments[0].value;
    }
}

export class TestFileParser {

    itBlocks: ItBlock[];

    async run(file: string): Promise<any> {
        try {
            let data = await this.generateAST(file);
            this.itBlocks = [];
            this.findItBlocksInBody(data["program"], file);
            return data;
        } catch (error) {
            return {};
        }
    }

    foundItNode(node: any, file: string){
        let it = new ItBlock();
        it.updateWithNode(node);
        it.file = file;
        this.itBlocks.push(it);
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
        ); 
    }

     isADescribe(node) {
        return node.type === "ExpressionStatement" &&
        node.expression.type === "CallExpression" &&
        node.expression.callee.name === "describe";
    }

    findItBlocksInBody(root: any, file: string) {
        for (var node in root.body) {
            if (root.body.hasOwnProperty(node)) {
                var element = root.body[node];
                if (this.isADescribe(element)){
                    if (element.expression.arguments.length === 2) {
                        let newBody = element.expression.arguments[1].body;
                        this.findItBlocksInBody(newBody, file);
                    }
                }
                if (this.isAnIt(element)) {
                    this.foundItNode(element, file);
                }        
            }
        }
    }

    generateAST(file: string): Promise<babylon.Node> {
        return new Promise((resolve, reject) =>{
            fs.readFile(file, "utf8", (err, data) => {
                if (err) { return reject(err.message); }
                resolve(
                    babylon.parse(data, { sourceType:"module", plugins: ["jsx", "flow"] })
                );
            });  
        });
    }
}