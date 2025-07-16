# D365 SQL Staging Table Generator - Deployment Guide

## Overview
This Power Automate flow automatically generates Azure SQL staging table scripts based on Dynamics 365 entity metadata. The flow retrieves entity definitions and attributes from Dataverse and creates corresponding SQL CREATE TABLE statements with appropriate data types, indexes, and permissions.

## Prerequisites

### 1. Power Platform Environment
- Power Automate premium license (required for Dataverse connector)
- System Administrator or System Customizer role in D365
- Access to create and modify Power Automate flows

### 2. Connections Required
- **Microsoft Dataverse** connector
  - Authentication: Use organizational account with D365 access
  - Required permissions: Read access to Entity Definitions and Attribute Definitions

### 3. Azure SQL Database (Target Environment)
- Azure SQL Database or SQL Server instance
- Database user with CREATE TABLE permissions
- Network connectivity from execution environment

## Step-by-Step Deployment

### Step 1: Import the Flow

1. **Download the flow definition**
   - Download low-definition.json from this repository

2. **Import into Power Automate**
   - Go to [Power Automate](https://make.powerautomate.com)
   - Select your target environment
   - Click **My flows** > **Import** > **Import Package (Legacy)**
   - Upload the low-definition.json file
   - Follow the import wizard

### Step 2: Configure Connections

1. **Set up Dataverse Connection**
   - During import, you'll be prompted to configure connections
   - Select **Create new** for Microsoft Dataverse connection
   - Sign in with your D365 organizational account
   - Verify connection has proper permissions

2. **Test Connection**
   - Ensure the connection can access entity metadata
   - Test with a simple entity like 'account' or 'contact'

### Step 3: Configure Flow Settings

1. **Review Flow Details**
   - Flow name: D365 SQL Staging Table Generator
   - Trigger type: Manual (PowerApps trigger)
   - Input parameter: EntityName (text)

2. **Validate Action Steps**
   - Get_Entity_Metadata: Retrieves entity information
   - Get_Entity_Attributes: Gets field definitions
   - Variable initialization steps
   - Data type mapping logic
   - SQL script generation

### Step 4: Test the Flow

1. **Manual Test**
   - Run the flow manually from Power Automate
   - Input: 'account' (or any standard D365 entity)
   - Verify output contains valid SQL CREATE TABLE statement

2. **Validation Checklist**
   - [ ] Flow runs without errors
   - [ ] SQL script is generated
   - [ ] Data types are correctly mapped
   - [ ] System fields are included
   - [ ] Indexes are created
   - [ ] Permissions are granted

## Usage Instructions

### Running the Flow

1. **From Power Automate**
   - Navigate to the flow in Power Automate
   - Click **Run flow**
   - Enter the entity logical name (e.g., 'account', 'contact', 'opportunity')
   - Click **Run flow**

2. **From Power Apps (Optional)**
   - Create a Power App that calls this flow
   - Use PowerApps trigger functionality
   - Pass entity name as parameter

### Input Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| EntityName | Text | Logical name of D365 entity | 'account' |

### Output Format

The flow generates a complete SQL script containing:
- DROP TABLE statement (if exists)
- CREATE TABLE statement with all entity fields
- Clustered index on CreatedDate
- Non-clustered indexes on ProcessingStatus and BatchId
- Permission grants for database roles

## Data Type Mapping

| D365 Attribute Type | SQL Data Type | Notes |
|-------------------|---------------|-------|
| String | NVARCHAR(n) or NVARCHAR(MAX) | Based on MaxLength property |
| Integer | INT | 32-bit integer |
| BigInt | BIGINT | 64-bit integer |
| Double | FLOAT | Double precision |
| Decimal | DECIMAL(precision, scale) | Uses D365 precision/scale |
| DateTime | DATETIME2(7) | High precision datetime |
| Boolean | BIT | True/False values |
| Uniqueidentifier | UNIQUEIDENTIFIER | GUID values |
| Memo | NVARCHAR(MAX) | Large text fields |
| Money | MONEY | Currency values |
| Picklist | INT | Option set values |
| Lookup | UNIQUEIDENTIFIER | Reference fields |
| Customer | UNIQUEIDENTIFIER | Customer lookup |
| Owner | UNIQUEIDENTIFIER | Owner lookup |
| State | INT | State values |
| Status | INT | Status reason values |

## System Fields Added

Every staging table includes these system fields:
- CreatedDate - DATETIME2(7) - Record creation timestamp
- ModifiedDate - DATETIME2(7) - Last modification timestamp
- SourceSystem - NVARCHAR(50) - Source system identifier ('D365')
- ProcessingStatus - NVARCHAR(20) - Processing status ('PENDING')
- ErrorMessage - NVARCHAR(MAX) - Error information
- BatchId - UNIQUEIDENTIFIER - Batch processing identifier

## Troubleshooting

### Common Issues

1. **Connection Errors**
   - Verify Dataverse connection credentials
   - Check user permissions in D365
   - Ensure environment access

2. **Entity Not Found**
   - Verify entity logical name spelling
   - Check if entity exists in target environment
   - Ensure entity is not deleted or renamed

3. **Permission Errors**
   - Verify user has System Administrator or System Customizer role
   - Check entity-level permissions
   - Validate connection authentication

### Error Handling

The flow includes built-in error handling:
- Invalid entity names are caught
- Missing attributes are handled gracefully
- Connection failures are reported
- Malformed data is managed

### Logging and Monitoring

1. **Flow Run History**
   - Monitor in Power Automate portal
   - Check run duration and status
   - Review input/output data

2. **Error Diagnosis**
   - Examine failed step details
   - Check connection status
   - Validate input parameters

## Security Considerations

### Data Access
- Flow requires read access to entity metadata only
- No business data is accessed or transmitted
- Generated SQL scripts contain structure only

### Connection Security
- Use organizational accounts for Dataverse connection
- Avoid sharing connection credentials
- Monitor connection usage regularly

### Output Security
- Generated SQL scripts may contain sensitive schema information
- Store and transmit scripts securely
- Apply appropriate access controls to generated scripts

## Best Practices

### Performance
- Use specific entity names rather than wildcards
- Test with small entities first
- Monitor flow execution time

### Maintenance
- Review generated scripts before execution
- Test scripts in development environment first
- Keep flow updated with latest connector versions

### Documentation
- Document custom modifications
- Maintain entity name conventions
- Track generated table usage

## Support and Updates

### Getting Help
- Check flow run history for error details
- Review D365 entity metadata in Power Platform admin center
- Validate connection permissions

### Updates and Modifications
- Fork this repository for customizations
- Submit issues for bugs or feature requests
- Follow Power Platform best practices for modifications

## Related Files

- low-definition.json - Main flow definition
- sample-sql-output.sql - Example generated SQL script
- 	est-entities.json - Test entity configurations
- error-handling-flow.json - Enhanced error handling version

---

**Last Updated:** 2025-07-15
**Version:** 1.0
**Repository:** https://github.com/gregszewczyk/d365-sql-staging-generator
