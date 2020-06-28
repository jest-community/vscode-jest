/**
 * internal classes used by `match-by-context`
 */

export interface BaseNodeType {
  zeroBasedLine: number;
  name: string;
}

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

export type ContextType = 'container' | 'data';
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
  // use conditional type to narrow down exactly the type
  public getChildren<C extends ContextType>(type: C): ChildNodeType<T, C>[] {
    const children = type === 'container' ? this.childContainers : this.childData;
    // has to cast explicitly due to the issue:
    // https://github.com/microsoft/TypeScript/issues/24929
    return children as ChildNodeType<T, C>[];
  }
}
export type NodeType<T> = ContainerNode<T> | DataNode<T>;
export type ChildNodeType<T, C extends ContextType> = C extends 'container'
  ? ContainerNode<T>
  : DataNode<T>;
