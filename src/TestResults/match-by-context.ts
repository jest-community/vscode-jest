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
import { TestResult } from './TestResult';
import {
  DataNode,
  ContainerNode,
  ContextType,
  ChildNodeType,
  ROOT_NODE_NAME,
  flatten,
  OptionalAttributes,
  MatchEvent,
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
      const zeroBasedLine = a.location?.line ? a.location.line - 1 : -1;
      container?.addDataNode(
        new DataNode(a.title, zeroBasedLine, a, {
          fullName: a.fullName,
          isGroup: 'maybe',
          range: { start: zeroBasedLine, end: zeroBasedLine },
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
      nonLiteralName: namedNode.nameType !== 'Literal',
      range: { start: namedNode.start?.line - 1 ?? -1, end: namedNode.end?.line - 1 ?? -1 },
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

  root.checkDuplicateName();

  return root;
};

const adjustLocation = (l: Location): Location => ({ column: l.column - 1, line: l.line - 1 });
const matchPos = (t: ItBlock, a: TestAssertionStatus, forError = false): boolean => {
  const line = forError ? a.line : a.line ?? a.location?.line;
  return (line != null && line >= t.start.line && line <= t.end.line) || false;
};

// could not use "instanceof" check as it could fail tests that mocked jest-editor-support like in TestResultProvider.test.ts
const isDataNode = (arg: DataNode<ItBlock> | ItBlock): arg is DataNode<ItBlock> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (arg as any).data;

export const toMatchResult = (
  source: DataNode<ItBlock> | ItBlock,
  assertionOrErr: DataNode<TestAssertionStatus> | string,
  reason: MatchEvent
): TestResult => {
  const [test, sourceHistory, sourceName] = isDataNode(source)
    ? [source.data, source.history(reason), source.fullName]
    : [source, [reason], source.name];
  const [assertion, assertionHistory, err] =
    typeof assertionOrErr === 'string'
      ? [undefined, undefined, assertionOrErr]
      : [assertionOrErr.data, assertionOrErr.history(reason), undefined];

  // Note the shift from one-based to zero-based line number and columns
  return {
    name: assertion?.fullName ?? assertion?.title ?? sourceName,
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
    sourceHistory,
    assertionHistory,
  };
};

type MessagingInfo = {
  type: 'report-unmatched';
  unmatchedItBlocks: DataNode<ItBlock>[];
  unmatchedAssertions: DataNode<TestAssertionStatus>[];
  tContainer: ContainerNode<ItBlock>;
  aContainer: ContainerNode<TestAssertionStatus>;
};

const createMessaging = (fileName: string, _verbose: boolean) => (info: MessagingInfo): void => {
  const build = (msg: string): Parameters<typeof console.log> => [
    `[test resut matching] ${info.type} : ${msg} : "${fileName}"\n`,
    info,
  ];
  switch (info.type) {
    case 'report-unmatched':
      console.warn(...build(`${info.unmatchedItBlocks.length} unmatched test blocks`));
      break;
  }
};

type MatchResultType<C extends ContextType> = [
  ChildNodeType<ItBlock, C>,
  ChildNodeType<TestAssertionStatus, C>[],
  MatchEvent
];
interface ContextMatchAlgorithm {
  match: (
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>,
    messaging: ReturnType<typeof createMessaging>
  ) => TestResult[];
}

interface MatchMethodResult<C extends ContextType> {
  unmatchedT: ChildNodeType<ItBlock, C>[];
  results: MatchResultType<C>[];
}

interface FallbackMatchResult<C extends ContextType> {
  matched?: TestResult[];
  unmatchedT?: ChildNodeType<ItBlock, C>[];
  unmatchedA?: ChildNodeType<TestAssertionStatus, C>[];
}

type ClassicMatchType = 'by-name' | 'by-location';

const ContextMatch = (): ContextMatchAlgorithm => {
  const handleTestBlockMatch = (
    result: MatchResultType<'data'>,
    reportUnmatch: boolean
  ): TestResult[] => {
    const [t, matched, reason] = result;
    if (matched.length === 0) {
      if (reportUnmatch) {
        return [toMatchResult(t, `found ${matched.length} matched assertion(s)`, reason)];
      }
      return [];
    }

    return flatten(
      matched.map((a) => {
        return a.getAll().map((aa) => toMatchResult(t, aa, reason));
      })
    );
  };

  const handleDescribeBlockMatch = (result: MatchResultType<'container'>): TestResult[] => {
    const [t, matched, reason] = result;
    if (matched.length === 0) {
      return [];
    }

    t.addEvent(reason);
    return flatten(
      matched.map((a) => {
        a.addEvent(reason);
        return matchContainers(t, a);
      })
    );
  };

  // match methods
  const classicMatch = <C extends ContextType>(
    type: ClassicMatchType,
    tList: ChildNodeType<ItBlock, C>[],
    aList: ChildNodeType<TestAssertionStatus, C>[]
  ): MatchMethodResult<C> => {
    const reason = type === 'by-name' ? 'match-by-name' : 'match-by-location';
    const options =
      type === 'by-name' ? undefined : { checkIsWithin: true, ignoreNonLiteralNameDiff: true };
    const results: MatchResultType<C>[] = [];

    const unmatchedT: ChildNodeType<ItBlock, C>[] = tList.filter((t) => {
      if (type === 'by-name' && t.hasEvent('duplicate-name')) {
        return true;
      }
      const matched = aList.filter((a) => a.match(t, options));
      if (matched.length <= 0) {
        return true;
      }

      if (matched.length === 1 || t.isGroupNode() === 'yes') {
        results.push([t, matched, reason]);
        return false;
      }
      return true;
    });

    return { unmatchedT, results };
  };

  const matchByContext = <C extends ContextType>(
    tList: ChildNodeType<ItBlock, C>[],
    aList: ChildNodeType<TestAssertionStatus, C>[]
  ): MatchMethodResult<C> => {
    const results: MatchResultType<C>[] = [];
    if (tList.length === aList.length) {
      const hasMismatch = tList.find(
        (t, idx) => !aList[idx].match(t, { ignoreNonLiteralNameDiff: true })
      );
      if (!hasMismatch) {
        tList.forEach((t, idx) => results.push([t, [aList[idx]], 'match-by-context']));
        return { unmatchedT: [], results };
      }
    }
    return { unmatchedT: tList, results: [] };
  };

  const matchChildren = <C extends ContextType>(
    contextType: C,
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>,
    onResult: (result: MatchResultType<C>) => void
  ): void => {
    const results: MatchResultType<C>[] = [];

    let tList = tContainer.getChildren(contextType);
    if (tList.length <= 0) {
      return;
    }

    const handleMatchReturn = (aReturn: MatchMethodResult<C>): void => {
      results.push(...aReturn.results);
      tList = aReturn.unmatchedT;
    };

    // if there is invalid location nodes, let's try to remove it from the container so we might be
    // able to match by context below
    let aList = aContainer.getChildren(contextType);
    const invalidLocations = aList.filter((n) => n.hasEvent('invalid-location'));

    if (invalidLocations.length > 0) {
      aList = aList.filter((n) => !n.hasEvent('invalid-location'));
      handleMatchReturn(classicMatch('by-name', tList, invalidLocations));
    }

    handleMatchReturn(matchByContext(tList, aList));

    tList.forEach((t) => results.push([t, [], 'match-failed']));
    results.forEach((r) => onResult(r));
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

  /**
   * After context matching, perform the following matches to the unmatched describe and test blocks
   * 1. perform fullName lookup first,
   * 2. followed by location lookup.
   *
   * @param tContainer
   * @param aContainer
   * @returns
   */

  const matchFallback = (
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>
  ): FallbackMatchResult<'data'> => {
    const doMatch = <C extends ContextType>(
      type: C,
      onResult: (result: MatchResultType<C>) => TestResult[]
    ) => {
      let tList = tContainer.unmatchedNodes(type);
      if (tList.length <= 0) {
        return {};
      }

      let aList = aContainer.unmatchedNodes(type, { ungroup: true });
      const matched = flatten(
        (['by-name', 'by-location'] as ClassicMatchType[]).map((matchType) => {
          const matchResult = classicMatch(matchType, tList, aList);
          tList = matchResult.unmatchedT;
          return flatten(matchResult.results.map(onResult));
        })
      );

      // const matched = flatten(results.map(onResult));
      aList = aList.filter((a) => !a.isMatched);

      return {
        matched,
        unmatchedT: tList,
        unmatchedA: aList,
      };
    };
    // handle unmatched container nodes
    const cFallback = doMatch('container', (r) => {
      const [t] = r;
      return t.isMatched ? [] : handleDescribeBlockMatch(r);
    });
    // handle unmatched data nodes
    const dFallback = doMatch('data', (r) => handleTestBlockMatch(r, false));

    return {
      ...dFallback,
      matched: (cFallback.matched ?? []).concat(dFallback.matched ?? []),
    };
  };

  const toUnmatchedResults = (nodes: DataNode<ItBlock>[]): TestResult[] =>
    flatten(nodes.map((t) => handleTestBlockMatch([t, [], 'match-failed'], true)));

  const match = (
    tContainer: ContainerNode<ItBlock>,
    aContainer: ContainerNode<TestAssertionStatus>,
    messaging: ReturnType<typeof createMessaging>
  ): TestResult[] => {
    let matched = matchContainers(tContainer, aContainer);
    const fallback = matchFallback(tContainer, aContainer);

    matched = fallback.matched ? matched.concat(fallback.matched) : matched;
    const unmatchedResults = fallback.unmatchedT && toUnmatchedResults(fallback.unmatchedT);

    // reporting
    if (unmatchedResults && unmatchedResults.length > 0) {
      matched = unmatchedResults ? matched.concat(unmatchedResults) : matched;
      messaging({
        type: 'report-unmatched',
        unmatchedItBlocks: fallback.unmatchedT ?? [],
        unmatchedAssertions: fallback.unmatchedA ?? [],
        tContainer,
        aContainer,
      });
    }

    return matched;
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

const { match } = ContextMatch();

export const matchTestAssertions = (
  fileName: string,
  sourceRoot: ParsedNode,
  assertions: TestAssertionStatus[],
  verbose = false
): TestResult[] => {
  const tContainer = buildSourceContainer(sourceRoot);
  const aContainer = buildAssertionContainer(assertions);

  const messaging = createMessaging(fileName, verbose);
  return match(tContainer, aContainer, messaging);
};
