import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { createServer } from 'node:http';

const exec = promisify(execFile);

const PORT = Number(process.env.DEVELOPER_APP_PORT || 5175);
const BASE_URL = process.env.DEVELOPER_APP_URL || `http://127.0.0.1:${PORT}`;

function result(type, message, data = {}) {
  return {
    type,
    message,
    data,
    created_at: new Date().toISOString()
  };
}

async function runBuild() {
  try {
    const { stdout, stderr } = await exec('npm', ['run', 'build'], {
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

async function inspectBrowser() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  const failedRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('requestfailed', (request) => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText || 'Unknown request failure'
    });
  });

  const pages = [
    '/',
    '/#/developer',
    '/#/login',
    '/#/signup',
    '/#/dashboard',
    '/#/orders',
    '/#/wallet',
    '/#/profile',
    '/#/admin',
    '/#/vendor',
    '/#/rider',
    '/#/driver'
  ];

  const reports = [];

  for (const path of pages) {
    const url = `${BASE_URL}${path}`;

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      await page.waitForTimeout(500);

      const report = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        buttons: [...document.querySelectorAll('button')].map((button) => ({
          text: (button.innerText || button.getAttribute('aria-label') || '').trim(),
          disabled: button.disabled
        })),
        links: [...document.querySelectorAll('a')].map((link) => ({
          text: (link.innerText || '').trim(),
          href: link.href
        })),
        inputs: [...document.querySelectorAll('input, textarea, select')].map((element) => ({
          tag: element.tagName,
          type: element.type || '',
          name: element.name || '',
          placeholder: element.placeholder || ''
        })),
        headings: [...document.querySelectorAll('h1,h2,h3')].map((element) =>
          (element.innerText || '').trim()
        ).filter(Boolean)
      }));

      const interactions = [];

      if (path === '/#/developer') {
        const safeButtons = [
          'Developer',
          'QA Tester',
          'Manager',
          'Accountant',
          'Assistant',
          'Deployment Team',
          'Hide'
        ];

        for (const label of safeButtons) {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
          });
          await page.waitForTimeout(250);

          const button = page.getByRole('button', {
            name: label,
            exact: true
          }).first();

          if (await button.count()) {
            try {
              await button.click({ timeout: 3000 });
              await page.waitForTimeout(200);

              const stateChanged = label === 'Hide'
                ? !(await page.getByText('Developer / Team Feedback', { exact: true }).count())
                : await button.evaluate((element) => element.classList.contains('active'));

              interactions.push({
                button: label,
                tested: true,
                clicked: true,
                state_changed: stateChanged,
                result: stateChanged
                  ? 'Click completed and expected interface state was verified'
                  : 'Click completed, but expected interface state was not verified'
              });
            } catch (error) {
              interactions.push({
                button: label,
                tested: true,
                result: 'Click failed',
                error: error.message
              });
            }
          } else {
            interactions.push({
              button: label,
              tested: false,
              result: 'Button not found'
            });
          }
        }
      }

      if (path === '/#/developer') {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });
        await page.waitForTimeout(300);

        const showButton = page.getByRole('button', {
          name: 'Show',
          exact: true
        }).first();

        if (await showButton.count()) {
          await showButton.click({ timeout: 3000 });
          await page.waitForTimeout(200);
        }

        const checkbox = page.locator('input[type="checkbox"]').first();

        if (await checkbox.count()) {
          const before = await checkbox.isChecked();
          await checkbox.setChecked(!before);
          const toggled = await checkbox.isChecked();
          await checkbox.setChecked(before);
          const restored = (await checkbox.isChecked()) === before;

          interactions.push({
            button: 'First checklist checkbox',
            tested: true,
            clicked: true,
            state_changed: toggled === !before && restored,
            result: toggled === !before && restored
              ? 'Checkbox toggled and original state was restored'
              : 'Checkbox state verification failed'
          });
        } else {
          interactions.push({
            button: 'First checklist checkbox',
            tested: false,
            result: 'Checklist checkbox not found after opening panel'
          });
        }
      }
      reports.push({
        path,
        ok: true,
        ...report,
        interactions
      });
    } catch (error) {
      reports.push({
        path,
        ok: false,
        error: error.message
      });
    }
  }

  await browser.close();

  return {
    pages: reports,
    consoleErrors,
    failedRequests
  };
}

async function inspectProject() {
  console.log(result('started', 'Master Developer inspection started.'));

  const browser = await inspectBrowser();

  console.log(
    result(
      'browser',
      `Browser inspection completed: ${browser.pages.length} routes checked.`,
      browser
    )
  );

  const build = await runBuild();

  console.log(
    result(
      'build',
      build.ok ? 'Production build passed.' : 'Production build failed.',
      build
    )
  );

  const failedPages = browser.pages.filter((page) => !page.ok);

  console.log(
    result(
      'completed',
      failedPages.length === 0 && build.ok
        ? 'Inspection completed successfully.'
        : 'Inspection completed with issues requiring attention.',
      {
        pages_checked: browser.pages.length,
        failed_pages: failedPages.length,
        console_errors: browser.consoleErrors.length,
        failed_requests: browser.failedRequests.length,
        build_passed: build.ok
      }
    )
  );

  return {
    browser,
    build,
    summary: {
      pages_checked: browser.pages.length,
      failed_pages: failedPages.length,
      console_errors: browser.consoleErrors.length,
      failed_requests: browser.failedRequests.length,
      build_passed: build.ok
    }
  };
}

if (process.argv.includes('--check')) {
  try {
    await inspectProject();
    process.exit(0);
  } catch (error) {
    console.error(result('error', error.message));
    process.exit(1);
  }
}

if (process.argv.includes('--serve')) {
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200);
      return response.end(JSON.stringify({ ok: true, service: 'developer-worker' }));
    }

    if (request.method !== 'POST' || request.url !== '/inspect') {
      response.writeHead(404);
      return response.end(JSON.stringify({ error: 'Not found' }));
    }

    try {
      let raw = '';
      for await (const chunk of request) {
        raw += chunk;
        if (raw.length > 4000) throw new Error('Request too large');
      }

      const payload = JSON.parse(raw || '{}');
      if (payload.action !== 'inspect') {
        response.writeHead(400);
        return response.end(JSON.stringify({ error: 'Unsupported action' }));
      }

      const report = await inspectProject();
      response.writeHead(200);
      return response.end(JSON.stringify({ ok: true, report }));
    } catch (error) {
      response.writeHead(500);
      return response.end(JSON.stringify({ ok: false, error: error.message }));
    }
  });

  server.listen(4179, '127.0.0.1', () => {
    console.log('[MASTER DEVELOPER WORKER] Local inspection API on 127.0.0.1:4179');
    console.log(`[MASTER DEVELOPER WORKER] Target: ${BASE_URL}`);
  });
} else {
  console.log('[MASTER DEVELOPER WORKER] Ready.');
  console.log(`[MASTER DEVELOPER WORKER] Target: ${BASE_URL}`);
  console.log('[MASTER DEVELOPER WORKER] Use --check to run a full inspection.');
}
