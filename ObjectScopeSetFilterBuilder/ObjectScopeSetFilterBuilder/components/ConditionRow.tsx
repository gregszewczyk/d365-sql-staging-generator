import * as React from "react";
import {
  AttributeDef,
  ConditionNode,
  IN_DELIMITER,
  Operator,
  OPERATOR_LABELS,
  OPERATORS_BY_KIND
} from "../model/types";

export interface ConditionRowProps {
  condition: ConditionNode;
  attributes: AttributeDef[];
  disabled: boolean;
  onChange: (patch: Partial<ConditionNode>) => void;
  onDelete: () => void;
}

/** One condition: attribute / operator / value / delete, as a 4-column grid row. */
export const ConditionRow: React.FC<ConditionRowProps> = (props) => {
  const { condition, attributes, disabled, onChange, onDelete } = props;
  const attrDef = attributes.find((a) => a.logicalName === condition.attribute);
  const operators: Operator[] = attrDef ? OPERATORS_BY_KIND[attrDef.kind] : ["eq", "ne", "like", "in", "gt", "lt"];

  const onAttributeChange = (logicalName: string) => {
    const next = attributes.find((a) => a.logicalName === logicalName);
    const nextOps = next ? OPERATORS_BY_KIND[next.kind] : operators;
    onChange({
      attribute: logicalName,
      operator: nextOps.includes(condition.operator) ? condition.operator : nextOps[0],
      value: ""
    });
  };

  const renderValueEditor = () => {
    if (!attrDef) {
      return (
        <input
          className="ossfb-input"
          type="text"
          disabled
          placeholder="Pick an attribute"
          aria-label="Value"
          value=""
          readOnly
        />
      );
    }
    if (condition.operator === "in") {
      return (
        <input
          className="ossfb-input"
          type="text"
          disabled={disabled}
          aria-label="Values (separate with ;)"
          placeholder={`Values separated by "${IN_DELIMITER}"`}
          value={condition.value}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      );
    }
    if (attrDef.kind === "boolean") {
      return (
        <select
          className="ossfb-select"
          disabled={disabled}
          aria-label="Value"
          value={condition.value}
          onChange={(e) => onChange({ value: e.target.value })}
        >
          <option value="">--</option>
          <option value="1">Yes</option>
          <option value="0">No</option>
        </select>
      );
    }
    if (attrDef.kind === "choice" && attrDef.options) {
      return (
        <select
          className="ossfb-select"
          disabled={disabled}
          aria-label="Value"
          value={condition.value}
          onChange={(e) => onChange({ value: e.target.value })}
        >
          <option value="">--</option>
          {attrDef.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        className="ossfb-input"
        type={attrDef.kind === "number" ? "number" : attrDef.kind === "datetime" ? "date" : "text"}
        disabled={disabled}
        aria-label="Value"
        placeholder="Value"
        value={condition.value}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    );
  };

  return (
    <div className="ossfb-condition-row">
      <select
        className="ossfb-select"
        disabled={disabled}
        aria-label="Attribute"
        value={condition.attribute}
        onChange={(e) => onAttributeChange(e.target.value)}
      >
        <option value="">Attribute...</option>
        {attributes.map((a) => (
          <option key={a.logicalName} value={a.logicalName}>
            {a.label}
          </option>
        ))}
      </select>
      <select
        className="ossfb-select"
        disabled={disabled || !attrDef}
        aria-label="Operator"
        value={condition.operator}
        onChange={(e) => onChange({ operator: e.target.value as Operator, value: "" })}
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </select>
      {renderValueEditor()}
      <button
        type="button"
        className="ossfb-icon-btn"
        disabled={disabled}
        title="Remove condition"
        aria-label="Remove condition"
        onClick={onDelete}
      >
        &#10005;
      </button>
    </div>
  );
};
