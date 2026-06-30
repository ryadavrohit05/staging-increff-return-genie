import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { fadeInUp, staggerContainer, staggerItem } from '../motion';
import logoUrl from '../assets/logo.png';

const FEATURES: { title: string; body: string }[] = [
  {
    title: 'Runs on your own IP',
    body: 'Local browser automation executes from your machine, so marketplaces never see datacenter traffic — no IP blocks or CAPTCHAs from shared infrastructure.',
  },
  {
    title: 'Credentials stay local',
    body: 'Your marketplace logins are stored encrypted on your own machine and never leave it. The portal only ever sees reconciliation results.',
  },
  {
    title: 'Automatic dedup against CIMS',
    body: 'Every return is checked against Increff CIMS before import, so already-recorded returns are skipped and nothing is double-counted.',
  },
  {
    title: 'Per-row results & audit CSV',
    body: 'See the exact status of every order — success, failed, or skipped — and download a full audit CSV for each sync run.',
  },
  {
    title: 'Multi-marketplace',
    body: 'Myntra is supported today, with more marketplaces on the way — all behind one consistent reconciliation flow.',
  },
  {
    title: 'Auto-updating signed app',
    body: 'A code-signed Windows desktop app that keeps itself up to date, so your team always runs the latest, secure build.',
  },
];

const STEPS: { title: string; body: string }[] = [
  { title: 'Sign in', body: 'Use your Return Genie credentials to access the portal and download the desktop app.' },
  { title: 'Save marketplace credentials', body: 'Enter your marketplace logins once — stored locally and encrypted on your machine.' },
  { title: 'Click Sync', body: 'Return Genie downloads your return reports locally and reconciles them against CIMS.' },
  { title: 'Get a report', body: 'Missing returns are synced into CIMS and you get a downloadable, per-order report.' },
];

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <motion.div
      className="mx-auto max-w-2xl text-center"
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-brand-600">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-3 text-base text-slate-500">{subtitle}</p>}
    </motion.div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={staggerItem} className="card h-full p-6">
      {children}
    </motion.div>
  );
}

export function Landing() {
  return (
    <div className="min-h-full bg-white">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Increff" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-slate-900">Return Genie</span>
          </div>
          <Link to="/login" className="btn-primary">
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50 to-white" aria-hidden />
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <motion.div variants={fadeInUp} initial="hidden" animate="visible">
            <span className="inline-flex rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
              Marketplace return reconciliation
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Automated marketplace return reconciliation for CIMS
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
              Return Genie is a secure desktop app that downloads your marketplace return reports
              locally and syncs the missing returns straight into Increff CIMS — accurately, on your
              own machine, with a full audit trail.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/login" className="btn-primary px-6 py-3 text-base">
                Sign in to download
              </Link>
              <a href="#how-it-works" className="btn-secondary px-6 py-3 text-base">
                How it works
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Why Return Genie"
          title="Reconciliation that's secure by design"
          subtitle="Built for operations teams who need accurate returns in CIMS without exposing credentials or fighting marketplace bot defenses."
        />
        <motion.div
          className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <h3 className="text-base font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </Card>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading eyebrow="How it works" title="From sign-in to reconciled in four steps" />
          <motion.ol
            className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
          >
            {STEPS.map((s, i) => (
              <motion.li key={s.title} variants={staggerItem} className="card h-full p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {i + 1}
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
            Ready to reconcile your returns?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-slate-500">
            Sign in to download the desktop app and start syncing returns into CIMS.
          </p>
          <Link to="/login" className="btn-primary mt-6 inline-flex px-6 py-3 text-base">
            Sign in to download
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Increff" className="h-6 w-auto" />
            <span className="text-sm text-slate-500">Return Genie</span>
          </div>
          <div className="flex items-center gap-5 text-sm text-slate-500">
            <Link to="/login" className="hover:text-slate-900">
              Sign in
            </Link>
            <a href="#how-it-works" className="hover:text-slate-900">
              How it works
            </a>
          </div>
          <div className="text-xs text-slate-400">
            © {new Date().getFullYear()} Increff. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
