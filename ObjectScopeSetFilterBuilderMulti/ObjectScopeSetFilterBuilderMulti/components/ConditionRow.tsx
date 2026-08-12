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
  /** Attributes offered in the picker: the intersection of the selected types. */
  attributes: AttributeDef[];
  /** Definition for the condition's current attribute, even if outside the intersection. */
  resolvedAttribute?: AttributeDef;
  /** Selected types that lack this condition's attribute; empty when it applies to all. */
  gapTypes: string[];
  disabled: boolean;
  onChange: (patch: Partial<ConditionNode>) => void;
  onDelete: () => void;
}

/** One condition: attribute / operator / value / delete, as a 4-column grid row. */
export const ConditionRow: React.FC<ConditionRowProps> = (props) => {
  const { condition, attributes, resolvedAttribute, gapTypes, disabled, onChange, onDelete } = props;
  const attrDef = resolvedAttribute;
  const operators: Operator[] = attrDef ? OPERATORS_BY_KIND[attrDef.kind] : ["eq", "ne", "like", "in", "gt", "lt"];
  const outOfScope = gapTypes.length > 0;

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
          className="ossfbm-input"
          type="text"
          disabled
          placeholder="Pick an attribute first"
          aria-label="Value"
          value=""
          readOnly
        />
      );
    }
    if (condition.operator === "in") {
      return (
        <input
          className="ossfbm-input"
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
          className="ossfbm-select"
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
          className="ossfbm-select"
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
        className="ossfbm-input"
        type={attrDef.kind === "number" ? "number" : attrDef.kind === "datetime" ? "date" : "text"}
        disabled={disabled}
        aria-label="Value"
        placeholder="Value"
        value={condition.value}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    );
  };

  // An attribute can fall outside the intersection when the user adds a type
  // after building the condition. The condition is kept, not deleted — but it
  // silently excludes the types that lack the attribute, so it is flagged.
  const attributeOptions = attrDef && !attributes.some((a) => a.logicalName === attrDef.logicalName)
    ? [...attributes, attrDef]
    : attributes;

  return (
    <div className={`ossfbm-condition-row ${outOfScope ? "ossfbm-condition-warn" : ""}`}>
      <select
        className="ossfbm-select"
        disabled={disabled}
        aria-label="Attribute"
        value={condition.attribute}
        onChange={(e) => onAttributeChange(e.target.value)}
      >
        <option value="">Attribute...</option>
        {attributeOptions.map((a) => (
          <option key={a.logicalName} value={a.logicalName}>
            {a.label}
          </option>
        ))}
      </select>
      <select
        className="ossfbm-select"
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
        className="ossfbm-icon-btn"
        disabled={disabled}
        title="Remove condition"
        aria-label="Remove condition"
        onClick={onDelete}
      >
        &#10005;
      </button>
      {outOfScope && (
        <div className="ossfbm-condition-warntext">
          &#9888; {attrDef ? attrDef.label : condition.attribute} does not apply to {gapTypes.join(", ")} — objects of{" "}
          {gapTypes.length === 1 ? "that type" : "those types"} will not match this condition.
        </div>
      )}
    </div>
  );
};
