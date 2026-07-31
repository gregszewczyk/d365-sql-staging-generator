import * as React from "react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { App } from "./components/App";
import { resolveConfig } from "./model/config";

/** Shape of the undocumented-but-stable context.mode.contextInfo on forms. */
interface ContextInfo {
  entityTypeName?: string;
  entityId?: string;
}

export class ObjectScopeSetFilterBuilderMulti
  implements ComponentFramework.ReactControl<IInputs, IOutputs>
{
  private notifyOutputChanged: () => void;

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    context.mode.trackContainerResize(true);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    const { config, error } = resolveConfig(context.parameters.configJson.raw);
    const contextInfo = (context.mode as unknown as { contextInfo?: ContextInfo }).contextInfo;
    const rawId = contextInfo?.entityId ?? "";
    const scopeSetId = rawId ? rawId.replace(/[{}]/g, "").toLowerCase() : null;
    const previewTop = context.parameters.previewTop.raw ?? 50;

    return React.createElement(App, {
      webAPI: context.webAPI,
      config,
      configError: error,
      scopeSetId,
      previewTop: previewTop > 0 ? previewTop : 50
    });
  }

  public getOutputs(): IOutputs {
    // The bound field is only an anchor; the control never writes to it.
    return {};
  }

  public destroy(): void {
    // React unmounting is handled by the platform for virtual controls.
  }
}
