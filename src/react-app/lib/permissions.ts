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
        description: "Allows creating, editing, and assigning roles.",
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
      { key: "kick_members", label: "Kick Members", description: "Allows removing members from the server." },
      { key: "ban_members", label: "Ban Members", description: "Allows permanently banning members." },
      { key: "create_invite", label: "Create Invite", description: "Allows inviting others to this server." },
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
      { key: "send_messages", label: "Send Messages", description: "Allows sending messages in text channels." },
      {
        key: "manage_messages",
        label: "Manage Messages",
        description: "Allows deleting and pinning messages from other members.",
      },
      {
        key: "mention_everyone",
        label: "Mention @everyone",
        description: "Allows using @everyone and @here.",
      },
      { key: "attach_files", label: "Attach Files", description: "Allows uploading images and files." },
    ],
  },
  {
    id: "voice",
    label: "Voice Channel Permissions",
    permissions: [
      { key: "connect_voice", label: "Connect", description: "Allows joining voice channels." },
      { key: "speak_voice", label: "Speak", description: "Allows talking in voice channels." },
      { key: "mute_members", label: "Mute Members", description: "Allows muting members in voice." },
      { key: "deafen_members", label: "Deafen Members", description: "Allows deafening members in voice." },
      { key: "move_members", label: "Move Members", description: "Allows moving members between voice channels." },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.key),
);
