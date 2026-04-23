namespace D365SqlStagingGenerator.Config;

public sealed class AppConfig
{
    public DataverseConfig Dataverse { get; set; } = new();
    public List<string> Entities { get; set; } = new();
    public OutputConfig Output { get; set; } = new();
}

public sealed class DataverseConfig
{
    public string Url { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
}

public sealed class OutputConfig
{
    public string Directory { get; set; } = "./sql-output";
    public string SchemaName { get; set; } = "dbo";
    public string TablePrefix { get; set; } = string.Empty;
    public bool IncludeDropIfExists { get; set; } = true;
    public bool GenerateSingleFile { get; set; } = false;
    public string SingleFileName { get; set; } = "staging_tables.sql";
    public bool IncludeSystemColumns { get; set; } = true;
}
