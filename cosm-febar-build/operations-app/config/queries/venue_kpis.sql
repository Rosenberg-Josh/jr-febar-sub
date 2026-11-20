-- @param venue STRING = ALL
-- @param days INT = 90
WITH fnb AS (
  SELECT
    COUNT(*) AS fnb_orders,
    CAST(COALESCE(SUM(total_amount), 0) AS DOUBLE) AS fnb_revenue,
    CAST(COALESCE(AVG(total_amount), 0) AS DOUBLE) AS avg_order_value,
    CAST(COALESCE(SUM(tip), 0) AS DOUBLE) AS total_tips
  FROM jr_febar_catalog.sales.fnb_transactions
  WHERE transaction_ts >= DATEADD(DAY, -:days, CURRENT_TIMESTAMP())
    AND (:venue = 'ALL' OR venue_id = :venue)
),
tix AS (
  SELECT
    CAST(COALESCE(SUM(total_amount), 0) AS DOUBLE) AS ticket_revenue,
    CAST(COALESCE(SUM(quantity), 0) AS DOUBLE) AS tickets_sold
  FROM jr_febar_catalog.sales.ticket_orders
  WHERE purchase_ts >= DATEADD(DAY, -:days, CURRENT_TIMESTAMP())
    AND (:venue = 'ALL' OR venue_id = :venue)
)
SELECT fnb.fnb_orders, fnb.fnb_revenue, fnb.avg_order_value, fnb.total_tips,
       tix.ticket_revenue, tix.tickets_sold
FROM fnb CROSS JOIN tix;
