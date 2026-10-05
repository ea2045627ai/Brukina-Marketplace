import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import createOrder from '../netlify/functions/create-order.mjs';
import initializePayment from '../netlify/functions/initialize-payment.mjs';
import paystackWebhook from '../netlify/functions/paystack-webhook.mjs';
import initializeDodoPayment from '../netlify/functions/initialize-dodo-payment.mjs';
import dodoWebhook from '../netlify/functions/dodo-webhook.mjs';
import operationsWebhook from '../netlify/functions/operations-webhook.mjs';
import supplyBridge from '../netlify/functions/supply-bridge.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = Number(process.env.PORT || 10000);

app.disable('x-powered-by');
app.use(cors());

function jsonResponse(res, body, status = 200) {
  res
    .status(status)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(body));
}

function methodGuard(allowed = 'POST') {
  return (req, res, next) => {
    if (req.method !== allowed) {
      res.set('Allow', allowed);
      return jsonResponse(
        res,
        { accepted: false, error: 'Method not allowed' },
        405
      );
    }
    next();
  };
}

function adaptHandler(handler, { rawBody = false } = {}) {
  return async (req, res) => {
    try {
      let bodyText = '';

      if (rawBody) {
        if (Buffer.isBuffer(req.body)) {
          bodyText = req.body;
        } else if (req.body instanceof Uint8Array) {
          bodyText = Buffer.from(req.body);
        } else if (typeof req.body === 'string') {
          bodyText = Buffer.from(req.body, 'utf8');
        } else {
          bodyText = Buffer.from('');
        }
      }

      const protocol =
        req.headers['x-forwarded-proto'] ||
        req.protocol ||
        'https';

      const host = req.get('host');

      const request = new Request(
        `${protocol}://${host}${req.originalUrl}`,
        {
          method: req.method,
          headers: new Headers(req.headers),
          body:
            req.method === 'GET' || req.method === 'HEAD'
              ? undefined
              : rawBody
                ? bodyText
                : JSON.stringify(req.body ?? {})
        }
      );

      const response = await handler(request);

      res.status(response.status);

      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      res.end(
        Buffer.from(await response.arrayBuffer())
      );
    } catch (error) {
      console.error('[BRUKINA API ADAPTER]', error);

      if (!res.headersSent) {
        jsonResponse(
          res,
          {
            accepted: false,
            error: 'Internal server error'
          },
          500
        );
      }
    }
  };
}

/* PAYSTACK WEBHOOK */
app.all(
  '/.netlify/functions/paystack-webhook',
  methodGuard('POST')
);

app.post(
  '/.netlify/functions/paystack-webhook',
  express.raw({ type: '*/*' }),
  adaptHandler(paystackWebhook, { rawBody: true })
);

/* DODO WEBHOOK */
app.all(
  '/.netlify/functions/dodo-webhook',
  methodGuard('POST')
);

app.post(
  '/.netlify/functions/dodo-webhook',
  express.raw({ type: '*/*' }),
  adaptHandler(dodoWebhook, { rawBody: true })
);

/* CREATE ORDER */
app.all(
  '/.netlify/functions/create-order',
  methodGuard('POST')
);

app.post(
  '/.netlify/functions/create-order',
  express.json(),
  adaptHandler(createOrder)
);

/* PAYSTACK INITIALIZATION */
app.all(
  '/.netlify/functions/initialize-payment',
  methodGuard('POST')
);

app.post(
  '/.netlify/functions/initialize-payment',
  express.json(),
  adaptHandler(initializePayment)
);

/* DODO INITIALIZATION */
app.all(
  '/.netlify/functions/initialize-dodo-payment',
  methodGuard('POST')
);

app.post(
  '/.netlify/functions/initialize-dodo-payment',
  express.json(),
  adaptHandler(initializeDodoPayment)
);

/* OPERATIONS WEBHOOK */
app.all(
  '/.netlify/functions/operations-webhook',
  methodGuard('POST')
);

app.post(
  '/.netlify/functions/operations-webhook',
  express.json(),
  adaptHandler(operationsWebhook)
);

/* SUPPLY BRIDGE */
app.all(
  '/.netlify/functions/supply-bridge',
  methodGuard('POST')
);

app.post(
  '/.netlify/functions/supply-bridge',
  express.json(),
  adaptHandler(supplyBridge)
);

/* HEALTH */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'Brukina Marketplace',
    provider: 'Render',
    timestamp: new Date().toISOString()
  });
});

/* FRONTEND */
app.use(
  express.static(path.join(rootDir, 'dist'))
);

/*
 * SPA fallback comes LAST.
 * API routes above can therefore never fall through
 * to index.html.
 */
app.get('*', (_req, res) => {
  res.sendFile(
    path.join(rootDir, 'dist', 'index.html')
  );
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[BRUKINA RENDER SERVER] listening on 0.0.0.0:${PORT}`
  );
});
