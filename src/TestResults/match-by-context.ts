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
    const [target, ...remaining] = path;
    let container = this.childContainers.find((c) => c.name === target);
    if (!container && createIfMissing) {
      container = new ContainerNode(target);
      this.addContainerNode(container);
    }
    return container?.findContainer(remaining, createIfMissing);
  }

  /**
   * deeply sort inline all child-data and child-containers by line position.
   * it will update this.zeroBasedLine based on its top child, if it is undefined.
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

    // recursive to sort childContainers, which will update its lineNumber and then sort the list itself
    this.childContainers.forEach((c) => c.sort(grouping));
    this.childContainers.sort(sortByLine);

    // if container doesn't have valid line info, use the first child's
    if (this.zeroBasedLine < 0) {
      const topLines = [this.childData, this.childContainers]
        .filter((l) => l.length > 0)
        .map((l) => l[0].zeroBasedLine);
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

const matchPos = (t: ItBlock, a?: TestAssertionStatus, allowLocation = true): boolean => {
  const line = a?.line ?? (allowLocation && a.location?.line);
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

    status: assertion?.status ?? TestReconciliationState.Unknown,
    shortMessage: assertion?.shortMessage ?? err,
    terseMessage: assertion?.terseMessage,
    lineNumberOfError: matchPos(test, assertion, false) ? assertion.line - 1 : test.end.line - 1,
  };
};

/** mark all data and child containers unmatched */
const toUnmatchedResults = (tContainer: ContainerNode<ItBlock>, err: string): TestResult[] => {
  const results = tContainer.childData.map((n) => toMatchResult(n.only(), err));
  tContainer.childContainers.forEach((c) => results.push(...toUnmatchedResults(c, err)));
  return results;
};

type MessageType = 'context-mismatch' | 'match-failed' | 'unusual-match' | 'duplicate-test-name';
const createMessaging = (fileName: string, verbose: boolean) => (
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
type Messaging = ReturnType<typeof createMessaging>;

/**
 * create a handler to process matched test block: (test, assertion) pair
 * @param config
 * @return a function to match each it block
 */
const HandleTestBlockMatch = (config: {
  messaging: Messaging;
  onResult: (result: TestResult) => void;
}) => (t: DataNode<ItBlock>, matched: DataNode<TestAssertionStatus>[]): void => {
  const { messaging, onResult } = config;
  if (matched.length !== 1) {
    return onResult(toMatchResult(t.only(), `found ${matched.length} matched assertion(s)`));
  }
  const a = matched[0];
  const itBlock = t.only();
  switch (a.data.length) {
    case 0:
      throw new TypeError(`invalid state: assertion data should not be empty if it is a match!`);
    case 1: {
      const assertion = a.only();
      if (a.name !== t.name && !matchPos(itBlock, assertion)) {
        messaging('unusual-match', 'data', t, a, 'neither name nor line matched');
      }
      return onResult(toMatchResult(itBlock, assertion));
    }
    default: {
      // 1-to-many
      messaging('unusual-match', 'data', t, a, '1-to-many match, jest.each perhaps?');

      // TODO: support multiple errorLine
      // until we support multiple errors, choose the first error assertion, if any
      const assertions = a.data.find((assertion) => assertion.status === 'KnownFail') || a.first();
      return onResult(toMatchResult(itBlock, assertions));
    }
  }
};

/**
 * create a handler to process matched describe block: (test, assertion) container pair
 *
 * Note: the match could either be they have the same name or same position in their parent's container,
 * it does not mean their actual content is matched. This function is to
 * examine if the content of the cotainers matched, if not, all the test blocks
 * in the source container will be returned as "unmatched test result" via `onResult`;
 * if the content does match, it will call `onMatch` to generate the result, which
 * will be reported via `onResult` also.
 *
 * @param config
 * @return a function to match each describe block
 */
const HandleDescribeBlockMatch = (config: {
  messaging: Messaging;
  onResult: (result: TestResult[]) => void;
  onMatch: (
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>
  ) => TestResult[];
}) => (t: ContainerNode<ItBlock>, matched: ContainerNode<TestAssertionStatus>[]): void => {
  const { messaging, onResult, onMatch } = config;
  if (matched.length !== 1) {
    messaging('match-failed', 'container', t);
    // if we can't find corresponding container to match, the whole container will be considered unmatched
    return onResult(toUnmatchedResults(t, `can not find matching assertion for block ${t.name}`));
  }
  return onResult(onMatch(t, matched[0]));
};

/**
 * create a function to match either data-node or container-node list.
 * the match algorithm:
 *  1. first match by sequence if they have the same structure;
 *  2. then fallback to simple name-based matching.
 *
 *  Upon each test block, it invokes the callback to process the matched results.
 *
 * @param config
 * @return a function to match list of test or describe blocks
 */
const MatchList = (config: {
  messaging: Messaging;
  tContainer: ContainerNode<ItBlock>;
  aContainer: ContainerNode<TestAssertionStatus>;
}) => <N1 extends NodeType<ItBlock>, N2 extends NodeType<TestAssertionStatus>>(
  list1: N1[],
  list2: N2[],
  onResult: (n1: N1, n2: N2[]) => void
): void => {
  const { messaging, tContainer, aContainer } = config;
  if (list1.length === list2.length) {
    list1.forEach((n, idx) => onResult(n, [list2[idx]]));
  } else {
    messaging('context-mismatch', 'container', tContainer, aContainer);
    list1.forEach((n) => {
      // duplicate names under the same layer is really illegal jest practice, they can not
      // be reliably resolved with name-based matching
      if (list1.filter((n1) => n1.name === n.name).length > 1) {
        messaging('duplicate-test-name', 'container', n);
        onResult(n, []);
      } else {
        const found = list2.filter((n2) => n2.name === n.name);
        onResult(n, found);
      }
    });
  }
};

/**
 * this is where the actual test-block => assertion(s) match occurred.
 * Each test and assertion container pair will try to match both its
 * child-data and child-container list recursively.
 *
 * @param tContainer
 * @param aContainer
 * @param messaging output matching messaging for diagnosis/debug purpose
 * @returns a list of TestResult collected from all its children (data + containers)
 */

const matchByContext = (
  tContainer: ContainerNode<ItBlock>,
  aContainer: ContainerNode<TestAssertionStatus>,
  messaging: Messaging
): TestResult[] => {
  const matchResults: TestResult[] = [];
  const handleTestBlockMatch = HandleTestBlockMatch({
    messaging,
    onResult: (t) => matchResults.push(t),
  });
  const handleDescribeBlockMatch = HandleDescribeBlockMatch({
    messaging,
    onResult: (tt: TestResult[]) => matchResults.push(...tt),
    onMatch: (t, a) => matchByContext(t, a, messaging),
  });
  const matchList = MatchList({ messaging, tContainer, aContainer });

  matchList(tContainer.childData, aContainer.childData, handleTestBlockMatch);
  matchList(tContainer.childContainers, aContainer.childContainers, handleDescribeBlockMatch);

  return matchResults;
};

/**
 * match tests container with assertion container by their context structure.
 * @param fileName
 * @param tContainer
 * @param aContainer
 * @param verbose turns on/off the debugging warning messages.
 */

export const matchTestAssertions = (
  fileName: string,
  sourceRoot: ParsedNode,
  assertions: TestAssertionStatus[],
  verbose = true
): TestResult[] => {
  const messaging = createMessaging(fileName, verbose);
  const tContainer = buildSourceContainer(sourceRoot);
  const aContainer = buildAssertionContainer(assertions);
  return matchByContext(tContainer, aContainer, messaging);
};
