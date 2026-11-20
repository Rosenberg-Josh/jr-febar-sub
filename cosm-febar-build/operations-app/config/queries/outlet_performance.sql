-- @param venue STRING = ALL
-- @param days INT = 90
SELECT
  outlet,
  CAST(SUM(total_amount) AS DOUBLE) AS revenue,
  COUNT(*) AS orders,
  CAST(AVG(total_amount) AS DOUBLE) AS avg_order_value
FROM jr_febar_catalog.sales.fnb_transactions
WHERE transaction_ts >= DATEADD(DAY, -:days, CURRENT_TIMESTAMP())
  AND (:venue = 'ALL' OR venue_id = :venue)
GROUP BY outlet
ORDER BY revenue DESC;
