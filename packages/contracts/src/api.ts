
export interface ApiSuccess<T> {
  success: true;
  data: T;
  status:number
}

export interface ApiError {
  success: false;
  status:number;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
