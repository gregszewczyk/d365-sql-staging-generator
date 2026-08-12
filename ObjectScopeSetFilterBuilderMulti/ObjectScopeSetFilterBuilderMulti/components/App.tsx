import * as React from "react";
import {
  attributeGapTypes,
  BuilderConfig,
  findObjectType,
  intersectAttributes,
  unionAttributes
} from "../model/config";
import { compileCountFetchXml, compileFetchXml } from "../model/fetchXmlCompiler";
import { buildTree, flattenTree, loadCriteria, saveCriteria } from "../model/persistence";
import {
  emptyCondition,
  emptyFilter,
  emptyGroup,
  findGroup,
  mutateFilter,
  removeGroup
} from "../model/treeUtils";
import { ConditionNode, GroupLogic, ScopeSetFilter } from "../model/types";
import { PreviewPanel, PreviewState } from "./PreviewPanel";
import { GroupPanel } from "./GroupPanel";
import { TypeSelector } from "./TypeSelector";

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
      const { filter: loaded, converted } = buildTree(rows);
      setFilter(rows.length > 0 ? loaded : emptyFilter());
      setExistingIds(rows.map((r) => r.id as string).filter(Boolean));
      setConvertedNotice(converted);
      // A converted filter differs from what is stored, so it must be re-saved
      // to take effect — surface it as unsaved work rather than silently drift.
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

  // --- attribute scoping ---------------------------------------------------

  const attributes = React.useMemo(
    () => intersectAttributes(config, filter.objectTypes),
    [config, filter.objectTypes]
  );
  const allAttributes = React.useMemo(
    () => unionAttributes(config, filter.objectTypes),
    [config, filter.objectTypes]
  );
  const resolveAttribute = React.useCallback(
    (logicalName: string) => allAttributes.find((a) => a.logicalName === logicalName),
    [allAttributes]
  );
  const gapTypesFor = React.useCallback(
    (logicalName: string) => attributeGapTypes(config, filter.objectTypes, logicalName),
    [config, filter.objectTypes]
  );

  // --- edit handlers -------------------------------------------------------

  // Toggling a type never touches the conditions: narrowing the attribute
  // intersection flags affected conditions instead of deleting the user's work.
  const onToggleType = (value: string) =>
    update((d) => {
      const i = d.objectTypes.indexOf(value);
      if (i >= 0) d.objectTypes.splice(i, 1);
      else d.objectTypes.push(value);
    });
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
      if (g) g.groups.push(emptyGroup("or"));
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
      setPreview({ status: "error", rows: [], error: "Select at least one source object type first." });
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
      const rows = flattenTree(filter);
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

  const noTypes = filter.objectTypes.length === 0;
  const noSharedAttributes = !noTypes && attributes.length === 0;

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
          These criteria were saved with separate per-type filters and have been merged into one shared filter.
          The result is broader than the original — review it before saving.
        </div>
      )}

      <TypeSelector
        available={config.objectTypes}
        selected={filter.objectTypes}
        disabled={saving}
        onToggle={onToggleType}
      />

      {noTypes ? (
        <div className="ossfbm-card ossfbm-hint">Select one or more source object types above to add conditions.</div>
      ) : (
        <div className="ossfbm-card">
          {noSharedAttributes && (
            <div className="ossfbm-warning">
              The selected object types have no filterable attributes in common, so no condition can apply to all of
              them. Remove a type, or filter them as separate scope sets.
            </div>
          )}
          <GroupPanel
            group={filter.root}
            attributes={attributes}
            resolveAttribute={resolveAttribute}
            gapTypesFor={gapTypesFor}
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
