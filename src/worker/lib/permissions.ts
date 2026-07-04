export type PermissionKey =
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
  | "move_members";

export type RolePermissions = Partial<Record<PermissionKey, boolean>>;

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "general",
    label: "General Permissions",
    permissions: [
      {
        key: "administrator",
        label: "Administrator",
        description: "Members with this permission have every permission and bypass channel restrictions.",
      },
      {
        key: "manage_server",
        label: "Manage Server",
        description: "Allows changing server name, region, and other server settings.",
      },
      {
        key: "manage_roles",
        label: "Manage Roles",
        description: "Allows creating, editing, and assigning roles below this role's position.",
      },
      {
        key: "manage_channels",
        label: "Manage Channels",
        description: "Allows creating, editing, and deleting channels.",
      },
      {
        key: "view_audit_log",
        label: "View Audit Log",
        description: "Allows viewing a record of important server events.",
      },
    ],
  },
  {
    id: "membership",
    label: "Membership Permissions",
    permissions: [
      {
        key: "kick_members",
        label: "Kick Members",
        description: "Allows removing members from the server.",
      },
      {
        key: "ban_members",
        label: "Ban Members",
        description: "Allows permanently banning members from the server.",
      },
      {
        key: "create_invite",
        label: "Create Invite",
        description: "Allows members to invite others to this server.",
      },
      {
        key: "manage_nicknames",
        label: "Manage Nicknames",
        description: "Allows changing other members' display names.",
      },
    ],
  },
  {
    id: "text",
    label: "Text Channel Permissions",
    permissions: [
      {
        key: "send_messages",
        label: "Send Messages",
        description: "Allows sending messages in text channels.",
      },
      {
        key: "manage_messages",
        label: "Manage Messages",
        description: "Allows deleting and pinning messages from other members.",
      },
      {
        key: "mention_everyone",
        label: "Mention @everyone",
        description: "Allows using @everyone and @here in messages.",
      },
      {
        key: "attach_files",
        label: "Attach Files",
        description: "Allows uploading images and files in text channels.",
      },
    ],
  },
  {
    id: "voice",
    label: "Voice Channel Permissions",
    permissions: [
      {
        key: "connect_voice",
        label: "Connect",
        description: "Allows joining voice channels.",
      },
      {
        key: "speak_voice",
        label: "Speak",
        description: "Allows talking in voice channels.",
      },
      {
        key: "mute_members",
        label: "Mute Members",
        description: "Allows muting other members in voice channels.",
      },
      {
        key: "deafen_members",
        label: "Deafen Members",
        description: "Allows deafening other members in voice channels.",
      },
      {
        key: "move_members",
        label: "Move Members",
        description: "Allows dragging members between voice channels.",
      },
    ],
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.key),
);

export const DEFAULT_EVERYONE_PERMISSIONS: RolePermissions = {
  send_messages: true,
  connect_voice: true,
  speak_voice: true,
  create_invite: true,
  attach_files: true,
};

export const FULL_PERMISSIONS: RolePermissions = Object.fromEntries(
  ALL_PERMISSION_KEYS.map((key) => [key, true]),
) as RolePermissions;

export function parsePermissions(raw: string): RolePermissions {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const result: RolePermissions = {};
    for (const key of ALL_PERMISSION_KEYS) {
      if (key in parsed && (parsed as Record<string, unknown>)[key] === true) {
        result[key] = true;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function serializePermissions(permissions: RolePermissions): string {
  const cleaned: RolePermissions = {};
  for (const key of ALL_PERMISSION_KEYS) {
    if (permissions[key]) {
      cleaned[key] = true;
    }
  }
  return JSON.stringify(cleaned);
}

export function hasPermission(
  permissions: RolePermissions,
  key: PermissionKey,
): boolean {
  return permissions.administrator === true || permissions[key] === true;
}

export function mergePermissions(roles: RolePermissions[]): RolePermissions {
  const merged: RolePermissions = {};
  for (const role of roles) {
    if (role.administrator) {
      return { ...FULL_PERMISSIONS };
    }
    for (const key of ALL_PERMISSION_KEYS) {
      if (role[key]) {
        merged[key] = true;
      }
    }
  }
  return merged;
}
