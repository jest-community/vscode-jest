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

interface BaseNodeType {
  zeroBasedLine: number;
  name: string;
}

type ContextType = 'container' | 'data';

/* interface implementation */
class DataNode<T> implements BaseNodeType {
  name: string;
  zeroBasedLine: number;
  data: T[];

  constructor(name: string, zeroBasedLine: number, data: T) {
    this.name = name;
    this.zeroBasedLine = zeroBasedLine;
    this.data = [data];
  }

  merge(another: DataNode<T>): boolean {
    if (another.zeroBasedLine !== this.zeroBasedLine) {
      return false;
    }
    this.data.push(...another.data);
    return true;
  }

  /** return the only element in the list, exception otherwise */
  only(): T {
    if (this.data.length !== 1) {
      throw new TypeError(`expect 1 element but got ${this.data.length} elements`);
    }
    return this.data[0];
  }
  /** return the first element, if no element, returns undefined */
  first(): T | undefined {
    if (this.data.length > 0) {
      return this.data[0];
    }
  }
}

export class ContainerNode<T> implements BaseNodeType {
  public childContainers: ContainerNode<T>[] = [];
  public childData: DataNode<T>[] = [];
  public zeroBasedLine: number;
  public name: string;

  constructor(name: string) {
    this.name = name;
    this.zeroBasedLine = -1;
  }

  public addContainerNode(container: ContainerNode<T>): void {
    this.childContainers.push(container);
  }

  public addDataNode(dataNode: DataNode<T>): void {
    this.childData.push(dataNode);
  }

  public findContainer(path: string[], createIfMissing = true): ContainerNode<T> | undefined {
    if (path.length <= 0) {
      return this;
    }
    const pn = path[0];
    let container = this.childContainers.find((c) => c.name === pn);
    if (!container && createIfMissing) {
      container = new ContainerNode(pn);
      this.addContainerNode(container);
    }
    return container?.findContainer(path.slice(1), createIfMissing);
  }

  /**
   * deeply sort all child-data and child-containers by line position.
   * @param grouping if true, will try to merge child-data with the same line
   */
  public sort(grouping = false): void {
    const sortByLine = (n1: BaseNodeType, n2: BaseNodeType): number =>
      n1.zeroBasedLine - n2.zeroBasedLine;
    const groupData = (list: DataNode<T>[], data: DataNode<T>): DataNode<T>[] => {
      if (list.length <= 0) {
        return [data];
      }
      // if not able to merge with previous node, i.e . can not group, add it to the list
      if (!list[list.length - 1].merge(data)) {
        list.push(data);
      }
      return list;
    };

    this.childData.sort(sortByLine);
    if (grouping) {
      this.childData = this.childData.reduce(groupData, []);
    }

    // recursive to sort childContainers, then sort the list itself
    this.childContainers.forEach((c) => c.sort(grouping));
    this.childContainers.sort(sortByLine);

    // if container doesn't have valid line info, use the first child's
    if (this.zeroBasedLine < 0) {
      const topLines = [this.childData, this.childContainers]
        .map((l) => (l.length > 0 ? l[0].zeroBasedLine : undefined))
        .filter((n) => n);
      this.zeroBasedLine = Math.min(...topLines);
    }
  }
}
type NodeType<T> = ContainerNode<T> | DataNode<T>;

const ROOT_NODE_NAME = '__root__';
export const buildAssertionContainer = (
  assertions: TestAssertionStatus[]
): ContainerNode<TestAssertionStatus> => {
  const root = new ContainerNode<TestAssertionStatus>(ROOT_NODE_NAME);
  if (assertions.length > 0) {
    assertions.forEach((a) => {
      const container = root.findContainer(a.ancestorTitles, true);
      container.addDataNode(new DataNode(a.title, a.location?.line ?? 0, a));
    });
    // group by line since there could be multiple assertions for the same test block, such
    // as in the jest.each use case
    root.sort(true);
  }
  return root;
};

export const buildSourceContainer = (sourceRoot: ParsedNode): ContainerNode<ItBlock> => {
  const isDescribeBlock = (node: ParsedNode): node is DescribeBlock => node.type === 'describe';
  const isItBlock = (node: ParsedNode): node is ItBlock => node.type === 'it';
  const buildNode = (node: ParsedNode, parent: ContainerNode<ItBlock>): void => {
    let container = parent;
    if (isDescribeBlock(node)) {
      container = new ContainerNode(node.name);
      parent.addContainerNode(container);
    } else if (isItBlock(node)) {
      parent.addDataNode(new DataNode(node.name, node.start.line - 1, node));
    }

    node.children?.forEach((n) => buildNode(n, container));
  };

  const root = new ContainerNode<ItBlock>(ROOT_NODE_NAME);
  buildNode(sourceRoot, root);
  // do not need to do grouping since there can't be test blocks that share lines
  root.sort(false);
  return root;
};

const matchPos = (t: ItBlock, a: TestAssertionStatus): boolean => {
  const line = a.line ?? a.location?.line;
  return line >= t.start.line && line <= t.end.line;
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
      assertion?.line >= test.start.line && assertion?.line <= test.end.line
        ? assertion.line - 1
        : test.end.line - 1,
  };
};

/** mark all data and child containers unmatched */
const toUnmatchedResults = (tContainer: ContainerNode<ItBlock>, err: string): TestResult[] => {
  const results = tContainer.childData.map((n) => toMatchResult(n.data[0], err));
  tContainer.childContainers.forEach((c) => results.push(...toUnmatchedResults(c, err)));
  return results;
};

type MessageType = 'context-mismatch' | 'match-failed' | 'unusual-match' | 'duplicate-test-name';
const makeWarning = (fileName: string, verbose: boolean) => (
  messageType: MessageType,
  contextType: ContextType,
  source: ContainerNode<ItBlock> | DataNode<ItBlock>,
  assertion?: ContainerNode<TestAssertionStatus> | DataNode<TestAssertionStatus>,
  extraReason?: string
): void => {
  if (!verbose) {
    return;
  }

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
    case 'duplicate-test-name': {
      output(
        `duplicate test names in the same describe block is not recommanded and might not be matched reliably: ${blockType} ${source.name}`
      );
      break;
    }
    case 'unusual-match': {
      output(`unusual match: ${extraReason} : ${blockType} ${source.name}: `);
      break;
    }
  }
};

const hasSameStructure = <N1 extends BaseNodeType, N2 extends BaseNodeType>(
  list1: N1[],
  list2: N2[]
): boolean => list1.length === list2.length;

/**
 * match tests container with assertion container by their context structure.
 * @param fileName
 * @param tContainer
 * @param aContainer
 * @param verbose turns on/off the debugging warning messages.
 */

export const matchByContext = (
  fileName: string,
  tContainer: ContainerNode<ItBlock>,
  aContainer: ContainerNode<TestAssertionStatus>,
  verbose = true
): TestResult[] => {
  const warning = makeWarning(fileName, verbose);

  /**
   * this is where the actual match occurred. Each test and assertion container pair will try
   * to match both its child-data and child-container list recursively.
   *
   * @param _tContainer
   * @param _aContainer
   * @returns a list of TestResult collected from all its children (data + containers)
   */
  const _matchByContext = (
    _tContainer: ContainerNode<ItBlock>,
    _aContainer: ContainerNode<TestAssertionStatus>
  ): TestResult[] => {
    // the match algorithm: first match by sequence if their have the same structure;
    // then fallback to simple name-based matching. Upon each test block, it invokes the
    // callback to process the matched results.
    const matchList = <N1 extends NodeType<ItBlock>, N2 extends NodeType<TestAssertionStatus>>(
      list1: N1[],
      list2: N2[],
      onResult: (n1: N1, n2: N2[]) => void
    ): void => {
      if (hasSameStructure(list1, list2)) {
        list1.forEach((n, idx) => onResult(n, [list2[idx]]));
      } else {
        warning('context-mismatch', 'container', _tContainer, _aContainer);
        list1.forEach((n) => {
          // duplicate names under the same layer is really illegal jest practice, they can not
          // be reliably resolved with name-based matching
          if (list1.filter((n1) => n1.name === n.name).length > 1) {
            warning('duplicate-test-name', 'container', n);
            onResult(n, []);
          } else {
            const found = list2.filter((n2) => n2.name === n.name);
            onResult(n, found);
          }
        });
      }
    };

    const handleTestBlockMatch = (
      t: DataNode<ItBlock>,
      matched: DataNode<TestAssertionStatus>[]
    ): TestResult => {
      if (matched.length !== 1) {
        return toMatchResult(t.only(), `found ${matched.length} matched assertion(s)`);
      }
      const a = matched[0];
      const itBlock = t.only();
      switch (a.data.length) {
        case 0:
          throw new TypeError(
            `invalid state: assertion data should not be empty if it is a match!`
          );
        case 1: {
          const assertion = a.only();
          if (a.name !== t.name && !matchPos(itBlock, assertion)) {
            warning('unusual-match', 'data', t, a, 'neither name nor line matched');
          }
          return toMatchResult(itBlock, assertion);
        }
        default: {
          // 1-to-many
          warning('unusual-match', 'data', t, a, '1-to-many match, jest.each perhaps?');

          // TODO: support multiple errorLine
          // until we support multiple errors, choose the first error assertion, if any
          const assertions =
            a.data.find((assertion) => assertion.status === 'KnownFail') || a.first();
          return toMatchResult(itBlock, assertions);
        }
      }
    };

    const handleDescribeBlockMatch = (
      t: ContainerNode<ItBlock>,
      matched: ContainerNode<TestAssertionStatus>[]
    ): TestResult[] => {
      if (matched.length !== 1) {
        warning('match-failed', 'container', t);
        // if we can't find corresponding container to match, the whole container will be considered unmatched
        return toUnmatchedResults(t, `can not find matching assertion for block ${t.name}`);
      }
      return _matchByContext(t, matched[0]);
    };

    const matchResults: TestResult[] = [];
    matchList(_tContainer.childData, _aContainer.childData, (t, results) =>
      matchResults.push(handleTestBlockMatch(t, results))
    );
    matchList(_tContainer.childContainers, _aContainer.childContainers, (t, results) =>
      matchResults.push(...handleDescribeBlockMatch(t, results))
    );

    return matchResults;
  };
  return _matchByContext(tContainer, aContainer);
};
