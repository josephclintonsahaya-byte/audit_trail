import { rateLimit } from "express-rate-limit";

export const LOGIN_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  limit: 5,
};

export const REGISTRATION_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  limit: 5,
};

export const createAuthRateLimiter = (
  options: { windowMs: number; limit: number },
  skipDuringTests = false
) =>
  rateLimit({
    ...options,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () =>
      skipDuringTests &&
      (process.env.NODE_ENV === "test" ||
        process.env.NODE_TEST_CONTEXT !== undefined),
  });

export const loginRateLimiter = createAuthRateLimiter(
  LOGIN_RATE_LIMIT,
  true
);

export const registrationRateLimiter = createAuthRateLimiter(
  REGISTRATION_RATE_LIMIT,
  true
);
