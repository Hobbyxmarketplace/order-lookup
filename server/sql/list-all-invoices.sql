-- Universe of all invoice numbers the tool knows about:
--   1. Every non-PSA / intake row from order_lookup_invoice_details
--   2. Every PSA Ready-for-Pickup row from psa_certOwners (that isn't Picked Up)
--
-- One row per invoice number. When both sources have the same invoice, the
-- PSA row wins on company/date fields (via UNION order + GROUP BY).
--
-- Filters:
--   ? search LIKE           (raw)
--   ? search LIKE           (raw again, for the OR arm)
--   ? search LIKE           (digits-only)
-- Empty search matches everything.

SELECT
  invoice_number,
  MAX(company)         AS company,
  MAX(pickup_ready_at) AS pickup_ready_at,
  MAX(submitted_at)    AS submitted_at,
  MAX(submission_id)   AS submission_number,
  MAX(owner_email)     AS owner_email,
  MAX(owner_name)      AS owner_name
FROM (
  -- PSA Ready-for-Pickup rows (one per invoice, aggregated in the subquery)
  SELECT
    CONVERT(co.InvoiceNumber USING utf8mb4) COLLATE utf8mb4_unicode_ci AS invoice_number,
    CONVERT('PSA'             USING utf8mb4) COLLATE utf8mb4_unicode_ci AS company,
    MAX(op.pickup_ready_at)       AS pickup_ready_at,
    CAST(NULL AS DATETIME)        AS submitted_at,
    CONVERT(MIN(co.SubmissionNumber) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS submission_id,
    CONVERT(MIN(co.`OwnerEmail(ME)`) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS owner_email,
    CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS owner_name
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
    AND (
      ? = ''
      OR UPPER(co.InvoiceNumber) LIKE UPPER(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)
      OR REGEXP_REPLACE(co.InvoiceNumber, '[^0-9]', '') LIKE ?
    )
  GROUP BY co.InvoiceNumber

  UNION ALL

  -- Non-PSA / intake rows
  SELECT
    CONVERT(d.submission_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS invoice_number,
    CONVERT(UPPER(TRIM(SUBSTRING_INDEX(d.service_level, ' - ', 1))) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS company,
    CAST(NULL AS DATETIME)                          AS pickup_ready_at,
    COALESCE(d.submitted_at, d.submission_date)     AS submitted_at,
    CONVERT(d.submission_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS submission_id,
    CONVERT(d.email USING utf8mb4) COLLATE utf8mb4_unicode_ci AS owner_email,
    CONVERT(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS owner_name
  FROM order_lookup_invoice_details AS d
  WHERE d.submission_id <> 'T'
    AND (
      ? = ''
      OR UPPER(d.submission_id) LIKE UPPER(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)
      OR REGEXP_REPLACE(d.submission_id, '[^0-9]', '') LIKE ?
    )
) AS u
GROUP BY invoice_number
