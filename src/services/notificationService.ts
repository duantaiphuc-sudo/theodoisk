// Browser Notification API Integration for Ergonomic & Vital Health Alerts

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export interface HealthNotificationOptions {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  badge?: string;
  requireInteraction?: boolean;
}

class BrowserNotificationManager {
  private lastNotificationTime: Record<string, number> = {};
  private minIntervalMs = 15000; // Throttle to at most once per 15s for the same tag

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermission(): NotificationPermissionStatus {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission as NotificationPermissionStatus;
  }

  public async requestPermission(): Promise<NotificationPermissionStatus> {
    if (!this.isSupported()) return 'unsupported';
    try {
      const perm = await Notification.requestPermission();
      return perm as NotificationPermissionStatus;
    } catch (e) {
      console.warn('Lỗi yêu cầu quyền thông báo:', e);
      return this.getPermission();
    }
  }

  public sendNotification(options: HealthNotificationOptions): boolean {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      return false;
    }

    const tag = options.tag || 'general_alert';
    const now = Date.now();
    const lastTime = this.lastNotificationTime[tag] || 0;

    // Throttle repeated notifications with the same tag
    if (now - lastTime < this.minIntervalMs) {
      return false;
    }

    this.lastNotificationTime[tag] = now;

    try {
      const notifOptions: NotificationOptions & { renotify?: boolean } = {
        body: options.body,
        tag: tag,
        icon: options.icon || '/favicon.ico',
        badge: options.badge || '/favicon.ico',
        renotify: true,
        requireInteraction: options.requireInteraction ?? false,
        silent: false,
      };
      const notification = new Notification(options.title, notifOptions as NotificationOptions);

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto close after 8 seconds
      setTimeout(() => {
        try {
          notification.close();
        } catch {}
      }, 8000);

      return true;
    } catch (e) {
      console.warn('Không thể gửi thông báo trình duyệt:', e);
      return false;
    }
  }

  // Force trigger test notification
  public sendTestNotification(): boolean {
    return this.sendNotification({
      title: '🔔 Cảnh Báo Sức Khỏe - HealthOffice',
      body: 'Thông báo trình duyệt hoạt động tốt! Bạn sẽ nhận được cảnh báo ngay cả khi thu nhỏ cửa sổ.',
      tag: 'test_notification_' + Date.now(),
    });
  }
}

export const notificationManager = new BrowserNotificationManager();
