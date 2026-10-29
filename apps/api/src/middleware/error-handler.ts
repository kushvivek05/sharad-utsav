
import type {
  ErrorRequestHandler,
  RequestHandler,
} from 'express';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.path} was not found`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  console.error(error);

  if (res.headersSent) {
    return;
  }

  const status =
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
      ? error.status
      : 500;

  res.status(status).json({
    success: false,
    error: {
      code: status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
      message:
        status === 500
          ? 'An unexpected error occurred'
          : error.message || 'The request could not be processed',
    },
  });
};
