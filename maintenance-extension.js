/**
 * Maintenance Extension for Paperclip
 * This module adds automatic maintenance capabilities to a running Paperclip instance
 */

const fs = require('fs').promises;
const path = require('path');
const { setInterval } = require('timers/promises');

class MaintenanceService {
  constructor() {
    this.config = {
      enabled: true,
      intervalMinutes: 30,
      maxLogSizeMB: 50,
      maxTempFileAgeHours: 24,
      preserveRunningTaskHours: 6,
      cleanupPaths: [
        "/tmp",
        "/var/tmp",
        process.env.TMPDIR || "/tmp"
      ]
    };
    this.lastRun = null;
    this.intervalId = null;
  }

  async getRunningTasks() {
    // In a real implementation, this would query the database
    // For now, return empty array
    return [];
  }

  async isRunningTaskFile(filePath) {
    try {
      const runningTasks = await this.getRunningTasks();
      const fileName = path.basename(filePath);

      for (const task of runningTasks) {
        if (fileName.includes(task.id)) {
          return true;
        }

        try {
          const stats = await fs.stat(filePath);
          const fileAge = Date.now() - stats.mtime.getTime();
          const maxAge = this.config.preserveRunningTaskHours * 60 * 60 * 1000;

          if (fileAge < maxAge) {
            return true;
          }
        } catch {
          // Ignore stat errors
        }
      }

      return false;
    } catch (error) {
      console.error('Failed to check running task file:', error);
      return false;
    }
  }

  async cleanupTempFiles() {
    const now = Date.now();
    const maxAge = this.config.maxTempFileAgeHours * 60 * 60 * 1000;

    for (const cleanupPath of this.config.cleanupPaths) {
      try {
        const files = await fs.readdir(cleanupPath);

        for (const file of files) {
          const filePath = path.join(cleanupPath, file);

          try {
            const stats = await fs.stat(filePath);

            if (stats.isDirectory()) {
              continue;
            }

            const fileAge = now - stats.mtime.getTime();

            if (await this.isRunningTaskFile(filePath)) {
              console.log(`Skipping task-related file: ${filePath}`);
              continue;
            }

            if (fileAge > maxAge) {
              await fs.unlink(filePath);
              console.log(`Cleaned up old temp file: ${filePath} (${Math.round(fileAge / (60 * 60 * 1000))}h old)`);
            }
          } catch (error) {
            if (error.code !== 'ENOENT') {
              console.debug(`Failed to cleanup temp file: ${filePath}`, error.message);
            }
          }
        }
      } catch (error) {
        console.debug(`Failed to cleanup temp directory: ${cleanupPath}`, error.message);
      }
    }
  }

  async rotateLogFiles() {
    const logPaths = [
      "/home/vpshsqxf/.paperclip/instances/default/logs/server.log"
    ];

    for (const logPath of logPaths) {
      try {
        const stats = await fs.stat(logPath);
        const maxSizeBytes = this.config.maxLogSizeMB * 1024 * 1024;

        if (stats.size > maxSizeBytes) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const backupPath = `${logPath}.${timestamp}.old`;

          await fs.rename(logPath, backupPath);
          console.log(`Rotated log file: ${logPath} -> ${backupPath} (${stats.size} bytes)`);

          await fs.writeFile(logPath, "");
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.debug(`Failed to rotate log file: ${logPath}`, error.message);
        }
      }
    }
  }

  async cleanupZaiSlots() {
    const slotDir = "/tmp/zai-slots";

    try {
      const files = await fs.readdir(slotDir);

      for (const file of files) {
        const filePath = path.join(slotDir, file);

        try {
          const stats = await fs.stat(filePath);

          if (!stats.isDirectory() && stats.size < 100) {
            await fs.unlink(filePath);
            console.log(`Cleaned up ZAI slot file: ${filePath}`);
          }
        } catch (error) {
          // Ignore errors
        }
      }
    } catch (error) {
      // Directory might not exist
    }
  }

  async runMaintenance() {
    const startTime = Date.now();

    try {
      console.log("Starting maintenance routine...");

      await Promise.all([
        this.cleanupTempFiles(),
        this.rotateLogFiles(),
        this.cleanupZaiSlots()
      ]);

      const duration = Date.now() - startTime;
      this.lastRun = new Date();

      console.log(`Maintenance routine completed in ${duration}ms`);

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Maintenance routine failed after ${duration}ms:`, error.message);
    }
  }

  start() {
    if (!this.config.enabled) {
      console.log("Maintenance service disabled");
      return;
    }

    if (this.intervalId) {
      console.log("Maintenance service already started");
      return;
    }

    console.log(`Starting maintenance service (interval: ${this.config.intervalMinutes}min)`);

    // Run immediately
    this.runMaintenance().catch(error => {
      console.error("Initial maintenance run failed:", error);
    });

    // Set up recurring interval
    this.intervalId = setInterval(
      () => this.runMaintenance(),
      this.config.intervalMinutes * 60 * 1000
    );
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Maintenance service stopped");
    }
  }

  getStatus() {
    return {
      enabled: this.config.enabled,
      running: !!this.intervalId,
      lastRun: this.lastRun?.toISOString() || null,
      nextRun: this.intervalId
        ? new Date(Date.now() + this.config.intervalMinutes * 60 * 1000).toISOString()
        : null,
      config: this.config
    };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log("Maintenance service config updated:", this.config);
  }
}

// Export for use
module.exports = { MaintenanceService };