import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import ServerHubModal from "./ServerHubModal";
import ServerIcon from "./ServerIcon";
import { PlusIcon } from "./UiIcons";
import {
  createServerFolder,
  getServerFolders,
  updateServerFolder,
  type Server,
  type ServerFolder,
} from "../lib/api";

interface ServerDialProps {
  servers: Server[];
  activeServerId: string | null;
  onSelectServer: (serverId: string) => void;
  onServerCreated: (server: Server) => void;
  onServerJoined: (server: Server) => void;
}

function pointerAngleDegrees(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

function angleDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > 180) {
    delta -= 360;
  }
  while (delta < -180) {
    delta += 360;
  }
  return delta;
}

function distanceFromTop(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360;
  return Math.min(normalized, 360 - normalized);
}

function serverAtTopIndex(rotation: number, count: number): number {
  let bestIndex = 0;
  let bestDistance = Infinity;

  for (let index = 0; index < count; index++) {
    const angle = (index / count) * 360 + rotation;
    const distance = distanceFromTop(angle);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function rotationForServerAtTop(serverId: string, serverList: Server[]): number {
  const index = serverList.findIndex((server) => server.id === serverId);
  if (index < 0 || serverList.length === 0) {
    return 0;
  }
  return -((index / serverList.length) * 360);
}

function serverIdFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const node = target.closest("[data-server-id]");
  return node?.getAttribute("data-server-id") ?? null;
}

export default function ServerDial({
  servers,
  activeServerId,
  onSelectServer,
  onServerCreated,
  onServerJoined,
}: ServerDialProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const skipAlignRef = useRef(false);
  const dragRef = useRef({
    active: false,
    lastAngle: 0,
    moved: false,
    pressedServerId: null as string | null,
  });

  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [folders, setFolders] = useState<ServerFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const filteredServers =
    activeFolderId === null
      ? servers
      : servers.filter((server) => {
          const folder = folders.find((item) => item.id === activeFolderId);
          return folder?.serverIds.includes(server.id);
        });

  const dialServers = filteredServers.length > 0 ? filteredServers : servers;

  const activeServer =
    dialServers.find((server) => server.id === activeServerId) ?? dialServers[0] ?? servers[0] ?? null;
  const canSpin = dialServers.length > 1;

  useEffect(() => {
    void getServerFolders()
      .then((response) => setFolders(response.folders))
      .catch(() => setFolders([]));
  }, [servers.length]);

  async function handleCreateFolder() {
    const name = window.prompt("Folder name:");
    if (!name?.trim()) return;
    try {
      const response = await createServerFolder(name.trim());
      const folder: ServerFolder = {
        id: response.folder.id,
        name: response.folder.name,
        position: folders.length,
        color: "#14b8a6",
        serverIds: activeServer ? [activeServer.id] : [],
      };
      if (activeServer) {
        await updateServerFolder(folder.id, { serverIds: folder.serverIds });
      }
      setFolders((current) => [...current, folder]);
      setActiveFolderId(folder.id);
    } catch {
      // ignore
    }
  }

  const applyRotation = useCallback((value: number) => {
    rotationRef.current = value;
    setRotation(value);
  }, []);

  const topIndex =
    dialServers.length > 0 ? serverAtTopIndex(rotation, dialServers.length) : -1;
  const topServer = topIndex >= 0 ? dialServers[topIndex] : activeServer;

  useEffect(() => {
    if (skipAlignRef.current || isDragging || !activeServer || dialServers.length < 2) {
      skipAlignRef.current = false;
      return;
    }

    const top = dialServers[serverAtTopIndex(rotationRef.current, dialServers.length)];
    if (top?.id === activeServer.id) {
      return;
    }

    applyRotation(rotationForServerAtTop(activeServer.id, dialServers));
  }, [activeServer, applyRotation, dialServers, isDragging]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !canSpin) {
      return;
    }

    const rect = dialRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    dragRef.current = {
      active: true,
      lastAngle: pointerAngleDegrees(event.clientX, event.clientY, rect),
      moved: false,
      pressedServerId: serverIdFromTarget(event.target),
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) {
      return;
    }

    const rect = dialRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const currentAngle = pointerAngleDegrees(event.clientX, event.clientY, rect);
    const delta = angleDelta(dragRef.current.lastAngle, currentAngle);
    if (Math.abs(delta) > 1) {
      dragRef.current.moved = true;
    }

    dragRef.current.lastAngle = currentAngle;
    applyRotation(rotationRef.current + delta);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);

    const { moved, pressedServerId } = dragRef.current;
    dragRef.current.active = false;
    setIsDragging(false);

    if (moved) {
      const selected = dialServers[serverAtTopIndex(rotationRef.current, dialServers.length)];
      if (selected && selected.id !== activeServer?.id) {
        skipAlignRef.current = true;
        onSelectServer(selected.id);
      }
      return;
    }

    if (pressedServerId && pressedServerId !== activeServer?.id) {
      skipAlignRef.current = true;
      onSelectServer(pressedServerId);
      applyRotation(rotationForServerAtTop(pressedServerId, dialServers));
    }
  }

  function handleFolderBarContextMenu(event: { preventDefault: () => void }) {
    event.preventDefault();
    void handleCreateFolder();
  }

  function handleFolderBarLongPress(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const timer = window.setTimeout(() => void handleCreateFolder(), 600);
    const cleanup = () => window.clearTimeout(timer);
    event.currentTarget.addEventListener("pointerup", cleanup, { once: true });
    event.currentTarget.addEventListener("pointerleave", cleanup, { once: true });
  }

  if (!activeServer || !topServer) {
    return null;
  }

  return (
    <div className="server-dial-wrap">
      {(folders.length > 0 || servers.length > 0) && (
        <div
          className="server-folder-bar"
          onContextMenu={handleFolderBarContextMenu}
          onPointerDown={handleFolderBarLongPress}
          title="Right-click or long-press to create a folder"
        >
          <button
            type="button"
            className={`server-folder-pill${activeFolderId === null ? " active" : ""}`}
            onClick={() => setActiveFolderId(null)}
          >
            All
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className={`server-folder-pill${activeFolderId === folder.id ? " active" : ""}`}
              style={{ "--folder-color": folder.color } as CSSProperties}
              onClick={() => setActiveFolderId(folder.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleCreateFolder();
              }}
            >
              {folder.name}
            </button>
          ))}
        </div>
      )}

      <div
        className={`server-dial-card${canSpin ? " server-dial-card-spin" : ""}${isDragging ? " dragging" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <p className={`server-dial-label${isDragging ? " server-dial-label-preview" : ""}`}>
          {topServer.name}
        </p>

        <div
          ref={dialRef}
          className="server-dial"
          role="listbox"
          aria-label="Server dial"
          aria-activedescendant={`server-option-${topServer.id}`}
        >
          <div
            id={`server-option-${topServer.id}`}
            className="server-dial-center"
            title={topServer.name}
            role="option"
            aria-selected={topServer.id === activeServer.id}
            data-server-id={topServer.id}
          >
            <span className="server-dial-icon-inner" aria-hidden="true">
              <ServerIcon
                serverName={topServer.name}
                iconUrl={topServer.iconUrl}
                size="dial"
              />
            </span>
          </div>

          {canSpin && (
            <div
              className="server-dial-ring"
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              {dialServers.map((server, index) => {
                const angle = (index / dialServers.length) * 360;
                const isAtTop = index === topIndex;
                return (
                  <div
                    key={server.id}
                    className={`server-dial-satellite${isAtTop ? " at-top" : ""}`}
                    title={server.name}
                    role="option"
                    aria-selected={server.id === activeServer.id}
                    data-server-id={server.id}
                    style={{
                      transform: `rotate(${angle}deg) translateY(-78px) rotate(${-angle - rotation}deg)`,
                    }}
                  >
                    <span className="server-dial-icon-inner" aria-hidden="true">
                      <ServerIcon
                        serverName={server.name}
                        iconUrl={server.iconUrl}
                        size="dial-sm"
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {canSpin && (
          <p className="server-dial-hint">Spin or click a server to switch</p>
        )}

        <button
          type="button"
          className="server-dial-add-btn"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setHubOpen(true)}
          aria-label="Create or join a server"
          title="Create or join server"
        >
          <PlusIcon className="server-dial-add-icon" />
        </button>
      </div>

      {hubOpen && (
        <ServerHubModal
          onClose={() => setHubOpen(false)}
          onServerCreated={onServerCreated}
          onServerJoined={onServerJoined}
        />
      )}
    </div>
  );
}
