/**
 * Dark terminal log view, ported from the reference. Color-codes lines by stage
 * (myntra / processing / system) and log level, auto-scrolls to the latest line.
 */
import { useEffect, useRef } from 'react';
import type { LogLine } from '../store/sync';
import { Terminal } from './icons';

function lineColor(log: LogLine): string {
  if (log.level === 'ERROR') return 'text-terminal-err';
  if (log.level === 'WARN') return 'text-terminal-n8n';
  const s = log.stage.toLowerCase();
  if (s.includes('myntra') || s.includes('flipkart')) return 'text-terminal-myntra';
  if (s.includes('process') || s.includes('upload')) return 'text-terminal-n8n';
  if (s.includes('system')) return 'text-terminal-sys';
  return 'text-terminal-info';
}

function prefix(level: string): string {
  if (level === 'ERROR') return '!';
  if (level === 'WARN') return '›';
  return '·';
}

interface Props {
  logs: LogLine[];
  visible: boolean;
  onToggle: () => void;
}

export function LogTerminal({ logs, visible, onToggle }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [logs]);

  return (
    <div className="rg-terminal">
      <div className="rg-terminal-bar">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28ca41]" />
        </div>
        <span className="font-mono text-[0.7rem] font-medium text-[#484f58]">pipeline.stdout</span>
        <button
          onClick={onToggle}
          className="inline-flex items-center gap-1 font-mono text-[0.68rem] text-[#484f58] hover:text-[#8b949e]"
        >
          <Terminal /> {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {visible && (
        <div ref={bodyRef} className="rg-terminal-body">
          {logs.length === 0 ? (
            <p className="rg-log text-terminal-info">{'›'} Booting reconciliation engine…</p>
          ) : (
            logs.map((log, i) => (
              <p key={i} className={`rg-log ${lineColor(log)}`}>
                {prefix(log.level)} <span className="text-[#484f58]">[{log.stage}]</span> {log.message}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}
