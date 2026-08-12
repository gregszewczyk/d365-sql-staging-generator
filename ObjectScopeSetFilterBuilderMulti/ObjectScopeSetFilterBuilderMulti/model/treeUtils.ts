import { ConditionNode, GroupLogic, GroupNode, ScopeSetFilter } from "./types";

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

export function emptyFilter(objectTypes: string[] = []): ScopeSetFilter {
  return { objectTypes, root: emptyGroup("and") };
}

/** Deep-clone the filter (plain data), apply a mutator, return the clone. */
export function mutateFilter(filter: ScopeSetFilter, fn: (draft: ScopeSetFilter) => void): ScopeSetFilter {
  const draft = JSON.parse(JSON.stringify(filter)) as ScopeSetFilter;
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

/** Remove a nested group anywhere under `root`. Returns true when removed. */
export function removeGroup(root: GroupNode, groupId: string): boolean {
  const idx = root.groups.findIndex((g) => g.id === groupId);
  if (idx >= 0) {
    root.groups.splice(idx, 1);
    return true;
  }
  return root.groups.some((g) => removeGroup(g, groupId));
}
