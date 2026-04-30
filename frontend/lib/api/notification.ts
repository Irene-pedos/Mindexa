// frontend/lib/api/notification.ts
import { apiClient } from "./client";

export interface NotificationResponse {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  action_url?: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationResponse[];
  total: number;
  page: number;
  page_size: number;
}

export const notificationApi = {
  getNotifications: async (unreadOnly = false, page = 1, pageSize = 20): Promise<NotificationListResponse> => {
    return apiClient(`/notifications/me?unread_only=${unreadOnly}&page=${page}&page_size=${pageSize}`);
  },
  markAsRead: async (id: string): Promise<{ success: boolean }> => {
    return apiClient(`/notifications/${id}/read`, { method: "POST" });
  },
  markAllAsRead: async (): Promise<{ success: boolean }> => {
    return apiClient(`/notifications/mark-all-read`, { method: "POST" });
  },
};
