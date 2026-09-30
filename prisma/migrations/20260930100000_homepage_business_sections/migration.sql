-- The business banner and the network/setup category split become ordinary homepage sections
-- (previously always rendered after the admin-managed sections).
ALTER TYPE "HomepageSectionType" ADD VALUE 'BUSINESS_BANNER';
ALTER TYPE "HomepageSectionType" ADD VALUE 'CATEGORY_SPLIT';
