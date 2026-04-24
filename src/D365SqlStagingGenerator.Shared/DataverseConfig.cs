namespace D365SqlStagingGenerator.Shared;

public sealed class DataverseConfig
{
    public string Url { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(Url))
            throw new InvalidOperationException("Dataverse:Url is required.");
        if (string.IsNullOrWhiteSpace(ClientId))
            throw new InvalidOperationException("Dataverse:ClientId is required.");
        if (string.IsNullOrWhiteSpace(ClientSecret))
            throw new InvalidOperationException("Dataverse:ClientSecret is required.");
    }
}
