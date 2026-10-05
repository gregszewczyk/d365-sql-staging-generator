-- Fill rate per object type: how many rows of each type actually populate each column.
-- A column that is 0 (or near it) for a type is a candidate to drop from that type's
-- attribute list in configJson. Run in SQL 4 CDS.
SELECT
  grc_objecttype,
  COUNT(*) AS total_rows,
  COUNT(grc_jiraobjectkey) AS jiraobjectkey,
  COUNT(grc_appid) AS appid,
  COUNT(grc_description) AS description,
  COUNT(grc_systemtype) AS systemtype,
  COUNT(grc_servicetype) AS servicetype,
  COUNT(grc_status) AS status,
  COUNT(grc_accesstype) AS accesstype,
  COUNT(grc_elementtype) AS elementtype,
  COUNT(grc_elementcategory) AS elementcategory,
  COUNT(grc_aiclassification) AS aiclassification,
  COUNT(grc_criticality) AS criticality,
  COUNT(grc_confidentiality) AS confidentiality,
  COUNT(grc_integrity) AS integrity,
  COUNT(grc_availability) AS availability,
  COUNT(grc_authenticity) AS authenticity,
  COUNT(grc_rto) AS rto,
  COUNT(grc_rpo) AS rpo,
  COUNT(grc_environment) AS environment,
  COUNT(grc_applicationenvironment) AS applicationenvironment,
  COUNT(grc_os) AS os,
  COUNT(grc_internetfacing) AS internetfacing,
  COUNT(grc_legalentity) AS legalentity,
  COUNT(grc_companycode) AS companycode,
  COUNT(grc_constituentunit) AS constituentunit,
  COUNT(grc_country) AS country,
  COUNT(grc_owner) AS owner,
  COUNT(grc_representative) AS representative,
  COUNT(grc_responsible) AS responsible,
  COUNT(grc_accountable) AS accountable,
  COUNT(grc_accountableunit) AS accountableunit,
  COUNT(grc_vendor) AS vendor,
  COUNT(grc_manufacturer) AS manufacturer,
  COUNT(grc_supplier) AS supplier,
  COUNT(grc_products) AS products,
  COUNT(grc_application) AS application,
  COUNT(grc_parentapp) AS parentapp,
  COUNT(grc_linkedobjects) AS linkedobjects,
  COUNT(grc_lastsyncedon) AS lastsyncedon
FROM grc_jiraobject
WHERE grc_isactive = 1
GROUP BY grc_objecttype
ORDER BY grc_objecttype;
