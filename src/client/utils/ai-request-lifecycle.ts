type AIRequest<Result> = {
  onStart: () => void;
  request: (signal: AbortSignal) => Promise<Result>;
  onSuccess: (result: Result) => void;
  onError: (error: unknown) => void;
  onFinish?: () => void;
  onCancel: () => void;
};

type InFlightAI = { kind: "ai"; controller: AbortController; startedAt: number; onCancel: () => void };

/** One synchronous occupancy per AI entry point, shared with non-cancellable saves. */
export function createAIRequestLifecycle(now = () => performance.now()) {
  let occupied: InFlightAI | { kind: "save" } | undefined;

  const abortAI = (): InFlightAI | undefined => {
    if (occupied?.kind !== "ai") return;
    const current = occupied;
    occupied = undefined;
    current.controller.abort();
    return current;
  };

  return {
    async start<Result>(operation: AIRequest<Result>): Promise<void> {
      if (occupied) return;
      const current: InFlightAI = {
        kind: "ai", controller: new AbortController(), startedAt: now(), onCancel: operation.onCancel,
      };
      occupied = current;
      try {
        operation.onStart();
        const result = await operation.request(current.controller.signal);
        if (occupied === current) operation.onSuccess(result);
      } catch (error) {
        if (occupied === current) operation.onError(error);
      } finally {
        if (occupied === current) {
          occupied = undefined;
          operation.onFinish?.();
        }
      }
    },
    async runSave(operation: () => Promise<void>): Promise<void> {
      if (occupied) return;
      occupied = { kind: "save" };
      try {
        await operation();
      } finally {
        occupied = undefined;
      }
    },
    elapsedSeconds(): number | undefined {
      if (occupied?.kind === "ai") return Math.floor((now() - occupied.startedAt) / 1000);
    },
    cancel(): void {
      abortAI()?.onCancel();
    },
    invalidate(): void {
      abortAI();
    },
  };
}
