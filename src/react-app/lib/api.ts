export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified?: boolean;
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
  afkChannelId?: string | null;
  vanityUrl?: string | null;
  uiTextScale?: number;
  isPublic?: boolean;
}

export interface ServerMember {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  nickname?: string | null;
  joinedAt: string;
  isOwner: boolean;
  avatarUrl?: string | null;
  displayRole?: { name: string; color: string } | null;
}

export interface ServerDetailsResponse {
  server: Server;
}

export interface ServerMembersResponse {
  members: ServerMember[];
}

export interface OnlineMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOwner: boolean;
  displayRole: { name: string; color: string } | null;
}

export interface OnlineMembersResponse {
  members: OnlineMember[];
  onlineCount: number;
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
  afkChannelId?: string | null;
  vanityUrl?: string | null;
  uiTextScale?: number;
  isPublic?: boolean;
}

export interface AuthResponse {
  user: User;
}

export interface ServersResponse {
  servers: Server[];
}

export interface PublicServer {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  memberCount: number;
}

export interface PublicServersResponse {
  servers: PublicServer[];
}

export interface ServerResponse {
  server: Server;
}

export interface ApiError {
  error: string;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      response.status >= 500
        ? "The server returned an error. Run: npx wrangler d1 migrations apply commhub-db --local && npm run dev"
        : "Server returned an invalid response.",
    );
  }
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
      "Could not reach the server. From the Commhub folder run: npm run dev:clean",
    );
  }

  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
      if (!response.ok) {
        const lower = snippet.toLowerCase();
        throw new Error(
          lower.includes("internal server") || lower.includes("internal error")
            ? `The API crashed (${response.status}). Stop the dev server and run: npm run dev:clean`
            : `Server returned an invalid response (${response.status}): ${snippet}`,
        );
      }
      throw new Error("Server returned an invalid response.");
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as ApiError).error)
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }

  return data as T;
}

export function getMe(): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/me");
}

export interface UserProfileRole {
  id: string;
  name: string;
  color: string;
}

export interface UserProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  nickname: string | null;
  serverDisplayName: string | null;
  roles: UserProfileRole[];
  displayRole: { name: string; color: string } | null;
  presence: { status: PresenceStatus; customStatus: string | null } | null;
  isOnline: boolean | null;
  isOwner: boolean | null;
  joinedAt: string | null;
  friendshipStatus: "self" | "friends" | "pending_outgoing" | "pending_incoming" | "none";
  incomingFriendRequestId: string | null;
}

export interface UserProfileResponse {
  profile: UserProfile;
}

export function getUserProfile(
  userId: string,
  serverId?: string | null,
): Promise<UserProfileResponse> {
  const query = serverId ? `?serverId=${encodeURIComponent(serverId)}` : "";
  return request<UserProfileResponse>(`/api/users/${userId}/profile${query}`);
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
  email?: string;
  displayName?: string;
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

  const data: unknown = await parseJsonResponse(response);
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

export function joinPublicServer(serverId: string): Promise<ServerResponse> {
  return request<ServerResponse>("/api/servers/join", {
    method: "POST",
    body: JSON.stringify({ serverId }),
  });
}

export function getPublicServers(): Promise<PublicServersResponse> {
  return request<PublicServersResponse>("/api/servers/public");
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

  const data: unknown = await parseJsonResponse(response);
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

export function heartbeatServerPresence(serverId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/servers/${serverId}/presence/heartbeat`, {
    method: "POST",
  });
}

export function getOnlineMembers(serverId: string): Promise<OnlineMembersResponse> {
  return request<OnlineMembersResponse>(`/api/servers/${serverId}/online-members`);
}

export function kickMember(serverId: string, userId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/servers/${serverId}/members/${userId}`, {
    method: "DELETE",
  });
}

export function banMember(
  serverId: string,
  userId: string,
  reason?: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/servers/${serverId}/members/${userId}/ban`, {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? "" }),
  });
}

export interface ServerBan {
  id: string;
  userId: string | null;
  username: string | null;
  reason: string;
  bannedBy: string;
  bannedByUsername: string | null;
  createdAt: string;
}

export function getServerBans(serverId: string): Promise<{ bans: ServerBan[] }> {
  return request<{ bans: ServerBan[] }>(`/api/servers/${serverId}/bans`);
}

export function unbanMember(serverId: string, userId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/servers/${serverId}/bans/${userId}`, {
    method: "DELETE",
  });
}

export interface AuditLogEvent {
  id: string;
  actionType: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorUsername: string | null;
}

export function getAuditLog(serverId: string): Promise<{ events: AuditLogEvent[] }> {
  return request<{ events: AuditLogEvent[] }>(`/api/servers/${serverId}/audit-log`);
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

export type ChannelType = "text" | "voice" | "forum" | "announcement" | "stage";

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  createdAt: string;
  voiceBitrate?: number;
  voiceUserLimit?: number;
  voicePttOnly?: boolean;
  topic?: string | null;
  slowModeSeconds?: number;
  nsfw?: boolean;
  categoryId?: string | null;
  position?: number;
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
    topic?: string;
    slowModeSeconds?: number;
    nsfw?: boolean;
    categoryId?: string | null;
    position?: number;
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

export interface MessageEmbed {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

export interface Message {
  id: string;
  channelId: string;
  serverId: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
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
  embeds: MessageEmbed[];
  threadArchived: boolean;
  threadLocked: boolean;
  sticker?: { id: string; name: string; url: string } | null;
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
    stickerId?: string | null;
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

export interface ThreadCountsResponse {
  counts: Record<string, number>;
}

export function getThreadCounts(
  serverId: string,
  channelId: string,
): Promise<ThreadCountsResponse> {
  return request<ThreadCountsResponse>(
    `/api/servers/${serverId}/channels/${channelId}/thread-counts`,
  );
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

  const data: unknown = await parseJsonResponse(response);
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as ApiError).error)
        : "Upload failed.";
    throw new Error(message);
  }

  return data as { attachment: Message["attachments"][number] };
}

export interface PrivacySettings {
  allowDmFrom: 0 | 1 | 2;
  allowFriendRequests: boolean;
  showActivityStatus: boolean;
  allowServerInvites: boolean;
  filterExplicitContent: boolean;
}

export function getPrivacySettings(): Promise<{
  settings: PrivacySettings;
  emailVerified: boolean;
}> {
  return request("/api/auth/privacy");
}

export function updatePrivacySettings(
  settings: Partial<PrivacySettings>,
): Promise<{ settings: PrivacySettings }> {
  return request("/api/auth/privacy", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export function sendVerificationEmail(): Promise<{ ok: boolean; message: string; devLink?: string }> {
  return request("/api/auth/verify-email/send", { method: "POST" });
}

export function verifyEmail(token: string): Promise<{ ok: boolean }> {
  return request("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function forgotPassword(email: string): Promise<{ ok: boolean; message: string }> {
  return request("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string): Promise<{ ok: boolean }> {
  return request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export function deleteAccount(password: string): Promise<{ ok: boolean }> {
  return request("/api/auth/account", {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
}

export interface BlockedUser {
  userId: string;
  username: string;
  displayName: string;
}

export function getBlockedUsers(): Promise<{ blocks: BlockedUser[] }> {
  return request("/api/auth/blocks");
}

export function blockUser(userId: string): Promise<{ ok: boolean }> {
  return request(`/api/auth/blocks/${userId}`, { method: "POST" });
}

export function unblockUser(userId: string): Promise<{ ok: boolean }> {
  return request(`/api/auth/blocks/${userId}`, { method: "DELETE" });
}

export function getChannelUnread(serverId: string): Promise<{ unread: Record<string, number> }> {
  return request(`/api/servers/${serverId}/channels/unread`);
}

export function setMemberNickname(
  serverId: string,
  userId: string,
  nickname: string | null,
): Promise<{ ok: boolean; nickname: string | null }> {
  return request(`/api/servers/${serverId}/members/${userId}/nickname`, {
    method: "PATCH",
    body: JSON.stringify({ nickname }),
  });
}

export function timeoutMember(
  serverId: string,
  userId: string,
  durationMinutes: number,
  reason?: string,
): Promise<{ ok: boolean; expiresAt: string }> {
  return request(`/api/servers/${serverId}/members/${userId}/timeout`, {
    method: "POST",
    body: JSON.stringify({ durationMinutes, reason }),
  });
}

export function removeMemberTimeout(
  serverId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/members/${userId}/timeout`, { method: "DELETE" });
}

export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

export function getMyPresence(): Promise<{
  presence: { status: PresenceStatus; customStatus: string | null };
}> {
  return request("/api/presence/me");
}

export function updateMyPresence(payload: {
  status: PresenceStatus;
  customStatus?: string | null;
}): Promise<{ ok: boolean }> {
  return request("/api/presence/me", { method: "PATCH", body: JSON.stringify(payload) });
}

export interface FriendUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface FriendRequest {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  createdAt: string;
}

export function getFriends(): Promise<{
  friends: FriendUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}> {
  return request("/api/friends");
}

export function sendFriendRequest(username: string): Promise<{ ok: boolean }> {
  return request("/api/friends/request", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function acceptFriendRequest(requestId: string): Promise<{ ok: boolean }> {
  return request(`/api/friends/request/${requestId}/accept`, { method: "POST" });
}

export function declineFriendRequest(requestId: string): Promise<{ ok: boolean }> {
  return request(`/api/friends/request/${requestId}/decline`, { method: "POST" });
}

export function removeFriend(userId: string): Promise<{ ok: boolean }> {
  return request(`/api/friends/${userId}`, { method: "DELETE" });
}

export interface DmChannel {
  id: string;
  createdAt: string;
  name?: string | null;
  isGroup?: boolean;
  lastMessage: string | null;
  lastMessageAt: string | null;
  participants: FriendUser[];
}

export interface DmAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
}

export interface DmMessage {
  id: string;
  channelId: string;
  author: { id: string; username: string; displayName: string; avatarUrl?: string | null };
  content: string;
  createdAt: string;
  editedAt: string | null;
  attachments?: DmAttachment[];
  reactions?: Array<{ emoji: string; count: number; me: boolean }>;
}

export function getDmChannels(): Promise<{ channels: DmChannel[] }> {
  return request("/api/dms");
}

export function openDm(userId: string): Promise<{ channelId: string }> {
  return request("/api/dms/open", { method: "POST", body: JSON.stringify({ userId }) });
}

export function getDmMessages(channelId: string): Promise<{ messages: DmMessage[] }> {
  return request(`/api/dms/${channelId}/messages`);
}

export function sendDmMessage(
  channelId: string,
  content: string,
  attachmentIds?: string[],
): Promise<{ message: DmMessage }> {
  return request(`/api/dms/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, attachmentIds }),
  });
}

export function editDmMessage(
  channelId: string,
  messageId: string,
  content: string,
): Promise<{ message: DmMessage }> {
  return request(`/api/dms/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export function deleteDmMessage(channelId: string, messageId: string): Promise<{ ok: boolean }> {
  return request(`/api/dms/${channelId}/messages/${messageId}`, { method: "DELETE" });
}

export async function uploadDmAttachment(
  channelId: string,
  file: File,
): Promise<{ attachment: DmAttachment }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`/api/dms/${channelId}/attachments`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error((data as ApiError).error ?? "Upload failed.");
  return data as { attachment: DmAttachment };
}

export function createGroupDm(payload: {
  userIds: string[];
  name?: string;
}): Promise<{ channelId: string; isGroup: boolean; name: string | null }> {
  return request("/api/dms/group", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface SearchResult {
  messageId: string;
  channelId: string;
  channelName: string;
  content: string;
  createdAt: string;
  threadRootId?: string | null;
  author: { username: string; displayName: string };
}

export interface ForumSearchResult {
  postId: string;
  channelId: string;
  channelName: string;
  title: string;
  content: string;
  createdAt: string;
  author: { username: string; displayName: string };
}

export function searchMessages(
  serverId: string,
  q: string,
): Promise<{ results: SearchResult[]; forumPosts?: ForumSearchResult[] }> {
  return request(`/api/servers/${serverId}/search?q=${encodeURIComponent(q)}`);
}

export interface ForumPost {
  id: string;
  channelId: string;
  serverId: string;
  title: string;
  content: string;
  pinned: boolean;
  locked: boolean;
  createdAt: string;
  commentCount: number;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface ForumComment {
  id: string;
  postId: string;
  content: string;
  createdAt: string;
  author: { id: string; username: string; displayName: string };
}

export function getForumPosts(
  serverId: string,
  channelId: string,
): Promise<{ posts: ForumPost[] }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/forum/posts`);
}

export function createForumPost(
  serverId: string,
  channelId: string,
  payload: { title: string; content: string },
): Promise<{ post: ForumPost }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/forum/posts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getForumComments(
  serverId: string,
  channelId: string,
  postId: string,
): Promise<{ comments: ForumComment[] }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/forum/posts/${postId}/comments`);
}

export function createForumComment(
  serverId: string,
  channelId: string,
  postId: string,
  content: string,
): Promise<{ comment: ForumComment }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/forum/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function reportContent(
  serverId: string,
  payload: { targetType: "message" | "user"; targetId: string; reason: string },
): Promise<{ ok: boolean; reportId: string }> {
  return request(`/api/servers/${serverId}/reports`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ModerationReport {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
  reporterUsername: string;
}

export function getModerationReports(serverId: string): Promise<{ reports: ModerationReport[] }> {
  return request(`/api/servers/${serverId}/reports`);
}

export function updateReportStatus(
  serverId: string,
  reportId: string,
  status: "resolved" | "dismissed",
): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/reports/${reportId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export interface ServerInvite {
  id: string;
  code: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
  creatorUsername: string;
}

export function getServerInvites(serverId: string): Promise<{ invites: ServerInvite[] }> {
  return request(`/api/servers/${serverId}/invites`);
}

export function createServerInvite(
  serverId: string,
  payload?: { maxUses?: number | null; expiresInHours?: number | null },
): Promise<{ invite: { id: string; code: string; maxUses: number | null; expiresAt: string | null } }> {
  return request(`/api/servers/${serverId}/invites`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export function deleteServerInvite(serverId: string, inviteId: string): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/invites/${inviteId}`, { method: "DELETE" });
}

export interface AutomodRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: string;
  action: string;
  config: Record<string, unknown>;
  createdAt: string;
}

export function getAutomodRules(serverId: string): Promise<{ rules: AutomodRule[] }> {
  return request(`/api/servers/${serverId}/automod`);
}

export function createAutomodRule(
  serverId: string,
  payload: { name: string; triggerType: string; action: string; config?: Record<string, unknown> },
): Promise<{ ok: boolean; ruleId: string }> {
  return request(`/api/servers/${serverId}/automod`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteAutomodRule(serverId: string, ruleId: string): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/automod/${ruleId}`, { method: "DELETE" });
}

export function getServerRules(serverId: string): Promise<{
  rulesText: string;
  requireAcceptance: boolean;
  accepted: boolean;
}> {
  return request(`/api/servers/${serverId}/rules`);
}

export function acceptServerRules(serverId: string): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/rules/accept`, { method: "POST" });
}

export function updateServerRules(
  serverId: string,
  payload: { rulesText?: string; requireAcceptance?: boolean },
): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/rules`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export interface ChannelCategory {
  id: string;
  name: string;
  position: number;
}

export function getChannelCategories(serverId: string): Promise<{ categories: ChannelCategory[] }> {
  return request(`/api/servers/${serverId}/categories`);
}

export function createChannelCategory(
  serverId: string,
  name: string,
): Promise<{ category: ChannelCategory }> {
  return request(`/api/servers/${serverId}/categories`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function moderateVoicePeer(
  serverId: string,
  channelId: string,
  userId: string,
  payload: { serverMuted?: boolean; serverDeafened?: boolean },
): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/voice/moderate`, {
    method: "POST",
    body: JSON.stringify({ userId, ...payload }),
  });
}

export function sendVoiceInvite(
  serverId: string,
  channelId: string,
  userId: string,
): Promise<{ ok: boolean; inviteId: string; alreadySent?: boolean }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/voice/invite`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function moveVoiceMember(
  serverId: string,
  channelId: string,
  userId: string,
  targetChannelId: string,
): Promise<{ ok: boolean; targetChannelId: string }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/voice/move`, {
    method: "POST",
    body: JSON.stringify({ userId, targetChannelId }),
  });
}

export interface EmbedPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

export function getEmbedPreview(url: string): Promise<{ embed: EmbedPreview }> {
  return request(`/api/embed-preview?url=${encodeURIComponent(url)}`);
}

export function updateThreadSettings(
  serverId: string,
  channelId: string,
  messageId: string,
  payload: { archived?: boolean; locked?: boolean },
): Promise<{ messageId: string; threadArchived: boolean; threadLocked: boolean }> {
  return request(
    `/api/servers/${serverId}/channels/${channelId}/messages/${messageId}/thread`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export type NotificationLevel = "inherit" | "all" | "mentions" | "nothing";

export function getChannelNotifications(
  serverId: string,
  channelId: string,
): Promise<{ level: NotificationLevel }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/notifications`);
}

export function setChannelNotifications(
  serverId: string,
  channelId: string,
  level: NotificationLevel,
): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/notifications`, {
    method: "PATCH",
    body: JSON.stringify({ level }),
  });
}

export interface ChannelOverwrite {
  id: string;
  channelId: string;
  targetType: "role" | "member";
  targetId: string;
  allow: RolePermissions;
  deny: RolePermissions;
}

export function getChannelOverwrites(
  serverId: string,
  channelId: string,
): Promise<{ overwrites: ChannelOverwrite[] }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/overwrites`);
}

export function setChannelOverwrite(
  serverId: string,
  channelId: string,
  payload: {
    targetType: "role" | "member";
    targetId: string;
    allow?: RolePermissions;
    deny?: RolePermissions;
  },
): Promise<{ ok: boolean; id: string }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/overwrites`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteChannelOverwrite(
  serverId: string,
  channelId: string,
  overwriteId: string,
): Promise<{ ok: boolean }> {
  return request(
    `/api/servers/${serverId}/channels/${channelId}/overwrites/${overwriteId}`,
    { method: "DELETE" },
  );
}

export function updateChannelCategory(
  serverId: string,
  categoryId: string,
  payload: { name?: string; position?: number },
): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteChannelCategory(
  serverId: string,
  categoryId: string,
): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/categories/${categoryId}`, { method: "DELETE" });
}

export interface ServerEmoji {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export function getServerEmojis(serverId: string): Promise<{ emojis: ServerEmoji[] }> {
  return request(`/api/servers/${serverId}/emojis`);
}

export async function uploadServerEmoji(
  serverId: string,
  name: string,
  file: File,
): Promise<{ emoji: ServerEmoji }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);
  const response = await fetch(`/api/servers/${serverId}/emojis`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error((data as ApiError).error ?? "Upload failed.");
  return data as { emoji: ServerEmoji };
}

export function deleteServerEmoji(serverId: string, emojiId: string): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/emojis/${emojiId}`, { method: "DELETE" });
}

export interface ServerSticker {
  id: string;
  name: string;
  description: string;
  url: string;
  createdAt: string;
}

export function getServerStickers(serverId: string): Promise<{ stickers: ServerSticker[] }> {
  return request(`/api/servers/${serverId}/stickers`);
}

export async function uploadServerSticker(
  serverId: string,
  name: string,
  file: File,
  description?: string,
): Promise<{ sticker: ServerSticker }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);
  if (description) formData.append("description", description);
  const response = await fetch(`/api/servers/${serverId}/stickers`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error((data as ApiError).error ?? "Upload failed.");
  return data as { sticker: ServerSticker };
}

export function deleteServerSticker(serverId: string, stickerId: string): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/stickers/${stickerId}`, { method: "DELETE" });
}

export interface ChannelWebhook {
  id: string;
  channelId: string;
  channelName: string;
  name: string;
  createdAt: string;
}

export function getChannelWebhooks(serverId: string): Promise<{ webhooks: ChannelWebhook[] }> {
  return request(`/api/servers/${serverId}/webhooks`);
}

export function createChannelWebhook(
  serverId: string,
  channelId: string,
  name: string,
): Promise<{ webhook: { id: string; name: string; token: string; url: string } }> {
  return request(`/api/servers/${serverId}/channels/${channelId}/webhooks`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteChannelWebhook(serverId: string, webhookId: string): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/webhooks/${webhookId}`, { method: "DELETE" });
}

export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  responseText: string;
  createdAt: string;
}

export function getSlashCommands(serverId: string): Promise<{ commands: SlashCommand[] }> {
  return request(`/api/servers/${serverId}/commands`);
}

export function createSlashCommand(
  serverId: string,
  payload: { name: string; description?: string; responseText: string },
): Promise<{ ok: boolean; commandId: string }> {
  return request(`/api/servers/${serverId}/commands`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteSlashCommand(serverId: string, commandId: string): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/commands/${commandId}`, { method: "DELETE" });
}

export interface ServerFolder {
  id: string;
  name: string;
  position: number;
  color: string;
  serverIds: string[];
}

export function getServerFolders(): Promise<{ folders: ServerFolder[] }> {
  return request("/api/server-folders");
}

export function createServerFolder(
  name: string,
  color?: string,
): Promise<{ folder: { id: string; name: string } }> {
  return request("/api/server-folders", {
    method: "POST",
    body: JSON.stringify({ name, color }),
  });
}

export function updateServerFolder(
  folderId: string,
  payload: { name?: string; color?: string; serverIds?: string[] },
): Promise<{ ok: boolean }> {
  return request(`/api/server-folders/${folderId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteServerFolder(folderId: string): Promise<{ ok: boolean }> {
  return request(`/api/server-folders/${folderId}`, { method: "DELETE" });
}

export function addDmReaction(
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<{ ok: boolean }> {
  return request(`/api/dms/${channelId}/messages/${messageId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
}

export function removeDmReaction(
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<{ ok: boolean }> {
  return request(
    `/api/dms/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    { method: "DELETE" },
  );
}

export function updateMyActivity(payload: {
  activityType?: string | null;
  activityName?: string | null;
  status?: PresenceStatus;
  customStatus?: string | null;
}): Promise<{ ok: boolean }> {
  return request("/api/presence/me/activity", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export interface BotApplication {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export function getApplications(): Promise<{ applications: BotApplication[] }> {
  return request("/api/applications");
}

export function createApplication(
  name: string,
  description?: string,
): Promise<{
  application: { id: string; name: string; description: string };
  token: string;
  botUserId: string;
}> {
  return request("/api/applications", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export function regenerateBotToken(appId: string): Promise<{ token: string }> {
  return request(`/api/applications/${appId}/token/regenerate`, { method: "POST" });
}

export interface InstalledBot {
  applicationId: string;
  name: string;
  description: string;
  botUserId: string;
  username: string;
  installedAt: string;
}

export function getServerBots(serverId: string): Promise<{ bots: InstalledBot[] }> {
  return request(`/api/servers/${serverId}/bots`);
}

export function installBot(
  serverId: string,
  appId: string,
): Promise<{ ok: boolean; botUserId: string }> {
  return request(`/api/servers/${serverId}/bots/${appId}/install`, { method: "POST" });
}

export function removeBot(serverId: string, appId: string): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/bots/${appId}`, { method: "DELETE" });
}

export function getOAuthStatus(): Promise<{ github: boolean; google: boolean }> {
  return request("/api/auth/oauth/status");
}

export function subscribePush(payload: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ ok: boolean }> {
  return request("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function unsubscribePush(endpoint?: string): Promise<{ ok: boolean }> {
  return request("/api/push/subscribe", {
    method: "DELETE",
    body: JSON.stringify(endpoint ? { endpoint } : {}),
  });
}

export interface ServerSound {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export function getServerSounds(serverId: string): Promise<{ sounds: ServerSound[] }> {
  return request(`/api/servers/${serverId}/sounds`);
}

export async function uploadServerSound(
  serverId: string,
  name: string,
  file: File,
): Promise<{ sound: ServerSound }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);
  const response = await fetch(`/api/servers/${serverId}/sounds`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error((data as ApiError).error ?? "Upload failed.");
  return data as { sound: ServerSound };
}

export function deleteServerSound(serverId: string, soundId: string): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/sounds/${soundId}`, { method: "DELETE" });
}

export interface ServerBoosts {
  boostCount: number;
  boostLevel: number;
  meBoosted: boolean;
  perks: {
    uploadLimitMb: number;
    emojiSlots: number;
    soundboardSlots: number;
  };
}

export function getServerBoosts(serverId: string): Promise<ServerBoosts> {
  return request(`/api/servers/${serverId}/boosts`);
}

export function boostServer(
  serverId: string,
): Promise<{ ok: boolean; boostCount: number; boostLevel: number }> {
  return request(`/api/servers/${serverId}/boosts`, { method: "POST" });
}

export function unboostServer(
  serverId: string,
): Promise<{ ok: boolean; boostCount: number; boostLevel: number }> {
  return request(`/api/servers/${serverId}/boosts`, { method: "DELETE" });
}

export interface ActivitySession {
  id: string;
  channelId: string | null;
  type: string;
  name: string;
  startedAt: string;
  metadata?: string;
  host: { username: string; displayName: string };
}

export function getActivities(serverId: string): Promise<{ activities: ActivitySession[] }> {
  return request(`/api/servers/${serverId}/activities`);
}

export function startActivity(
  serverId: string,
  payload: { channelId?: string | null; type?: string; name?: string },
): Promise<{ activity: { id: string } }> {
  return request(`/api/servers/${serverId}/activities`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function endActivity(serverId: string, activityId: string): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/activities/${activityId}`, { method: "DELETE" });
}

export function updateActivityMetadata(
  serverId: string,
  activityId: string,
  metadata: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return request(`/api/servers/${serverId}/activities/${activityId}`, {
    method: "PATCH",
    body: JSON.stringify({ metadata }),
  });
}
