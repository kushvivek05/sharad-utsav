import app from './app.js';
import { env } from './config/env.js';
import { closeBookingStore } from './services/booking-store.js';

const PORT = env.port;

const server = app.listen(PORT, () => {
  console.log(`Sharad Utsav API running on port ${PORT}`);
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down API...`);

  server.close((error) => {
    if (error) {
      console.error('Error shutting down server:', error);
      process.exitCode = 1;
      return;
    }
    void closeBookingStore().then(() => { process.exitCode = 0; }).catch((closeError) => {
      console.error('Error closing booking storage:', closeError);
      process.exitCode = 1;
    });
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
