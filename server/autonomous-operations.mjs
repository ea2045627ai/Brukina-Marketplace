import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';

const exec = promisify(execFile);

const INTERVAL_MS = Number(process.env.AUTONOMOUS_INTERVAL_MS || 60000);

const ROLE_POLICIES = {
  manager: {
    name: 'Manager',
    mission: 'Continuously monitor project health, priorities, blockers and operational readiness.',
    checks: [
      'Project structure is present',
      'Developer worker is available',
      'QA/build evidence is current',
      'No unresolved critical operational signal is being ignored'
    ]
  },
  accountant: {
    name: 'Accountant',
    mission: 'Continuously audit financial and transaction-related application areas for structural consistency.',
    checks: [
      'Wallet component exists',
      'Admin ledger component exists',
      'Order component exists',
      'Validation utilities exist'
    ]
  },
  assistant: {
    name: 'Assistant',
    mission: 'Continuously monitor routine application operations and maintain follow-up signals.',
    checks: [
      'Core application entry exists',
      'Feedback center exists',
      'Management roles exist',
      'Realtime catalog hook exists'
    ]
  },
  deployment: {
    name: 'Deployment Team',
    mission: 'Continuously verify production build, Netlify deployment functions and active Dodo payment infrastructure.',
    checks: [
      'Production build passes',
      'Netlify configuration exists',
      'Dodo payment functions exist',
      'Vite configuration exists'
    ]
  },
  qa: {
    name: 'QA Tester',
    mission: 'Continuously verify application routes, controls, browser errors and production build.',
    checks: [
      'All configured routes load',
      'Developer controls respond',
      'No browser console errors',
      'No failed browser requests',
      'Production build passes'
    ]
  }
};

const state = {
  running: false,
  cycle: 0,
  started_at: null,
  last_cycle_at: null,
  last_cycle: null,
  history: []
};

function record(role, status, message, data = {}) {
  return {
    role,
    status,
    message,
    data,
    created_at: new Date().toISOString()
  };
}

function remember(cycle) {
  state.last_cycle = cycle;
  state.last_cycle_at = cycle.created_at;
  state.history = [...state.history, cycle].slice(-20);
}

function fileExists(relativePath) {
  return existsSync(relativePath);
}

function fileSize(relativePath) {
  try {
    return readFileSync(relativePath, 'utf8').length;
  } catch {
    return 0;
  }
}

async function runBuildCheck() {
  try {
    const { stdout, stderr } = await exec(process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm', process.platform === 'win32' ? ['/d','/s','/c','npm.cmd run build'] : ['run','build'], {
      cwd: process.cwd(),
      timeout: 120000,
      maxBuffer: 5 * 1024 * 1024
    });

    return {
      ok: true,
      output: `${stdout}\n${stderr}`.slice(-12000)
    };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout || ''}\n${error.stderr || ''}\n${error.message}`.slice(-12000)
    };
  }
}

async function runRoleAudit(role, inspection = null) {
  const policy = ROLE_POLICIES[role];

  if (!policy) {
    return record(role, 'error', 'Unknown autonomous role.');
  }

  const checks = [];

  if (role === 'manager') {
    checks.push(
      ['Project structure', fileExists('src/App.jsx')],
      ['Worker available', fileExists('server/developer-worker.mjs')],
      ['Control Center available', fileExists('src/components/developer/DeveloperControlCenter.jsx')]
    );

    if (inspection) {
      checks.push(
        ['Routes checked', inspection.summary.pages_checked > 0],
        ['No failed pages', inspection.summary.failed_pages === 0],
        ['No console errors', inspection.summary.console_errors === 0],
        ['No failed requests', inspection.summary.failed_requests === 0],
        ['Build passed', inspection.summary.build_passed === true]
      );
    }
  }

  if (role === 'accountant') {
    checks.push(
      ['Wallet panel', fileExists('src/components/WalletPanel.jsx')],
      ['Admin ledger', fileExists('src/components/AdminLedgerPanel.jsx')],
      ['Order chat', fileExists('src/components/OrderChatComponent.jsx')],
      ['Validation utilities', fileExists('src/lib/validation.mjs')]
    );
  }

  if (role === 'assistant') {
    checks.push(
      ['Application entry', fileExists('src/App.jsx')],
      ['Feedback center', fileExists('src/components/feedback/FeedbackCenter.jsx')],
      ['Business roles', fileExists('src/components/management/BusinessRoles.jsx')],
      ['Realtime catalog', fileExists('src/hooks/useRealtimeCatalog.js')]
    );
  }

  if (role === 'deployment') {
    checks.push(
      ['Netlify configuration', fileExists('netlify.toml')],
      ['Dodo payment functions',
        fileExists('netlify/functions/initialize-dodo-payment.mjs') &&
        fileExists('netlify/functions/dodo-webhook.mjs')
      ],
      ['Vite configuration', fileExists('vite.config.js')]
    );

    const build = await runBuildCheck();
    checks.push(['Production build', build.ok]);
  }

  if (role === 'qa' && inspection) {
    checks.push(
      ['Routes load', inspection.summary.failed_pages === 0],
      ['Console clean', inspection.summary.console_errors === 0],
      ['Requests clean', inspection.summary.failed_requests === 0],
      ['Production build', inspection.summary.build_passed === true]
    );
  }

  const failed = checks.filter(([, ok]) => !ok);
  const passed = checks.filter(([, ok]) => ok);

  return record(
    role,
    failed.length === 0 ? 'healthy' : 'attention',
    failed.length === 0
      ? `${policy.name} completed its autonomous audit successfully.`
      : `${policy.name} found ${failed.length} item(s) requiring attention.`,
    {
      mission: policy.mission,
      checks: checks.map(([name, ok]) => ({ name, ok })),
      passed: passed.length,
      failed: failed.map(([name]) => name)
    }
  );
}

export async function runAutonomousCycle(runInspection) {
  if (state.running) {
    return {
      ok: false,
      skipped: true,
      reason: 'An autonomous cycle is already running.'
    };
  }

  state.running = true;
  state.cycle += 1;

  const cycle = {
    cycle: state.cycle,
    created_at: new Date().toISOString(),
    mode: 'autonomous',
    roles: []
  };

  try {
    console.log(`[AUTONOMOUS OPS] Cycle ${cycle.cycle} started.`);

    const inspection = await runInspection();

    cycle.roles.push(await runRoleAudit('manager', inspection));
    cycle.roles.push(await runRoleAudit('accountant'));
    cycle.roles.push(await runRoleAudit('assistant'));
    cycle.roles.push(await runRoleAudit('qa', inspection));
    cycle.roles.push(await runRoleAudit('deployment'));

    const attention = cycle.roles.filter((item) => item.status === 'attention');

    cycle.summary = {
      roles_run: cycle.roles.length,
      roles_attention: attention.length,
      healthy: attention.length === 0
    };

    remember(cycle);

    console.log(
      `[AUTONOMOUS OPS] Cycle ${cycle.cycle} completed: ` +
      `${cycle.summary.roles_run} roles, ${cycle.summary.roles_attention} attention item(s).`
    );

    return {
      ok: true,
      cycle
    };
  } finally {
    state.running = false;
  }
}

export function getAutonomousStatus() {
  return {
    enabled: true,
    interval_ms: INTERVAL_MS,
    state: {
      ...state,
      running: Boolean(state.running)
    },
    roles: Object.entries(ROLE_POLICIES).map(([id, policy]) => ({
      id,
      name: policy.name,
      mission: policy.mission,
      checks: policy.checks
    }))
  };
}

export function startAutonomousOperations(runInspection) {
  if (state.started_at) {
    return;
  }

  state.started_at = new Date().toISOString();

  console.log(
    `[AUTONOMOUS OPS] Enabled. Automatic cycle every ${INTERVAL_MS}ms.`
  );

  const schedule = async () => {
    try {
      await runAutonomousCycle(runInspection);
    } catch (error) {
      console.error(`[AUTONOMOUS OPS] Cycle failed: ${error.message}`);
    }
  };

  schedule();
  setInterval(schedule, INTERVAL_MS);
}

