
import { Router } from 'express';
import { checkBookingStore } from '../services/booking-store.js';

const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  try {
    await checkBookingStore();
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        service: 'sharad-utsav-api',
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Booking storage is unavailable.' } });
  }
});

export default healthRouter;
