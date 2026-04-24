namespace D365SqlStagingGenerator.Shared;

public static class DataverseConnectionStringBuilder
{
    public static string Build(DataverseConfig config, bool requireNewInstance = true)
    {
        config.Validate();

        var parts = new List<string>
        {
            "AuthType=ClientSecret",
            $"Url={config.Url}",
            $"ClientId={config.ClientId}",
            $"ClientSecret={config.ClientSecret}"
        };

        if (!string.IsNullOrWhiteSpace(config.TenantId))
            parts.Add($"TenantId={config.TenantId}");

        if (requireNewInstance)
            parts.Add("RequireNewInstance=true");

        return string.Join(";", parts) + ";";
    }
}
