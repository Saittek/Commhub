import { serverInitials } from "../lib/avatar";

interface ServerIconProps {
  serverName: string;
  iconUrl?: string | null;
  className?: string;
  size?: "dial" | "dial-sm" | "settings";
}

export default function ServerIcon({
  serverName,
  iconUrl,
  className = "",
  size = "dial",
}: ServerIconProps) {
  return (
    <div className={`server-icon server-icon-${size}${className ? ` ${className}` : ""}`}>
      {iconUrl ? (
        <img src={iconUrl} alt="" className="server-icon-image" />
      ) : (
        <span className="server-icon-initials" aria-hidden="true">
          {serverInitials(serverName)}
        </span>
      )}
    </div>
  );
}
