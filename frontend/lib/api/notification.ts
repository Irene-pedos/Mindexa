// frontend/lib/api/notification.ts
import { apiClient } from "./client";

export interface NotificationResponse {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  action_url?: string;
  related_id?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationResponse[];
  total: number;
  page: number;
  page_size: number;
}

import { NotificationType } from "./notification/notificationTypes";

export const notificationApi = {
  NotificationType,
  getNotifications: async (
    unreadOnly = false,
    page = 1,
    pageSize = 20,
    category?: string,
  ): Promise<NotificationListResponse> => {
    let url = `/notifications/me?unread_only=${unreadOnly}&page=${page}&page_size=${pageSize}`;
    if (category && category !== "all" && category !== "unread") {
      url += `&category=${encodeURIComponent(category)}`;
    }
    return apiClient(url);
  },
  markAsRead: async (id: string): Promise<{ success: boolean }> => {
    return apiClient(`/notifications/${id}/read`, { method: "POST" });
  },
  markAllAsRead: async (): Promise<{ success: boolean }> => {
    return apiClient(`/notifications/mark-all-read`, { method: "POST" });
  },
};
