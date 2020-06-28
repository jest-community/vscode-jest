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

import {
  ItBlock,
  TestAssertionStatus,
  ParsedNode,
  DescribeBlock,
  Location,
} from 'jest-editor-support';
import { TestReconciliationState } from './TestReconciliationState';
import { TestResult } from './TestResult';
import { DataNode, ContainerNode, ContextType, ChildNodeType } from './match-node';

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

const matchPos = (t: ItBlock, a?: TestAssertionStatus, forError = false): boolean => {
  const line = forError ? a?.line : a?.line ?? a.location?.line;
  return line >= t.start.line && line <= t.end.line;
};
export const toMatchResult = (
  test: ItBlock,
  assertionOrErr: TestAssertionStatus | string
): TestResult => {
  const assertion = typeof assertionOrErr === 'string' ? undefined : assertionOrErr;
  const err = typeof assertionOrErr === 'string' ? assertionOrErr : undefined;
  const adjustLocation = (l: Location): Location => ({ column: l.column - 1, line: l.line - 1 });

  // Note the shift from one-based to zero-based line number and columns
  return {
    name: test.name,
    start: adjustLocation(test.start),
    end: adjustLocation(test.end),
    status: assertion?.status ?? TestReconciliationState.Unknown,
    shortMessage: assertion?.shortMessage ?? err,
    terseMessage: assertion?.terseMessage,
    lineNumberOfError: matchPos(test, assertion, true) ? assertion.line - 1 : test.end.line - 1,
  };
};

/** mark all data and child containers unmatched */
const toUnmatchedResults = (tContainer: ContainerNode<ItBlock>, err: string): TestResult[] => {
  const results = tContainer.childData.map((n) => toMatchResult(n.only(), err));
  tContainer.childContainers.forEach((c) => results.push(...toUnmatchedResults(c, err)));
  return results;
};

type MessageType = 'context-mismatch' | 'match-failed' | 'unusual-match' | 'duplicate-name';
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
    case 'duplicate-name': {
      output(
        `duplicate names in the same (describe) block is not recommanded and might not be matched reliably: ${source.name}`
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

interface ContextMatchAlgorithm {
  match: (
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>
  ) => TestResult[];
}

const ContextMatch = (messaging: Messaging): ContextMatchAlgorithm => {
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
        throw new TypeError(`invalid state: assertion data should not be empty if it is a match!`);
      case 1: {
        const assertion = a.only();
        if (a.name !== t.name && !matchPos(itBlock, assertion)) {
          messaging('unusual-match', 'data', t, a, 'neither name nor line matched');
        }
        return toMatchResult(itBlock, assertion);
      }
      default: {
        // 1-to-many
        messaging('unusual-match', 'data', t, a, '1-to-many match, jest.each perhaps?');

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
      messaging('match-failed', 'container', t);
      // if we can't find corresponding container to match, the whole container will be considered unmatched
      return toUnmatchedResults(t, `can not find matching assertion for block ${t.name}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return matchContainers(t, matched[0]);
  };

  const matchChildren = <C extends ContextType>(
    contextType: C,
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>,
    onResult: (t: ChildNodeType<ItBlock, C>, a: ChildNodeType<TestAssertionStatus, C>[]) => void
  ): void => {
    const tList = tContainer.getChildren(contextType);
    const aList = aContainer.getChildren(contextType);

    if (tList.length === aList.length) {
      tList.forEach((t, idx) => onResult(t, [aList[idx]]));
    } else {
      messaging('context-mismatch', contextType, tContainer, aContainer);
      tList.forEach((t) => {
        // duplicate names under the same layer is really illegal jest practice, they can not
        // be reliably resolved with name-based matching
        if (tList.filter((t1) => t1.name === t.name).length > 1) {
          messaging('duplicate-name', contextType, t);
          onResult(t, []);
        } else {
          const found = aList.filter((a) => a.name === t.name);
          onResult(t, found);
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
   * @returns a list of TestResult collected from all its children (data + containers)
   */

  const matchContainers = (
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>
  ): TestResult[] => {
    const matchResults: TestResult[] = [];
    matchChildren('data', tContainer, aContainer, (t, a) =>
      matchResults.push(handleTestBlockMatch(t, a))
    );
    matchChildren('container', tContainer, aContainer, (t, a) =>
      matchResults.push(...handleDescribeBlockMatch(t, a))
    );

    return matchResults;
  };
  return { match: matchContainers };
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
  const tContainer = buildSourceContainer(sourceRoot);
  const aContainer = buildAssertionContainer(assertions);
  const { match } = ContextMatch(createMessaging(fileName, verbose));
  return match(tContainer, aContainer);
};
