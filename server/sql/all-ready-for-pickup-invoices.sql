-- Every invoice that occupies a shelf spot right now. Same universe as the
-- bulk-move page: PSA Ready-for-Pickup UNION all BGS/CGC/GEA intake rows.
-- No pagination, no filtering. Used by the zones page to compute per-zone
-- occupancy (total invoices, not per-company).

SELECT invoice_number FROM (
  -- PSA Ready-for-Pickup pool
  SELECT DISTINCT
    CONVERT(co.InvoiceNumber USING utf8mb4) COLLATE utf8mb4_unicode_ci AS invoice_number
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
    AND co.InvoiceNumber <> 'T'

  UNION

  -- Non-PSA intake pool (BGS/CGC/GEA only)
  SELECT DISTINCT
    CONVERT(d.submission_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS invoice_number
  FROM order_lookup_invoice_details AS d
  WHERE d.submission_id <> 'T'
    AND UPPER(TRIM(SUBSTRING_INDEX(d.service_level, ' - ', 1))) IN ('BGS','CGC','GEA')
) AS u
