import { parsePermissions } from "./permissions";

export interface MemberRoleInfo {
  id: string;
  name: string;
  color: string;
  position: number;
  isEveryone: boolean;
  hasAdministrator: boolean;
}

export interface OnlineMemberBase {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOwner: boolean;
}

export interface RankedOnlineMember extends OnlineMemberBase {
  powerScore: number;
  displayRole: { name: string; color: string } | null;
}

const OWNER_POWER_SCORE = 1_000_000;
const ADMINISTRATOR_BONUS = 10_000;

export function rolesForMember(
  userId: string,
  assignments: Array<{ user_id: string; role: MemberRoleInfo }>,
  everyoneRole: MemberRoleInfo | null,
): MemberRoleInfo[] {
  const assigned = assignments
    .filter((row) => row.user_id === userId)
    .map((row) => row.role);

  if (everyoneRole && !assigned.some((role) => role.isEveryone)) {
    return [everyoneRole, ...assigned];
  }

  return assigned;
}

export function computePowerScore(isOwner: boolean, roles: MemberRoleInfo[]): number {
  if (isOwner) {
    return OWNER_POWER_SCORE;
  }

  let score = 0;
  for (const role of roles) {
    if (role.isEveryone) {
      continue;
    }
    score = Math.max(score, role.position);
    if (role.hasAdministrator) {
      score += ADMINISTRATOR_BONUS;
    }
  }

  return score;
}

export function pickDisplayRole(
  roles: MemberRoleInfo[],
  isOwner: boolean,
): { name: string; color: string } | null {
  if (isOwner) {
    const ownerRole = roles.find((role) => role.name === "Owner");
    if (ownerRole) {
      return { name: ownerRole.name, color: ownerRole.color };
    }
    return { name: "Owner", color: "#f1c40f" };
  }

  const ranked = roles
    .filter((role) => !role.isEveryone)
    .sort((a, b) => b.position - a.position);

  const top = ranked[0];
  return top ? { name: top.name, color: top.color } : null;
}

export function rankOnlineMembers(
  members: OnlineMemberBase[],
  assignments: Array<{ user_id: string; role: MemberRoleInfo }>,
  everyoneRole: MemberRoleInfo | null,
  ownerId: string,
): RankedOnlineMember[] {
  return members
    .map((member) => {
      const isOwner = member.userId === ownerId || member.isOwner;
      const roles = rolesForMember(member.userId, assignments, everyoneRole);
      const powerScore = computePowerScore(isOwner, roles);
      const displayRole = pickDisplayRole(roles, isOwner);

      return {
        ...member,
        isOwner,
        powerScore,
        displayRole,
      };
    })
    .sort((left, right) => {
      if (right.powerScore !== left.powerScore) {
        return right.powerScore - left.powerScore;
      }
      return left.username.localeCompare(right.username);
    });
}

export function mapRoleRow(row: {
  id: string;
  name: string;
  color: string;
  position: number;
  permissions: string;
  is_everyone: number;
}): MemberRoleInfo {
  const permissions = parsePermissions(row.permissions);
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    position: row.position,
    isEveryone: row.is_everyone === 1,
    hasAdministrator: Boolean(permissions.administrator),
  };
}
