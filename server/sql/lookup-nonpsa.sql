-- Fetch a single non-PSA (BGS/CGC/GEA/Unknown) invoice from the intake table.
-- Used ONLY when the PSA pipeline returned no row for the invoice number.
-- Placeholder ? = invoice as typed (matched case-insensitively).

SELECT
  submission_id        AS invoice_number,
  submission_date      AS submission_date,
  submitted_at         AS submitted_at,
  submission_year      AS submission_year,
  submission_month     AS submission_month,
  group_code           AS group_code,
  handler              AS handler,
  service_level        AS service_level_raw,
  first_name           AS first_name,
  last_name            AS last_name,
  email                AS owner_email,
  phone                AS owner_phone,
  international_phone  AS owner_international_phone,
  preferred_language   AS preferred_language
FROM order_lookup_invoice_details
WHERE UPPER(submission_id) = UPPER(?)
  AND submission_id <> 'T'
LIMIT 1
