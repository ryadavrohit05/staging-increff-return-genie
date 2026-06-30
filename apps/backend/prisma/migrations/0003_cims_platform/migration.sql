-- CIMS platform per tenant.
--
-- Determines the authDomainName suffix derived from the client slug:
--   ICC   -> {slug}-omni
--   PROXY -> {slug}-oltp
-- Default PROXY preserves the previous "-oltp" behavior for existing rows.

-- CreateEnum
CREATE TYPE "CimsPlatform" AS ENUM ('ICC', 'PROXY');

-- AlterTable
ALTER TABLE "external_api_configs"
  ADD COLUMN "cims_platform" "CimsPlatform" NOT NULL DEFAULT 'PROXY';
