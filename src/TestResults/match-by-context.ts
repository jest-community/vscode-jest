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
import { MatchResultReason, TestResult } from './TestResult';
import { DataNode, ContainerNode, ContextType, ChildNodeType } from './match-node';

const ROOT_NODE_NAME = '__root__';
export const buildAssertionContainer = (
  assertions: TestAssertionStatus[]
): ContainerNode<TestAssertionStatus> => {
  const root = new ContainerNode<TestAssertionStatus>(ROOT_NODE_NAME);
  if (assertions.length > 0) {
    assertions.forEach((a) => {
      const container = root.findContainer(a.ancestorTitles, true);
      container?.addDataNode(new DataNode(a.title, a.location?.line ?? -1, a));
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

const adjustLocation = (l: Location): Location => ({ column: l.column - 1, line: l.line - 1 });
const matchPos = (t: ItBlock, a: TestAssertionStatus, forError = false): boolean => {
  const line = forError ? a.line : a.line ?? a.location?.line;
  return (line != null && line >= t.start.line && line <= t.end.line) || false;
};
export const toMatchResult = (
  test: ItBlock,
  assertionOrErr: TestAssertionStatus | string,
  reason: MatchResultReason
): TestResult => {
  const assertion = typeof assertionOrErr === 'string' ? undefined : assertionOrErr;
  const err = typeof assertionOrErr === 'string' ? assertionOrErr : undefined;

  // Note the shift from one-based to zero-based line number and columns
  return {
    name: assertion?.fullName ?? assertion?.title ?? test.name,
    identifier: {
      title: assertion?.title || test.name,
      ancestorTitles: assertion?.ancestorTitles || [],
    },
    start: adjustLocation(test.start),
    end: adjustLocation(test.end),
    status: assertion?.status ?? TestReconciliationState.Unknown,
    shortMessage: assertion?.shortMessage ?? err,
    terseMessage: assertion?.terseMessage,
    lineNumberOfError:
      assertion?.line && matchPos(test, assertion, true) ? assertion.line - 1 : test.end.line - 1,
    reason,
  };
};

/** mark all data and child containers unmatched */
const toUnmatchedResults = (
  tContainer: ContainerNode<ItBlock>,
  err: string,
  reason: MatchResultReason
): TestResult[] => {
  const results = tContainer.childData.map((n) => toMatchResult(n.single(), err, reason));
  tContainer.childContainers.forEach((c) => results.push(...toUnmatchedResults(c, err, reason)));
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
        `!! context mismatched !! ${contextType} nodes are different under "${source.name}: either different test count or with unknown locations within the block": `
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
    matched: DataNode<TestAssertionStatus>[],
    reason: MatchResultReason
  ): TestResult[] => {
    if (matched.length !== 1) {
      return [toMatchResult(t.single(), `found ${matched.length} matched assertion(s)`, reason)];
    }
    const a = matched[0];
    const itBlock = t.single();
    if (a.data.length === 1) {
      const assertion = a.single();
      if (a.name !== t.name && !matchPos(itBlock, assertion)) {
        messaging('unusual-match', 'data', t, a, 'neither name nor line matched');
      }
      return [toMatchResult(itBlock, assertion, reason)];
    }
    // 1-to-many: parameterized tests
    return a.data.map((a) => toMatchResult(itBlock, a, reason));
  };

  const handleDescribeBlockMatch = (
    t: ContainerNode<ItBlock>,
    matched: ContainerNode<TestAssertionStatus>[],
    reason: MatchResultReason
  ): TestResult[] => {
    if (matched.length !== 1) {
      messaging('match-failed', 'container', t);
      // if we can't find corresponding container to match, the whole container will be considered unmatched
      return toUnmatchedResults(t, `can not find matching assertion for block ${t.name}`, reason);
    }
    return matchContainers(t, matched[0]);
  };

  const matchChildren = <C extends ContextType>(
    contextType: C,
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>,
    onResult: (
      t: ChildNodeType<ItBlock, C>,
      a: ChildNodeType<TestAssertionStatus, C>[],
      reason: MatchResultReason
    ) => void
  ): void => {
    const tList = tContainer.getChildren(contextType);
    const aList = aContainer.getChildren(contextType);

    // handle invalid assertions here: since it has no location info, we can't use context to match them, will
    // match by name instead. Once the test block is matched, we should remove it from the remaining matching candidate
    // so we might be able to match the rest valid tests/assertions by context again.
    // note: tList should not have any invalid child, only aList could...
    let remainingTList = tList.valid;
    if (aList.invalid) {
      //match invalid assertions by name from the tList
      remainingTList = remainingTList.filter((t) => {
        const found = aList.invalid?.filter((a) => a.name === t.name);
        if (found && found.length > 0) {
          onResult(t, found, 'match-by-name');
          return false;
        }
        return true;
      });
    }
    if (remainingTList.length === aList.valid.length) {
      remainingTList.forEach((t, idx) => onResult(t, [aList.valid[idx]], 'match-by-context'));
    } else {
      messaging('context-mismatch', contextType, tContainer, aContainer);

      remainingTList.forEach((t) => {
        // duplicate names under the same layer is really illegal jest practice, they can not
        // be reliably resolved with name-based matching
        if (remainingTList.filter((t1) => t1.name === t.name).length > 1) {
          messaging('duplicate-name', contextType, t);
          onResult(t, [], 'duplicate-names');
        } else {
          const found = aList.valid.filter((a) => a.name === t.name);
          onResult(t, found, found?.length > 0 ? 'match-by-name' : 'no-matched-assertion');
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
    matchChildren('data', tContainer, aContainer, (t, a, r) =>
      matchResults.push(...handleTestBlockMatch(t, a, r))
    );
    matchChildren('container', tContainer, aContainer, (t, a, r) =>
      matchResults.push(...handleDescribeBlockMatch(t, a, r))
    );

    if (aContainer.group) {
      aContainer.group.forEach((c) => matchResults.push(...matchContainers(tContainer, c)));
    }

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
