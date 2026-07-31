import * as React from "react";
import { BuilderConfig, findObjectType } from "../model/config";
import { ConditionNode, GroupLogic, TypeBlockNode } from "../model/types";
import { GroupPanel } from "./GroupPanel";

export interface TypeBlockCardProps {
  block: TypeBlockNode;
  index: number;
  config: BuilderConfig;
  disabled: boolean;
  onSetType: (blockId: string, objectType: string) => void;
  onRemoveBlock: (blockId: string) => void;
  onSetLogic: (groupId: string, logic: GroupLogic) => void;
  onAddCondition: (groupId: string) => void;
  onChangeCondition: (groupId: string, conditionId: string, patch: Partial<ConditionNode>) => void;
  onDeleteCondition: (groupId: string, conditionId: string) => void;
  onAddGroup: (parentGroupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
}

const ACCENTS = ["#0f6cbd", "#7a7574", "#038387", "#8764b8", "#ca5010"];

/** One type block: coloured-border card pinned to a source object type. */
export const TypeBlockCard: React.FC<TypeBlockCardProps> = (props) => {
  const { block, index, config, disabled } = props;
  const typeDef = findObjectType(config, block.objectType);
  const accent = ACCENTS[index % ACCENTS.length];

  return (
    <div className="ossfbm-block" style={{ borderLeftColor: accent }}>
      <div className="ossfbm-block-header">
        <span className="ossfbm-type-pill" style={{ backgroundColor: accent }}>
          {typeDef ? typeDef.label : "Choose type"}
        </span>
        <select
          className="ossfbm-select ossfbm-type-select"
          aria-label="Source object type"
          disabled={disabled}
          value={block.objectType}
          onChange={(e) => props.onSetType(block.id, e.target.value)}
        >
          <option value="">Source object type...</option>
          {config.objectTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ossfbm-icon-btn"
          disabled={disabled}
          title="Remove this type block"
          aria-label="Remove this type block"
          onClick={() => props.onRemoveBlock(block.id)}
        >
          &#10005;
        </button>
      </div>

      {block.objectType === "" ? (
        <div className="ossfbm-hint">Pick a source object type to start adding conditions.</div>
      ) : (
        <GroupPanel
          group={block.root}
          attributes={typeDef ? typeDef.attributes : []}
          disabled={disabled}
          isRoot={true}
          onSetLogic={props.onSetLogic}
          onAddCondition={props.onAddCondition}
          onChangeCondition={props.onChangeCondition}
          onDeleteCondition={props.onDeleteCondition}
          onAddGroup={props.onAddGroup}
          onDeleteGroup={props.onDeleteGroup}
        />
      )}
    </div>
  );
};
