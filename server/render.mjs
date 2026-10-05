import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import createOrder from '../netlify/functions/create-order.mjs';
import initializePayment from '../netlify/functions/initialize-payment.mjs';
import paystackWebhook from '../netlify/functions/paystack-webhook.mjs';
import initializeDodoPayment from '../netlify/functions/initialize-dodo-payment.mjs';
import dodoWebhook from '../netlify/functions/dodo-webhook.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = Number(process.env.PORT || 10000);

app.use(cors());

function adaptHandler(handler, { rawBody = false } = {}) {
  return async (req, res) => {
    try {
      let bodyText = '';

      if (rawBody) {
        bodyText = await new Promise((resolve, reject) => {
          let data = '';
          req.setEncoding('utf8');

          req.on('data', chunk => {
            data += chunk;
          });

          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
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

      const buffer = Buffer.from(await response.arrayBuffer());
      res.end(buffer);
    } catch (error) {
      console.error('[BRUKINA API ADAPTER]', error);

      if (!res.headersSent) {
        res.status(500).json({
          accepted: false,
          error: 'Internal server error'
        });
      }
    }
  };
}

/*
 * Webhooks must receive their original raw body.
 */
app.post(
  '/.netlify/functions/paystack-webhook',
  express.raw({ type: '*/*' }),
  adaptHandler(paystackWebhook, { rawBody: true })
);

app.post(
  '/.netlify/functions/dodo-webhook',
  express.raw({ type: '*/*' }),
  adaptHandler(dodoWebhook, { rawBody: true })
);

/*
 * Normal JSON API functions.
 */
app.post(
  '/.netlify/functions/create-order',
  express.json(),
  adaptHandler(createOrder)
);

app.post(
  '/.netlify/functions/initialize-payment',
  express.json(),
  adaptHandler(initializePayment)
);

app.post(
  '/.netlify/functions/initialize-dodo-payment',
  express.json(),
  adaptHandler(initializeDodoPayment)
);

/*
 * Basic health endpoint.
 */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'Brukina Marketplace',
    provider: 'Render',
    timestamp: new Date().toISOString()
  });
});

/*
 * Serve the production Vite build.
 */
app.use(express.static(path.join(rootDir, 'dist')));

/*
 * React SPA fallback.
 */
app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BRUKINA RENDER SERVER] listening on 0.0.0.0:${PORT}`);
});
