import { useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PublishVersionInput } from '@rg/shared';
import { PageHeader, ErrorNotice } from '../components/Layout';
import { useToast } from '../components/motion';
import { fadeInUp } from '../motion';
import { humanizeBytes } from '../lib/format';
import { usePublishVersion, useUploadRelease } from '../lib/queries';

/**
 * Versions control plane for the desktop auto-update flow.
 *
 * Two operations:
 *  1. PUBLISH (POST /admin/versions) — sets release POLICY only. `minSupported`
 *     gates clients below it from syncing until they update.
 *  2. UPLOAD INSTALLER (POST /admin/releases, multipart) — uploads the actual
 *     signed .exe build into the private bucket so licensed users can download it
 *     from the client portal.
 *
 * NOTE: the backend has no list endpoint for versions/releases, so this page is
 * publish/upload-only. Add GET /admin/versions to surface release history here.
 */
export function Versions() {
  return (
    <>
      <PageHeader
        title="Versions"
        description="Publish desktop app versions, control the forced-update gate, and upload installer builds."
      />
      <UploadInstaller />
      <div className="mt-8">
        <PublishPolicy />
      </div>
    </>
  );
}

function UploadInstaller() {
  const upload = useUploadRelease();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [channel, setChannel] = useState<'stable' | 'beta'>('stable');
  const [minSupported, setMinSupported] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [uploaded, setUploaded] = useState<{ version: string; sizeBytes: number } | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploaded(null);
    const res = await upload.mutateAsync({ file, version, channel, minSupported, releaseNotes });
    setUploaded({ version: res.version, sizeBytes: res.sizeBytes });
    toast.success('Installer uploaded', `v${res.version} · ${humanizeBytes(res.sizeBytes)}`);
    // Reset the form so the same build isn't accidentally re-uploaded.
    setFile(null);
    setVersion('');
    setMinSupported(false);
    setReleaseNotes('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <section className="card max-w-xl p-6">
      <h2 className="text-base font-semibold text-slate-900">Upload installer</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        Upload a signed Windows installer (.exe). Licensed users can then download it from the
        portal.
      </p>

      <ErrorNotice error={upload.error} />

      <AnimatePresence initial={false}>
        {uploaded && (
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mb-4 mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700"
          >
            Uploaded installer <strong>v{uploaded.version}</strong> ({humanizeBytes(uploaded.sizeBytes)}).
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div>
          <label className="label">Installer file (.exe)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".exe,application/x-msdownload,application/octet-stream"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
          {file && (
            <p className="mt-1 text-xs text-slate-400">
              {file.name} · {humanizeBytes(file.size)}
            </p>
          )}
        </div>
        <div>
          <label className="label">Version (semver)</label>
          <input
            className="input"
            placeholder="1.2.0"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Channel</label>
          <select
            className="input"
            value={channel}
            onChange={(e) => setChannel(e.target.value as 'stable' | 'beta')}
          >
            <option value="stable">stable</option>
            <option value="beta">beta</option>
          </select>
        </div>
        <div>
          <label className="label">Release notes</label>
          <textarea
            className="input"
            rows={4}
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
          />
        </div>
        <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={minSupported}
            onChange={(e) => setMinSupported(e.target.checked)}
          />
          <span className="text-sm text-amber-800">
            <strong>Forced update</strong> — set this as the minimum supported version. Clients on an
            older version will be blocked from syncing until they update.
          </span>
        </label>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={upload.isPending || !file}>
            {upload.isPending ? 'Uploading…' : 'Upload installer'}
          </button>
        </div>
      </form>
    </section>
  );
}

function PublishPolicy() {
  const publish = usePublishVersion();
  const toast = useToast();
  const [form, setForm] = useState<PublishVersionInput>({
    version: '',
    channel: 'stable',
    minSupported: false,
    releaseNotes: '',
  });
  const [published, setPublished] = useState<{ version: string } | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPublished(null);
    const res = await publish.mutateAsync({
      ...form,
      releaseNotes: form.releaseNotes?.trim() ? form.releaseNotes : undefined,
    });
    setPublished({ version: res.version });
    toast.success('Version published', `v${res.version} is now live.`);
  };

  return (
    <section className="card max-w-xl p-6">
      <h2 className="text-base font-semibold text-slate-900">Publish version policy</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        Set release metadata and the forced-update gate without uploading a binary.
      </p>

      <ErrorNotice error={publish.error} />

      <AnimatePresence initial={false}>
        {published && (
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mb-4 mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700"
          >
            Published version <strong>{published.version}</strong>.
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div>
          <label className="label">Version (semver)</label>
          <input
            className="input"
            placeholder="1.2.0"
            value={form.version}
            onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="label">Channel</label>
          <select
            className="input"
            value={form.channel}
            onChange={(e) =>
              setForm((f) => ({ ...f, channel: e.target.value as PublishVersionInput['channel'] }))
            }
          >
            <option value="stable">stable</option>
            <option value="beta">beta</option>
          </select>
        </div>
        <div>
          <label className="label">Release notes</label>
          <textarea
            className="input"
            rows={4}
            value={form.releaseNotes}
            onChange={(e) => setForm((f) => ({ ...f, releaseNotes: e.target.value }))}
          />
        </div>
        <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.minSupported}
            onChange={(e) => setForm((f) => ({ ...f, minSupported: e.target.checked }))}
          />
          <span className="text-sm text-amber-800">
            <strong>Forced update</strong> — set this as the minimum supported version. Clients on an
            older version will be blocked from syncing until they update.
          </span>
        </label>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={publish.isPending}>
            {publish.isPending ? 'Publishing…' : 'Publish version'}
          </button>
        </div>
      </form>
    </section>
  );
}
