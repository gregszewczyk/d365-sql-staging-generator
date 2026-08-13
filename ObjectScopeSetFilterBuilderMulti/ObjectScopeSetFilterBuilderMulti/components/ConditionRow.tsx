import * as React from "react";
import { BuilderConfig, isTypeAttribute } from "../model/config";
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
  config: BuilderConfig;
  /** Attributes offered here: object type plus whatever the type context allows. */
  attributes: AttributeDef[];
  /** Types in context that lack this attribute; empty when it applies throughout. */
  gapTypes: string[];
  disabled: boolean;
  onChange: (patch: Partial<ConditionNode>) => void;
  onDelete: () => void;
}

/** One condition: attribute / operator / value / delete, as a 4-column grid row. */
export const ConditionRow: React.FC<ConditionRowProps> = (props) => {
  const { condition, config, attributes, gapTypes, disabled, onChange, onDelete } = props;
  const attrDef = attributes.find((a) => a.logicalName === condition.attribute);
  const operators: Operator[] = attrDef ? OPERATORS_BY_KIND[attrDef.kind] : ["eq", "ne", "like", "in", "gt", "lt"];
  const outOfScope = gapTypes.length > 0;
  const isType = isTypeAttribute(config, condition.attribute);

  const onAttributeChange = (logicalName: string) => {
    const next = attributes.find((a) => a.logicalName === logicalName);
    const nextOps = next ? OPERATORS_BY_KIND[next.kind] : operators;
    onChange({
      attribute: logicalName,
      operator: nextOps.includes(condition.operator) ? condition.operator : nextOps[0],
      value: ""
    });
  };

  /** Multi-select for `in`, so type lists are built by picking, not typing. */
  const renderMultiChoice = (options: { value: string; label: string }[]) => {
    const selected = condition.value
      .split(IN_DELIMITER)
      .map((v) => v.trim())
      .filter((v) => v !== "");
    const toggle = (v: string) => {
      const next = selected.indexOf(v) >= 0 ? selected.filter((s) => s !== v) : [...selected, v];
      onChange({ value: next.join(IN_DELIMITER) });
    };
    return (
      <div className="ossfbm-valuepills" role="group" aria-label="Values">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={selected.indexOf(o.value) >= 0}
            className={`ossfbm-valuepill ${selected.indexOf(o.value) >= 0 ? "ossfbm-valuepill-on" : ""}`}
            disabled={disabled}
            onClick={() => toggle(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
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
      // Choice-like attributes (including object type) get pills; free text keeps
      // the delimited input.
      if (attrDef.options && attrDef.options.length > 0) return renderMultiChoice(attrDef.options);
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

  // A loaded condition can reference an attribute outside the current context —
  // keep it selectable so the user's work is never silently dropped.
  const attributeOptions =
    condition.attribute && !attrDef
      ? [...attributes, { logicalName: condition.attribute, label: condition.attribute, kind: "text" as const }]
      : attributes;

  return (
    <div
      className={`ossfbm-condition-row ${outOfScope ? "ossfbm-condition-warn" : ""} ${
        isType ? "ossfbm-condition-type" : ""
      }`}
    >
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
