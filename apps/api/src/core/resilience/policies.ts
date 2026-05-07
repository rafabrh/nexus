import {
  retry,
  handleAll,
  circuitBreaker,
  wrap,
  SamplingBreaker,
  ExponentialBackoff,
} from 'cockatiel';

// --- Evolution API ---
const evolutionRetry = retry(handleAll, {
  maxAttempts: 2,
  backoff: new ExponentialBackoff({ initialDelay: 500, maxDelay: 5000 }),
});

const evolutionBreaker = circuitBreaker(handleAll, {
  halfOpenAfter: 10_000,
  breaker: new SamplingBreaker({
    threshold: 0.6,
    duration: 30_000,
    minimumRps: 1,
  }),
});

export const evolutionPolicy = wrap(evolutionRetry, evolutionBreaker);

// --- Google Sheets API ---
const sheetsRetry = retry(handleAll, {
  maxAttempts: 3,
  backoff: new ExponentialBackoff({ initialDelay: 1000, maxDelay: 10000 }),
});

const sheetsBreaker = circuitBreaker(handleAll, {
  halfOpenAfter: 30_000,
  breaker: new SamplingBreaker({
    threshold: 0.5,
    duration: 60_000,
    minimumRps: 1,
  }),
});

export const sheetsPolicy = wrap(sheetsRetry, sheetsBreaker);

// --- Resend (Email) ---
export const resendPolicy = retry(handleAll, {
  maxAttempts: 2,
  backoff: new ExponentialBackoff({ initialDelay: 1000, maxDelay: 5000 }),
});
