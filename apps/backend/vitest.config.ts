import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The backend's env.ts validates required env at import and `process.exit(1)`s
    // if anything is missing. Tests import modules that load it (external-api,
    // the Express app), so provide safe DUMMY values here — these are never real
    // secrets and never hit a real service. Set before any test module loads, so
    // CI needs no .env. (dotenv won't override already-set process.env values.)
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
      DIRECT_URL: 'postgresql://user:pass@localhost:5432/test',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      SUPABASE_JWT_SECRET: 'test-jwt-secret-0123456789abcdef',
      EXTERNAL_API_CLIENT: 'testclient',
      EXTERNAL_API_USERNAME: 'test-system.user',
      EXTERNAL_API_PASSWORD: 'test-password',
      EXTERNAL_API_ENC_KEY: 'test-enc-key-0123456789abcdef',
      CIMS_OMS_LOCATION_ID: '1',
      CIMS_FULFILLMENT_LOCATION_CODE: 'TEST-1',
      CIMS_CLIENT_ID: '1',
      WEBGET_DB_ID: '1',
    },
  },
});
