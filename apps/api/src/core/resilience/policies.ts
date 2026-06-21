import {
  retry,
  handleAll,
  handleWhen,
  circuitBreaker,
  wrap,
  SamplingBreaker,
  ExponentialBackoff,
} from 'cockatiel';

// --- Evolution API ---
// Only transient failures should be retried / count toward the breaker.
// A 4xx (e.g. 404 "instance does not exist") is deterministic: retrying wastes
// time and a stream of 404s would wrongly trip the breaker, blinding us to a
// genuinely-down instance. Treat 5xx, 429 and network/timeout errors as
// transient; everything with a 4xx code is permanent.
const isTransientEvolutionError = (err: unknown): boolean => {
  const msg = (err as Error)?.message ?? '';
  const m = msg.match(/Evolution API (\d{3})/);
  if (m) {
    const code = Number(m[1]);
    return code >= 500 || code === 429;
  }
  // No HTTP code parsed → network error, timeout (AbortError), DNS, etc.
  return true;
};
const handleTransient = handleWhen(isTransientEvolutionError);

const evolutionRetry = retry(handleTransient, {
  maxAttempts: 2,
  backoff: new ExponentialBackoff({ initialDelay: 500, maxDelay: 5000 }),
});

const evolutionBreaker = circuitBreaker(handleTransient, {
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
