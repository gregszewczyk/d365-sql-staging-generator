import * as React from "react";
import { BuilderConfig, findObjectType } from "../model/config";
import { compileCountFetchXml, compileFetchXml } from "../model/fetchXmlCompiler";
import { buildTree, flattenTree, loadCriteria, saveCriteria } from "../model/persistence";
import {
  emptyBlock,
  emptyCondition,
  emptyGroup,
  findGroupInBlocks,
  mutateTree,
  removeGroup
} from "../model/treeUtils";
import { ConditionNode, GroupLogic, TypeBlockNode } from "../model/types";
import { PreviewPanel, PreviewState } from "./PreviewPanel";
import { TypeBlockCard } from "./TypeBlockCard";

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

  const [blocks, setBlocks] = React.useState<TypeBlockNode[]>([]);
  const [existingIds, setExistingIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | undefined>();
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | undefined>();
  const [saveError, setSaveError] = React.useState<string | undefined>();
  const [preview, setPreview] = React.useState<PreviewState>({ status: "idle", rows: [] });

  const reload = React.useCallback(async () => {
    if (!scopeSetId) {
      setBlocks([emptyBlock()]);
      setExistingIds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(undefined);
    try {
      const rows = await loadCriteria(webAPI, config, scopeSetId);
      const tree = buildTree(rows);
      setBlocks(tree.length > 0 ? tree : [emptyBlock()]);
      setExistingIds(rows.map((r) => r.id as string).filter(Boolean));
      setDirty(false);
    } catch (e) {
      setLoadError((e as Error).message ?? String(e));
      setBlocks([emptyBlock()]);
    } finally {
      setLoading(false);
    }
  }, [webAPI, config, scopeSetId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const update = (fn: (draft: TypeBlockNode[]) => void) => {
    setBlocks((prev) => mutateTree(prev, fn));
    setDirty(true);
    setSaveMessage(undefined);
  };

  // --- tree edit handlers -------------------------------------------------

  const onAddBlock = () => update((d) => d.push(emptyBlock()));
  const onRemoveBlock = (blockId: string) =>
    update((d) => {
      const i = d.findIndex((b) => b.id === blockId);
      if (i >= 0) d.splice(i, 1);
      if (d.length === 0) d.push(emptyBlock());
    });
  const onSetType = (blockId: string, objectType: string) =>
    update((d) => {
      const b = d.find((x) => x.id === blockId);
      if (!b) return;
      b.objectType = objectType;
      // Attributes differ per type, so existing conditions no longer apply.
      b.root = emptyGroup("and");
    });
  const onSetLogic = (groupId: string, logic: GroupLogic) =>
    update((d) => {
      const g = findGroupInBlocks(d, groupId);
      if (g) g.logic = logic;
    });
  const onAddCondition = (groupId: string) =>
    update((d) => {
      const g = findGroupInBlocks(d, groupId);
      if (g) g.conditions.push(emptyCondition());
    });
  const onChangeCondition = (groupId: string, conditionId: string, patch: Partial<ConditionNode>) =>
    update((d) => {
      const g = findGroupInBlocks(d, groupId);
      const c = g?.conditions.find((x) => x.id === conditionId);
      if (c) Object.assign(c, patch);
    });
  const onDeleteCondition = (groupId: string, conditionId: string) =>
    update((d) => {
      const g = findGroupInBlocks(d, groupId);
      if (!g) return;
      const i = g.conditions.findIndex((x) => x.id === conditionId);
      if (i >= 0) g.conditions.splice(i, 1);
    });
  const onAddGroup = (parentGroupId: string) =>
    update((d) => {
      const g = findGroupInBlocks(d, parentGroupId);
      if (g) g.groups.push(emptyGroup("or"));
    });
  const onDeleteGroup = (groupId: string) =>
    update((d) => {
      d.forEach((b) => removeGroup(b.root, groupId));
    });

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
    const fetchXml = compileFetchXml(blocks, compileOpts);
    if (!fetchXml) {
      setPreview({ status: "error", rows: [], error: "Add at least one type block with a source object type first." });
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
        const countXml = compileCountFetchXml(blocks, compileOpts);
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
      const rows = flattenTree(blocks);
      const writes = await saveCriteria(webAPI, config, scopeSetId, rows, existingIds);
      setSaveMessage(`Saved (${writes} change${writes === 1 ? "" : "s"}).`);
      await reload(); // re-read so new rows carry their Dataverse ids
    } catch (e) {
      setSaveError((e as Error).message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  // --- render ---------------------------------------------------------------

  if (loading) {
    return <div className="ossfb-root ossfb-hint">Loading criteria&hellip;</div>;
  }

  return (
    <div className="ossfb-root">
      {props.configError && <div className="ossfb-warning">{props.configError}</div>}
      {loadError && <div className="ossfb-error">Failed to load existing criteria: {loadError}</div>}
      {!scopeSetId && (
        <div className="ossfb-warning">
          Save the scope set record first — criteria can be built but not saved until the record exists.
        </div>
      )}

      {blocks.map((b, i) => (
        <React.Fragment key={b.id}>
          {i > 0 && <div className="ossfb-or-separator">OR</div>}
          <TypeBlockCard
            block={b}
            index={i}
            config={config}
            disabled={saving}
            onSetType={onSetType}
            onRemoveBlock={onRemoveBlock}
            onSetLogic={onSetLogic}
            onAddCondition={onAddCondition}
            onChangeCondition={onChangeCondition}
            onDeleteCondition={onDeleteCondition}
            onAddGroup={onAddGroup}
            onDeleteGroup={onDeleteGroup}
          />
        </React.Fragment>
      ))}

      <button type="button" className="ossfb-add-block-btn" disabled={saving} onClick={onAddBlock}>
        + Add another source object type
      </button>

      <div className="ossfb-actions">
        <button type="button" className="ossfb-btn ossfb-btn-secondary" disabled={saving} onClick={() => void onRunFilter()}>
          Run filter
        </button>
        <button
          type="button"
          className="ossfb-btn ossfb-btn-primary"
          disabled={saving || !dirty || !scopeSetId}
          onClick={() => void onSave()}
        >
          {saving ? "Saving..." : "Save criteria"}
        </button>
        {dirty && !saving && <span className="ossfb-dirty">Unsaved changes</span>}
        {saveMessage && <span className="ossfb-saved">{saveMessage}</span>}
        {saveError && <span className="ossfb-error">Save failed: {saveError}</span>}
      </div>

      <PreviewPanel preview={preview} cap={previewTop} />
    </div>
  );
};
