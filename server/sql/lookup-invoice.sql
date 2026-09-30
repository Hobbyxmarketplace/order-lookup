-- Invoice status lookup.
-- Placeholders: ? = invoice as typed by the user (exact match, upper),
--                ? = digits-only version of the same (fallback for "131055"
--                    matching "H131055").
--
-- Only one row is ever returned. Exact matches beat digits-only via ORDER BY.
-- Returns a single row with columns:
--   grading_company, invoice_number, submission_number, status, status_date,
--   owner_email, owner_login, owner_display_name, owner_phone, owner_registered,
--   date_arrived, date_completed, pickup_ready_at, pickup_date,
--   service_level, is_reholder_or_crc,
--   shipment_raw, turnaround_days, turnaround_days_high,
--   estimated_completion, estimated_completion_upper
--
-- Status priority (matches the main app):
--   1. Picked Up   -- invoice is in psa_hobbyx_invoice_pickup
--   2. Ready for Pickup   -- op.is_pickup_ready = 1
--   3. PSA pipeline flags (Completing / Grades Ready / Assembly / Grading / ...)
--   4. Order Arrived   -- st.`Arrived(ME)` = 'yes'
--   5. Shipping   -- default

SELECT
  'PSA' AS grading_company,
  co.InvoiceNumber AS invoice_number,
  co.SubmissionNumber AS submission_number,
  CASE
    WHEN ip.invoice_number IS NOT NULL THEN 'Picked Up'
    WHEN op.is_pickup_ready = 1 THEN 'Ready for Pickup'
    WHEN (
      MAX(st.OrderNumber) IS NOT NULL
      AND MAX(st.OrderNumber) <> ''
      AND MAX(st.OrderNumber) <> '0'
    ) THEN
      CASE
        WHEN MAX(pos.Completed) = 1 THEN 'Completing'
        WHEN MAX(pos.GradesReady) = 1 THEN 'Grades Ready'
        WHEN MAX(pos.QACheck) = 1 THEN 'Completing'
        WHEN MAX(pos.Assembly) = 1 THEN 'Assembly'
        WHEN MAX(pos.ResearchAndID) = 1 THEN
          CASE
            WHEN LOWER(COALESCE(MAX(pod.serviceLevel), '')) LIKE '%reholder%'
              OR LOWER(COALESCE(MAX(pod.serviceLevel), '')) LIKE '%crc%'
              OR LOWER(COALESCE(MAX(st.`ServiceLevel(ME)`), '')) LIKE '%crc%'
            THEN 'Assembly'
            ELSE 'Grading'
          END
        WHEN MAX(pos.OrderPrep) = 1 THEN 'Research and ID'
        ELSE 'Shipping'
      END
    WHEN LOWER(MAX(st.`Arrived(ME)`)) = 'yes' THEN 'Order Arrived'
    ELSE 'Shipping'
  END AS status,
  CASE
    WHEN ip.invoice_number IS NOT NULL THEN ip.pickup_date
    WHEN op.is_pickup_ready = 1 THEN DATE(op.pickup_ready_at)
    WHEN MAX(pos.Completed) = 1 THEN MAX(pod.dateCompleted)
    ELSE NULL
  END AS status_date,
  co.`OwnerEmail(ME)` AS owner_email,
  u.user_login AS owner_login,
  u.display_name AS owner_display_name,
  u.user_registered AS owner_registered,
  (
    SELECT meta_value
    FROM jih_usermeta
    WHERE user_id = u.ID AND meta_key = 'mobile_number'
    LIMIT 1
  ) AS owner_phone,
  MAX(pod.dateArrived) AS date_arrived,
  MAX(pod.dateCompleted) AS date_completed,
  op.pickup_ready_at AS pickup_ready_at,
  ip.pickup_date AS pickup_date,
  -- App parity: service name shown to users comes from psa_submissions.ServiceLevel(ME).
  -- psa_ordersDetail.serviceLevel is loaded above but only used to detect reholder/CRC.
  MAX(st.`ServiceLevel(ME)`) AS service_level,
  CASE
    WHEN LOWER(COALESCE(MAX(pod.serviceLevel), '')) LIKE '%reholder%'
      OR LOWER(COALESCE(MAX(pod.serviceLevel), '')) LIKE '%crc%'
      OR LOWER(COALESCE(MAX(st.`ServiceLevel(ME)`), '')) LIKE '%crc%'
    THEN 1 ELSE 0
  END AS is_reholder_or_crc,
  MAX(st.`Shipment(ME)`) AS shipment_raw,
  MAX(pod.serviceTurnaroundDays) AS turnaround_days,
  MAX(pod.serviceTurnaroundDaysUpperRange) AS turnaround_days_high,
  MAX(pod.dateEstCompleted) AS estimated_completion,
  MAX(pod.dateEstCompletedUpperRange) AS estimated_completion_upper
FROM psa_certOwners AS co
LEFT JOIN psa_hobbyx_order_pickup AS op
  ON op.submission_number = CAST(co.SubmissionNumber AS UNSIGNED)
LEFT JOIN psa_hobbyx_invoice_pickup AS ip
  ON ip.invoice_number = co.InvoiceNumber COLLATE utf8mb4_unicode_520_ci
LEFT JOIN psa_submissions AS st
  ON st.SubmissionNumber = co.SubmissionNumber AND st.isActive = 1
LEFT JOIN psa_ordersStatus AS pos
  ON pos.submissionNumber = co.SubmissionNumber
LEFT JOIN psa_orders AS po
  ON po.submissionNumber = co.SubmissionNumber
LEFT JOIN psa_ordersDetail AS pod
  ON pod.submissionNumber = co.SubmissionNumber
LEFT JOIN jih_users AS u
  ON u.user_email = co.`OwnerEmail(ME)`
WHERE co.isActive = 1
  AND (
    UPPER(TRIM(co.InvoiceNumber)) = UPPER(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)
    OR REGEXP_REPLACE(co.InvoiceNumber, '[^0-9]', '') = ?
  )
GROUP BY
  co.InvoiceNumber,
  co.SubmissionNumber,
  co.`OwnerEmail(ME)`,
  u.ID,
  u.user_login,
  u.display_name,
  u.user_registered,
  op.is_pickup_ready,
  op.pickup_ready_at,
  ip.invoice_number,
  ip.pickup_date
ORDER BY
  -- Prefer an exact string hit over a digits-only fallback.
  CASE
    WHEN UPPER(TRIM(co.InvoiceNumber)) = UPPER(CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)
    THEN 0 ELSE 1
  END
LIMIT 1
