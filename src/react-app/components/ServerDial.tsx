import { useCallback, useRef, useState, type PointerEvent } from "react";
import CreateServerModal from "./CreateServerModal";
import ServerIcon from "./ServerIcon";
import { PlusIcon } from "./UiIcons";
import type { Server } from "../lib/api";

interface ServerDialProps {
  servers: Server[];
  activeServerId: string | null;
  onSelectServer: (serverId: string) => void;
  onServerCreated: (server: Server) => void;
}

function ServerDialIcon({ server }: { server: Server }) {
  return (
    <span className="server-dial-icon-inner" aria-hidden="true">
      <ServerIcon serverName={server.name} iconUrl={server.iconUrl} size="dial" />
    </span>
  );
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

function distanceFromTop(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360;
  return Math.min(normalized, 360 - normalized);
}

export default function ServerDial({
  servers,
  activeServerId,
  onSelectServer,
  onServerCreated,
}: ServerDialProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    startRotation: 0,
    startAngle: 0,
    moved: false,
  });

  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const activeServer =
    servers.find((server) => server.id === activeServerId) ?? servers[0] ?? null;
  const inactiveServers = servers.filter((server) => server.id !== activeServer?.id);

  const selectFromRotation = useCallback(
    (currentRotation: number) => {
      if (inactiveServers.length === 0) {
        return;
      }

      let bestIndex = 0;
      let bestDistance = Infinity;

      inactiveServers.forEach((_server, index) => {
        const angle = (index / inactiveServers.length) * 360 + currentRotation;
        const distance = distanceFromTop(angle);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      const nextServer = inactiveServers[bestIndex];
      if (nextServer && nextServer.id !== activeServer?.id) {
        onSelectServer(nextServer.id);
      }
      setRotation(0);
    },
    [activeServer?.id, inactiveServers, onSelectServer],
  );

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || inactiveServers.length === 0) {
      return;
    }

    const rect = dialRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    dragRef.current = {
      active: true,
      startRotation: rotation,
      startAngle: pointerAngleDegrees(event.clientX, event.clientY, rect),
      moved: false,
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
    const delta = currentAngle - dragRef.current.startAngle;
    if (Math.abs(delta) > 2) {
      dragRef.current.moved = true;
    }

    setRotation(dragRef.current.startRotation + delta);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) {
      return;
    }

    const rect = dialRef.current?.getBoundingClientRect();
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current.active = false;
    setIsDragging(false);

    if (dragRef.current.moved && rect) {
      const currentAngle = pointerAngleDegrees(event.clientX, event.clientY, rect);
      const delta = currentAngle - dragRef.current.startAngle;
      const finalRotation = dragRef.current.startRotation + delta;
      selectFromRotation(finalRotation);
    }
  }

  if (!activeServer) {
    return null;
  }

  return (
    <div className="server-dial-wrap">
      <div className="server-dial-card">
        <p className="server-dial-label">{activeServer.name}</p>

        <div
          ref={dialRef}
          className={`server-dial ${isDragging ? "dragging" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="listbox"
          aria-label="Server dial"
          aria-activedescendant={`server-option-${activeServer.id}`}
        >
          <div
            id={`server-option-${activeServer.id}`}
            className="server-dial-center"
            title={activeServer.name}
            role="option"
            aria-selected
          >
            <ServerDialIcon server={activeServer} />
          </div>

          {inactiveServers.length > 0 && (
            <div
              className="server-dial-ring"
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              {inactiveServers.map((server, index) => {
                const angle = (index / inactiveServers.length) * 360;
                return (
                  <button
                    key={server.id}
                    type="button"
                    className="server-dial-satellite"
                    title={server.name}
                    role="option"
                    aria-selected={false}
                    style={{ transform: `rotate(${angle}deg) translateY(-78px) rotate(${-angle}deg)` }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onSelectServer(server.id)}
                  >
                    <ServerIcon serverName={server.name} iconUrl={server.iconUrl} size="dial-sm" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {inactiveServers.length > 0 && (
          <p className="server-dial-hint">Spin or click a server to switch</p>
        )}

        <button
          type="button"
          className="server-dial-add-btn"
          onClick={() => setCreateOpen(true)}
          aria-label="Create another server"
          title="Create server"
        >
          <PlusIcon className="server-dial-add-icon" />
        </button>
      </div>

      {createOpen && (
        <CreateServerModal
          onClose={() => setCreateOpen(false)}
          onCreated={onServerCreated}
        />
      )}
    </div>
  );
}
