import * as React from "react";
import { BuilderConfig, findObjectType } from "../model/config";
import { compileCountFetchXml, compileFetchXml, hasTypeCondition } from "../model/fetchXmlCompiler";
import { buildTree, flattenTree, loadCriteria, saveCriteria } from "../model/persistence";
import { emptyCondition, emptyFilter, emptyGroup, findGroup, mutateFilter, removeGroup } from "../model/treeUtils";
import { ConditionNode, GroupLogic, ScopeSetFilter } from "../model/types";
import { PreviewPanel, PreviewState } from "./PreviewPanel";
import { GroupPanel } from "./GroupPanel";

export interface AppProps {
  webAPI: ComponentFramework.WebApi;
  config: BuilderConfig;
  configError?: string;
  /** Id of the grc_objectscopeset record the form is showing; null on unsaved records. */
  scopeSetId: string | null;
  previewTop: number;
}

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

export const App: React.FC<AppProps> = (props) => {
  const { webAPI, config, scopeSetId, previewTop } = props;

  const [filter, setFilter] = React.useState<ScopeSetFilter>(emptyFilter());
  const [existingIds, setExistingIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | undefined>();
  const [convertedNotice, setConvertedNotice] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | undefined>();
  const [saveError, setSaveError] = React.useState<string | undefined>();
  const [preview, setPreview] = React.useState<PreviewState>({ status: "idle", rows: [] });

  const reload = React.useCallback(async () => {
    if (!scopeSetId) {
      setFilter(emptyFilter());
      setExistingIds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(undefined);
    try {
      const rows = await loadCriteria(webAPI, config, scopeSetId);
      const { filter: loaded, converted } = buildTree(rows, config.typeAttribute);
      setFilter(rows.length > 0 ? loaded : emptyFilter());
      setExistingIds(rows.map((r) => r.id as string).filter(Boolean));
      setConvertedNotice(converted);
      // An upgraded tree contains rows that do not exist yet, so it must be
      // saved to take effect — surface it as unsaved work rather than drift.
      setDirty(converted);
    } catch (e) {
      setLoadError((e as Error).message ?? String(e));
      setFilter(emptyFilter());
    } finally {
      setLoading(false);
    }
  }, [webAPI, config, scopeSetId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const update = (fn: (draft: ScopeSetFilter) => void) => {
    setFilter((prev) => mutateFilter(prev, fn));
    setDirty(true);
    setSaveMessage(undefined);
  };

  // --- edit handlers -------------------------------------------------------

  const onSetLogic = (groupId: string, logic: GroupLogic) =>
    update((d) => {
      const g = findGroup(d.root, groupId);
      if (g) g.logic = logic;
    });
  const onAddCondition = (groupId: string) =>
    update((d) => {
      const g = findGroup(d.root, groupId);
      if (g) g.conditions.push(emptyCondition());
    });
  const onChangeCondition = (groupId: string, conditionId: string, patch: Partial<ConditionNode>) =>
    update((d) => {
      const g = findGroup(d.root, groupId);
      const c = g?.conditions.find((x) => x.id === conditionId);
      if (c) Object.assign(c, patch);
    });
  const onDeleteCondition = (groupId: string, conditionId: string) =>
    update((d) => {
      const g = findGroup(d.root, groupId);
      if (!g) return;
      const i = g.conditions.findIndex((x) => x.id === conditionId);
      if (i >= 0) g.conditions.splice(i, 1);
    });
  const onAddGroup = (parentGroupId: string) =>
    update((d) => {
      const g = findGroup(d.root, parentGroupId);
      // A nested group defaults to the opposite logic of its parent, which is
      // almost always what the user wants when they reach for one.
      if (g) g.groups.push(emptyGroup(g.logic === "and" ? "or" : "and"));
    });
  const onDeleteGroup = (groupId: string) => update((d) => removeGroup(d.root, groupId));

  // --- preview (ephemeral: reads only, never writes) ----------------------

  const compileOpts = React.useMemo(
    () => ({
      entityName: config.jiraObjectEntity,
      typeAttribute: config.typeAttribute,
      activeAttribute: config.activeAttribute,
      selectAttributes: [
        config.jiraObjectPrimaryName,
        config.typeAttribute,
        ...(config.objectUrlAttribute ? [config.objectUrlAttribute] : [])
      ],
      top: previewTop
    }),
    [config, previewTop]
  );

  const onRunFilter = async () => {
    const fetchXml = compileFetchXml(filter, compileOpts);
    if (!fetchXml) {
      setPreview({ status: "error", rows: [], error: "Add at least one complete condition first." });
      return;
    }
    setPreview({ status: "running", rows: [] });
    try {
      const result = await webAPI.retrieveMultipleRecords(
        config.jiraObjectEntity,
        `?fetchXml=${encodeURIComponent(fetchXml)}`
      );
      const idAttr = `${config.jiraObjectEntity}id`;
      const rows = result.entities.map((e, i) => {
        const rawType = e[config.typeAttribute];
        const typeLabel =
          (e[`${config.typeAttribute}${FORMATTED}`] as string) ??
          findObjectType(config, String(rawType ?? ""))?.label ??
          String(rawType ?? "");
        return {
          id: (e[idAttr] as string) ?? String(i),
          name: (e[config.jiraObjectPrimaryName] as string) ?? "(no name)",
          typeLabel,
          url: config.objectUrlAttribute ? ((e[config.objectUrlAttribute] as string) ?? undefined) : undefined
        };
      });

      let total: number | undefined;
      try {
        const countXml = compileCountFetchXml(filter, compileOpts);
        const countResult = await webAPI.retrieveMultipleRecords(
          config.jiraObjectEntity,
          `?fetchXml=${encodeURIComponent(countXml)}`
        );
        total = countResult.entities.length > 0 ? Number(countResult.entities[0].matchcount) : rows.length;
      } catch {
        total = undefined; // aggregate can fail (>50k rows); fall back to row count
      }

      setPreview({ status: "done", rows, total });
    } catch (e) {
      setPreview({ status: "error", rows: [], error: (e as Error).message ?? String(e) });
    }
  };

  // --- explicit save -------------------------------------------------------

  const onSave = async () => {
    if (!scopeSetId) return;
    setSaving(true);
    setSaveError(undefined);
    setSaveMessage(undefined);
    try {
      const rows = flattenTree(filter, config.typeAttribute);
      const writes = await saveCriteria(webAPI, config, scopeSetId, rows, existingIds);
      setSaveMessage(`Saved (${writes} change${writes === 1 ? "" : "s"}).`);
      setConvertedNotice(false);
      await reload(); // re-read so new rows carry their Dataverse ids
    } catch (e) {
      setSaveError((e as Error).message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  // --- render ---------------------------------------------------------------

  if (loading) {
    return <div className="ossfbm-root ossfbm-hint">Loading criteria&hellip;</div>;
  }

  const untyped = !hasTypeCondition(filter, config.typeAttribute);

  return (
    <div className="ossfbm-root">
      {props.configError && <div className="ossfbm-warning">{props.configError}</div>}
      {loadError && <div className="ossfbm-error">Failed to load existing criteria: {loadError}</div>}
      {!scopeSetId && (
        <div className="ossfbm-warning">
          Save the scope set record first — criteria can be built but not saved until the record exists.
        </div>
      )}
      {convertedNotice && (
        <div className="ossfbm-warning">
          These criteria were stored in an earlier format and have been loaded as object-type conditions. Review them
          and save to store them in the new format.
        </div>
      )}

      <div className="ossfbm-card">
        <div className="ossfbm-cardhead">
          <span className="ossfbm-section-label">Filter</span>
          <span className="ossfbm-hint">
            Object type is a condition like any other — combine it freely with AND / OR and nested groups.
          </span>
        </div>
        <GroupPanel
          group={filter.root}
          config={config}
          ancestors={[]}
          disabled={saving}
          isRoot={true}
          onSetLogic={onSetLogic}
          onAddCondition={onAddCondition}
          onChangeCondition={onChangeCondition}
          onDeleteCondition={onDeleteCondition}
          onAddGroup={onAddGroup}
          onDeleteGroup={onDeleteGroup}
        />
      </div>

      {untyped && (
        <div className="ossfbm-warning">
          No object type condition — this filter will match objects of every type. Add an Object type condition to
          narrow it.
        </div>
      )}

      <div className="ossfbm-actions">
        <button
          type="button"
          className="ossfbm-btn ossfbm-btn-secondary"
          disabled={saving}
          onClick={() => void onRunFilter()}
        >
          Run filter
        </button>
        <button
          type="button"
          className="ossfbm-btn ossfbm-btn-primary"
          disabled={saving || !dirty || !scopeSetId}
          onClick={() => void onSave()}
        >
          {saving ? "Saving..." : "Save criteria"}
        </button>
        {dirty && !saving && <span className="ossfbm-dirty">Unsaved changes</span>}
        {saveMessage && <span className="ossfbm-saved">{saveMessage}</span>}
        {saveError && <span className="ossfbm-error">Save failed: {saveError}</span>}
      </div>

      <PreviewPanel preview={preview} cap={previewTop} />
    </div>
  );
};
