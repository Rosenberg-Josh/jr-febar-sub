-- @param venue STRING = ALL
-- @param days INT = 90
SELECT
  m.item_name,
  m.item_category,
  CAST(SUM(ti.line_total) AS DOUBLE) AS revenue,
  CAST(SUM(ti.quantity) AS DOUBLE) AS units
FROM jr_febar_catalog.sales.fnb_transaction_items ti
JOIN jr_febar_catalog.sales.fnb_transactions t ON ti.transaction_id = t.transaction_id
JOIN jr_febar_catalog.sales.fnb_menu_items m ON ti.item_id = m.item_id
WHERE t.transaction_ts >= DATEADD(DAY, -:days, CURRENT_TIMESTAMP())
  AND (:venue = 'ALL' OR t.venue_id = :venue)
GROUP BY m.item_name, m.item_category
ORDER BY revenue DESC
LIMIT 12;
