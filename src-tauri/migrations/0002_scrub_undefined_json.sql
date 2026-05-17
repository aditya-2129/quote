-- Repair JSON-mode text columns that were written as the literal string "undefined"
-- before the client-side cleanParam guard landed (see src/db/client.ts).
UPDATE quotes        SET cost_snapshot   = NULL                 WHERE cost_snapshot   = 'undefined';
UPDATE quotes        SET quantity_breaks = '[1,10,25,100,250]'  WHERE quantity_breaks = 'undefined' OR quantity_breaks IS NULL;
UPDATE quote_events  SET payload         = NULL                 WHERE payload         = 'undefined';
UPDATE part_stock    SET dims            = '{}'                 WHERE dims            = 'undefined' OR dims IS NULL;
UPDATE materials     SET available_forms = '[]'                 WHERE available_forms = 'undefined' OR available_forms IS NULL;
UPDATE materials     SET form_rates      = '{}'                 WHERE form_rates      = 'undefined' OR form_rates      IS NULL;
