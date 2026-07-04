export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Server {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  createdAt?: string;
  iconUrl?: string | null;
  description?: string;
  region?: string;
  invitesPaused?: boolean;
  verificationLevel?: number;
  defaultNotifications?: string;
  explicitContentFilter?: boolean;
  afkTimeoutMinutes?: number;
}

export interface ServerMember {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  joinedAt: string;
  isOwner: boolean;
}

export interface ServerDetailsResponse {
  server: Server;
}

export interface ServerMembersResponse {
  members: ServerMember[];
}

export interface UpdateServerPayload {
  name?: string;
  description?: string;
  region?: string;
  invitesPaused?: boolean;
  verificationLevel?: number;
  defaultNotifications?: string;
  explicitContentFilter?: boolean;
  afkTimeoutMinutes?: number;
}

export interface AuthResponse {
  user: User;
}

export interface ServersResponse {
  servers: Server[];
}

export interface ServerResponse {
  server: Server;
}

export interface ApiError {
  error: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error(
      "Could not reach the server. Stop old dev servers, run `npx wrangler d1 migrations apply commhub-db --local`, then `npm run dev`.",
    );
  }

  const data: unknown = await response.json();

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as ApiError).error)
        : "Request failed.";
    throw new Error(message);
  }

  return data as T;
}

export function getMe(): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/me");
}

export function login(usernameOrEmail: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ usernameOrEmail, password }),
  });
}

export function signup(
  username: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
  });
}

export interface UpdateProfilePayload {
  email: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function updateProfile(payload: UpdateProfilePayload): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function changePassword(payload: ChangePasswordPayload): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/auth/password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadAvatar(file: File): Promise<AuthResponse> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch("/api/auth/avatar", {
      method: "POST",
      credentials: "include",
      body: formData,
    });
  } catch {
    throw new Error(
      "Could not reach the server. Stop old dev servers, run `npx wrangler d1 migrations apply commhub-db --local`, then `npm run dev`.",
    );
  }

  const data: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as ApiError).error)
        : "Could not upload avatar.";
    throw new Error(message);
  }

  return data as AuthResponse;
}

export function getMyServers(): Promise<ServersResponse> {
  return request<ServersResponse>("/api/servers/mine");
}

export function createServer(name: string): Promise<ServerResponse> {
  return request<ServerResponse>("/api/servers", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function joinServer(inviteCode: string): Promise<ServerResponse> {
  return request<ServerResponse>("/api/servers/join", {
    method: "POST",
    body: JSON.stringify({ inviteCode }),
  });
}

export function getServer(serverId: string): Promise<ServerDetailsResponse> {
  return request<ServerDetailsResponse>(`/api/servers/${serverId}`);
}

export function updateServer(
  serverId: string,
  payload: UpdateServerPayload,
): Promise<ServerDetailsResponse> {
  return request<ServerDetailsResponse>(`/api/servers/${serverId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function uploadServerIcon(
  serverId: string,
  file: File,
): Promise<ServerDetailsResponse> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(`/api/servers/${serverId}/icon`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
  } catch {
    throw new Error(
      "Could not reach the server. Stop old dev servers, run `npx wrangler d1 migrations apply commhub-db --local`, then `npm run dev`.",
    );
  }

  const data: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as ApiError).error)
        : "Could not upload server icon.";
    throw new Error(message);
  }

  return data as ServerDetailsResponse;
}

export function regenerateInvite(serverId: string): Promise<ServerDetailsResponse> {
  return request<ServerDetailsResponse>(`/api/servers/${serverId}/invite/regenerate`, {
    method: "POST",
  });
}

export function getServerMembers(serverId: string): Promise<ServerMembersResponse> {
  return request<ServerMembersResponse>(`/api/servers/${serverId}/members`);
}

export function kickMember(serverId: string, userId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/servers/${serverId}/members/${userId}`, {
    method: "DELETE",
  });
}

export function leaveServer(serverId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/servers/${serverId}/leave`, {
    method: "POST",
  });
}

export function deleteServer(serverId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/servers/${serverId}`, {
    method: "DELETE",
  });
}

export type ChannelType = "text" | "voice";

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  createdAt: string;
  voiceBitrate?: number;
  voiceUserLimit?: number;
  voicePttOnly?: boolean;
}

export interface ChannelsResponse {
  channels: Channel[];
}

export interface ChannelResponse {
  channel: Channel;
}

export function getServerChannels(serverId: string): Promise<ChannelsResponse> {
  return request<ChannelsResponse>(`/api/servers/${serverId}/channels`);
}

export function createChannel(
  serverId: string,
  name: string,
  type: ChannelType,
): Promise<ChannelResponse> {
  return request<ChannelResponse>(`/api/servers/${serverId}/channels`, {
    method: "POST",
    body: JSON.stringify({ name, type }),
  });
}

export function updateChannel(
  serverId: string,
  channelId: string,
  payload: {
    name?: string;
    voiceBitrate?: number;
    voiceUserLimit?: number;
    voicePttOnly?: boolean;
  },
): Promise<ChannelResponse> {
  return request<ChannelResponse>(`/api/servers/${serverId}/channels/${channelId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteChannel(
  serverId: string,
  channelId: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/servers/${serverId}/channels/${channelId}`, {
    method: "DELETE",
  });
}

export type RolePermissions = Partial<
  Record<
    | "administrator"
    | "manage_server"
    | "manage_roles"
    | "manage_channels"
    | "view_audit_log"
    | "kick_members"
    | "ban_members"
    | "create_invite"
    | "manage_nicknames"
    | "send_messages"
    | "manage_messages"
    | "mention_everyone"
    | "attach_files"
    | "connect_voice"
    | "speak_voice"
    | "mute_members"
    | "deafen_members"
    | "move_members",
    boolean
  >
>;

export interface ServerRole {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  permissions: RolePermissions;
  isEveryone: boolean;
  isManaged: boolean;
  memberCount: number;
  memberIds: string[];
  createdAt: string;
}

export interface ServerRolesResponse {
  roles: ServerRole[];
  canManage: boolean;
}

export interface ServerRoleResponse {
  role: ServerRole;
}

export function getServerRoles(serverId: string): Promise<ServerRolesResponse> {
  return request<ServerRolesResponse>(`/api/servers/${serverId}/roles`);
}

export function createRole(
  serverId: string,
  payload: { name: string; color?: string; permissions?: RolePermissions },
): Promise<ServerRoleResponse> {
  return request<ServerRoleResponse>(`/api/servers/${serverId}/roles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateRole(
  serverId: string,
  roleId: string,
  payload: {
    name?: string;
    color?: string;
    position?: number;
    permissions?: RolePermissions;
  },
): Promise<ServerRoleResponse> {
  return request<ServerRoleResponse>(`/api/servers/${serverId}/roles/${roleId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteRole(serverId: string, roleId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/servers/${serverId}/roles/${roleId}`, {
    method: "DELETE",
  });
}

export function assignMemberRole(
  serverId: string,
  userId: string,
  roleId: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/servers/${serverId}/members/${userId}/roles/${roleId}`,
    { method: "POST" },
  );
}

export function removeMemberRole(
  serverId: string,
  userId: string,
  roleId: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/servers/${serverId}/members/${userId}/roles/${roleId}`,
    { method: "DELETE" },
  );
}

export interface Message {
  id: string;
  channelId: string;
  serverId: string;
  author: {
    id: string;
    username: string;
    displayName: string;
  };
  content: string;
  threadRootId: string | null;
  replyToId: string | null;
  replyTo: {
    id: string;
    content: string;
    authorName: string;
  } | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  pinned: boolean;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    url: string;
  }>;
  reactions: Array<{
    emoji: string;
    count: number;
    me: boolean;
    userIds: string[];
  }>;
}

export interface MessagesResponse {
  messages: Message[];
}

export interface MessageResponse {
  message: Message;
}

export interface PinsResponse {
  pins: Message[];
}

export interface MyPermissionsResponse {
  permissions: RolePermissions;
}

export function getMyPermissions(serverId: string): Promise<MyPermissionsResponse> {
  return request<MyPermissionsResponse>(`/api/servers/${serverId}/permissions/me`);
}

export function getChannelMessages(
  serverId: string,
  channelId: string,
  options?: { before?: string; limit?: number; thread?: string | null },
): Promise<MessagesResponse> {
  const params = new URLSearchParams();
  if (options?.before) {
    params.set("before", options.before);
  }
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }
  if (options?.thread) {
    params.set("thread", options.thread);
  }
  const query = params.toString();
  return request<MessagesResponse>(
    `/api/servers/${serverId}/channels/${channelId}/messages${query ? `?${query}` : ""}`,
  );
}

export function sendMessage(
  serverId: string,
  channelId: string,
  payload: {
    content: string;
    threadRootId?: string | null;
    replyToId?: string | null;
    attachmentIds?: string[];
  },
): Promise<MessageResponse> {
  return request<MessageResponse>(`/api/servers/${serverId}/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function editMessage(
  serverId: string,
  channelId: string,
  messageId: string,
  content: string,
): Promise<MessageResponse> {
  return request<MessageResponse>(
    `/api/servers/${serverId}/channels/${channelId}/messages/${messageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ content }),
    },
  );
}

export function deleteMessage(
  serverId: string,
  channelId: string,
  messageId: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/servers/${serverId}/channels/${channelId}/messages/${messageId}`,
    { method: "DELETE" },
  );
}

export function addReaction(
  serverId: string,
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<MessageResponse> {
  return request<MessageResponse>(
    `/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions`,
    {
      method: "POST",
      body: JSON.stringify({ emoji }),
    },
  );
}

export function removeReaction(
  serverId: string,
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<MessageResponse> {
  return request<MessageResponse>(
    `/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    { method: "DELETE" },
  );
}

export function pinMessage(
  serverId: string,
  channelId: string,
  messageId: string,
): Promise<MessageResponse> {
  return request<MessageResponse>(
    `/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/pin`,
    { method: "PUT" },
  );
}

export function unpinMessage(
  serverId: string,
  channelId: string,
  messageId: string,
): Promise<MessageResponse> {
  return request<MessageResponse>(
    `/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/pin`,
    { method: "DELETE" },
  );
}

export function getPinnedMessages(
  serverId: string,
  channelId: string,
): Promise<PinsResponse> {
  return request<PinsResponse>(`/api/servers/${serverId}/channels/${channelId}/pins`);
}

export function markChannelRead(
  serverId: string,
  channelId: string,
  messageId?: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/servers/${serverId}/channels/${channelId}/read`, {
    method: "POST",
    body: JSON.stringify({ messageId }),
  });
}

export async function uploadAttachment(
  serverId: string,
  channelId: string,
  file: File,
): Promise<{ attachment: Message["attachments"][number] }> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(`/api/servers/${serverId}/channels/${channelId}/attachments`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
  } catch {
    throw new Error("Could not upload file.");
  }

  const data: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as ApiError).error)
        : "Upload failed.";
    throw new Error(message);
  }

  return data as { attachment: Message["attachments"][number] };
}
