import { useState } from 'react';
import { motion } from 'framer-motion';
import { PageHeader } from '../../components/Layout';
import { FadeInUp } from '../../components/motion';
import { springs } from '../../motion';
import { ApiError } from '../../lib/api';
import { humanizeBytes, formatDateTime } from '../../lib/format';
import { useLatestRelease, useRequestDownload } from '../../lib/clientQueries';

export function Download() {
  const release = useLatestRelease();
  const requestDownload = useRequestDownload();
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const onDownload = async () => {
    setDownloadError(null);
    try {
      const ticket = await requestDownload.mutateAsync();
      // Trigger the browser download from the short-lived signed URL. Using an
      // anchor with `download` keeps the suggested filename; the signed URL is
      // single-use/short-lived so we navigate to it immediately.
      const a = document.createElement('a');
      a.href = ticket.url;
      a.download = ticket.fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      // Surface the backend's error code/message (e.g. inactive license).
      if (err instanceof ApiError) setDownloadError(err.message);
      else setDownloadError(err instanceof Error ? err.message : 'Download failed.');
    }
  };

  const info = release.data;

  return (
    <>
      <PageHeader
        title="Download Return Genie"
        description="The secure desktop app that reconciles your marketplace returns into CIMS."
      />

      {release.isLoading && (
        <div className="card p-8 text-sm text-slate-500">Checking for the latest version…</div>
      )}

      {release.error && (
        <div className="card border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {release.error instanceof Error ? release.error.message : 'Could not load release info.'}
        </div>
      )}

      {info && !info.available && (
        <FadeInUp className="card p-8 text-center">
          <p className="text-base font-medium text-slate-800">No installer published yet</p>
          <p className="mt-1 text-sm text-slate-500">
            An administrator hasn&rsquo;t published a desktop installer yet. Please check back soon
            or contact your administrator.
          </p>
        </FadeInUp>
      )}

      {info && info.available && (
        <FadeInUp className="card overflow-hidden">
          <div className="border-b border-slate-200 bg-gradient-to-br from-brand-50 to-white px-8 py-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  Latest release
                </div>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  Return Genie v{info.version}
                </h2>
                <div className="mt-1 text-sm text-slate-500">
                  {info.fileName ?? 'Windows installer'} · {humanizeBytes(info.sizeBytes)}
                  {info.releasedAt && <> · released {formatDateTime(info.releasedAt)}</>}
                </div>
              </div>
              <motion.button
                type="button"
                className="btn-primary px-6 py-3 text-base"
                onClick={onDownload}
                disabled={requestDownload.isPending}
                whileTap={{ scale: 0.98 }}
                transition={springs.snappy}
              >
                {requestDownload.isPending ? 'Preparing download…' : 'Download Return Genie'}
              </motion.button>
            </div>

            {downloadError && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
                {downloadError}
              </div>
            )}
          </div>

          <div className="grid gap-8 px-8 py-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Release notes</h3>
              {info.releaseNotes ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                  {info.releaseNotes}
                </p>
              ) : (
                <p className="mt-2 text-sm text-slate-400">No release notes provided.</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Install instructions</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
                <li>Download the Windows installer (.exe) above.</li>
                <li>Run the installer and follow the prompts.</li>
                <li>Launch Return Genie and sign in with these same credentials.</li>
                <li>Save your marketplace credentials (stored locally, encrypted), then sync.</li>
              </ol>
              <p className="mt-3 text-xs text-slate-400">
                The app auto-updates, so you only need to do this once.
              </p>
            </div>
          </div>
        </FadeInUp>
      )}
    </>
  );
}
