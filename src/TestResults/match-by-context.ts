/**
 * matching tests with assertion by its `context`, i.e. describe/test block structure
 * as well as sequence (by relative line position) in its context.
 *
 * The assumption is both source parser and jest have generated correct output,
 * while the names of the test might not always match (such as template-literal, jest.each use cases),
 * nor the line numbers (due to source map difference and other transpile complication),
 * the relative position should be the same, i.e. the first assertion in describe-block X
 * should always match the first test block under the same describe block and so on.
 */

import { ItBlock, TestAssertionStatus, ParsedNode, DescribeBlock } from 'jest-editor-support';
import { TestReconciliationState } from './TestReconciliationState';
import { TestResult } from './TestResult';

const matchPos = (t: ItBlock, a: TestAssertionStatus): boolean =>
  (a.line !== undefined && a.line >= t.start.line && a.line <= t.end.line) ||
  (a.location && a.location.line >= t.start.line && a.location.line <= t.end.line);

export interface NodeBase {
  zeroBasedLine: number;
}
export interface DataNode<T> extends NodeBase {
  name: string;
  data: T;
}
export interface DataGroupNode<T> extends NodeBase {
  nodes: DataNode<T>[];
}

type DataNodeType<T> = DataNode<T> | DataGroupNode<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isDataNode = (arg: any): arg is DataNode<unknown> =>
  typeof arg.name === 'string' && typeof arg.zeroBasedLine === 'number';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isDataGroupNode = (arg: any): arg is DataGroupNode<unknown> =>
  arg && typeof arg.zeroBasedLine === 'number' && Array.isArray(arg.nodes);

export interface ContainerNode<T> extends NodeBase {
  name: string;
  childContainers: ContainerNode<T>[];
  childData: DataNodeType<T>[];
  zeroBasedLine: number;

  findContainer: (parentNames: string[], createIfMissing?: boolean) => ContainerNode<T> | undefined;
  addData: (name: string, zeroBasedLine: number, data: T) => void;
  addContainer: (container: ContainerNode<T>) => void;
  sortByLine: (grouping?: boolean) => void;
}

type ContextType = 'container' | 'data';

export class ContainerNode<T> implements ContainerNode<T> {
  public childContainers: ContainerNode<T>[] = [];
  public childData: DataNodeType<T>[] = [];
  public zeroBasedLine: number;

  constructor(name: string) {
    this.name = name;
    this.zeroBasedLine = -1;
  }

  public addContainer = (container: ContainerNode<T>): void => {
    this.childContainers.push(container);
  };

  public findContainer = (
    parentNames: string[],
    createIfMissing = true
  ): ContainerNode<T> | undefined => {
    if (parentNames.length <= 0) {
      return this;
    }
    const pn = parentNames[0];
    let container = this.childContainers.find((c) => c.name === pn);
    if (!container && createIfMissing) {
      container = new ContainerNode(pn);
      this.addContainer(container);
    }
    return container?.findContainer(parentNames.slice(1), createIfMissing);
  };

  public addData = (name: string, zeroBasedLine: number, data: T): void => {
    // TODO: jest-editor-support has a bug that for jest.test it will report undefined as name
    const node: DataNode<T> = { name: name || '', zeroBasedLine, data };
    this.childData.push(node);
  };

  /**
   * sort by the zeroBaseLine. If grouping is true,
   * combines the data node with the same line into a group
   */
  public sortByLine = (grouping = false): void => {
    const sortChildData = (): void => {
      if (this.childData.length <= 0) {
        return;
      }
      this.childData.sort((n1, n2) => n1.zeroBasedLine - n2.zeroBasedLine);
      this.zeroBasedLine = this.childData[0].zeroBasedLine;
      if (!grouping) {
        return;
      }

      const grouped = this.childData.reduce<DataNodeType<T>[]>((list, data) => {
        if (list.length <= 0) {
          return [data];
        }
        let last = list.pop();
        if (last.zeroBasedLine === data.zeroBasedLine) {
          const dataNodes = isDataNode(data) ? [data] : data.nodes;

          if (isDataGroupNode(last)) {
            last.nodes.push(...dataNodes);
          } else {
            last = { zeroBasedLine: last.zeroBasedLine, nodes: [last, ...dataNodes] };
          }
        } else {
          list.push(last);
          last = data;
        }
        list.push(last);
        return list;
      }, []);
      this.childData = grouped;
    };

    sortChildData();
    this.childContainers.forEach((c) => c.sortByLine(grouping));
    this.childContainers.sort((n1, n2) => n1.zeroBasedLine - n2.zeroBasedLine);
  };

  public hasSameStructure = (
    another: ContainerNode<unknown> | undefined,
    types: ContextType[]
  ): boolean => {
    return (
      this.name === another.name &&
      (!types.includes('data') || this.childData.length === another.childData.length) &&
      (!types.includes('container') ||
        this.childContainers.length === another.childContainers.length)
    );
  };
}

const ROOT_NODE_NAME = '__root__';
export const buildAssertionContainer = (
  assertions: TestAssertionStatus[]
): ContainerNode<TestAssertionStatus> => {
  const root = new ContainerNode<TestAssertionStatus>(ROOT_NODE_NAME);
  if (assertions.length > 0) {
    assertions.forEach((a) => {
      const container = root.findContainer(a.ancestorTitles, true);
      container.addData(a.title, a.location?.line ?? 0, a);
    });
    // group by line since there could be multiple assertions for the same test block, such
    // as in the jest.each use case
    root.sortByLine(true);
  }
  return root;
};

const isDescribeBlock = (node: ParsedNode): node is DescribeBlock => node.type === 'describe';
const isItBlock = (node: ParsedNode): node is ItBlock => node.type === 'it';

export const buildSourceContainer = (sourceRoot: ParsedNode): ContainerNode<ItBlock> => {
  const buildNode = (node: ParsedNode, parent: ContainerNode<ItBlock>): void => {
    let container = parent;
    if (isDescribeBlock(node)) {
      container = new ContainerNode(node.name);
      parent.addContainer(container);
    } else if (isItBlock(node)) {
      parent.addData(node.name, node.start.line - 1, node);
    }

    node.children?.forEach((n) => buildNode(n, container));
  };

  const root = new ContainerNode<ItBlock>(ROOT_NODE_NAME);
  buildNode(sourceRoot, root);
  // do not group by line since there can't be test blocks that share lines
  root.sortByLine(false);
  return root;
};

export const toMatchResult = (
  test: ItBlock,
  assertionOrErr: TestAssertionStatus | string
): TestResult => {
  const assertion = typeof assertionOrErr === 'string' ? undefined : assertionOrErr;
  const err = typeof assertionOrErr === 'string' ? assertionOrErr : undefined;

  // Note the shift from one-based to zero-based line number and columns
  return {
    name: test.name,
    start: {
      column: test.start.column - 1,
      line: test.start.line - 1,
    },
    end: {
      column: test.end.column - 1,
      line: test.end.line - 1,
    },

    status: assertion ? assertion.status : TestReconciliationState.Unknown,
    shortMessage: assertion ? assertion.shortMessage : err,
    terseMessage: assertion ? assertion.terseMessage : undefined,
    lineNumberOfError:
      assertion &&
      assertion.line &&
      assertion.line >= test.start.line &&
      assertion.line <= test.end.line
        ? assertion.line - 1
        : test.end.line - 1,
  };
};

const assertSourceDataNode = (node: DataNodeType<ItBlock>): DataNode<ItBlock> => {
  if (!isDataNode(node)) {
    throw new TypeError(`Source data do not support group context: ${JSON.stringify(node)}`);
  }
  return node;
};
/** mark all data and child containers unmatched */
const toUnmatcheResults = (tContainer: ContainerNode<ItBlock>, err: string): TestResult[] => {
  const results = tContainer.childData.map((n) => toMatchResult(assertSourceDataNode(n).data, err));
  tContainer.childContainers.forEach((c) => results.push(...toUnmatcheResults(c, err)));
  return results;
};

const extractContainerData = <T>(container: ContainerNode<T>): T[] =>
  container.childData.reduce<T[]>((list, n) => {
    if (isDataNode(n)) {
      list.push(n.data);
    } else {
      list.push(...n.nodes.map((nn) => nn.data));
    }
    return list;
  }, []);

type MessageType = 'context-mismatch' | 'match-failed' | 'unusual-match';
const makeWarning = (fileName: string) => (
  messageType: MessageType,
  contextType: ContextType,
  source: ContainerNode<ItBlock> | DataNode<ItBlock>,
  assertion?: ContainerNode<TestAssertionStatus> | DataNodeType<TestAssertionStatus>,
  extraReason?: string
): void => {
  const output = (message: string): void =>
    console.warn(`[${fileName}] ${message} \n source=`, source, `\n assertion=`, assertion);

  const blockType = contextType === 'container' ? 'describe' : 'test';
  switch (messageType) {
    case 'context-mismatch':
      output(
        `!! context mismatched !! ${contextType} nodes are different under "${source.name}": `
      );
      break;
    case 'match-failed': {
      output(`!! match failed !! ${blockType}: "${source.name}": ${extraReason} `);
      break;
    }
    case 'unusual-match': {
      output(`unusual match: ${extraReason} : ${blockType} ${source.name}: `);
      break;
    }
  }
};

/**
 * match tests container with assertion container by their context structure.
 *
 * @param tContainer
 * @param aContainer
 * @param isGreedy optional, default to false. If the context did not match, we can still
 * try to match by name. However it is not clear what could cause context misalignment in real world,
 * therefore, hard to decide if we even need this?
 */

export const matchByContext = (
  fileName: string,
  tContainer: ContainerNode<ItBlock>,
  aContainer: ContainerNode<TestAssertionStatus>
): TestResult[] => {
  const warning = makeWarning(fileName);

  const _matchByContext = (
    _tContainer: ContainerNode<ItBlock>,
    _aContainer: ContainerNode<TestAssertionStatus>
  ): TestResult[] => {
    /* simple name-based look up as a fallback, best effort attempt for mismatched data nodes */
    const matchDataByName = (): TestResult[] => {
      let assertions = extractContainerData(_aContainer);
      const results = _tContainer.childData.map((node) => {
        const n = assertSourceDataNode(node);
        const testName = n.data.name;
        const found = assertions.filter((a) => a.title === testName);
        switch (found.length) {
          case 0: {
            const reason = `missing assertion`;
            warning('match-failed', 'data', n, undefined, reason);
            return toMatchResult(n.data, reason);
          }
          case 1:
            assertions = assertions.filter((a) => a != found[0]);
            return toMatchResult(n.data, found[0]);
          default: {
            const reason = `found too many (${found.length}) assertions`;
            warning('match-failed', 'data', n, _aContainer, reason);
            return toMatchResult(n.data, reason);
          }
        }
      });
      return results;
    };

    // recursive to match each childContainer
    const matchChildContainers = (): TestResult[] => {
      const lookupByName = !_tContainer.hasSameStructure(_aContainer, ['container']);
      if (lookupByName) {
        warning('context-mismatch', 'container', _tContainer, _aContainer);
      }
      return _tContainer.childContainers.reduce<TestResult[]>((list, c, idx) => {
        const ac = lookupByName
          ? _aContainer.findContainer([c.name])
          : _aContainer.childContainers[idx];

        if (ac) {
          list.push(..._matchByContext(c, ac));
        } else {
          warning('match-failed', 'container', c);
          // nothing to match, mark all data and containers unknown
          list.push(...toUnmatcheResults(c, `source and assertion misalign in block ${c.name}`));
        }

        return list;
      }, []);
    };

    const matchChildData = (): TestResult[] => {
      return _tContainer.childData.map((iNode, idx) => {
        const srcNode = assertSourceDataNode(iNode);
        const candidate = _aContainer.childData[idx];
        // do some validation and give warning for low confidence matching
        if (isDataNode(candidate)) {
          if (candidate.name !== srcNode.name && !matchPos(srcNode.data, candidate.data)) {
            warning('unusual-match', 'data', srcNode, candidate, 'neither name nor line matched');
          }
          return toMatchResult(srcNode.data, candidate.data);
        }

        // handle 1-to-many match here
        warning('unusual-match', 'data', srcNode, candidate, '1-to-many match, jest.each ?');

        // if not all assertions pass: consider it failed...
        const assertions: TestAssertionStatus[] = candidate.nodes.map((n) => n.data);
        // TODO: support multiple errorLine
        // until we support multiple errors, choose the first error assertion, if any
        const targetAssertion = assertions.find((a) => a.status === 'KnownFail') || assertions[0];
        return toMatchResult(srcNode.data, targetAssertion);
      });
    };

    let matchResults: TestResult[];
    // validate out assumption: we assumed that the source and assertion
    // structure will match... throw exception if not
    if (!_tContainer.hasSameStructure(_aContainer, ['data'])) {
      warning('context-mismatch', 'data', _tContainer, _aContainer);
      matchResults = matchDataByName();
    } else {
      matchResults = matchChildData();
    }
    matchResults.push(...matchChildContainers());

    // now we just go to each leave to match them up
    return matchResults;
  };
  return _matchByContext(tContainer, aContainer);
};
