-- All invoice numbers currently in Ready-for-Pickup status.
-- No pagination, no filtering. Used by the zones page to compute the true
-- per-zone occupancy (boxes actually sitting on shelves right now).

SELECT DISTINCT co.InvoiceNumber AS invoice_number
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
