-- CreateEnum
CREATE TYPE "MegaMenuMode" AS ENUM ('AUTO', 'CUSTOM');

-- AlterTable
ALTER TABLE "mega_menu_panels" ADD COLUMN     "eyebrow" TEXT,
ADD COLUMN     "mode" "MegaMenuMode" NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN     "promo_category_id" INTEGER,
ADD COLUMN     "promo_cta" TEXT,
ADD COLUMN     "promo_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promo_href" TEXT,
ADD COLUMN     "promo_text" TEXT,
ADD COLUMN     "promo_title" TEXT;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "highlight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "icon" TEXT;

-- AddForeignKey
ALTER TABLE "mega_menu_panels" ADD CONSTRAINT "mega_menu_panels_promo_category_id_fkey" FOREIGN KEY ("promo_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

