import { ConditionNode, GroupLogic, GroupNode, TypeBlockNode } from "./types";

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function emptyCondition(): ConditionNode {
  return { id: newId("c"), attribute: "", operator: "eq", value: "" };
}

export function emptyGroup(logic: GroupLogic = "and"): GroupNode {
  return { id: newId("g"), logic, conditions: [emptyCondition()], groups: [] };
}

export function emptyBlock(objectType = ""): TypeBlockNode {
  return { id: newId("b"), objectType, root: emptyGroup("and") };
}

/** Deep-clone the tree (plain data), apply a mutator, return the clone. */
export function mutateTree(blocks: TypeBlockNode[], fn: (draft: TypeBlockNode[]) => void): TypeBlockNode[] {
  const draft = JSON.parse(JSON.stringify(blocks)) as TypeBlockNode[];
  fn(draft);
  return draft;
}

export function findGroup(root: GroupNode, groupId: string): GroupNode | undefined {
  if (root.id === groupId) return root;
  for (const g of root.groups) {
    const found = findGroup(g, groupId);
    if (found) return found;
  }
  return undefined;
}

export function findGroupInBlocks(blocks: TypeBlockNode[], groupId: string): GroupNode | undefined {
  for (const b of blocks) {
    const found = findGroup(b.root, groupId);
    if (found) return found;
  }
  return undefined;
}

/** Remove a nested group anywhere under `root`. Returns true when removed. */
export function removeGroup(root: GroupNode, groupId: string): boolean {
  const idx = root.groups.findIndex((g) => g.id === groupId);
  if (idx >= 0) {
    root.groups.splice(idx, 1);
    return true;
  }
  return root.groups.some((g) => removeGroup(g, groupId));
}
