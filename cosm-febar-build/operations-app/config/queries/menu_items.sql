SELECT
  item_id,
  item_name,
  item_category,
  CAST(price AS DOUBLE) AS price,
  is_alcoholic
FROM jr_febar_catalog.sales.fnb_menu_items
ORDER BY item_category, item_name;
