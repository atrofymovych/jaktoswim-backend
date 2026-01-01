const fetch = require('node-fetch');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const os = require('os');

class TelegramMonitor {
  constructor() {
    this.botToken = '7945333499:AAHxcRvsX62A4jDWi6ZLeb6L14Uz2kJsegM';
    this.chatIds = ['1930412008', '622724841'];
    this.startTime = Date.now();
    this.metrics = {
      requests: 0,
      errors: 0,
      startTime: Date.now(),
      errorHistory: [],
      requestHistory: [],
    };

    this.setupConsoleMonitoring();
    this.startHourlyReporting();
  }

  setupConsoleMonitoring() {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const self = this;

    console.error = function (...args) {
      const errorMessage = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');

      self.trackError(errorMessage, { source: 'console.error', args });
      originalConsoleError.apply(console, args);
    };

    console.warn = function (...args) {
      const warnMessage = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');

      self.trackError(warnMessage, { source: 'console.warn', args });
      originalConsoleWarn.apply(console, args);
    };

    process.on('uncaughtException', (error) => {
      self.trackError(`Uncaught Exception: ${error.message}`, {
        source: 'uncaughtException',
        stack: error.stack,
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      self.trackError(`Unhandled Rejection: ${reason}`, {
        source: 'unhandledRejection',
        promise: promise.toString(),
      });
    });
  }

  async sendTelegramMessage(message, priority = 'INFO') {
    const emoji = this.getPriorityEmoji(priority);
    const formattedMessage = `${emoji} **${priority}**\n\n${message}\n\n⏰ ${new Date().toISOString()}`;

    const promises = this.chatIds.map((chatId) => this.sendToChatId(chatId, formattedMessage));
    await Promise.allSettled(promises);
  }

  async sendToChatId(chatId, formattedMessage) {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: formattedMessage,
          parse_mode: 'Markdown',
        }),
      });

      if (!response.ok) {
        console.error(`[TELEGRAM] Failed to send message to ${chatId}:`, response.statusText);
      }
    } catch (error) {
      console.error(`[TELEGRAM] Error sending message to ${chatId}:`, error.message);
    }
  }

  addChatId(chatId) {
    if (!chatId || typeof chatId !== 'string') {
      console.error('[TELEGRAM] Invalid chat ID provided');
      return false;
    }

    if (!this.chatIds.includes(chatId)) {
      this.chatIds.push(chatId);
      return true;
    }
    return false;
  }

  removeChatId(chatId) {
    const index = this.chatIds.indexOf(chatId);
    if (index > -1) {
      this.chatIds.splice(index, 1);
      return true;
    }
    return false;
  }

  getChatIds() {
    return [...this.chatIds];
  }

  async sendToSpecificChat(chatId, message, priority = 'INFO') {
    if (!this.chatIds.includes(chatId)) {
      console.error(`[TELEGRAM] Chat ID ${chatId} not in allowed list`);
      return false;
    }

    const emoji = this.getPriorityEmoji(priority);
    const formattedMessage = `${emoji} **${priority}**\n\n${message}\n\n⏰ ${new Date().toISOString()}`;
    await this.sendToChatId(chatId, formattedMessage);
    return true;
  }

  getPriorityEmoji(priority) {
    const emojis = {
      CRITICAL: '🚨',
      HIGH: '⚠️',
      MEDIUM: '🔶',
      INFO: 'ℹ️',
    };
    return emojis[priority] || 'ℹ️';
  }

  trackError(errorMessage, context = {}) {
    this.metrics.errors++;
    this.metrics.errorHistory.push({
      timestamp: Date.now(),
      error: errorMessage,
      context,
    });

    if (this.metrics.errorHistory.length > 100) {
      this.metrics.errorHistory.shift();
    }

    this.sendTelegramMessage(
      '❌ **Error Detected**\n\n' +
        `Error: ${errorMessage}\n` +
        `Source: ${context.source || 'Unknown'}\n` +
        `Context: ${JSON.stringify(context, null, 2)}`,
      'HIGH'
    );
  }

  trackRequest() {
    this.metrics.requests++;
    this.metrics.requestHistory.push(Date.now());

    if (this.metrics.requestHistory.length > 1000) {
      this.metrics.requestHistory.shift();
    }
  }

  getHardwareStats() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
      },
      cpu: {
        user: cpuUsage.user / 1000,
        system: cpuUsage.system / 1000,
      },
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      version: process.version,
    };
  }

  async getSecurityMetrics() {
    try {
      const [ipAddress, localIP, totalUsers, activeSessions, lastLogin, failedLogins, openPorts, diskUsage, networkConnections, suspiciousProcesses] = await Promise.all([
        this.getPublicIP(),
        this.getLocalIP(),
        this.getTotalSystemUsers(),
        this.getActiveSessions(),
        this.getLastLogin(),
        this.getFailedLogins(),
        this.getOpenPorts(),
        this.getDiskUsage(),
        this.getNetworkConnections(),
        this.getSuspiciousProcesses(),
      ]);

      return {
        ipAddress,
        localIP,
        totalUsers,
        activeSessions,
        lastLogin,
        failedLogins,
        openPorts,
        diskUsage,
        networkConnections,
        suspiciousProcesses,
      };
    } catch (error) {
      console.error('[MONITORING] Error getting security metrics:', error);
      return {
        ipAddress: 'Unknown',
        localIP: 'Unknown',
        totalUsers: 0,
        activeSessions: 0,
        lastLogin: 'Unknown',
        failedLogins: 0,
        openPorts: 0,
        diskUsage: 0,
        networkConnections: 0,
        suspiciousProcesses: 0,
      };
    }
  }

  async getPublicIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error('[MONITORING] Error getting public IP:', error);
      return 'Unknown';
    }
  }

  async getLocalIP() {
    try {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            return iface.address;
          }
        }
      }
      return 'Unknown';
    } catch (error) {
      console.error('[MONITORING] Error getting local IP:', error);
      return 'Unknown';
    }
  }

  async getTotalSystemUsers() {
    try {
      const { stdout } = await execAsync('who | wc -l');
      return parseInt(stdout.trim());
    } catch (error) {
      console.error('[MONITORING] Error getting total users:', error);
      return 0;
    }
  }

  async getActiveSessions() {
    try {
      const { stdout } = await execAsync('who | grep -v "pts/" | wc -l');
      return parseInt(stdout.trim());
    } catch (error) {
      console.error('[MONITORING] Error getting active sessions:', error);
      return 0;
    }
  }

  async getLastLogin() {
    try {
      const { stdout } = await execAsync('last -n 1 | head -1');
      const line = stdout.trim();
      if (line.includes('still logged in')) {
        return 'Currently logged in';
      }
      return line || 'No recent logins';
    } catch (error) {
      console.error('[MONITORING] Error getting last login:', error);
      return 'No recent logins';
    }
  }

  async getFailedLogins() {
    try {
      const { stdout } = await execAsync('grep "Failed password" /var/log/auth.log | tail -10 | wc -l');
      return parseInt(stdout.trim());
    } catch (error) {
      console.error('[MONITORING] Error getting failed logins:', error);
      return 0;
    }
  }

  async getOpenPorts() {
    try {
      const { stdout } = await execAsync('netstat -tuln | grep LISTEN | wc -l');
      return parseInt(stdout.trim());
    } catch (error) {
      console.error('[MONITORING] Error getting open ports:', error);
      return 0;
    }
  }

  async getDiskUsage() {
    try {
      const { stdout } = await execAsync("df -h / | awk 'NR==2 {print $5}' | sed 's/%//'");
      return parseInt(stdout.trim());
    } catch (error) {
      console.error('[MONITORING] Error getting disk usage:', error);
      return 0;
    }
  }

  async getNetworkConnections() {
    try {
      const { stdout } = await execAsync('netstat -an | grep ESTABLISHED | wc -l');
      return parseInt(stdout.trim());
    } catch (error) {
      console.error('[MONITORING] Error getting network connections:', error);
      return 0;
    }
  }

  async getSuspiciousProcesses() {
    try {
      const { stdout } = await execAsync('ps aux | grep -E "(nc|netcat|nmap|masscan)" | grep -v grep | wc -l');
      return parseInt(stdout.trim());
    } catch (error) {
      console.error('[MONITORING] Error getting suspicious processes:', error);
      return 0;
    }
  }

  async sendHourlyReport() {
    try {
      const now = new Date();
      const uptime = Date.now() - this.metrics.startTime;
      const uptimeHours = uptime / (1000 * 60 * 60);

      const hardwareStats = this.getHardwareStats();
      const securityMetrics = await this.getSecurityMetrics();

      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const requestsThisHour = this.metrics.requestHistory.filter((timestamp) => timestamp > oneHourAgo).length;
      const errorsThisHour = this.metrics.errorHistory.filter((error) => error.timestamp > oneHourAgo).length;

      const reportMessage =
        '📊 **Hourly System Status Report**\n\n' +
        `⏰ Report time: ${now.toISOString()}\n` +
        `🕐 System uptime: ${uptimeHours.toFixed(2)} hours\n\n` +
        '💻 **Hardware Stats**\n' +
        `🧠 Memory (heap): ${hardwareStats.memory.heapUsed}MB / ${hardwareStats.memory.heapTotal}MB\n` +
        `💾 Memory (RSS): ${hardwareStats.memory.rss}MB\n` +
        `⚡ CPU user: ${hardwareStats.cpu.user}ms\n` +
        `⚡ CPU system: ${hardwareStats.cpu.system}ms\n` +
        `🆔 Process ID: ${hardwareStats.pid}\n` +
        `📱 Platform: ${hardwareStats.platform} ${hardwareStats.arch}\n` +
        `🔄 Node.js: ${hardwareStats.version}\n\n` +
        '🛡️ **Security Metrics**\n' +
        `🌐 Public IP: ${securityMetrics.ipAddress}\n` +
        `🏠 Local IP: ${securityMetrics.localIP}\n` +
        `👥 Total system users: ${securityMetrics.totalUsers}\n` +
        `🔐 Active sessions: ${securityMetrics.activeSessions}\n` +
        `🚪 Open ports: ${securityMetrics.openPorts}\n` +
        `🔗 Network connections: ${securityMetrics.networkConnections}\n` +
        `💾 Disk usage: ${securityMetrics.diskUsage}%\n` +
        `⚠️ Failed logins (last 10): ${securityMetrics.failedLogins}\n` +
        `🔍 Suspicious processes: ${securityMetrics.suspiciousProcesses}\n` +
        `📅 Last login: ${securityMetrics.lastLogin}\n\n` +
        '📈 **Performance Metrics**\n' +
        `📊 Total requests: ${this.metrics.requests.toLocaleString()}\n` +
        `❌ Total errors: ${this.metrics.errors}\n` +
        `📊 Requests this hour: ${requestsThisHour.toLocaleString()}\n` +
        `❌ Errors this hour: ${errorsThisHour}\n` +
        `📊 Error rate: ${((this.metrics.errors / Math.max(this.metrics.requests, 1)) * 100).toFixed(2)}%`;

      await this.sendTelegramMessage(reportMessage, 'INFO');
    } catch (error) {
      console.error('[MONITORING] Error sending hourly report:', error);
      await this.sendTelegramMessage(
        `⚠️ **Hourly Report Error**\n\nFailed to generate hourly report: ${error.message}`,
        'MEDIUM'
      );
    }
  }

  startHourlyReporting() {
    this.sendStartupMessage();

    setInterval(
      () => {
        this.sendHourlyReport();
      },
      60 * 60 * 1000
    );
  }

  async sendStartupMessage() {
    const startupMessage =
      '🚀 **System Startup**\n\n' +
      `⏰ Started at: ${new Date().toISOString()}\n` +
      `🖥️ Environment: ${process.env.NODE_ENV || 'development'}\n` +
      `📊 Node.js: ${process.version}\n` +
      `🏗️ Platform: ${process.platform} ${process.arch}\n` +
      `💾 Memory: ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB\n` +
      `🆔 Process ID: ${process.pid}\n\n` +
      '✅ Telegram monitoring system initialized\n' +
      '🔍 Console monitoring: Active\n' +
      '📈 Hourly reports: Enabled\n' +
      '👥 User tracking: Active\n' +
      '🚨 Error alerts: Real-time';

    await this.sendTelegramMessage(startupMessage, 'INFO');
  }

  async triggerStatusReport() {
    await this.sendHourlyReport();
  }
}

const telegramMonitor = new TelegramMonitor();

module.exports = telegramMonitor;
