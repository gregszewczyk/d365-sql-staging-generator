using D365SqlStagingGenerator.Shared;

namespace D365EarlyBoundGenerator.Config;

public sealed class AppConfig
{
    public DataverseConfig Dataverse { get; set; } = new();
    public List<string> Entities { get; set; } = new();
    public OutputConfig Output { get; set; } = new();
    public CrmSvcUtilConfig CrmSvcUtil { get; set; } = new();
}

public sealed class OutputConfig
{
    public string Directory { get; set; } = "./generated";
    public string FileName { get; set; } = "EarlyBoundEntities.cs";
    public string Namespace { get; set; } = "D365.EarlyBound";
    public string? ServiceContextName { get; set; }
    public bool GenerateActions { get; set; } = false;
    public bool EmitFieldsClasses { get; set; } = false;
}

public sealed class CrmSvcUtilConfig
{
    /// <summary>
    /// Optional override for the path to CrmSvcUtil.exe.
    /// If empty, the app looks for ./crmsvcutil/CrmSvcUtil.exe next to the running assembly.
    /// </summary>
    public string ExecutablePath { get; set; } = string.Empty;

    /// <summary>
    /// On non-Windows platforms, set this to "mono" (or a full path to mono) to invoke the .NET Framework tool.
    /// Leave empty on Windows.
    /// </summary>
    public string MonoPath { get; set; } = string.Empty;
}
