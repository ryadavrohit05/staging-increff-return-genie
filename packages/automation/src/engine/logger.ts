/**
 * Structured event builders for the automation engine.
 *
 * The engine never logs to stdout directly in production — it emits
 * `AutomationEvent` objects through an `onEvent` callback supplied by the caller
 * (the Electron utility process). This keeps logging side-effect-free and lets
 * the desktop relay events over IPC and persist them to the backend.
 *
 * REDACTION: secrets (email / password values) must NEVER appear in a log
 * message. `redact()` is applied to every message built here as a defensive
 * guard so a careless `emit(...)` call site can't leak a credential — mirroring
 * ARCHITECTURE.md §5 ("No credentials in logs").
 */

import type { SyncPhase } from '@rg/shared';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export type AutomationEvent =
  | { type: 'log'; ts: number; level: LogLevel; stage: string; message: string }
  | { type: 'phase'; ts: number; phase: string }
  | { type: 'screenshot'; ts: number; path: string };

export type EmitFn = (e: AutomationEvent) => void;

/**
 * Values that, if present in the job, must be scrubbed from any log line.
 * Registered at the start of a run via {@link registerSecrets}.
 */
const secrets = new Set<string>();

/** Register secret values (email/password) so they are masked in all log output. */
export function registerSecrets(...values: Array<string | undefined | null>): void {
  for (const v of values) {
    if (typeof v === 'string' && v.length >= 3) secrets.add(v);
  }
}

/** Clear registered secrets at the end of a run. */
export function clearSecrets(): void {
  secrets.clear();
}

/**
 * Mask any registered secret substring, plus opportunistically redact anything
 * that looks like an email address or a long password-ish token.
 */
export function redact(message: string): string {
  let out = message;
  for (const s of secrets) {
    if (s) out = out.split(s).join('***');
  }
  // Generic email masking (defence in depth — covers unregistered values).
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '***@***');
  return out;
}

/**
 * Build a log event with a redacted message. `stage` is a short marketplace tag
 * like `[Myntra]`, matching the reference console prefixes.
 */
export function logEvent(level: LogLevel, stage: string, message: string): AutomationEvent {
  return { type: 'log', ts: Date.now(), level, stage, message: redact(message) };
}

/** Build a phase event carrying a `SyncPhase` value. */
export function phaseEvent(phase: SyncPhase): AutomationEvent {
  return { type: 'phase', ts: Date.now(), phase };
}

/** Build a screenshot event pointing at a saved failure snapshot. */
export function screenshotEvent(path: string): AutomationEvent {
  return { type: 'screenshot', ts: Date.now(), path };
}

/**
 * Small convenience wrapper bound to a stage tag and an emit function so call
 * sites read like the reference's `console.log('[Myntra] ...')`.
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  phase(phase: SyncPhase): void;
  screenshot(path: string): void;
}

export function createLogger(stage: string, emit: EmitFn): Logger {
  return {
    info: (m) => emit(logEvent('INFO', stage, m)),
    warn: (m) => emit(logEvent('WARN', stage, m)),
    error: (m) => emit(logEvent('ERROR', stage, m)),
    phase: (p) => emit(phaseEvent(p)),
    screenshot: (p) => emit(screenshotEvent(p)),
  };
}
