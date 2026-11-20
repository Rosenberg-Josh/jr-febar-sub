-- @param venue STRING = ALL
-- @param days INT = 90
SELECT
  TO_DATE(transaction_ts) AS day,
  CAST(SUM(total_amount) AS DOUBLE) AS revenue,
  COUNT(*) AS orders
FROM jr_febar_catalog.sales.fnb_transactions
WHERE transaction_ts >= DATEADD(DAY, -:days, CURRENT_TIMESTAMP())
  AND (:venue = 'ALL' OR venue_id = :venue)
GROUP BY TO_DATE(transaction_ts)
ORDER BY day;
