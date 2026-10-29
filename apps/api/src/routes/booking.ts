import { type Response, type Request , Router } from 'express';
import { BookingInputError, calculateQuote, completeBooking, getAvailability } from '../services/booking-store.js';
import { getPublicEventConfig } from '../services/event-config.js';

const bookingRouter = Router();


// Util function for Booking Routes
function sendFailure(res: Response, error: unknown) {
  const known = error instanceof BookingInputError;
  const databaseCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const databaseBusy = databaseCode === 'ER_LOCK_DEADLOCK' || databaseCode === 'ER_LOCK_WAIT_TIMEOUT' || databaseCode === 'POOL_ENQUEUELIMIT';
  const databaseUnavailable = ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ECONNRESET'].includes(databaseCode);
  const status = known ? error.status : databaseBusy || databaseUnavailable ? 503 : 500;
  if (!known) console.error('Booking API request failed:', error);
  return res.status(status).json({
    success: false,
    error: {
      code: known ? error.code : databaseBusy ? 'DATABASE_BUSY' : databaseUnavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR',
      message: known ? error.message : databaseBusy ? 'Bookings are busy. Please retry in a moment.' : databaseUnavailable ? 'Booking storage is temporarily unavailable.' : 'The booking service could not complete the request.',
    },
  });
}


bookingRouter.get('/event', (_req:Request, res:Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: getPublicEventConfig() });
});


bookingRouter.get('/availability', async (_req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await getAvailability() });
  } catch (error) { sendFailure(res, error); }
});

bookingRouter.post('/quote', async (req, res) => {
  try { res.json({ success: true, data: await calculateQuote(req.body) }); }
  catch (error) { sendFailure(res, error); }
});

bookingRouter.post('/bookings', async (req, res) => {
  try { res.status(201).json({ success: true, data: await completeBooking(req.body, req.get('Idempotency-Key')) }); }
  catch (error) { sendFailure(res, error); }
});

export default bookingRouter;
