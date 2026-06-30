-- Multi-tenant configuration.
--
-- Additive + backward-compatible:
--  * organizations.automation_mode defaults to AUTO_LOGIN so existing orgs
--    (Adidas) keep their current behavior; onboarding sets it explicitly.
--  * external_api_configs gains per-org cims_client_id / webget_db_id (nullable,
--    so the env-default tenant falls back to CIMS_CLIENT_ID / WEBGET_DB_ID).
--  * auth_password_enc becomes nullable so onboarding may rely on the shared
--    backend CIMS password instead of a per-org secret.

-- CreateEnum
CREATE TYPE "AutomationMode" AS ENUM ('AUTO_LOGIN', 'MANUAL_LOGIN');

-- AlterTable
ALTER TABLE "organizations"
  ADD COLUMN "automation_mode" "AutomationMode" NOT NULL DEFAULT 'AUTO_LOGIN';

-- AlterTable
ALTER TABLE "external_api_configs"
  ADD COLUMN "cims_client_id" INTEGER,
  ADD COLUMN "webget_db_id" INTEGER,
  ALTER COLUMN "auth_password_enc" DROP NOT NULL;
