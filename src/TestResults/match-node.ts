/**
 * internal classes used by `match-by-context`
 */

export interface PositionNode {
  zeroBasedLine: number;
}

type IsGroupType = 'yes' | 'no' | 'maybe';
export interface BaseNodeType extends PositionNode {
  readonly name: string;
  readonly isGroup?: IsGroupType;
  readonly ancestorTitles: string[];
  readonly fullName: string;
  readonly hasDynamicName?: boolean;
}

export interface MatchOptions {
  /**If true, will match by fullName instead of name */
  byFullName?: boolean;
  /** if true, will ignore name/fullName difference */
  ignoreDynamicNameDiff?: boolean;
  /** if true, will ignore isGroupNode() difference */
  ignoreGroupDiff?: boolean;
  /** if true will immediately mark nodes' isMatched flag */
  markImmediately?: boolean;
}
export interface GroupableNodeType<T> extends BaseNodeType {
  merge: (another: this, forced?: boolean) => boolean;

  /**
   * return all grouped nodes including self
   * @param resetGroup if true, the group will be reset after flatten
   **/
  getAll: () => this[];

  /** returns true if the node is a group node, i.e. either has non-zero group member or lastProperty === 'each' */
  isGroupNode: () => IsGroupType;

  // is any element in the group (not including self) matches the give name
  isInGroup: (name: string) => boolean;

  /**
   * try to match "other" based on the filter type:
   * "by-name": match by name of the nodes
   * "by-group": if the node has a group, then the "other" node should have 'each' lastProperty.
   *
   * the matched node will be linked and returns true; otherwise false
   *
   * If other already matched, returns true as well.
   **/
  match: (other: T, options?: MatchOptions) => boolean;

  /** note: setting isMatch will set its group members, if any, match-state as well */
  isMatched: boolean;
}

export const hasUnknownLocation = (node: PositionNode): boolean => node.zeroBasedLine < 0;

const sortByLine = (n1: PositionNode, n2: PositionNode): number =>
  n1.zeroBasedLine - n2.zeroBasedLine;

// group nodes after sort
const groupNodes = <N extends GroupableNodeType<GroupableNode>>(list: N[], node: N): N[] => {
  if (list.length <= 0) {
    return [node];
  }
  // if not able to merge with previous node, i.e . can not group, add it to the list
  if (!list[list.length - 1].merge(node)) {
    list.push(node);
  }
  return list;
};

export interface HasTitle {
  title: string;
}

export const ROOT_NODE_NAME = '__root__';

export interface OptionalAttributes {
  fullName?: string;
  isGroup?: IsGroupType;
  hasDynamicName?: boolean;
}
export class GroupableNode implements GroupableNodeType<GroupableNode> {
  name: string;
  zeroBasedLine: number;
  group: this[];
  attrs: OptionalAttributes;

  private _matched: boolean;
  private _ancestorTitles: string[];

  constructor(name: string, zeroBasedLine: number, attrs?: OptionalAttributes) {
    this.name = name;
    this.zeroBasedLine = zeroBasedLine;

    this.attrs = attrs ?? {};

    this.group = [];
    this._ancestorTitles = [];
    this._matched = false;
  }

  get ancestorTitles(): string[] {
    return this._ancestorTitles;
  }
  get fullName(): string {
    if (!this.attrs.fullName) {
      this.attrs.fullName = [...this._ancestorTitles.filter((t) => t.length > 0), this.name].join(
        ' '
      );
    }
    return this.attrs.fullName;
  }

  set isMatched(value: boolean) {
    this.getAll().forEach((n) => (n._matched = value));
  }

  /** check if the target node is in the matched nodes list; if no target, check if there is any matched node. */
  get isMatched(): boolean {
    return this._matched;
  }

  // only update fullName if it is undefined
  setParentInfo(pInfo: { titles: string[]; isGroup?: IsGroupType }): void {
    this._ancestorTitles = pInfo.titles.filter((t) => t !== ROOT_NODE_NAME);
    if (pInfo.isGroup === 'yes') {
      this.attrs.isGroup = 'yes';
    }
  }

  merge(another: this, forced = false): boolean {
    //can not merge if the location is unknown
    if (
      !forced &&
      (hasUnknownLocation(this) ||
        hasUnknownLocation(another) ||
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
  flatten(): this[] {
    const members = this.getAll();
    this.group = [];
    return members;
  }

  /** returns true if the node is a group node, i.e. either has non-zero group member or lastProperty === 'each' */
  isGroupNode(): 'yes' | 'no' | 'maybe' {
    if (this.attrs.isGroup === 'yes' || this.group.length > 0) {
      return 'yes';
    }
    return this.attrs.isGroup ?? 'no';
  }

  // is any element in the group (not including self) matches the give name
  isInGroup(name: string): boolean {
    return this.group.find((n) => n.name === name) != null;
  }

  addGroupMember(member: this): void {
    this.group.push(...member.flatten());
  }

  private nameMaybeDynamic(): boolean {
    return this.attrs.hasDynamicName || this.isGroupNode() !== 'no';
  }

  /**
   * match the other node by name and other group property. if matched, the nodes will be "linked".
   * If "onlyUnmatched" flag is true, will only match if "other" has not been matched.
   * @returns true if matched, even if it is already matched; otherwise false.
   **/

  match(other: GroupableNode, options?: MatchOptions): boolean {
    const nameMatched = options?.byFullName
      ? this.fullName === other.fullName
      : this.name === other.name;

    if (
      !nameMatched &&
      !(options?.ignoreDynamicNameDiff && (this.nameMaybeDynamic() || other.nameMaybeDynamic()))
    ) {
      return false;
    }

    if (
      !options?.ignoreGroupDiff &&
      !(
        this.isGroupNode() === 'maybe' ||
        other.isGroupNode() === 'maybe' ||
        this.isGroupNode() === other.isGroupNode()
      )
    ) {
      return false;
    }

    if (options?.markImmediately) {
      this.isMatched = true;
      other.isMatched = true;
    }

    return true;
  }
}
/* interface implementation */
export class DataNode<T> extends GroupableNode {
  data: T;

  constructor(name: string, zeroBasedLine: number, data: T, attrs?: OptionalAttributes) {
    super(name, zeroBasedLine, attrs);
    this.data = data;
  }
}

export interface UnmatchedOptions {
  flatten?: boolean;
  skipInvalid?: boolean;
}
export type ContextType = 'container' | 'data';

export const flatten = <T>(lists: T[][]): T[] =>
  lists.reduce((finalList, list) => finalList.concat(list), [] as T[]);

export class ContainerNode<T> extends GroupableNode {
  public childContainers: ContainerNode<T>[] = [];
  public childData: DataNode<T>[] = [];

  // childContainers without location info
  public invalidChildContainers?: ContainerNode<T>[] = [];
  // childData without location info
  public invalidChildData?: DataNode<T>[];

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
    if (hasUnknownLocation(dataNode)) {
      if (this.invalidChildData) {
        this.invalidChildData.push(dataNode);
      } else {
        this.invalidChildData = [dataNode];
      }
    } else {
      this.childData.push(dataNode);
    }
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
    const valid: ContainerNode<T>[] = [];
    const invalid: ContainerNode<T>[] = [];
    this.childContainers.forEach((c) => {
      c.sort(grouping);
      if (hasUnknownLocation(c)) {
        invalid.push(c);
      } else {
        valid.push(c);
      }
    });
    this.childContainers = valid;
    this.invalidChildContainers = invalid.length > 0 ? invalid : undefined;

    this.childContainers.sort(sortByLine);
    if (grouping) {
      this.childContainers = this.childContainers.reduce<ContainerNode<T>[]>(groupNodes, []);
    }

    // if container doesn't have valid line info, use the first known-location child's
    if (hasUnknownLocation(this)) {
      const topLines = [this.childData, this.childContainers]
        .filter((l) => l.length > 0)
        .map((l) => l[0].zeroBasedLine);
      this.zeroBasedLine = topLines.length > 0 ? Math.min(...topLines) : -1;
    }
  }
  // use conditional type to narrow down exactly the type

  public getChildren<C extends ContextType>(type: C): ChildrenList<T, C> {
    const valid = type === 'container' ? this.childContainers : this.childData;
    const invalid = type === 'container' ? this.invalidChildContainers : this.invalidChildData;
    // has to cast explicitly due to the issue:
    // https://github.com/microsoft/TypeScript/issues/24929
    return { valid, invalid } as ChildrenList<T, C>;
  }
  /**
   * invalidate duplicate named nodes
   *
   * @returns true if container has been updated; otherwise false
   */
  public invalidateDuplicateNameNodes<C extends ContextType>(
    contextType: ContextType,
    onDups?: (dups: ChildNodeType<T, C>[]) => void
  ): boolean {
    const { valid, invalid } = this.getChildren(contextType);

    const dups = valid.filter((n) => valid.find((nn) => nn !== n && nn.fullName === n.fullName));
    if (dups.length <= 0) {
      return false;
    }
    const newValid = valid.filter((n) => !dups.includes(n));
    const newInvalid = invalid || [];
    newInvalid.push(...dups);

    if (contextType === 'container') {
      this.childContainers = newValid as ContainerNode<T>[];
      this.invalidChildContainers = newInvalid as ContainerNode<T>[];
    } else {
      this.childData = newValid as DataNode<T>[];
      this.invalidChildData = newInvalid as DataNode<T>[];
    }

    onDups?.(dups as ChildNodeType<T, C>[]);

    return true;
  }

  /** move child container to invalid list.
   * @returns true if container has been updated; otherwise false
   */
  public invalidateGroupNode<C extends ContextType>(
    contextType: ContextType,
    node: ChildNodeType<T, C>
  ): boolean {
    const { valid, invalid } = this.getChildren(contextType);
    const idx = valid.indexOf(node);

    if (idx < 0) {
      console.warn(
        `no child found in parent container for ${contextType}. Not able to fix incorrect grouping`
      );
      return false;
    }
    valid.splice(idx, 1);

    const newInvalid = invalid || [];
    newInvalid.push(...node.flatten());
    if (contextType === 'container') {
      this.invalidChildContainers = newInvalid as ContainerNode<T>[];
    } else {
      this.invalidChildData = newInvalid as DataNode<T>[];
    }

    return true;
  }

  // extract all unmatched data node
  public unmatchedNodes = (options?: UnmatchedOptions): DataNode<T>[] => {
    const dataNodes =
      (options?.skipInvalid !== true && this.invalidChildData?.concat(this.childData)) ||
      this.childData;
    let unmatched = dataNodes.filter((n) => !n.isMatched);

    if (options?.flatten) {
      unmatched = flatten(unmatched.map((u) => u.flatten()));
    }

    const containerNodes =
      (options?.skipInvalid !== true &&
        this.invalidChildContainers?.concat(this.childContainers)) ||
      this.childContainers;
    const deepUnmatched = flatten(containerNodes.map((n) => n.unmatchedNodes(options)));
    unmatched.push(...deepUnmatched);

    return unmatched;
  };
}

export type NodeType<T> = ContainerNode<T> | DataNode<T>;
export type ChildNodeType<T, C extends ContextType> = C extends 'container'
  ? ContainerNode<T>
  : DataNode<T>;
export interface ChildrenList<T, C extends ContextType> {
  valid: ChildNodeType<T, C>[];
  invalid?: ChildNodeType<T, C>[];
}
