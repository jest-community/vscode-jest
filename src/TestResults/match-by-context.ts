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
  NamedBlock,
} from 'jest-editor-support';
import { TestReconciliationState } from './TestReconciliationState';
import { MatchResultReason, TestResult } from './TestResult';
import {
  DataNode,
  ContainerNode,
  ContextType,
  ChildNodeType,
  ROOT_NODE_NAME,
  flatten,
  OptionalAttributes,
} from './match-node';

export const buildAssertionContainer = (
  assertions: TestAssertionStatus[]
): ContainerNode<TestAssertionStatus> => {
  const root = new ContainerNode<TestAssertionStatus>(ROOT_NODE_NAME);
  if (assertions.length > 0) {
    assertions.forEach((a) => {
      const container = root.findContainer(
        a.ancestorTitles,
        (name: string) => new ContainerNode(name, { isGroup: 'maybe' })
      );
      container?.addDataNode(
        new DataNode(a.title, a.location?.line ?? -1, a, {
          fullName: a.fullName,
          isGroup: 'maybe',
        })
      );
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
    const attrs = (namedNode: NamedBlock): OptionalAttributes => ({
      isGroup: namedNode.lastProperty === 'each' ? 'yes' : 'no',
      hasDynamicName: namedNode.hasDynamicName,
    });
    if (isDescribeBlock(node)) {
      container = new ContainerNode(node.name, attrs(node));
      parent.addContainerNode(container);
    } else if (isItBlock(node)) {
      parent.addDataNode(new DataNode(node.name, node.start.line - 1, node, attrs(node)));
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

type MessageType = 'match-failed' | 'duplicate-name' | 'incorrect-grouping' | 'fallback-warning';
const createMessaging = (fileName: string, verbose: boolean) => (
  messageType: MessageType,
  contextType: ContextType,
  source: ContainerNode<ItBlock> | DataNode<ItBlock>,
  assertion?:
    | ContainerNode<TestAssertionStatus>
    | DataNode<TestAssertionStatus>
    | DataNode<TestAssertionStatus>[],
  extraReason?: string
): void => {
  const blockType = contextType === 'container' ? 'describe' : 'test';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildMessage = (message: string): any[] => [
    `TestResultMatch: ${messageType} :  "${fileName}" > "${source.fullName}" (${blockType}):\n`,
    message,
    `\n\tsource =`,
    source,
    `\n\tassertion =`,
    assertion,
  ];

  switch (messageType) {
    case 'match-failed': {
      console.error(
        buildMessage(`!! not able to match test result with source !!\n${extraReason ?? ''}`)
      );
      break;
    }
    case 'duplicate-name': {
      console.error(
        buildMessage(
          `found duplicate test names in the same (describe) block . This is not recommanded and might not be matched correctly`
        )
      );
      break;
    }
    case 'incorrect-grouping': {
      if (verbose) {
        console.warn(
          buildMessage(
            `found incorrect grouping (most likely due to incorrect test result generated by jest), please check troubleshoot to address root cause. Will ungroup and retry matching. `
          )
        );
      }
      break;
    }
    case 'fallback-warning': {
      if (verbose) {
        console.warn(
          buildMessage(
            `matching by context failed (most likely due to incorrect test result generated by jest), please check troubleshooting to address the root cause. Will fallback to "best-effort" name-based matching`
          )
        );
      }
      break;
    }
  }
};

type Messaging = ReturnType<typeof createMessaging>;
type MatchResultType<C extends ContextType> = [
  ChildNodeType<ItBlock, C>,
  ChildNodeType<TestAssertionStatus, C>[],
  MatchResultReason
];
interface ContextMatchAlgorithm {
  match: (
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>
  ) => TestResult[];
}

interface IncorrectGroupingError<C extends ContextType> {
  t: ChildNodeType<ItBlock, C>;
  incorrectGroups: ChildNodeType<TestAssertionStatus, C>[];
}
const isIncorrectGroupingError = <C extends ContextType>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arg: any
): arg is IncorrectGroupingError<C> => arg.t && arg.incorrectGroups;

const ContextMatch = (messaging: Messaging): ContextMatchAlgorithm => {
  const handleTestBlockMatch = (
    result: MatchResultType<'data'>,
    reportUnmatch: boolean
  ): TestResult[] => {
    const [t, matched, reason] = result;
    if (matched.length === 0) {
      if (reportUnmatch) {
        messaging('match-failed', 'data', t, undefined);
        return [toMatchResult(t.data, `found ${matched.length} matched assertion(s)`, reason)];
      }
      return [];
    }

    return flatten(
      matched.map((a) => {
        return a.getAll().map((aa) => toMatchResult(t.data, aa.data, reason));
      })
    );
  };

  const handleDescribeBlockMatch = (result: MatchResultType<'container'>): TestResult[] => {
    const [t, matched] = result;
    if (matched.length === 0) {
      return [];
    }
    return flatten(matched.map((a) => matchContainers(t, a)));
  };

  const matchByName = <C extends ContextType>(
    tList: ChildNodeType<ItBlock, C>[],
    aList: ChildNodeType<TestAssertionStatus, C>[],
    checkGroup?: boolean
  ): [ChildNodeType<ItBlock, C>[], MatchResultType<C>[]] => {
    const remainingTList: ChildNodeType<ItBlock, C>[] = [];

    const results: MatchResultType<C>[] = [];
    for (const t of tList) {
      const matched = aList.filter((a) => a.match(t));
      if (matched.length > 0) {
        results.push([t, matched, 'match-by-name']);
        continue;
      }

      if (checkGroup) {
        const incorrectGroups = aList.filter((a) => a.isInGroup(t.name));
        if (incorrectGroups.length > 0) {
          throw { t, incorrectGroups } as IncorrectGroupingError<C>;
        }
      }
      remainingTList.push(t);
    }
    return [remainingTList, results];
  };

  const matchByContext = <C extends ContextType>(
    tList: ChildNodeType<ItBlock, C>[],
    aList: ChildNodeType<TestAssertionStatus, C>[]
  ): [ChildNodeType<ItBlock, C>[], MatchResultType<C>[]] => {
    const results: MatchResultType<C>[] = [];
    if (tList.length === aList.length) {
      const hasMismatch = tList.find(
        (t, idx) => !aList[idx].match(t, { ignoreDynamicNameDiff: true })
      );
      if (!hasMismatch) {
        tList.forEach((t, idx) => results.push([t, [aList[idx]], 'match-by-context']));
        return [[], results];
      }
    }
    return [tList, []];
  };

  const ErrorReasons: Partial<MatchResultReason>[] = ['duplicate-name', 'match-failed'];
  const updateMatchState = <C extends ContextType>(result: MatchResultType<C>): void => {
    const [t, aList, reason] = result;
    const isMatched = ErrorReasons.includes(reason) ? false : true;
    t.isMatched = isMatched;
    aList.forEach((a) => (a.isMatched = isMatched));
  };

  const matchChildren = <C extends ContextType>(
    contextType: C,
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>,
    onResult: (result: MatchResultType<C>) => void
  ): void => {
    const results: MatchResultType<C>[] = [];
    let _results: MatchResultType<C>[];

    const tChildren = tContainer.getChildren(contextType);
    const aChildren = aContainer.getChildren(contextType);

    let remainingTList = tChildren.valid;

    // handle invalid assertions here: since it has no location info, we can't use context/position to match them, will
    // match by name instead. Once the test block is matched, we should remove it from the remaining matching candidate
    // so we might be able to match the rest valid tests/assertions by context again.
    if (aChildren.invalid) {
      [remainingTList, _results] = matchByName(remainingTList, aChildren.invalid);
      results.push(..._results);
    }

    if (remainingTList.length > 0) {
      [remainingTList, _results] = matchByContext(remainingTList, aChildren.valid);
      results.push(..._results);

      if (remainingTList.length > 0) {
        if (
          tContainer.invalidateDuplicateNameNodes(contextType, (dups) =>
            dups.forEach((dup) => messaging('duplicate-name', contextType, dup))
          )
        ) {
          return matchChildren(contextType, tContainer, aContainer, onResult);
        }
        try {
          [remainingTList, _results] = matchByName(remainingTList, aChildren.valid, true);
          results.push(..._results);
        } catch (e) {
          if (isIncorrectGroupingError(e)) {
            e.incorrectGroups.forEach((a) => {
              messaging('incorrect-grouping', 'container', e.t, a);
              aContainer.invalidateGroupNode(contextType, a);
            });
            return matchChildren(contextType, tContainer, aContainer, onResult);
          }
        }
      }
      remainingTList.forEach((t) => results.push([t, [], 'match-failed']));
    }
    results.forEach((r) => {
      updateMatchState(r);
      onResult(r);
    });
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

    matchChildren('data', tContainer, aContainer, (result) =>
      matchResults.push(...handleTestBlockMatch(result, false))
    );
    matchChildren('container', tContainer, aContainer, (result) =>
      matchResults.push(...handleDescribeBlockMatch(result))
    );

    aContainer.group.forEach((c) => matchResults.push(...matchContainers(tContainer, c)));

    return matchResults;
  };

  const matchByFullName = (
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>
  ): TestResult[] => {
    const tList = tContainer.unmatchedNodes({ skipInvalid: true });
    // unstructured assertions (missing ancestor info) should be all on the top level, so no need to go deep.
    // Note: we explicitly do not consider matching assertion with explicit structure, as it might be too dangerous and currently no use-case suggest we need it
    const aList = aContainer.unmatchedNodes({
      flatten: true,
    });
    return flatten(
      tList.map((t) => {
        const matched = aList.filter((a) => a.match(t, { byFullName: true }));
        if (matched.length > 0) {
          if (matched.length === 1 || t.isGroupNode() === 'yes') {
            messaging('fallback-warning', 'data', t, matched);
            updateMatchState([t, matched, 'match-by-fullName']);
            return handleTestBlockMatch([t, [...matched], 'match-by-fullName'], false);
          }
          messaging('duplicate-name', 'data', t);
        }
        return [];
      })
    );
  };
  const unmatchedResults = (tContainer: ContainerNode<ItBlock>): TestResult[] =>
    flatten(
      tContainer.unmatchedNodes().map((t) => handleTestBlockMatch([t, [], 'match-failed'], true))
    );

  const match = (
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>
  ): TestResult[] => {
    const results = matchContainers(tContainer, aContainer);
    const fallbackMatched = matchByFullName(tContainer, aContainer);
    const unmatched = unmatchedResults(tContainer);

    return results.concat(fallbackMatched, unmatched);
  };

  return { match };
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
