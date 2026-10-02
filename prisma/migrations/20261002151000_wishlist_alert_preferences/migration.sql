ALTER TABLE "wishlist_items"
  ADD COLUMN "notify_back_in_stock" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "back_in_stock_alert_sent_at" TIMESTAMP(3),
  ADD COLUMN "notify_price_drop" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "price_drop_baseline" DECIMAL(10,2);