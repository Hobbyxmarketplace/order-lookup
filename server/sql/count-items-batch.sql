-- Item counts for many PSA invoices at once. The caller passes an array of
-- invoice numbers via mysql2's `?` placeholder — expands to `IN (?, ?, ...)`.
-- Non-matching invoices simply won't appear in the result set.

SELECT
  UPPER(TRIM(co.InvoiceNumber)) AS invoice_number,
  COUNT(*)                       AS items
FROM psa_certOwners AS co
WHERE co.isActive = 1
  AND co.InvoiceNumber <> 'T'
  AND UPPER(TRIM(co.InvoiceNumber)) IN (?)
GROUP BY UPPER(TRIM(co.InvoiceNumber))
