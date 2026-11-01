export type OllamaRequestPriority = "answer" | "question";

type QueueEntry = {
  priority: OllamaRequestPriority;
  sequence: number;
  signal?: AbortSignal;
  resolve: (release: () => void) => void;
  reject: (reason: unknown) => void;
  abortListener?: () => void;
  timeout?: ReturnType<typeof setTimeout>;
};

export class OllamaQueueFullError extends Error {
  constructor() {
    super("MED-A is at capacity right now. Please try again shortly.");
    this.name = "OllamaQueueFullError";
  }
}

export class OllamaQueueTimeoutError extends Error {
  constructor() {
    super("MED-A waited too long for an available response slot. Please try again.");
    this.name = "OllamaQueueTimeoutError";
  }
}

function readIntegerSetting(name: string, fallback: number, min: number, max: number) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

export class OllamaRequestQueue {
  private activeCount = 0;
  private sequence = 0;
  private readonly pending: QueueEntry[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
    private readonly waitTimeoutMs: number,
  ) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error("Ollama request concurrency must be at least one.");
    }
    if (!Number.isInteger(maxQueued) || maxQueued < 0) {
      throw new Error("Ollama queue capacity cannot be negative.");
    }
    if (!Number.isInteger(waitTimeoutMs) || waitTimeoutMs < 1_000) {
      throw new Error("Ollama queue timeout must be at least 1000 milliseconds.");
    }
  }

  acquire(priority: OllamaRequestPriority, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? new Error("The request was cancelled."));
    }

    if (this.activeCount < this.maxConcurrent && this.pending.length === 0) {
      this.activeCount += 1;
      return Promise.resolve(this.createRelease());
    }

    if (this.pending.length >= this.maxQueued) {
      return Promise.reject(new OllamaQueueFullError());
    }

    return new Promise((resolve, reject) => {
      const entry: QueueEntry = {
        priority,
        sequence: this.sequence++,
        signal,
        resolve,
        reject,
      };

      const removeEntry = (error: unknown) => {
        const index = this.pending.indexOf(entry);
        if (index < 0) return;
        this.pending.splice(index, 1);
        this.cleanup(entry);
        reject(error);
        this.drain();
      };

      if (signal) {
        entry.abortListener = () => {
          removeEntry(signal.reason ?? new Error("The request was cancelled."));
        };
        signal.addEventListener("abort", entry.abortListener, { once: true });
      }

      entry.timeout = setTimeout(() => removeEntry(new OllamaQueueTimeoutError()), this.waitTimeoutMs);
      entry.timeout.unref?.();

      this.pending.push(entry);
      this.pending.sort((left, right) => {
        const priorityDifference = Number(right.priority === "answer") - Number(left.priority === "answer");
        return priorityDifference || left.sequence - right.sequence;
      });
      this.drain();
    });
  }

  private drain() {
    while (this.activeCount < this.maxConcurrent && this.pending.length > 0) {
      const entry = this.pending.shift();
      if (!entry) return;
      this.cleanup(entry);

      if (entry.signal?.aborted) {
        entry.reject(entry.signal.reason ?? new Error("The request was cancelled."));
        continue;
      }

      this.activeCount += 1;
      entry.resolve(this.createRelease());
    }
  }

  private cleanup(entry: QueueEntry) {
    if (entry.timeout) clearTimeout(entry.timeout);
    if (entry.signal && entry.abortListener) {
      entry.signal.removeEventListener("abort", entry.abortListener);
    }
  }

  private createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeCount -= 1;
      this.drain();
    };
  }
}

export const ollamaRequestQueue = new OllamaRequestQueue(
  readIntegerSetting("OLLAMA_MAX_CONCURRENT_REQUESTS", 3, 1, 32),
  readIntegerSetting("OLLAMA_MAX_QUEUED_REQUESTS", 500, 0, 10_000),
  readIntegerSetting("OLLAMA_QUEUE_TIMEOUT_MS", 120_000, 1_000, 600_000),
);

export async function withOllamaRequestSlot<T>(
  priority: OllamaRequestPriority,
  signal: AbortSignal | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  const release = await ollamaRequestQueue.acquire(priority, signal);
  try {
    return await operation();
  } finally {
    release();
  }
}
