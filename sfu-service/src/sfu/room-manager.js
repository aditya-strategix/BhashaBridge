const config = require('../config');
const workerPool = require('./worker-pool');
const SFURoomRouter = require('./router');

/**
 * Global SFU Room Router Manager
 * Provisions, indexes, and recycles Mediasoup room routers across all meetings.
 */
class RoomManager {
  constructor() {
    this.rooms = new Map(); // meetingId -> SFURoomRouter
  }

  /**
   * Get an existing room router or provision a new one on the worker pool
   */
  async getOrCreateRoom(meetingId) {
    if (!meetingId) throw new Error('meetingId is required');

    if (this.rooms.has(meetingId)) {
      return this.rooms.get(meetingId);
    }

    // Ensure worker pool is initialized
    if (!workerPool.isInitialized) {
      await workerPool.init();
    }

    // Select worker in round-robin / load-balanced fashion
    const worker = workerPool.getWorker();

    // Create mediasoup router with configured media codecs
    const router = await worker.createRouter({
      mediaCodecs: config.mediasoup.router.mediaCodecs
    });

    const roomRouter = new SFURoomRouter(meetingId, router, worker);
    this.rooms.set(meetingId, roomRouter);

    roomRouter.on('close', () => {
      this.rooms.delete(meetingId);
    });

    return roomRouter;
  }

  /**
   * Find existing room router
   */
  getRoom(meetingId) {
    return this.rooms.get(meetingId) || null;
  }

  /**
   * Close and delete a room router
   */
  closeRoom(meetingId) {
    const room = this.rooms.get(meetingId);
    if (room) {
      room.close();
      this.rooms.delete(meetingId);
      return true;
    }
    return false;
  }

  /**
   * List all active rooms
   */
  listRooms() {
    return Array.from(this.rooms.keys());
  }

  /**
   * Get global SFU metrics across all workers and rooms
   */
  async getGlobalStats() {
    const workerStats = await workerPool.getStats();
    let totalPeers = 0;
    let totalTransports = 0;
    let totalProducers = 0;
    let totalConsumers = 0;
    let totalAudioTaps = 0;

    const roomDetails = [];
    for (const [meetingId, room] of this.rooms.entries()) {
      const stats = room.getStats();
      totalPeers += stats.totalPeers;
      totalTransports += stats.totalTransports;
      totalProducers += stats.totalProducers;
      totalConsumers += stats.totalConsumers;
      totalAudioTaps += stats.activeAudioTaps;

      roomDetails.push(stats);
    }

    return {
      service: config.service.name,
      version: config.service.version,
      timestamp: new Date().toISOString(),
      activeRooms: this.rooms.size,
      totalPeers,
      totalTransports,
      totalProducers,
      totalConsumers,
      totalAudioTaps,
      workers: workerStats,
      rooms: roomDetails
    };
  }

  /**
   * Close all rooms on shutdown
   */
  closeAll() {
    for (const room of this.rooms.values()) {
      try { room.close(); } catch (e) {}
    }
    this.rooms.clear();
  }
}

module.exports = new RoomManager();
