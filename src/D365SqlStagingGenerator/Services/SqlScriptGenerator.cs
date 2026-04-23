using System.Text;
using D365SqlStagingGenerator.Config;
using Microsoft.Xrm.Sdk.Metadata;

namespace D365SqlStagingGenerator.Services;

public sealed class SqlScriptGenerator
{
    private readonly OutputConfig _output;

    public SqlScriptGenerator(OutputConfig output)
    {
        _output = output;
    }

    public string Generate(EntityMetadata entity)
    {
        var tableName = $"{_output.TablePrefix}{entity.LogicalName}";
        var qualifiedName = $"[{_output.SchemaName}].[{tableName}]";

        var sb = new StringBuilder();
        sb.AppendLine($"-- Source entity: {entity.LogicalName} (SchemaName: {entity.SchemaName})");
        if (!string.IsNullOrWhiteSpace(entity.Description?.UserLocalizedLabel?.Label))
            sb.AppendLine($"-- Description: {entity.Description.UserLocalizedLabel.Label}");
        sb.AppendLine($"-- Primary Id attribute: {entity.PrimaryIdAttribute}");
        sb.AppendLine();

        if (_output.IncludeDropIfExists)
        {
            sb.AppendLine($"IF OBJECT_ID(N'{_output.SchemaName}.{tableName}', N'U') IS NOT NULL");
            sb.AppendLine($"    DROP TABLE {qualifiedName};");
            sb.AppendLine("GO");
            sb.AppendLine();
        }

        sb.AppendLine($"CREATE TABLE {qualifiedName} (");

        var attributes = entity.Attributes
            .Where(a => IsSupportedAttribute(a))
            .OrderBy(a => a.LogicalName == entity.PrimaryIdAttribute ? 0 : 1)
            .ThenBy(a => a.LogicalName, StringComparer.Ordinal)
            .ToList();

        var columnLines = new List<string>();
        foreach (var attr in attributes)
        {
            var column = BuildColumnDefinition(attr, entity.PrimaryIdAttribute);
            if (column is not null)
                columnLines.Add("    " + column);
        }

        if (_output.IncludeSystemColumns)
        {
            columnLines.Add("    [_StagingLoadedAt]   DATETIME2(7)      NOT NULL CONSTRAINT DF_" + tableName + "_StagingLoadedAt DEFAULT (SYSUTCDATETIME())");
            columnLines.Add("    [_StagingBatchId]    UNIQUEIDENTIFIER  NULL");
            columnLines.Add("    [_StagingStatus]     NVARCHAR(20)      NULL");
            columnLines.Add("    [_StagingError]      NVARCHAR(MAX)     NULL");
        }

        if (!string.IsNullOrWhiteSpace(entity.PrimaryIdAttribute) &&
            attributes.Any(a => a.LogicalName == entity.PrimaryIdAttribute))
        {
            columnLines.Add($"    CONSTRAINT [PK_{tableName}] PRIMARY KEY NONCLUSTERED ([{entity.PrimaryIdAttribute}])");
        }

        sb.AppendLine(string.Join(",\n", columnLines));
        sb.AppendLine(");");
        sb.AppendLine("GO");
        sb.AppendLine();

        return sb.ToString();
    }

    private static bool IsSupportedAttribute(AttributeMetadata attr)
    {
        if (attr.AttributeOf != null) return false;
        if (attr.IsLogical == true) return false;
        if (attr.IsValidForRead == false && attr.IsValidForCreate == false && attr.IsValidForUpdate == false)
            return false;

        return attr.AttributeType switch
        {
            AttributeTypeCode.Virtual => false,
            AttributeTypeCode.CalendarRules => false,
            AttributeTypeCode.PartyList => false,
            AttributeTypeCode.EntityName => false,
            AttributeTypeCode.ManagedProperty => false,
            null => false,
            _ => true
        };
    }

    private static string? BuildColumnDefinition(AttributeMetadata attr, string primaryIdAttribute)
    {
        var sqlType = MapSqlType(attr);
        if (sqlType is null) return null;

        var nullability = ResolveNullability(attr, primaryIdAttribute);

        var name = $"[{attr.LogicalName}]";
        var padded = name.PadRight(40);
        var paddedType = sqlType.PadRight(18);

        return $"{padded} {paddedType} {nullability}";
    }

    private static string ResolveNullability(AttributeMetadata attr, string primaryIdAttribute)
    {
        if (attr.LogicalName == primaryIdAttribute) return "NOT NULL";

        var level = attr.RequiredLevel?.Value;
        return level switch
        {
            AttributeRequiredLevel.SystemRequired => "NOT NULL",
            AttributeRequiredLevel.ApplicationRequired => "NOT NULL",
            _ => "NULL"
        };
    }

    private static string? MapSqlType(AttributeMetadata attr)
    {
        switch (attr)
        {
            case StringAttributeMetadata s:
            {
                var len = s.MaxLength ?? 100;
                return len <= 0 || len > 4000 ? "NVARCHAR(MAX)" : $"NVARCHAR({len})";
            }
            case MemoAttributeMetadata:
                return "NVARCHAR(MAX)";
            case IntegerAttributeMetadata:
                return "INT";
            case BigIntAttributeMetadata:
                return "BIGINT";
            case DecimalAttributeMetadata d:
            {
                var precision = d.Precision ?? 2;
                // D365 decimal MaxValue can be up to 100000000000, use total precision 23
                return $"DECIMAL(23,{precision})";
            }
            case DoubleAttributeMetadata:
                return "FLOAT";
            case MoneyAttributeMetadata m:
            {
                var precision = m.Precision ?? 4;
                return $"DECIMAL(23,{precision})";
            }
            case BooleanAttributeMetadata:
                return "BIT";
            case DateTimeAttributeMetadata:
                return "DATETIME2(7)";
            case UniqueIdentifierAttributeMetadata:
                return "UNIQUEIDENTIFIER";
            case LookupAttributeMetadata:
                return "UNIQUEIDENTIFIER";
            case PicklistAttributeMetadata:
                return "INT";
            case StateAttributeMetadata:
                return "INT";
            case StatusAttributeMetadata:
                return "INT";
            case MultiSelectPicklistAttributeMetadata:
                return "NVARCHAR(MAX)";
            case ImageAttributeMetadata:
                return "VARBINARY(MAX)";
            case FileAttributeMetadata:
                return "UNIQUEIDENTIFIER";
            case EntityNameAttributeMetadata:
                return "NVARCHAR(100)";
        }

        return attr.AttributeType switch
        {
            AttributeTypeCode.Customer => "UNIQUEIDENTIFIER",
            AttributeTypeCode.Owner => "UNIQUEIDENTIFIER",
            _ => null
        };
    }
}
