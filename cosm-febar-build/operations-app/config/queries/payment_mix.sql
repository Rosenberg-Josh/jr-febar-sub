-- @param venue STRING = ALL
-- @param days INT = 90
SELECT
  payment_method,
  COUNT(*) AS orders,
  CAST(SUM(total_amount) AS DOUBLE) AS revenue
FROM jr_febar_catalog.sales.fnb_transactions
WHERE transaction_ts >= DATEADD(DAY, -:days, CURRENT_TIMESTAMP())
  AND (:venue = 'ALL' OR venue_id = :venue)
GROUP BY payment_method
ORDER BY orders DESC;
