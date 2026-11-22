const config = require('../config');
const { createWorker, isNative } = require('./mediasoup-core');

/**
 * Mediasoup Worker Pool Manager
 * Distributes WebRTC media routers across multi-core worker threads/processes.
 */
class WorkerPool {
  constructor() {
    this.workers = [];
    this.nextWorkerIdx = 0;
    this.isInitialized = false;
  }

  /**
   * Initialize worker pool
   */
  async init(numWorkers = config.mediasoup.numWorkers, workerSettings = config.mediasoup.workerSettings) {
    if (this.isInitialized) return;

    console.log(`[WorkerPool] Initializing ${numWorkers} SFU worker processes (Native: ${isNative})...`);

    for (let i = 0; i < numWorkers; i++) {
      try {
        const worker = await createWorker(workerSettings);
        
        worker.on('died', () => {
          if (this.isClosing) return;
          console.error(`[WorkerPool] Worker ${worker.pid || worker.id} died unexpectedly. Respawning...`);
          const index = this.workers.indexOf(worker);
          if (index !== -1) this.workers.splice(index, 1);
          this.spawnReplacementWorker(workerSettings);
        });

        this.workers.push(worker);
        console.log(`[WorkerPool] Worker [${i + 1}/${numWorkers}] online (PID: ${worker.pid || worker.id})`);
      } catch (err) {
        console.error(`[WorkerPool] Failed to create worker ${i}:`, err);
      }
    }

    if (this.workers.length === 0) {
      throw new Error('[WorkerPool] Failed to spawn any SFU workers');
    }

    this.isInitialized = true;
    console.log(`[WorkerPool] Successfully initialized ${this.workers.length} active workers.`);
  }

  async spawnReplacementWorker(workerSettings) {
    try {
      const worker = await createWorker(workerSettings);
      this.workers.push(worker);
      console.log(`[WorkerPool] Replacement worker online (PID: ${worker.pid || worker.id})`);
    } catch (err) {
      console.error('[WorkerPool] Failed to spawn replacement worker:', err);
    }
  }

  /**
   * Get next worker in round-robin fashion
   */
  getWorker() {
    if (!this.workers.length) {
      throw new Error('[WorkerPool] No workers available in pool');
    }

    const worker = this.workers[this.nextWorkerIdx];
    this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
    return worker;
  }

  /**
   * Get pool telemetry
   */
  async getStats() {
    const workerStats = await Promise.all(
      this.workers.map(async (worker, index) => {
        let usage = {};
        if (typeof worker.getResourceUsage === 'function') {
          try { usage = await worker.getResourceUsage(); } catch (e) {}
        }
        return {
          index,
          id: worker.id || worker.pid,
          pid: worker.pid,
          closed: worker.closed,
          usage
        };
      })
    );

    return {
      totalWorkers: this.workers.length,
      isNative,
      workers: workerStats
    };
  }

  /**
   * Graceful shutdown
   */
  close() {
    this.isClosing = true;
    for (const worker of this.workers) {
      try { worker.close(); } catch (e) {}
    }
    this.workers = [];
    this.isInitialized = false;
    this.isClosing = false;
  }
}

module.exports = new WorkerPool();
