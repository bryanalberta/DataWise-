import { WorkerRequest, WorkerResponse } from '../types';

type PromiseResolver = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

class WorkerClient {
  private worker: Worker | null = null;
  private pendingTasks: Map<string, PromiseResolver> = new Map();
  private taskIdCounter = 0;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window !== 'undefined' && !this.worker) {
      try {
        const workerUrl = window.location?.origin && window.location.origin !== 'null'
          ? new URL('/workers/data-processor.worker.js', window.location.origin).href
          : '/workers/data-processor.worker.js';

        this.worker = new Worker(workerUrl);
        this.worker.addEventListener('message', this.handleMessage.bind(this));
        this.worker.addEventListener('messageerror', this.handleMessageError.bind(this));
        this.worker.addEventListener('error', this.handleError.bind(this));
      } catch (err) {
        console.error('Failed to initialize Web Worker:', err);
        this.worker = null;
      }
    }
  }

  private handleMessage(event: MessageEvent<WorkerResponse>) {
    const response = event.data;
    if (!response || !response.taskId) return;

    const resolver = this.pendingTasks.get(response.taskId);
    if (resolver) {
      if (response.status === 'SUCCESS') {
        resolver.resolve(response.payload);
      } else if (response.status === 'ERROR') {
        resolver.reject(new Error(response.payload?.error || 'Worker task failed.'));
      }
      this.pendingTasks.delete(response.taskId);
    }
  }

  private handleMessageError(event: MessageEvent) {
    console.error('Web Worker Message Error:', event);
    this.pendingTasks.forEach((resolver) => {
      resolver.reject(new Error('Gagal mendeserialisasi pesan dari Web Worker.'));
    });
    this.pendingTasks.clear();
  }

  private handleError(error: ErrorEvent | Event) {
    console.error('Web Worker Error:', error);
    const errorMsg = (error as ErrorEvent)?.message || 'Web Worker mengalami kesalahan fatal saat memproses tugas.';
    // Reject all pending tasks if the worker completely crashes so promises never hang
    this.pendingTasks.forEach((resolver) => {
      resolver.reject(new Error(errorMsg));
    });
    this.pendingTasks.clear();

    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
  }

  private generateTaskId(): string {
    this.taskIdCounter += 1;
    return `task-${Date.now()}-${this.taskIdCounter}`;
  }

  /**
   * Executes a task on the Web Worker and returns a Promise.
   */
  public executeTask<T extends WorkerRequest>(
    action: T['action'],
    payload: T extends { payload: infer P } ? P : never
  ): { promise: Promise<unknown>; taskId: string } {
    if (!this.worker) {
      this.initWorker();
    }

    if (!this.worker) {
      throw new Error('Web Worker is not supported in this environment.');
    }

    const taskId = this.generateTaskId();

    const request = {
      taskId,
      action,
      payload,
    } as unknown as WorkerRequest;

    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingTasks.set(taskId, { resolve, reject });
      try {
        this.worker!.postMessage(request);
      } catch (postError) {
        this.pendingTasks.delete(taskId);
        reject(postError);
      }
    });

    return { promise, taskId };
  }

  /**
   * Cancels a pending task by ID.
   */
  public cancelTask(taskId: string): void {
    if (this.worker) {
      try {
        // Send cancellation message to worker
        this.worker.postMessage({
          taskId,
          action: 'CANCEL_TASK',
        } satisfies WorkerRequest);
      } catch {
        // Ignore if worker is already terminated
      }
    }

    // Reject the local promise immediately
    const resolver = this.pendingTasks.get(taskId);
    if (resolver) {
      resolver.reject(new Error('Task Cancelled'));
      this.pendingTasks.delete(taskId);
    }
  }

  /**
   * Terminates the worker and cleans up resources.
   */
  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingTasks.clear();
  }
}

// Export a singleton instance for application-wide use
export const workerClient = new WorkerClient();
