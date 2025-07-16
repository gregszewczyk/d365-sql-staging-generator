# How to Import the D365 SQL Staging Generator Flow

Since the ZIP import is not working as expected, here are alternative methods to get the flow into your Power Automate environment:

## Method 1: Copy and Paste (Recommended)

1. Open Power Automate (https://make.powerautomate.com)
2. Click "My flows" → "New flow" → "Instant cloud flow"
3. Name it "D365 SQL Staging Generator"
4. Choose "Manually trigger a flow" as the trigger
5. Click "Create"
6. Click on the trigger step and add the following input:
   - Input name: EntityName
   - Input type: Text
   - Input description: Enter the logical name of the D365 entity
7. Delete any existing steps after the trigger
8. Click "New step" and search for "Data operation - Compose"
9. Switch to "Code view" (</> icon in the top toolbar)
10. Replace the entire JSON content with the content from flow-definition.json
11. Save the flow

## Method 2: Import as Solution (Alternative)

1. In Power Automate, go to "Solutions"
2. Click "Import solution"
3. Browse and select the ZIP file
4. Follow the import wizard

## Required Connections

Before running the flow, ensure you have:
1. Microsoft Dataverse connection with permissions to read entity metadata
2. SQL Server connection (if you plan to execute the generated scripts automatically)

## Testing the Flow

1. Run the flow manually
2. Enter an entity name (e.g., "account", "contact", "opportunity")
3. The flow will generate a complete SQL script for creating a staging table
4. Copy the generated SQL and run it in your SQL Server environment
