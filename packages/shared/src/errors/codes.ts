/**
 * Canonical error codes for the whole platform.
 *
 * Every thrown/returned error in Return Genie carries one of these codes so that
 * logs, the desktop UI, and the admin portal can map a failure to a stable,
 * user-readable explanation without parsing free-text messages.
 *
 * Format: RG-<DOMAIN>-<NNN>
 */
export const ErrorCode = {
  // --- Auth ---------------------------------------------------------------
  AUTH_INVALID_CREDENTIALS: 'RG-AUTH-001',
  AUTH_TOKEN_EXPIRED: 'RG-AUTH-002',
  AUTH_TOKEN_INVALID: 'RG-AUTH-003',
  AUTH_REFRESH_FAILED: 'RG-AUTH-004',
  AUTH_FORBIDDEN: 'RG-AUTH-005',

  // --- License / device ---------------------------------------------------
  LIC_ORG_SUSPENDED: 'RG-LIC-001',
  LIC_EXPIRED: 'RG-LIC-002',
  LIC_DEVICE_LIMIT: 'RG-LIC-003',
  LIC_DEVICE_REVOKED: 'RG-LIC-004',
  LIC_NOT_FOUND: 'RG-LIC-005',

  // --- App / version ------------------------------------------------------
  APP_UPDATE_REQUIRED: 'RG-APP-001',

  // --- Marketplace credentials (local) ------------------------------------
  CRED_NOT_CONFIGURED: 'RG-CRED-001',
  CRED_ENCRYPTION_UNAVAILABLE: 'RG-CRED-002',
  CRED_VALIDATION_FAILED: 'RG-CRED-003',

  // --- Automation (Playwright) --------------------------------------------
  AUTO_LOGIN_FAILED: 'RG-AUTO-001',
  AUTO_LOGIN_TIMEOUT: 'RG-AUTO-002',
  AUTO_NAV_FAILED: 'RG-AUTO-003',
  AUTO_FILTER_FAILED: 'RG-AUTO-004',
  AUTO_REPORT_TIMEOUT: 'RG-AUTO-005',
  AUTO_DOWNLOAD_FAILED: 'RG-AUTO-006',
  AUTO_CANCELLED: 'RG-AUTO-007',
  AUTO_BROWSER_CRASH: 'RG-AUTO-008',
  AUTO_UNKNOWN: 'RG-AUTO-999',

  // --- Processing (backend) -----------------------------------------------
  PROC_PARSE_FAILED: 'RG-PROC-001',
  PROC_VALIDATION_FAILED: 'RG-PROC-002',
  PROC_UPLOAD_FAILED: 'RG-PROC-003',
  PROC_EXTERNAL_API_DOWN: 'RG-PROC-004',
  PROC_PARTIAL_FAILURE: 'RG-PROC-005',

  // --- Generic ------------------------------------------------------------
  VALIDATION_FAILED: 'RG-VAL-001',
  RATE_LIMITED: 'RG-RATE-001',
  NETWORK_ERROR: 'RG-NET-001',
  INTERNAL: 'RG-INT-001',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Human-readable, end-user-safe messages keyed by code. */
export const ErrorMessage: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 'Incorrect email or password.',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Your session expired. Please sign in again.',
  [ErrorCode.AUTH_TOKEN_INVALID]: 'Invalid session. Please sign in again.',
  [ErrorCode.AUTH_REFRESH_FAILED]: 'Could not refresh your session.',
  [ErrorCode.AUTH_FORBIDDEN]: 'You do not have permission to do that.',
  [ErrorCode.LIC_ORG_SUSPENDED]: 'Your organization is suspended. Contact support.',
  [ErrorCode.LIC_EXPIRED]: 'Your subscription has expired.',
  [ErrorCode.LIC_DEVICE_LIMIT]: 'Device limit reached for your license.',
  [ErrorCode.LIC_DEVICE_REVOKED]: 'This device has been deactivated.',
  [ErrorCode.LIC_NOT_FOUND]: 'No active license found for your organization.',
  [ErrorCode.APP_UPDATE_REQUIRED]: 'A required update is available. Please update to continue.',
  [ErrorCode.CRED_NOT_CONFIGURED]: 'Marketplace credentials are not configured.',
  [ErrorCode.CRED_ENCRYPTION_UNAVAILABLE]: 'Secure storage is unavailable on this machine.',
  [ErrorCode.CRED_VALIDATION_FAILED]: 'Marketplace credentials appear to be invalid.',
  [ErrorCode.AUTO_LOGIN_FAILED]: 'Could not sign in to the marketplace portal.',
  [ErrorCode.AUTO_LOGIN_TIMEOUT]: 'Timed out signing in to the marketplace portal.',
  [ErrorCode.AUTO_NAV_FAILED]: 'Could not navigate the marketplace portal.',
  [ErrorCode.AUTO_FILTER_FAILED]: 'Could not apply report filters.',
  [ErrorCode.AUTO_REPORT_TIMEOUT]: 'The report did not finish generating in time.',
  [ErrorCode.AUTO_DOWNLOAD_FAILED]: 'Could not download the report.',
  [ErrorCode.AUTO_CANCELLED]: 'Sync was cancelled.',
  [ErrorCode.AUTO_BROWSER_CRASH]: 'The automation browser crashed.',
  [ErrorCode.AUTO_UNKNOWN]: 'An unexpected automation error occurred.',
  [ErrorCode.PROC_PARSE_FAILED]: 'Could not parse the downloaded report.',
  [ErrorCode.PROC_VALIDATION_FAILED]: 'The report failed validation.',
  [ErrorCode.PROC_UPLOAD_FAILED]: 'Could not upload return orders.',
  [ErrorCode.PROC_EXTERNAL_API_DOWN]: 'The upload service is currently unavailable.',
  [ErrorCode.PROC_PARTIAL_FAILURE]: 'Some rows failed to upload.',
  [ErrorCode.VALIDATION_FAILED]: 'The request was invalid.',
  [ErrorCode.RATE_LIMITED]: 'Too many requests. Please slow down.',
  [ErrorCode.NETWORK_ERROR]: 'A network error occurred.',
  [ErrorCode.INTERNAL]: 'Something went wrong on our end.',
};

/** Structured application error carried across IPC and HTTP boundaries. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? ErrorMessage[code] ?? code);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}
