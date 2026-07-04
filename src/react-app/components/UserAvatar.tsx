interface UserAvatarProps {
  username: string;
  avatarUrl: string | null;
  className?: string;
  size?: "sidebar" | "profile";
}

function initialsFor(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

export default function UserAvatar({
  username,
  avatarUrl,
  className = "",
  size = "sidebar",
}: UserAvatarProps) {
  return (
    <div className={`user-avatar user-avatar-${size}${className ? ` ${className}` : ""}`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="user-avatar-image" />
      ) : (
        <span className="user-avatar-initials" aria-hidden="true">
          {initialsFor(username)}
        </span>
      )}
    </div>
  );
}
