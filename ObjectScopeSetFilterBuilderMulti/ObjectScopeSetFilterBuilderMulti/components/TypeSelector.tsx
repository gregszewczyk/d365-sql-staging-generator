import * as React from "react";
import { ObjectTypeDef } from "../model/types";

export interface TypeSelectorProps {
  available: ObjectTypeDef[];
  selected: string[];
  disabled: boolean;
  onToggle: (value: string) => void;
}

const ACCENTS = ["#0f6cbd", "#7a7574", "#038387", "#8764b8", "#ca5010"];

/**
 * The scope set's source object types — chosen once, up front, and shared by
 * every condition below. Rendered as toggleable pills: the full set is small
 * and always worth seeing at a glance, which a dropdown would hide.
 */
export const TypeSelector: React.FC<TypeSelectorProps> = ({ available, selected, disabled, onToggle }) => (
  <div className="ossfbm-typeselect">
    <div className="ossfbm-typeselect-header">
      <span className="ossfbm-section-label">Source object types</span>
      <span className="ossfbm-hint">
        {selected.length === 0
          ? "Pick at least one type to start filtering"
          : `Conditions below apply to ${selected.length === 1 ? "this type" : "all selected types"}`}
      </span>
    </div>
    <div className="ossfbm-typeselect-pills" role="group" aria-label="Source object types">
      {available.map((t, i) => {
        const isOn = selected.indexOf(t.value) >= 0;
        return (
          <button
            key={t.value}
            type="button"
            role="checkbox"
            aria-checked={isOn}
            className={`ossfbm-typepill ${isOn ? "ossfbm-typepill-on" : ""}`}
            style={isOn ? { backgroundColor: ACCENTS[i % ACCENTS.length], borderColor: ACCENTS[i % ACCENTS.length] } : undefined}
            disabled={disabled}
            onClick={() => onToggle(t.value)}
          >
            {isOn ? "✓ " : ""}
            {t.label}
          </button>
        );
      })}
    </div>
  </div>
);
