
import express from 'express';
import healthRouter from './routes/health.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.disable('x-powered-by');

app.use(express.json({ limit: '100kb' }));

app.use('/api/v1', healthRouter);

const server = app.listen(PORT, () => {
  console.log(`Sharad Utsav API running on port ${PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down API...`);

  server.close((error) => {
    if (error) {
      console.error('Error shutting down server:', error);
      process.exitCode = 1;
      return;
    }

    process.exitCode = 0;
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
