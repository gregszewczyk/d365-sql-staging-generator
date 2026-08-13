import * as React from "react";
import {
  attributeGapTypes,
  attributesForContext,
  BuilderConfig,
  impliedTypesFromPath,
  TypeContext
} from "../model/config";
import { ConditionNode, GroupLogic, GroupNode } from "../model/types";
import { ConditionRow } from "./ConditionRow";

export interface GroupPanelProps {
  group: GroupNode;
  config: BuilderConfig;
  /**
   * Groups from the root down to (but not including) this one. Combined with
   * this group, it is what type-context inference walks.
   */
  ancestors: GroupNode[];
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
  const { group, config, ancestors, disabled, isRoot } = props;

  const path = React.useMemo(() => [...ancestors, group], [ancestors, group]);
  const ctx: TypeContext = React.useMemo(() => impliedTypesFromPath(config, path), [config, path]);
  const attributes = React.useMemo(() => attributesForContext(config, ctx), [config, ctx]);

  const contextLabel = React.useMemo(() => {
    if (ctx === null) return null;
    if (ctx.length === 0) return "No object type can satisfy this group's type conditions.";
    const labels = ctx.map((v) => config.objectTypes.find((t) => t.value === v)?.label ?? v);
    return `Attributes shown apply to ${labels.join(", ")}`;
  }, [ctx, config]);

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
        <div className="ossfbm-group-headerright">
          {contextLabel && (
            <span className={ctx && ctx.length === 0 ? "ossfbm-error" : "ossfbm-hint"}>{contextLabel}</span>
          )}
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
      </div>

      {group.conditions.map((c) => (
        <ConditionRow
          key={c.id}
          condition={c}
          config={config}
          attributes={attributes}
          gapTypes={c.attribute ? attributeGapTypes(config, ctx, c.attribute) : []}
          disabled={disabled}
          onChange={(patch) => props.onChangeCondition(group.id, c.id, patch)}
          onDelete={() => props.onDeleteCondition(group.id, c.id)}
        />
      ))}

      {group.groups.map((sub) => (
        <GroupPanel key={sub.id} {...props} group={sub} ancestors={path} isRoot={false} />
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
