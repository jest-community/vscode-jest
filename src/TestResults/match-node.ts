/**
 * internal classes used by `match-by-context`
 */

export interface PositionNode {
  zeroBasedLine: number;
}

export interface BaseNodeType extends PositionNode {
  name: string;
  lastProperty?: string;
}

export interface GroupableNodeType extends BaseNodeType {
  merge: (another: this) => boolean;

  /**
   * return all grouped nodes including self
   * @param resetGroup if true, the group will be reset after flatten
   **/
  getAll: () => this[];

  // if no grouping, returns 0 otherwie the number of group memebers without self
  groupCount: () => number;

  // is any element in the group (not including self) matches the give name
  isInGroup: (name: string) => boolean;

  // check if the node matches the other node, by name and other group property.
  isMatched: <T extends GroupableNodeType>(other: T) => boolean;
}

export const hasUnknownLocation = (node: PositionNode): boolean => node.zeroBasedLine < 0;

const sortByLine = (n1: PositionNode, n2: PositionNode): number =>
  n1.zeroBasedLine - n2.zeroBasedLine;

// group nodes after sort
const groupNodes = <N extends GroupableNodeType>(list: N[], node: N): N[] => {
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
export class VirtualGroupableNode implements GroupableNodeType {
  name: string;
  zeroBasedLine: number;
  lastProperty?: string;
  group: this[];

  constructor(name: string, zeroBasedLine: number, lastProperty?: string) {
    this.name = name;
    this.zeroBasedLine = zeroBasedLine;
    this.lastProperty = lastProperty;
    this.group = [];
  }

  merge(_another: this): boolean {
    throw new Error(`derived class sould implement "merge"`);
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

  // if no grouping, returns 0 otherwie the number of group memebers without self
  groupCount(): number {
    return this.group.length;
  }

  // is any element in the group (not including self) matches the give name
  isInGroup(name: string): boolean {
    return this.group.find((n) => n.name === name) != null;
  }

  // check if the node matches the other node, by name and other group property.
  isMatched<T extends GroupableNodeType>(other: T): boolean {
    return (
      this.name === other.name &&
      ((this.groupCount() > 0 && other.lastProperty === 'each') ||
        (this.groupCount() <= 0 && other.lastProperty !== 'each'))
    );
  }

  addGroupMember(member: this): void {
    this.group.push(...member.flatten());
  }
}
/* interface implementation */
export class DataNode<T> extends VirtualGroupableNode implements GroupableNodeType {
  data: T;

  constructor(name: string, zeroBasedLine: number, data: T, lastProperty?: string) {
    super(name, zeroBasedLine, lastProperty);
    this.data = data;
  }

  merge(another: this): boolean {
    //can not merge if the location is unknown
    if (
      hasUnknownLocation(this) ||
      hasUnknownLocation(another) ||
      another.zeroBasedLine !== this.zeroBasedLine
    ) {
      return false;
    }
    this.addGroupMember(another);
    return true;
  }

  /** return the single element in the list, exception otherwise */
  single(): T {
    if (this.groupCount() > 0) {
      throw new TypeError(`expect single element but got ${this.groupCount()} elements`);
    }
    return this.data;
  }
}

export type ContextType = 'container' | 'data';
export class ContainerNode<T> extends VirtualGroupableNode implements GroupableNodeType {
  public childContainers: ContainerNode<T>[] = [];
  public childData: DataNode<T>[] = [];

  // childContainers without location info
  public invalidChildContainers?: ContainerNode<T>[] = [];
  // childData without location info
  public invalidChildData?: DataNode<T>[];

  constructor(name: string, lastProperty?: string) {
    super(name, -1, lastProperty);
  }

  public addContainerNode(container: ContainerNode<T>): void {
    this.childContainers.push(container);
  }

  public addDataNode(dataNode: DataNode<T>): void {
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

  merge(another: this): boolean {
    // can not merge if location is unknown
    if (
      hasUnknownLocation(this) ||
      hasUnknownLocation(another) ||
      another.zeroBasedLine !== this.zeroBasedLine
    ) {
      return false;
    }
    this.addGroupMember(another);
    return true;
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

  public invalidateGroupNode<C extends ContextType>(
    contextType: ContextType,
    node: ChildNodeType<T, C>
  ): boolean {
    // move child container to invalid list
    const { valid, invalid } = this.getChildren(contextType);
    const idx = valid.indexOf(node);
    // contextType === 'container' ? valid.indexOf(node) : valid.indexOf(node as DataNode<T>);

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
}

export type NodeType<T> = ContainerNode<T> | DataNode<T>;
export type ChildNodeType<T, C extends ContextType> = C extends 'container'
  ? ContainerNode<T>
  : DataNode<T>;
export interface ChildrenList<T, C extends ContextType> {
  valid: ChildNodeType<T, C>[];
  invalid?: ChildNodeType<T, C>[];
}
