using D365SqlStagingGenerator.Config;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;

namespace D365SqlStagingGenerator.Services;

public sealed class DataverseMetadataService : IDisposable
{
    private readonly ServiceClient _client;

    public DataverseMetadataService(DataverseConfig config)
    {
        if (string.IsNullOrWhiteSpace(config.Url))
            throw new InvalidOperationException("Dataverse:Url is required.");
        if (string.IsNullOrWhiteSpace(config.ClientId))
            throw new InvalidOperationException("Dataverse:ClientId is required.");
        if (string.IsNullOrWhiteSpace(config.ClientSecret))
            throw new InvalidOperationException("Dataverse:ClientSecret is required.");

        var connectionString =
            $"AuthType=ClientSecret;" +
            $"Url={config.Url};" +
            $"ClientId={config.ClientId};" +
            $"ClientSecret={config.ClientSecret};" +
            (string.IsNullOrWhiteSpace(config.TenantId) ? string.Empty : $"TenantId={config.TenantId};") +
            $"RequireNewInstance=true";

        _client = new ServiceClient(connectionString);

        if (!_client.IsReady)
        {
            throw new InvalidOperationException(
                $"Failed to connect to Dataverse: {_client.LastError} {_client.LastException?.Message}");
        }
    }

    public EntityMetadata RetrieveEntity(string logicalName)
    {
        var request = new RetrieveEntityRequest
        {
            LogicalName = logicalName,
            EntityFilters = EntityFilters.Entity | EntityFilters.Attributes,
            RetrieveAsIfPublished = true
        };

        var response = (RetrieveEntityResponse)_client.Execute(request);
        return response.EntityMetadata;
    }

    public void Dispose() => _client.Dispose();
}
