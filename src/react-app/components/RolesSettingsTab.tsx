import { useEffect, useMemo, useState } from "react";
import {
  assignMemberRole,
  createRole,
  deleteRole,
  getServerRoles,
  removeMemberRole,
  updateRole,
  type ServerMember,
  type ServerRole,
} from "../lib/api";
import { PERMISSION_GROUPS, type PermissionKey, type RolePermissions } from "../lib/permissions";

interface RolesSettingsTabProps {
  serverId: string;
  members: ServerMember[];
}

const ROLE_COLORS = [
  "#99aab5",
  "#14b8a6",
  "#57f287",
  "#fee75c",
  "#ed4245",
  "#eb459e",
  "#f1c40f",
  "#e67e22",
  "#1abc9c",
  "#9b59b6",
];

function emptyPermissions(): RolePermissions {
  return {};
}

export default function RolesSettingsTab({
  serverId,
  members,
}: RolesSettingsTabProps) {
  const [roles, setRoles] = useState<ServerRole[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#14b8a6");
  const [permissions, setPermissions] = useState<RolePermissions>(emptyPermissions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [memberToAdd, setMemberToAdd] = useState("");

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;

  const membersWithRole = useMemo(() => {
    if (!selectedRole) {
      return [];
    }
    return members.filter((member) => selectedRole.memberIds.includes(member.userId));
  }, [members, selectedRole]);

  const membersWithoutRole = useMemo(() => {
    if (!selectedRole) {
      return [];
    }
    return members.filter((member) => !selectedRole.memberIds.includes(member.userId));
  }, [members, selectedRole]);

  async function loadRoles(preferredId?: string) {
    setLoading(true);
    setError(null);

    try {
      const response = await getServerRoles(serverId);
      setRoles(response.roles);
      setCanManage(response.canManage);

      const nextId =
        preferredId && response.roles.some((role) => role.id === preferredId)
          ? preferredId
          : response.roles[0]?.id ?? null;

      setSelectedRoleId(nextId);
      const nextRole = response.roles.find((role) => role.id === nextId);
      if (nextRole) {
        setName(nextRole.name);
        setColor(nextRole.color);
        setPermissions(nextRole.permissions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load roles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRoles();
  }, [serverId]);

  function selectRole(role: ServerRole) {
    setSelectedRoleId(role.id);
    setName(role.name);
    setColor(role.color);
    setPermissions(role.permissions);
    setError(null);
    setMessage(null);
    setMemberToAdd("");
  }

  function togglePermission(key: PermissionKey) {
    if (!canManage || (selectedRole?.isManaged && !selectedRole.isEveryone)) {
      return;
    }

    setPermissions((current) => {
      if (key === "administrator") {
        const next = !current.administrator;
        return next ? { administrator: true } : { ...current, administrator: false };
      }

      if (current.administrator) {
        return current;
      }

      return { ...current, [key]: !current[key] };
    });
  }

  async function handleMoveRole(roleId: string, direction: "up" | "down") {
    const index = roles.findIndex((r) => r.id === roleId);
    if (index < 0) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= roles.length) return;
    const role = roles[index];
    const swapRole = roles[swapIndex];
    if (role.isEveryone || role.isManaged || swapRole.isEveryone || swapRole.isManaged) return;

    setSaving(true);
    try {
      await updateRole(serverId, role.id, { position: swapRole.position });
      await updateRole(serverId, swapRole.id, { position: role.position });
      await loadRoles(role.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder roles.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRole() {
    if (!canManage) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await createRole(serverId, {
        name: "New Role",
        color: "#14b8a6",
        permissions: {},
      });
      await loadRoles(response.role.id);
      setMessage("Role created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRole() {
    if (!canManage || !selectedRole) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await updateRole(serverId, selectedRole.id, {
        name:
          selectedRole.isEveryone || selectedRole.isManaged ? undefined : name,
        color,
        permissions,
      });
      setRoles((current) =>
        current.map((role) => (role.id === response.role.id ? response.role : role)),
      );
      selectRole(response.role);
      setMessage("Role saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRole() {
    if (!canManage || !selectedRole || selectedRole.isEveryone || selectedRole.isManaged) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await deleteRole(serverId, selectedRole.id);
      await loadRoles();
      setMessage("Role deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignMember(userId: string) {
    if (!canManage || !selectedRole || !userId) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await assignMemberRole(serverId, userId, selectedRole.id);
      await loadRoles(selectedRole.id);
      setMemberToAdd("");
      setMessage("Role assigned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!canManage || !selectedRole) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await removeMemberRole(serverId, userId, selectedRole.id);
      await loadRoles(selectedRole.id);
      setMessage("Role removed from member.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove role.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="settings-muted">Loading roles...</p>;
  }

  return (
    <div className="roles-settings">
      <div className="roles-settings-header">
        <div>
          <h3>Roles</h3>
          <p className="settings-muted">
            Create roles and assign permissions like Discord or TeamSpeak.
          </p>
        </div>
        {canManage && (
          <button type="button" className="secondary-button" onClick={() => void handleCreateRole()} disabled={saving}>
            + Create Role
          </button>
        )}
      </div>

      {error && <div className="settings-error">{error}</div>}
      {message && <div className="settings-success">{message}</div>}

      <div className="roles-layout">
        <div className="roles-list">
          {roles.map((role, index) => (
            <div key={role.id} className="role-list-item-wrap">
              <button
                type="button"
                className={selectedRoleId === role.id ? "role-list-item active" : "role-list-item"}
                onClick={() => selectRole(role)}
              >
                <span className="role-color-dot" style={{ backgroundColor: role.color }} />
                <span className="role-list-name">{role.name}</span>
                <span className="role-list-count">{role.memberCount}</span>
              </button>
              {canManage && !role.isEveryone && !role.isManaged && (
                <div className="role-reorder-btns">
                  <button type="button" disabled={index === 0 || saving} onClick={() => void handleMoveRole(role.id, "up")}>↑</button>
                  <button type="button" disabled={index === roles.length - 1 || saving} onClick={() => void handleMoveRole(role.id, "down")}>↓</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {selectedRole && (
          <div className="role-editor">
            <div className="role-editor-header">
              <span className="role-color-dot large" style={{ backgroundColor: color }} />
              {selectedRole.isEveryone || (selectedRole.isManaged && selectedRole.name === "Owner") ? (
                <strong>{selectedRole.name}</strong>
              ) : (
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!canManage || saving}
                  maxLength={32}
                />
              )}
            </div>

            <label className="role-color-label">
              Role Color
              <div className="role-color-picker">
                {ROLE_COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className={color === swatch ? "role-swatch active" : "role-swatch"}
                    style={{ backgroundColor: swatch }}
                    onClick={() => setColor(swatch)}
                    disabled={!canManage || saving}
                    aria-label={`Color ${swatch}`}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  disabled={!canManage || saving}
                />
              </div>
            </label>

            <div className="role-permissions">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.id} className="permission-group">
                  <h4>{group.label}</h4>
                  <div className="permission-list">
                    {group.permissions.map((permission) => (
                      <label key={permission.key} className="permission-item">
                        <input
                          type="checkbox"
                          checked={
                            permissions.administrator === true || permissions[permission.key] === true
                          }
                          onChange={() => togglePermission(permission.key)}
                          disabled={
                            !canManage ||
                            saving ||
                            (selectedRole.isManaged && !selectedRole.isEveryone) ||
                            (permissions.administrator && permission.key !== "administrator")
                          }
                        />
                        <span>
                          <strong>{permission.label}</strong>
                          <small>{permission.description}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="role-members-section">
              <h4>Members with this role</h4>
              <div className="role-member-list">
                {membersWithRole.length === 0 ? (
                  <p className="settings-muted">No members have this role yet.</p>
                ) : (
                  membersWithRole.map((member) => (
                    <div key={member.userId} className="role-member-row">
                      <span>
                        {member.nickname || member.displayName}
                        <small>@{member.username}</small>
                      </span>
                      {canManage && !selectedRole.isEveryone && !(selectedRole.isManaged && member.isOwner) && (
                        <button
                          type="button"
                          className="channel-create-cancel"
                          onClick={() => void handleRemoveMember(member.userId)}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {canManage && !selectedRole.isEveryone && (
                <div className="role-assign-row">
                  <select
                    value={memberToAdd}
                    onChange={(event) => setMemberToAdd(event.target.value)}
                    disabled={saving || membersWithoutRole.length === 0}
                  >
                    <option value="">Add member...</option>
                    {membersWithoutRole.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName} (@{member.username})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handleAssignMember(memberToAdd)}
                    disabled={saving || !memberToAdd}
                  >
                    Assign
                  </button>
                </div>
              )}
            </div>

            {canManage && (
              <div className="role-editor-actions">
                <button type="button" onClick={() => void handleSaveRole()} disabled={saving}>
                  {saving ? "Saving..." : "Save Role"}
                </button>
                {!selectedRole.isEveryone && !selectedRole.isManaged && (
                  <button
                    type="button"
                    className="danger-button subtle"
                    onClick={() => void handleDeleteRole()}
                    disabled={saving}
                  >
                    Delete Role
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
