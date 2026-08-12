import * as React from "react";
import { AttributeDef, ConditionNode, GroupLogic, GroupNode } from "../model/types";
import { ConditionRow } from "./ConditionRow";

export interface GroupPanelProps {
  group: GroupNode;
  /** Attributes offered in pickers: intersection of the selected types. */
  attributes: AttributeDef[];
  /** Resolves an attribute's definition even when it is outside the intersection. */
  resolveAttribute: (logicalName: string) => AttributeDef | undefined;
  /** Selected types lacking the given attribute (empty when it applies to all). */
  gapTypesFor: (logicalName: string) => string[];
  disabled: boolean;
  /** The root group renders without its own border (the card is the frame). */
  isRoot: boolean;
  onSetLogic: (groupId: string, logic: GroupLogic) => void;
  onAddCondition: (groupId: string) => void;
  onChangeCondition: (groupId: string, conditionId: string, patch: Partial<ConditionNode>) => void;
  onDeleteCondition: (groupId: string, conditionId: string) => void;
  onAddGroup: (parentGroupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
}

/** A criteria group: AND/OR toggle, condition rows, nested groups (recursive). */
export const GroupPanel: React.FC<GroupPanelProps> = (props) => {
  const { group, attributes, resolveAttribute, gapTypesFor, disabled, isRoot } = props;

  const logicToggle = (
    <div className="ossfbm-logic-toggle" role="radiogroup" aria-label="Group logic">
      <button
        type="button"
        role="radio"
        aria-checked={group.logic === "and"}
        className={`ossfbm-logic-btn ${group.logic === "and" ? "ossfbm-logic-active" : ""}`}
        disabled={disabled}
        onClick={() => props.onSetLogic(group.id, "and")}
      >
        Match ALL (AND)
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={group.logic === "or"}
        className={`ossfbm-logic-btn ${group.logic === "or" ? "ossfbm-logic-active" : ""}`}
        disabled={disabled}
        onClick={() => props.onSetLogic(group.id, "or")}
      >
        Match ANY (OR)
      </button>
    </div>
  );

  return (
    <div className={isRoot ? "ossfbm-group ossfbm-group-root" : "ossfbm-group ossfbm-group-nested"}>
      <div className="ossfbm-group-header">
        {logicToggle}
        {!isRoot && (
          <button
            type="button"
            className="ossfbm-icon-btn"
            disabled={disabled}
            title="Remove group"
            aria-label="Remove group"
            onClick={() => props.onDeleteGroup(group.id)}
          >
            &#10005;
          </button>
        )}
      </div>

      {group.conditions.map((c) => (
        <ConditionRow
          key={c.id}
          condition={c}
          attributes={attributes}
          resolvedAttribute={c.attribute ? resolveAttribute(c.attribute) : undefined}
          gapTypes={c.attribute ? gapTypesFor(c.attribute) : []}
          disabled={disabled}
          onChange={(patch) => props.onChangeCondition(group.id, c.id, patch)}
          onDelete={() => props.onDeleteCondition(group.id, c.id)}
        />
      ))}

      {group.groups.map((sub) => (
        <GroupPanel key={sub.id} {...props} group={sub} isRoot={false} />
      ))}

      <div className="ossfbm-group-actions">
        <button
          type="button"
          className="ossfbm-link-btn"
          disabled={disabled}
          onClick={() => props.onAddCondition(group.id)}
        >
          + Add condition
        </button>
        <button
          type="button"
          className="ossfbm-link-btn"
          disabled={disabled}
          onClick={() => props.onAddGroup(group.id)}
        >
          + Add nested group
        </button>
      </div>
    </div>
  );
};
