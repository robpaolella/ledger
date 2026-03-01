/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';

const qaModules = import.meta.glob('../../../../.github/qa/*.json', { eager: true });

interface QAGroup {
  name: string;
  items: string[];
}
interface QASection {
  title: string;
  groups: QAGroup[];
}
interface QAChecklist {
  title: string;
  storageKey: string;
  testingOrder?: string;
  sections: QASection[];
}

type ItemStatus = 'pass' | 'fail' | 'skip';
interface SavedState {
  checks: Record<string, ItemStatus>;
  notes: Record<string, string>;
}

function getChecklist(mod: unknown): QAChecklist | null {
  if (!mod) return null;
  const obj = (mod as Record<string, unknown>).default ?? mod;
  if (obj && typeof obj === 'object' && 'title' in obj && 'storageKey' in obj && 'sections' in obj) {
    return obj as QAChecklist;
  }
  return null;
}

function parseChecklists(): Record<string, QAChecklist> {
  const result: Record<string, QAChecklist> = {};
  for (const [path, mod] of Object.entries(qaModules)) {
    const match = path.match(/\/([^/]+)\.json$/);
    if (!match) continue;
    const cl = getChecklist(mod);
    if (cl) result[match[1]] = cl;
  }
  return result;
}

function loadStateLocal(storageKey: string): SavedState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { checks: parsed.checks || {}, notes: parsed.notes || {} };
    }
  } catch { /* ignore parse errors */ }
  return { checks: {}, notes: {} };
}

function saveStateLocal(storageKey: string, state: SavedState) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

async function loadStateFromServer(storageKey: string): Promise<SavedState | null> {
  try {
    const res = await apiFetch<{ data: { value: string } | null }>(`/dev/storage/${encodeURIComponent(storageKey)}`);
    if (res.data?.value) {
      const parsed = JSON.parse(res.data.value);
      return { checks: parsed.checks || {}, notes: parsed.notes || {} };
    }
  } catch { /* ignore */ }
  return null;
}

async function saveStateToServer(storageKey: string, state: SavedState): Promise<void> {
  try {
    await apiFetch(`/dev/storage/${encodeURIComponent(storageKey)}`, {
      method: 'PUT',
      body: JSON.stringify({ value: JSON.stringify(state) }),
    });
  } catch { /* ignore */ }
}

async function deleteStateFromServer(storageKey: string): Promise<void> {
  try {
    await apiFetch(`/dev/storage/${encodeURIComponent(storageKey)}`, { method: 'DELETE' });
  } catch { /* ignore */ }
}

function countItems(checklist: QAChecklist): number {
  let n = 0;
  for (const s of checklist.sections) for (const g of s.groups) n += g.items.length;
  return n;
}

function countByStatus(state: SavedState) {
  let pass = 0, fail = 0, skip = 0;
  for (const v of Object.values(state.checks)) {
    if (v === 'pass') pass++;
    else if (v === 'fail') fail++;
    else if (v === 'skip') skip++;
  }
  return { pass, fail, skip };
}

// --- Index page ---

function ChecklistIndex({ checklists }: { checklists: Record<string, QAChecklist> }) {
  const entries = Object.entries(checklists);
  const [progressMap, setProgressMap] = useState<Record<string, SavedState>>({});

  useEffect(() => {
    // Load progress from server for all checklists
    entries.forEach(([name, cl]) => {
      loadStateFromServer(cl.storageKey).then(serverState => {
        const state = serverState || loadStateLocal(cl.storageKey);
        setProgressMap(prev => ({ ...prev, [name]: state }));
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-main)' }}>
      <div className="max-w-[820px] mx-auto p-6">
        <h1 style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>
          QA Checklists
        </h1>
        {entries.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>
            No checklists found. Add JSON files to <code>.github/qa/</code>.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.map(([name, cl]) => {
            const total = countItems(cl);
            const state = progressMap[name] || { checks: {}, notes: {} };
            const { pass, fail, skip } = countByStatus(state);
            const tested = pass + fail + skip;
            const pct = total > 0 ? Math.round((tested / total) * 100) : 0;
            const hasProgress = tested > 0;

            return (
              <div
                key={name}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--bg-card-border)',
                  borderRadius: 12,
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 15 }}>
                      {cl.title}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
                      {total} items
                    </div>
                  </div>
                  <a
                    href={`/qa?checklist=${name}`}
                    style={{ color: 'var(--color-accent, #3b82f6)', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}
                  >
                    Start Testing →
                  </a>
                </div>
                {hasProgress && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        <span style={{ color: 'var(--color-positive)' }}>{pass}✓</span>{' '}
                        <span style={{ color: 'var(--color-negative)' }}>{fail}✗</span>{' '}
                        <span style={{ color: 'var(--text-muted)' }}>{skip}⏭</span>
                      </span>
                      <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--progress-track)', overflow: 'hidden', display: 'flex' }}>
                      {pass > 0 && <div style={{ width: `${(pass / total) * 100}%`, background: 'var(--color-positive)' }} />}
                      {fail > 0 && <div style={{ width: `${(fail / total) * 100}%`, background: 'var(--color-negative)' }} />}
                      {skip > 0 && <div style={{ width: `${(skip / total) * 100}%`, background: 'var(--text-muted)' }} />}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Checklist viewer ---

const STATUS_CYCLE: (ItemStatus | null)[] = [null, 'pass', 'fail', 'skip'];

function nextStatus(current: ItemStatus | undefined): ItemStatus | null {
  const idx = STATUS_CYCLE.indexOf(current ?? null);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

function ChecklistViewer({ checklist }: { checklist: QAChecklist }) {
  const [state, setState] = useState<SavedState>(() => loadStateLocal(checklist.storageKey));
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  // Load from server on mount (override localStorage if server has data)
  useEffect(() => {
    loadStateFromServer(checklist.storageKey).then(serverState => {
      if (serverState && (Object.keys(serverState.checks).length > 0 || Object.keys(serverState.notes).length > 0)) {
        setState(serverState);
        saveStateLocal(checklist.storageKey, serverState);
      }
      initialLoadDone.current = true;
    });
  }, [checklist.storageKey]);

  // Save to localStorage immediately + debounce server save
  useEffect(() => {
    saveStateLocal(checklist.storageKey, state);
    if (!initialLoadDone.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveStateToServer(checklist.storageKey, state);
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state, checklist.storageKey]);

  const total = useMemo(() => countItems(checklist), [checklist]);
  const { pass, fail, skip } = useMemo(() => countByStatus(state), [state]);
  const remaining = total - pass - fail - skip;
  const pct = total > 0 ? Math.round(((pass + fail + skip) / total) * 100) : 0;

  const cycleItem = useCallback((key: string) => {
    setState(prev => {
      const next = nextStatus(prev.checks[key]);
      const checks = { ...prev.checks };
      if (next === null) delete checks[key];
      else checks[key] = next;
      return { ...prev, checks };
    });
  }, []);

  const saveNote = useCallback((key: string, text: string) => {
    setState(prev => {
      const notes = { ...prev.notes };
      if (text.trim()) notes[key] = text.trim();
      else delete notes[key];
      return { ...prev, notes };
    });
    setEditingNote(null);
  }, []);

  const clearNote = useCallback((key: string) => {
    setState(prev => {
      const notes = { ...prev.notes };
      delete notes[key];
      return { ...prev, notes };
    });
    setEditingNote(null);
  }, []);

  const resetAll = useCallback(() => {
    if (window.confirm('Reset all checks and notes? This cannot be undone.')) {
      setState({ checks: {}, notes: {} });
      localStorage.removeItem(checklist.storageKey);
      deleteStateFromServer(checklist.storageKey);
    }
  }, [checklist.storageKey]);

  const exportResults = useCallback(() => {
    const lines: string[] = [];
    lines.push(`## QA Results: ${checklist.title}`);
    lines.push(`**Progress:** ${pass} pass, ${fail} fail, ${skip} skip, ${remaining} untested (${pct}%)`);
    lines.push('');

    const collect = (status: ItemStatus, header: string, checkbox: string) => {
      const items: string[] = [];
      checklist.sections.forEach((s, si) => {
        s.groups.forEach((g, gi) => {
          g.items.forEach((item, ii) => {
            const key = `${si}-${gi}-${ii}`;
            if (state.checks[key] === status) {
              items.push(`- ${checkbox} ${s.title} > ${g.name} > ${item}`);
              if (state.notes[key]) items.push(`  - Note: ${state.notes[key]}`);
            }
          });
        });
      });
      if (items.length > 0) {
        lines.push(`### ${header}`);
        lines.push(...items);
        lines.push('');
      }
    };

    collect('fail', 'Failed Items', '[ ]');
    collect('skip', 'Skipped Items', '[ ]');

    const text = lines.join('\n');
    const fallbackCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  }, [checklist, state, pass, fail, skip, remaining, pct]);

  const toggleCollapse = (si: number) => {
    setCollapsed(prev => ({ ...prev, [si]: !prev[si] }));
  };

  // Section stats
  const sectionStats = useMemo(() => {
    return checklist.sections.map((s, si) => {
      let sTotal = 0, sPass = 0, sFail = 0;
      s.groups.forEach((g, gi) => {
        g.items.forEach((_, ii) => {
          sTotal++;
          const st = state.checks[`${si}-${gi}-${ii}`];
          if (st === 'pass') sPass++;
          else if (st === 'fail') sFail++;
        });
      });
      return { total: sTotal, pass: sPass, fail: sFail, done: sPass + sFail };
    });
  }, [checklist, state]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-main)' }}>
      {/* Sticky progress bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--bg-card-border)',
          padding: '12px 24px',
        }}
      >
        <div className="max-w-[820px] mx-auto">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, fontWeight: 500 }}>
              <span style={{ color: 'var(--color-positive)' }}>✓ {pass}</span>
              <span style={{ color: 'var(--color-negative)' }}>✗ {fail}</span>
              <span style={{ color: 'var(--text-muted)' }}>⏭ {skip}</span>
              <span style={{ color: 'var(--text-muted)' }}>○ {remaining}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {pct}%
              </span>
              <button
                onClick={exportResults}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--bg-card-border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-body)',
                  cursor: 'pointer',
                }}
              >
                {copied ? 'Copied!' : 'Export Results'}
              </button>
              <button
                onClick={resetAll}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--bg-card-border)',
                  background: 'var(--bg-card)',
                  color: 'var(--color-negative)',
                  cursor: 'pointer',
                }}
              >
                Reset All
              </button>
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--progress-track)', overflow: 'hidden', display: 'flex' }}>
            {pass > 0 && <div style={{ width: `${(pass / total) * 100}%`, background: 'var(--color-positive)', transition: 'width 150ms' }} />}
            {fail > 0 && <div style={{ width: `${(fail / total) * 100}%`, background: 'var(--color-negative)', transition: 'width 150ms' }} />}
            {skip > 0 && <div style={{ width: `${(skip / total) * 100}%`, background: 'var(--text-muted)', transition: 'width 150ms' }} />}
          </div>
        </div>
      </div>

      <div className="max-w-[820px] mx-auto p-6">
        <a
          href="/qa"
          style={{ color: 'var(--color-accent, #3b82f6)', fontSize: 13, fontWeight: 500, textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}
        >
          ← Back to Checklists
        </a>

        <h1 style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
          {checklist.title}
        </h1>

        {checklist.testingOrder && (
          <div
            style={{
              background: 'var(--bg-inline-info)',
              border: '1px solid var(--bg-inline-info-border)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 20,
              fontSize: 13,
              color: 'var(--text-inline-info)',
            }}
          >
            {checklist.testingOrder}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {checklist.sections.map((section, si) => {
            const stats = sectionStats[si];
            const isCollapsed = !!collapsed[si];
            const allPass = stats.pass === stats.total && stats.total > 0;
            const hasFail = stats.fail > 0;

            let headerBg = 'var(--bg-card)';
            if (hasFail) headerBg = 'var(--bg-inline-error)';
            else if (allPass) headerBg = 'var(--bg-inline-success)';

            return (
              <div
                key={si}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--bg-card-border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {/* Section header */}
                <button
                  onClick={() => toggleCollapse(si)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: headerBg,
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14 }}>
                      {section.title}
                    </span>
                    {stats.fail > 0 && (
                      <span
                        style={{
                          background: 'var(--color-negative)',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '1px 7px',
                          borderRadius: 10,
                        }}
                      >
                        {stats.fail} fail
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {stats.pass}/{stats.total}
                    </span>
                    <span
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        display: 'inline-block',
                        transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                        transition: 'transform 150ms',
                      }}
                    >
                      ▸
                    </span>
                  </div>
                </button>

                {/* Section body */}
                {!isCollapsed && (
                  <div style={{ padding: '8px 0' }}>
                    {section.groups.map((group, gi) => (
                      <div key={gi} style={{ padding: '4px 16px 12px' }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: 'var(--text-muted)',
                            marginBottom: 6,
                            marginTop: 4,
                          }}
                        >
                          {group.name}
                        </div>
                        {group.items.map((item, ii) => {
                          const key = `${si}-${gi}-${ii}`;
                          const status = state.checks[key] as ItemStatus | undefined;
                          const note = state.notes[key];
                          const isEditing = editingNote === key;
                          const isFail = status === 'fail';
                          const isSkip = status === 'skip';

                          let icon = '○';
                          let iconColor = 'var(--text-muted)';
                          if (status === 'pass') { icon = '✓'; iconColor = 'var(--color-positive)'; }
                          else if (status === 'fail') { icon = '✗'; iconColor = 'var(--color-negative)'; }
                          else if (status === 'skip') { icon = '⏭'; iconColor = 'var(--text-muted)'; }

                          return (
                            <div key={ii}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 8,
                                  padding: '6px 8px',
                                  borderRadius: 6,
                                  background: isFail ? 'var(--bg-inline-error)' : 'transparent',
                                }}
                              >
                                <span
                                  style={{
                                    width: 20,
                                    flexShrink: 0,
                                    textAlign: 'center',
                                    fontSize: 14,
                                    color: iconColor,
                                    fontWeight: 600,
                                    lineHeight: '20px',
                                  }}
                                >
                                  {icon}
                                </span>
                                <span
                                  onClick={() => cycleItem(key)}
                                  style={{
                                    flex: 1,
                                    fontSize: 13,
                                    color: 'var(--text-body)',
                                    cursor: 'pointer',
                                    lineHeight: '20px',
                                    textDecoration: isSkip ? 'line-through' : 'none',
                                    opacity: isSkip ? 0.5 : 1,
                                    userSelect: 'none',
                                  }}
                                >
                                  {item}
                                </span>
                                <button
                                  onClick={() => {
                                    if (isEditing) {
                                      setEditingNote(null);
                                    } else {
                                      setEditingNote(key);
                                      setNoteDraft(note || '');
                                    }
                                  }}
                                  style={{
                                    flexShrink: 0,
                                    width: 24,
                                    height: 24,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 12,
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    borderRadius: 4,
                                  }}
                                  title={note ? 'Edit note' : 'Add note'}
                                >
                                  {note ? '📝' : '+'}
                                </button>
                              </div>

                              {/* Note editor */}
                              {isEditing && (
                                <div style={{ marginLeft: 28, marginTop: 4, marginBottom: 4 }}>
                                  <textarea
                                    value={noteDraft}
                                    onChange={e => setNoteDraft(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        saveNote(key, noteDraft);
                                      }
                                    }}
                                    rows={2}
                                    style={{
                                      width: '100%',
                                      fontSize: 12,
                                      padding: '6px 8px',
                                      borderRadius: 6,
                                      border: '1px solid var(--bg-card-border)',
                                      background: 'var(--bg-main)',
                                      color: 'var(--text-body)',
                                      resize: 'vertical',
                                      outline: 'none',
                                      fontFamily: 'inherit',
                                    }}
                                    autoFocus
                                  />
                                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                    <button
                                      onClick={() => saveNote(key, noteDraft)}
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        padding: '3px 10px',
                                        borderRadius: 4,
                                        border: 'none',
                                        background: 'var(--color-accent, #3b82f6)',
                                        color: '#fff',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingNote(null)}
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        padding: '3px 10px',
                                        borderRadius: 4,
                                        border: '1px solid var(--bg-card-border)',
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-body)',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Cancel
                                    </button>
                                    {note && (
                                      <button
                                        onClick={() => clearNote(key)}
                                        style={{
                                          fontSize: 11,
                                          fontWeight: 600,
                                          padding: '3px 10px',
                                          borderRadius: 4,
                                          border: 'none',
                                          background: 'none',
                                          color: 'var(--color-negative)',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        Clear
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Saved note display */}
                              {note && !isEditing && (
                                <div
                                  style={{
                                    marginLeft: 28,
                                    marginTop: 2,
                                    marginBottom: 4,
                                    fontSize: 12,
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    background: 'var(--bg-inline-warning)',
                                    border: '1px solid var(--bg-inline-warning-border)',
                                    color: 'var(--text-inline-warning)',
                                  }}
                                >
                                  {note}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Main page ---

export default function QAPage() {
  const [searchParams] = useSearchParams();
  const checklists = useMemo(() => parseChecklists(), []);
  const name = searchParams.get('checklist');

  if (name) {
    const checklist = checklists[name];
    if (!checklist) {
      return (
        <div className="min-h-screen" style={{ background: 'var(--bg-main)', padding: 48 }}>
          <div className="max-w-[820px] mx-auto">
            <p style={{ color: 'var(--color-negative)', fontWeight: 600 }}>
              Checklist "{name}" not found.
            </p>
            <a
              href="/qa"
              style={{ color: 'var(--color-accent, #3b82f6)', fontSize: 13, marginTop: 8, display: 'inline-block' }}
            >
              ← Back to Checklists
            </a>
          </div>
        </div>
      );
    }
    return <ChecklistViewer checklist={checklist} />;
  }

  return <ChecklistIndex checklists={checklists} />;
}
