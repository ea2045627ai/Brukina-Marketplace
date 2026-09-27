import React, { useEffect, useMemo, useState } from 'react';

const TEAM = [
  ['developer', 'Developer'],
  ['qa', 'QA Tester'],
  ['manager', 'Manager'],
  ['accountant', 'Accountant'],
  ['assistant', 'Assistant'],
  ['deployer', 'Deployment Team']
];

const CHECKS = [
  'Pages and interfaces',
  'Navigation and routes',
  'Buttons and clickable controls',
  'Tabs and forms',
  'Product descriptions/details',
  'Product images and image views',
  'Buy Now and quantity controls',
  'Orders, wallet and profile',
  'Admin, vendor, rider and driver workspaces',
  'Login and signup',
  'Browser console errors',
  'Vite production build',
  'Supabase connectivity',
  'Deployment verification'
];

const STORAGE = 'brukina_developer_control_center';

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE)) || {};
  } catch {
    return {};
  }
}

export default function DeveloperControlCenter() {
  const saved = useMemo(loadState, []);
  const [instruction, setInstruction] = useState('');
  const [messages, setMessages] = useState(saved.messages || []);
  const [status, setStatus] = useState(saved.status || 'ready');
  const [activeTeam, setActiveTeam] = useState(saved.activeTeam || 'developer');
  const [checks, setChecks] = useState(saved.checks || {});
  const [open, setOpen] = useState(saved.open ?? true);

  useEffect(() => {
    localStorage.setItem(
      STORAGE,
      JSON.stringify({
        messages,
        status,
        activeTeam,
        checks,
        open
      })
    );
  }, [messages, status, activeTeam, checks, open]);

  async function sendInstruction(event) {
    event.preventDefault();

    const text = instruction.trim();
    if (!text) return;

    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();
    const teamName = TEAM.find(([id]) => id === activeTeam)?.[1] || 'Developer';

    setMessages((current) => [
      ...current,
      {
        id: taskId,
        sender: 'You',
        team: activeTeam,
        text,
        status: 'instruction',
        created_at: now
      },
      {
        id: crypto.randomUUID(),
        sender: 'Master Developer',
        team: activeTeam,
        text: 'Inspection request sent to the local worker. Waiting for real browser and build results...',
        status: 'working',
        created_at: new Date().toISOString()
      }
    ]);

    setStatus('working');
    setInstruction('');

    try {
      const response = await fetch('/developer-api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'inspect', instruction: text, team: activeTeam })
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Worker returned HTTP ${response.status}`);
      }

      const summary = result.report?.summary || {};
      const reportText = [
        'Real inspection completed.',
        `Pages checked: ${summary.pages_checked ?? 'unknown'}`,
        `Failed page loads: ${summary.failed_pages ?? 'unknown'}`,
        `Console errors: ${summary.console_errors ?? 'unknown'}`,
        `Failed requests: ${summary.failed_requests ?? 'unknown'}`,
        `Production build: ${summary.build_passed === true ? 'PASSED' : summary.build_passed === false ? 'FAILED' : 'unknown'}`,
        '',
        'Note: this run checks route loading and collects interface elements; it does not click every control or make code changes.'
      ].join('\n');

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          sender: 'Master Developer',
          team: activeTeam,
          text: reportText,
          status: summary.failed_pages === 0 && summary.build_passed ? 'fixed' : 'info',
          created_at: new Date().toISOString()
        }
      ]);
      setStatus(summary.failed_pages === 0 && summary.build_passed ? 'testing' : 'needs-attention');
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          sender: 'Master Developer',
          team: activeTeam,
          text: `Inspection could not be completed: ${error.message}. Check that the local worker is running and the Vite proxy is active.`,
          status: 'error',
          created_at: new Date().toISOString()
        }
      ]);
      setStatus('error');
    }
  }

  function toggleCheck(index) {
    setChecks((current) => ({
      ...current,
      [index]: !current[index]
    }));
  }

  function addFeedback(text, feedbackStatus = 'info') {
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        sender: 'Developer',
        team: 'developer',
        text,
        status: feedbackStatus,
        created_at: new Date().toISOString()
      }
    ]);
  }

  function markFixed() {
    setStatus('fixed');
    addFeedback(
      'Developer marked the current task fixed. Run the QA checks before treating it as verified.',
      'fixed'
    );
  }

  function markTesting() {
    setStatus('testing');
    addFeedback(
      'QA testing started. Pages, controls, images, forms, routes and console errors must be checked.',
      'testing'
    );
  }

  function resetCenter() {
    localStorage.removeItem(STORAGE);
    setMessages([]);
    setChecks({});
    setStatus('ready');
    setInstruction('');
  }

  const passed = CHECKS.filter((_, index) => checks[index]).length;

  return (
    <aside className="developer-control-center">
      <div className="developer-header">
        <div>
          <h2>Developer Control Center</h2>
          <p>Direct project instructions, team feedback and verification.</p>
        </div>

        <button type="button" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide' : 'Open'}
        </button>
      </div>

      {open && (
        <>
          <div className="developer-status">
            <strong>Status:</strong>
            <span data-developer-status={status}>{status.toUpperCase()}</span>
            <span>{passed}/{CHECKS.length} checks</span>
          </div>

          <div className="developer-team">
            {TEAM.map(([id, name]) => (
              <button
                key={id}
                type="button"
                className={activeTeam === id ? 'active' : ''}
                onClick={() => setActiveTeam(id)}
              >
                {name}
              </button>
            ))}
          </div>

          <form className="developer-chat" onSubmit={sendInstruction}>
            <label htmlFor="developer-instruction">
              Send instruction to {TEAM.find(([id]) => id === activeTeam)?.[1]}
            </label>

            <textarea
              id="developer-instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Example: Fix the product image view and test every category."
              rows={4}
            />

            <button type="submit">Send Instruction</button>
          </form>

          <div className="developer-actions">
            <button type="button" onClick={markTesting}>Start QA</button>
            <button type="button" onClick={markFixed}>Mark Fixed</button>
            <button type="button" onClick={() => addFeedback('Build/deployment verification requested.', 'info')}>
              Request Deployment Check
            </button>
          </div>

          <section className="developer-checklist">
            <h3>Project Verification</h3>

            {CHECKS.map((item, index) => (
              <label key={item}>
                <input
                  type="checkbox"
                  checked={Boolean(checks[index])}
                  onChange={() => toggleCheck(index)}
                />
                <span>{item}</span>
              </label>
            ))}
          </section>

          <section className="developer-feedback">
            <h3>Developer / Team Feedback</h3>

            {messages.length === 0 ? (
              <p>No developer messages yet. Send the first instruction above.</p>
            ) : (
              messages.slice(-20).map((message) => (
                <article key={message.id} data-feedback-status={message.status}>
                  <strong>{message.sender}</strong>
                  <small>{new Date(message.created_at).toLocaleString()}</small>
                  <p>{message.text}</p>
                </article>
              ))
            )}
          </section>

          <button type="button" onClick={resetCenter}>
            Reset Control Center
          </button>
        </>
      )}
    </aside>
  );
}
