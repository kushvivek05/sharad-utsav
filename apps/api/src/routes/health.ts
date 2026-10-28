
import { Router } from 'express';

const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      service: 'sharad-utsav-api',
      timestamp: new Date().toISOString(),
    },
  });
});

export default healthRouter;
