import * as React from "react";

export interface PreviewRow {
  id: string;
  name: string;
  typeLabel: string;
  url?: string;
}

export interface PreviewState {
  status: "idle" | "running" | "done" | "error";
  rows: PreviewRow[];
  /** Total matches from the aggregate count query; undefined if it failed. */
  total?: number;
  error?: string;
}

export interface PreviewPanelProps {
  preview: PreviewState;
  cap: number;
}

/** Preview card: match-count pill plus a flat result list with per-row type labels. */
export const PreviewPanel: React.FC<PreviewPanelProps> = ({ preview, cap }) => {
  if (preview.status === "idle") {
    return <div className="ossfb-preview ossfb-hint">Run the filter to preview matching objects. Nothing is saved by previewing.</div>;
  }
  if (preview.status === "running") {
    return <div className="ossfb-preview ossfb-hint">Running filter&hellip;</div>;
  }
  if (preview.status === "error") {
    return <div className="ossfb-preview ossfb-error">Preview failed: {preview.error}</div>;
  }

  const total = preview.total ?? preview.rows.length;
  const more = total > preview.rows.length ? total - preview.rows.length : 0;

  return (
    <div className="ossfb-preview">
      <div className="ossfb-preview-header">
        <span className="ossfb-count-pill">
          {total} match{total === 1 ? "" : "es"}
        </span>
        {preview.rows.length === cap && more > 0 && (
          <span className="ossfb-hint">showing first {cap}</span>
        )}
      </div>
      {preview.rows.length === 0 ? (
        <div className="ossfb-hint">No objects match the current filter.</div>
      ) : (
        <ul className="ossfb-preview-list">
          {preview.rows.map((r) => (
            <li key={r.id} className="ossfb-preview-row">
              <span className="ossfb-row-type">{r.typeLabel}</span>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.name}
                </a>
              ) : (
                <span>{r.name}</span>
              )}
            </li>
          ))}
          {more > 0 && <li className="ossfb-preview-row ossfb-hint">+ {more} more</li>}
        </ul>
      )}
    </div>
  );
};
