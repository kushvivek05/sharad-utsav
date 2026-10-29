import express from 'express';
import { env } from './config/env.js';
import healthRouter from './routes/health.js';
import bookingRouter from './routes/booking.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const app = express();

app.disable('x-powered-by');

app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && env.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && env.corsOrigins.includes(origin) ? 204 : 403);
  next();
});

app.use('/api/v1', healthRouter);
app.use('/api/v1', bookingRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
