-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('MYNTRA', 'FLIPKART');

-- CreateEnum
CREATE TYPE "SyncState" AS ENUM ('QUEUED', 'RUNNING', 'DOWNLOADING', 'PROCESSING', 'UPLOADING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "RowStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "max_devices" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_api_configs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "client_slug" TEXT NOT NULL,
    "auth_username" TEXT,
    "auth_password_enc" TEXT NOT NULL,
    "return_orders_path" TEXT NOT NULL DEFAULT '/cims/import/returnOrders',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_api_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "app_version" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_heartbeat" TIMESTAMP(3),
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "max_devices" INTEGER NOT NULL DEFAULT 2,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_accounts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "label" TEXT NOT NULL,
    "cred_ref" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "marketplace_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "state" "SyncState" NOT NULL DEFAULT 'QUEUED',
    "phase" TEXT,
    "report_path" TEXT,
    "result_path" TEXT,
    "total_rows" INTEGER,
    "success_rows" INTEGER,
    "failed_rows" INTEGER,
    "skipped_rows" INTEGER,
    "error_code" TEXT,
    "error_message" TEXT,
    "screenshot_key" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "sync_run_id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" "LogLevel" NOT NULL,
    "stage" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_results" (
    "id" TEXT NOT NULL,
    "sync_run_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "RowStatus" NOT NULL,
    "error" TEXT,

    CONSTRAINT "sync_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'stable',
    "min_supported" BOOLEAN NOT NULL DEFAULT false,
    "release_notes" TEXT,
    "released_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "meta" JSONB,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "external_api_configs_org_id_key" ON "external_api_configs"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_org_id_idx" ON "users"("org_id");

-- CreateIndex
CREATE INDEX "devices_org_id_idx" ON "devices"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_org_id_fingerprint_key" ON "devices"("org_id", "fingerprint");

-- CreateIndex
CREATE INDEX "licenses_org_id_idx" ON "licenses"("org_id");

-- CreateIndex
CREATE INDEX "marketplace_accounts_org_id_idx" ON "marketplace_accounts"("org_id");

-- CreateIndex
CREATE INDEX "sync_runs_org_id_started_at_idx" ON "sync_runs"("org_id", "started_at");

-- CreateIndex
CREATE INDEX "sync_logs_sync_run_id_ts_idx" ON "sync_logs"("sync_run_id", "ts");

-- CreateIndex
CREATE INDEX "sync_results_sync_run_id_idx" ON "sync_results"("sync_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_versions_version_key" ON "app_versions"("version");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_ts_idx" ON "audit_logs"("org_id", "ts");

-- AddForeignKey
ALTER TABLE "external_api_configs" ADD CONSTRAINT "external_api_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_accounts" ADD CONSTRAINT "marketplace_accounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_results" ADD CONSTRAINT "sync_results_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

