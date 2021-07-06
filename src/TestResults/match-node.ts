/**
 * internal classes used by `match-by-context`
 */

import { ParsedRange } from 'jest-editor-support';

type IsGroupType = 'yes' | 'no' | 'maybe';

const IsMatchedEvents = ['match-by-context', 'match-by-name', 'match-by-location'] as const;

export type IsMatchedEvent = typeof IsMatchedEvents[number];

export type MatchEvent =
  | IsMatchedEvent
  | 'match-failed'
  | 'match-failed:1-to-many'
  | 'duplicate-name'
  | 'invalid-location'
  | 'missing-ancestor-info';

export interface MatchOptions {
  /** if true, will ignore name difference if both nodes have NonLiteral names */
  ignoreNonLiteralNameDiff?: boolean;

  // accept regular name, i.e. the name of the node, not the fullName, match.
  acceptLocalNameMatch?: boolean;

  /** if true, will ignore isGroupNode() difference */
  ignoreGroupDiff?: boolean;
  /** if true, will perform position check to see if "this" is enclosed within "other" node */
  checkIsWithin?: boolean;
}

const sortByLine = (n1: BaseNode, n2: BaseNode): number => n1.zeroBasedLine - n2.zeroBasedLine;

// group nodes after sort
const groupNodes = <N extends BaseNode>(list: N[], node: N): N[] => {
  if (list.length <= 0) {
    return [node];
  }
  if (node.hasEvent('invalid-location')) {
    list.push(node);
  } else {
    // if not able to merge with previous node, i.e . can not group, add it to the list
    if (!list[list.length - 1].merge(node)) {
      list.push(node);
    }
  }
  return list;
};

export const ROOT_NODE_NAME = '__root__';

export interface OptionalAttributes {
  fullName?: string;
  isGroup?: IsGroupType;
  nonLiteralName?: boolean;
  // zero-based location range
  range?: ParsedRange;
}
export class BaseNode {
  name: string;
  zeroBasedLine: number;
  group: this[];
  attrs: OptionalAttributes;
  events: Set<MatchEvent>;

  private _ancestorTitles: string[];

  constructor(name: string, zeroBasedLine: number, attrs?: OptionalAttributes) {
    this.name = name;
    this.zeroBasedLine = zeroBasedLine;

    this.attrs = attrs ?? {};

    this.group = [];
    this._ancestorTitles = [];
    this.events = new Set();
  }

  hasUnknownLocation(): boolean {
    return this.zeroBasedLine < 0;
  }

  // events
  history(additional?: MatchEvent): MatchEvent[] {
    if (additional) {
      this.addEvent(additional);
    }
    return Array.from(this.events.values());
  }

  /** check if the target node is in the matched nodes list; if no target, check if there is any matched node. */
  get isMatched(): boolean {
    return IsMatchedEvents.find((e) => this.events.has(e)) != null;
  }

  addEvent(event: MatchEvent): void {
    this.getAll().forEach((n) => n.events.add(event));
  }
  hasEvent(event: MatchEvent): boolean {
    return this.events.has(event);
  }

  // fullName
  get ancestorTitles(): string[] {
    return this._ancestorTitles;
  }
  get fullName(): string {
    if (!this.attrs.fullName) {
      this.attrs.fullName = this._ancestorTitles
        .concat(this.name)
        .filter((t) => t)
        .join(' ');
    }
    return this.attrs.fullName;
  }

  // only update fullName if it is undefined
  setParentInfo(pInfo: { titles: string[]; isGroup?: IsGroupType }): void {
    this._ancestorTitles = pInfo.titles.filter((t) => t !== ROOT_NODE_NAME);
    if (pInfo.isGroup === 'yes') {
      this.attrs.isGroup = 'yes';
    }
  }

  contains(another: BaseNode): boolean {
    if (!this.attrs?.range || !another.attrs?.range) {
      return false;
    }
    return (
      this.attrs.range.start.line <= another.attrs.range.start.line &&
      this.attrs.range.end.line >= another.attrs.range.end.line
    );
  }

  merge(another: this, forced = false): boolean {
    //can not merge if the location is unknown
    if (
      !forced &&
      (this.hasUnknownLocation() ||
        another.hasUnknownLocation() ||
        another.zeroBasedLine !== this.zeroBasedLine)
    ) {
      return false;
    }
    this.addGroupMember(another);
    return true;
  }

  // flatten node with grouping into an array including self
  getAll(): this[] {
    return [this, ...this.group];
  }
  // flatten node with grouping into an array including self
  ungroup(): this[] {
    const nodes = this.getAll();
    this.group = [];
    return nodes;
  }

  /**
   * returns true if the node is a group node, i.e. either has non-zero group member or lastProperty === 'each'.
   * If the node can not know it determinstically before matching, it should return "maybe".
   */
  isGroupNode(): 'yes' | 'no' | 'maybe' {
    if (this.group.length > 0 && this.attrs.isGroup !== 'no') {
      return 'yes';
    }
    return this.attrs.isGroup ?? 'no';
  }

  addGroupMember(member: this): void {
    this.group.push(...member.ungroup());
  }

  private maybeNonLiteralName(): boolean {
    // a group node (such as test.each) could have a literal name that contains variable therefore could
    // genrate different test names per parameter set
    return this.attrs.nonLiteralName || this.isGroupNode() !== 'no';
  }

  /**
   * match the other node by name and other group property. if matched, the nodes will be "linked".
   * If "onlyUnmatched" flag is true, will only match if "other" has not been matched.
   * @returns true if matched, even if it is already matched; otherwise false.
   **/

  match(other: BaseNode, options?: MatchOptions): boolean {
    // check position
    if (options?.checkIsWithin && !other.contains(this)) {
      return false;
    }
    // check name
    const ignoreNameDiff =
      options?.ignoreNonLiteralNameDiff &&
      this.maybeNonLiteralName() &&
      other.maybeNonLiteralName();
    if (
      this.fullName !== other.fullName &&
      !ignoreNameDiff &&
      !(options?.acceptLocalNameMatch && this.name === other.name)
    ) {
      return false;
    }

    // check group
    const ignoreGroupDiff =
      options?.ignoreGroupDiff || this.isGroupNode() === 'maybe' || other.isGroupNode() === 'maybe';
    if (this.isGroupNode() !== other.isGroupNode() && !ignoreGroupDiff) {
      return false;
    }

    return true;
  }

  /**
   * check if a node is structurally "valid", i.e. is the ancestorTitle, location info are populated. This does not check
   * across the nodes, just the node itself.
   * @returns true if no itegrity issue otherwise false and the node.history will be updated accordingly
   */
  checkIntegrity(): boolean {
    const issues: MatchEvent[] = [];
    if (this.name !== this.fullName && this._ancestorTitles.length <= 0) {
      issues.push('missing-ancestor-info');
    }

    if (this.hasUnknownLocation()) {
      issues.push('invalid-location');
    }

    if (issues.length > 0) {
      issues.forEach((e) => this.addEvent(e));
      return false;
    }
    return true;
  }
}
/* interface implementation */
export class DataNode<T> extends BaseNode {
  data: T;

  constructor(name: string, zeroBasedLine: number, data: T, attrs?: OptionalAttributes) {
    super(name, zeroBasedLine, attrs);
    this.data = data;
  }
}

export type ContextType = 'container' | 'data';

export class ContainerNode<T> extends BaseNode {
  public childContainers: ContainerNode<T>[] = [];
  public childData: DataNode<T>[] = [];

  constructor(name: string, attrs?: OptionalAttributes) {
    super(name, -1, attrs);
  }

  public addContainerNode(container: ContainerNode<T>): void {
    container.setParentInfo({
      titles: [...this.ancestorTitles, this.name],
      isGroup: this.attrs.isGroup,
    });
    this.childContainers.push(container);
  }

  public addDataNode(dataNode: DataNode<T>): void {
    dataNode.setParentInfo({
      titles: [...this.ancestorTitles, this.name],
      isGroup: this.attrs.isGroup,
    });
    dataNode.checkIntegrity();
    this.childData.push(dataNode);
  }

  public findContainer(
    path: string[],
    createNewContainer?: (name: string) => ContainerNode<T>
  ): ContainerNode<T> | undefined {
    if (path.length <= 0) {
      return this;
    }
    const [target, ...remaining] = path;
    let container = this.childContainers.find((c) => c.name === target);
    if (!container && createNewContainer) {
      container = createNewContainer(target);
      this.addContainerNode(container);
    }
    return container?.findContainer(remaining, createNewContainer);
  }

  /**
   * deeply sort inline all child-data and child-containers by line position.
   * it will update this.zeroBasedLine based on its top child, if it is undefined.
   * @param grouping if true, will try to merge child-data with the same line
   */
  public sort(grouping = false): void {
    this.childData.sort(sortByLine);
    if (grouping) {
      this.childData = this.childData.reduce<DataNode<T>[]>(groupNodes, []);
    }

    // recursive to sort childContainers, which will update its lineNumber, remove the invalid container then then sort the list itself
    const childContainers: ContainerNode<T>[] = [];
    this.childContainers.forEach((c) => {
      c.sort(grouping);
      c.checkIntegrity();
      childContainers.push(c);
    });
    this.childContainers = childContainers;

    this.childContainers.sort(sortByLine);
    if (grouping) {
      this.childContainers = this.childContainers.reduce<ContainerNode<T>[]>(groupNodes, []);
    }

    // if container doesn't have valid line info, use the first known-location child's
    if (this.hasUnknownLocation()) {
      const topLines = ([this.childData, this.childContainers] as BaseNode[][])
        .map((nodes) => nodes.find((n) => !n.hasEvent('invalid-location'))?.zeroBasedLine)
        .filter((n) => n != null) as number[];
      this.zeroBasedLine = topLines.length > 0 ? Math.min(...topLines) : -1;
      if (!this.attrs.range) {
        this.attrs.range = {
          start: { line: this.zeroBasedLine, column: 0 },
          end: { line: this.zeroBasedLine, column: 0 },
        };
      }
    }
  }

  public getChildren<C extends ContextType>(type: C): ChildNodeType<T, C>[] {
    // https://github.com/microsoft/TypeScript/issues/24929
    return (type === 'container' ? this.childContainers : this.childData) as ChildNodeType<T, C>[];
  }

  private allChildNodes<C extends ContextType>(type: C): ChildNodeType<T, C>[] {
    const allNodes: ChildNodeType<T, C>[] = [];

    const allContainerNodes = this.childContainers.flatMap((c) => c.getAll());
    if (type === 'container') {
      allNodes.push(...(allContainerNodes as ChildNodeType<T, C>[]));
    } else {
      const allDataNodes = this.childData.flatMap((c) => c.getAll());
      allNodes.push(...(allDataNodes as ChildNodeType<T, C>[]));
    }

    const childrenNodes = allContainerNodes.flatMap((c) => c.allChildNodes(type));
    return allNodes.concat(childrenNodes);
  }
  public checkDuplicateName(): void {
    const dataNodes = this.allChildNodes('data');
    dataNodes.forEach((n) => {
      const dups = dataNodes.filter((nn) => nn !== n && nn.fullName === n.fullName);
      if (dups.length > 0) {
        dups.concat(n).forEach((nn) => nn.addEvent('duplicate-name'));
      }
    });
  }

  // extract all unmatched data node
  public unmatchedNodes = <C extends ContextType>(type: C): ChildNodeType<T, C>[] =>
    this.allChildNodes(type).filter((n) => !n.isMatched);
}

export type NodeType<T> = ContainerNode<T> | DataNode<T>;
export type ChildNodeType<T, C extends ContextType> = C extends 'container'
  ? ContainerNode<T>
  : DataNode<T>;
