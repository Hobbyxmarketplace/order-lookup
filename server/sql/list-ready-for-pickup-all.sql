-- All Ready-for-Pickup rows matching an optional search string.
-- Returns one row per invoice: an invoice may cover several submissions, but
-- moves between zones as a single unit, so we collapse them here.
-- Zones are joined in SQLite, filtering and pagination happen in JS
-- so this must return the full result set.
-- Placeholders: ? = search term (LIKE), ? = search term (LIKE).

SELECT
  co.InvoiceNumber                      AS invoice_number,
  MIN(co.SubmissionNumber)              AS submission_number,
  MIN(co.`OwnerEmail(ME)`)              AS owner_email,
  MAX(op.pickup_ready_at)               AS pickup_ready_at
FROM psa_certOwners AS co
JOIN psa_hobbyx_order_pickup AS op
  ON op.submission_number = CAST(co.SubmissionNumber AS UNSIGNED)
LEFT JOIN psa_hobbyx_invoice_pickup AS ip
  ON ip.invoice_number = co.InvoiceNumber COLLATE utf8mb4_unicode_520_ci
WHERE co.isActive = 1
  AND op.is_pickup_ready = 1
  AND ip.invoice_number IS NULL
  AND co.InvoiceNumber IS NOT NULL
  AND co.InvoiceNumber <> ''
  AND (
    ? = ''
    OR UPPER(co.InvoiceNumber) LIKE UPPER(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)
  )
GROUP BY co.InvoiceNumber
ORDER BY MAX(op.pickup_ready_at) DESC, co.InvoiceNumber ASC
