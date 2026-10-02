ALTER TABLE "newsletter_subscribers"
  ADD COLUMN "unsubscribe_token" TEXT,
  ADD COLUMN "unsubscribed_at" TIMESTAMP(3);

UPDATE "newsletter_subscribers"
SET "unsubscribe_token" = gen_random_uuid()::text
WHERE "unsubscribe_token" IS NULL;

ALTER TABLE "newsletter_subscribers"
  ALTER COLUMN "unsubscribe_token" SET NOT NULL;

CREATE UNIQUE INDEX "newsletter_subscribers_unsubscribe_token_key"
  ON "newsletter_subscribers"("unsubscribe_token");
CREATE INDEX "newsletter_subscribers_unsubscribed_at_idx"
  ON "newsletter_subscribers"("unsubscribed_at");