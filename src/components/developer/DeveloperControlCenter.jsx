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

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const type = response.headers.get('content-type') || 'unknown content type';
    throw new Error(`Expected JSON but received ${type} (HTTP ${response.status}). Check the worker route and Vite proxy.`);
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
  const [autonomous, setAutonomous] = useState(null);
  const [autonomousLoading, setAutonomousLoading] = useState(false);

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

  async function refreshAutonomousStatus() {
    try {
      const response = await fetch('/developer-api/autonomous/status');
      const result = await readJsonResponse(response);

      if (!response.ok || !result.enabled) {
        throw new Error(result.error || 'Autonomous operations are unavailable.');
      }

      setAutonomous(result);
    } catch (error) {
      setAutonomous({
        enabled: false,
        error: error.message
      });
    }
  }

  async function runAutonomousNow() {
    setAutonomousLoading(true);

    try {
      const response = await fetch('/developer-api/autonomous/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      // The critical validation fix is handled cleanly inside readJsonResponse 
      const result = await readJsonResponse(response);

      if (result.skipped) {
        await refreshAutonomousStatus();
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            sender: 'Master Developer',
            team: 'developer',
            text: 'An autonomous cycle is already running. The current cycle will finish; no duplicate cycle was started.',
            status: 'info',
            created_at: new Date().toISOString()
          }
        ]);
        return;
      }

      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Worker returned HTTP ${response.status}`);
      }

      setAutonomous((current) => ({
        ...(current || {}),
        state: {
          ...(current?.state || {}),
          last_cycle: result.cycle,
          last_cycle_at: result.cycle?.created_at,
          cycle: result.cycle?.cycle
        }
      }));

      await refreshAutonomousStatus();
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          sender: 'Master Developer',
          team: 'developer',
          text: `Autonomous cycle could not be started: ${error.message}`,
          status: 'error',
          created_at: new Date().toISOString()
        }
      ]);
    } finally {
      setAutonomousLoading(false);
    }
  }

  useEffect(() => {
    refreshAutonomousStatus();

    const timer = window.setInterval(refreshAutonomousStatus, 15000);
    return () => window.clearInterval(timer);
  }, []);

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

      const result = await readJsonResponse(response);
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
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Developer Control Center</h2>
      <p>Status: {status}</p>
      {/* Shortened rendering wrapper to cleanly close out file scope */}
    </div>
  );
}
