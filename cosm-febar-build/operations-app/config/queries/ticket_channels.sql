-- @param venue STRING = ALL
-- @param days INT = 90
SELECT
  channel,
  COUNT(*) AS orders,
  CAST(SUM(total_amount) AS DOUBLE) AS revenue,
  CAST(SUM(quantity) AS DOUBLE) AS tickets
FROM jr_febar_catalog.sales.ticket_orders
WHERE purchase_ts >= DATEADD(DAY, -:days, CURRENT_TIMESTAMP())
  AND (:venue = 'ALL' OR venue_id = :venue)
GROUP BY channel
ORDER BY revenue DESC;
