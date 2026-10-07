CREATE TABLE "payment_reminder_links" (
  "id" SERIAL NOT NULL,
  "order_id" INTEGER NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_reminder_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_reminder_links_token_hash_key"
  ON "payment_reminder_links"("token_hash");
CREATE INDEX "payment_reminder_links_order_id_created_at_idx"
  ON "payment_reminder_links"("order_id", "created_at");
CREATE INDEX "payment_reminder_links_expires_at_idx"
  ON "payment_reminder_links"("expires_at");

ALTER TABLE "payment_reminder_links"
  ADD CONSTRAINT "payment_reminder_links_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
