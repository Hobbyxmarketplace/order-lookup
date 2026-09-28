-- Item count for a PSA invoice: one psa_certOwners row = one item.
-- Excludes the 'T' sentinel invoice used for unassigned items.
-- Placeholder ? = invoice number.

SELECT COUNT(*) AS items
FROM psa_certOwners
WHERE isActive = 1
  AND InvoiceNumber <> 'T'
  AND UPPER(TRIM(InvoiceNumber)) = UPPER(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)
