/**
 * internal classes used by `match-by-context`
 */

export interface PositionNode {
  zeroBasedLine: number;
}
export interface BaseNodeType extends PositionNode {
  name: string;
  merge: (another: this) => boolean;
}

export const hasUnknownLocation = (node: PositionNode): boolean => node.zeroBasedLine < 0;

const sortByLine = (n1: PositionNode, n2: PositionNode): number =>
  n1.zeroBasedLine - n2.zeroBasedLine;

// group nodes after sort
const groupNodes = <N extends BaseNodeType>(list: N[], node: N): N[] => {
  if (list.length <= 0) {
    return [node];
  }
  // if not able to merge with previous node, i.e . can not group, add it to the list
  if (!list[list.length - 1].merge(node)) {
    list.push(node);
  }
  return list;
};

/* interface implementation */
export class DataNode<T> implements BaseNodeType {
  name: string;
  zeroBasedLine: number;
  data: T[];

  constructor(name: string, zeroBasedLine: number, data: T) {
    this.name = name;
    this.zeroBasedLine = zeroBasedLine;
    this.data = [data];
  }

  merge(another: DataNode<T>): boolean {
    //can not merge if the location is unknown
    if (
      hasUnknownLocation(this) ||
      hasUnknownLocation(another) ||
      another.zeroBasedLine !== this.zeroBasedLine
    ) {
      return false;
    }
    this.data.push(...another.data);
    return true;
  }

  /** return the single element in the list, exception otherwise */
  single(): T {
    if (this.data.length !== 1) {
      throw new TypeError(`expect 1 element but got ${this.data.length} elements`);
    }
    return this.data[0];
  }
}

export type ContextType = 'container' | 'data';
export class ContainerNode<T> implements BaseNodeType {
  public childContainers: ContainerNode<T>[] = [];
  public childData: DataNode<T>[] = [];
  public zeroBasedLine: number;
  public name: string;
  public group?: ContainerNode<T>[];
  // childContainers without location info
  public invalidChildContainers?: ContainerNode<T>[] = [];
  // childData without location info
  public invalidChildData?: DataNode<T>[];

  constructor(name: string) {
    this.name = name;
    this.zeroBasedLine = -1;
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

  merge(another: ContainerNode<T>): boolean {
    // can not merge if location is unknown
    if (
      hasUnknownLocation(this) ||
      hasUnknownLocation(another) ||
      another.zeroBasedLine !== this.zeroBasedLine
    ) {
      return false;
    }
    if (!this.group) {
      this.group = [another];
    } else {
      this.group.push(another);
    }
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
}

export type NodeType<T> = ContainerNode<T> | DataNode<T>;
export type ChildNodeType<T, C extends ContextType> = C extends 'container'
  ? ContainerNode<T>
  : DataNode<T>;
export interface ChildrenList<T, C extends ContextType> {
  valid: ChildNodeType<T, C>[];
  invalid?: ChildNodeType<T, C>[];
}
