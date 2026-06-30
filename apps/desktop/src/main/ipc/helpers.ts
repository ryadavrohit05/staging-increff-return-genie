/**
 * IPC handler helpers (ARCHITECTURE.md §4 "IPC validation").
 *
 * Every handler:
 *   - verifies the sender frame is our own renderer (reject foreign frames),
 *   - validates the payload with a zod contract before acting,
 *   - returns a uniform IpcResult<T> envelope so the renderer never sees a raw
 *     throw and always gets a typed { code, message }.
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';
import { AppError, ErrorCode, type IpcResult } from '@rg/shared';
import { createLog } from '../services/logger.js';

const log = createLog('ipc');

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(err: unknown): IpcResult<never> {
  if (err instanceof AppError) {
    return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, error: { code: ErrorCode.INTERNAL, message } };
}

/** Reject events that did not originate from our own renderer frame. */
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  if (!frame) throw new AppError(ErrorCode.AUTH_FORBIDDEN, 'Missing sender frame.');
  const url = frame.url;
  const isDevServer = process.env['ELECTRON_RENDERER_URL']
    ? url.startsWith(process.env['ELECTRON_RENDERER_URL'])
    : false;
  const isLocalFile = url.startsWith('file://');
  if (!isDevServer && !isLocalFile) {
    log.warn('Rejected IPC from untrusted frame', { url });
    throw new AppError(ErrorCode.AUTH_FORBIDDEN, 'Untrusted sender.');
  }
}

/**
 * Register a validated invoke handler. The raw payload is parsed with `schema`
 * (pass `null` for no payload), and the result is wrapped in IpcResult.
 */
export function handle<S extends z.ZodTypeAny | null, T>(
  channel: string,
  schema: S,
  fn: (
    input: S extends z.ZodTypeAny ? z.infer<S> : undefined,
    event: IpcMainInvokeEvent,
  ) => Promise<T>,
): void {
  ipcMain.handle(channel, async (event, raw): Promise<IpcResult<T>> => {
    try {
      assertTrustedSender(event);
      const input = schema ? schema.parse(raw) : undefined;
      const data = await fn(input as never, event);
      return ok(data);
    } catch (err) {
      // Zod errors → VALIDATION_FAILED with the issue list as details.
      if (err && typeof err === 'object' && 'issues' in err) {
        return {
          ok: false,
          error: {
            code: ErrorCode.VALIDATION_FAILED,
            message: 'Invalid request payload.',
            details: (err as { issues: unknown }).issues,
          },
        };
      }
      return fail(err);
    }
  });
}
