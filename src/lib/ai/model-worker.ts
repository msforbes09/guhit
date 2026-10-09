type WorkerReply =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "ready"; warmupMs: number }
  | { type: "error"; id?: number; message: string }
  | { type: "result"; id: number };

/**
 * A Transformers.js model running in its own worker: sends "load", sums the
 * per-file download progress, then matches each request to its reply by id.
 */
export class ModelWorker<Result extends { type: "result"; id: number }> {
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void }>();

  constructor(private worker: Worker) {}

  load(message: object, onProgress: (loaded: number, total: number) => void): Promise<{ warmupMs: number }> {
    const files = new Map<string, { loaded: number; total: number }>();
    return new Promise((resolve, reject) => {
      this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const reply = event.data;
        if (reply.type === "progress") {
          files.set(reply.file, { loaded: reply.loaded, total: reply.total });
          let loaded = 0;
          let total = 0;
          for (const f of files.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          onProgress(loaded, total);
        } else if (reply.type === "ready") {
          this.worker.onmessage = (e: MessageEvent<WorkerReply>) => this.settle(e.data);
          resolve({ warmupMs: reply.warmupMs });
        } else if (reply.type === "error") {
          reject(new Error(reply.message));
        }
      };
      this.worker.onerror = (event) => reject(new Error(event.message || "A model failed to start."));
      this.worker.postMessage(message);
    });
  }

  call(message: object, transfer: Transferable[] = []): Promise<Result> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...message, id }, transfer);
    });
  }

  private settle(reply: WorkerReply) {
    if ((reply.type !== "result" && reply.type !== "error") || reply.id === undefined) return;
    const waiter = this.pending.get(reply.id);
    if (!waiter) return;
    this.pending.delete(reply.id);
    if (reply.type === "result") waiter.resolve(reply as unknown as Result);
    else waiter.reject(new Error(reply.message));
  }
}
