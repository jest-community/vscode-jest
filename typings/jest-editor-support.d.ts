declare module 'jest-editor-support' {
    import { EventEmitter } from 'events';
    
    export class Runner extends EventEmitter {
        constructor(workspace: ProjectWorkspace);
        start(): void;
        closeProcess(): void;
        runJestWithUpdateForSnapshots(completion: any): void;
    }
    
    export class Settings extends EventEmitter {
        constructor(workspace: ProjectWorkspace);
        getConfig(completed: any): void;
        jestVersionMajor: number | null;
        settings: {
            testRegex: string;
        };
    }
    
    export class ProjectWorkspace {
        constructor(a, b, c);
        pathToJest: string;
        rootPath: string;
        pathToConfig: string;
    }

    export interface IParseResults {
        expects: Expect[];
        itBlocks: ItBlock[];
    }
    
    export function parse(file: string): IParseResults;
    export type ItBlock = any;
    export type Expect = any;
    
    export class TestReconciler {
        stateForTestFile(file: string): any;
        stateForTestAssertion(file: string, name: string): any;
        failedStatuses(): any;
        updateFileWithJestStatus(data): void;
    }
}