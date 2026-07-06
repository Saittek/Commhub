import { useEffect, useRef, useState } from "react";
import { QUICK_REACTIONS } from "../lib/message-format";

export interface EmojiPickerEmoji {
  name: string;
  url: string;
}

interface EmojiPickerProps {
  emojis: EmojiPickerEmoji[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}

function EmojiIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="9" cy="10" r="1.25" fill="currentColor" />
      <circle cx="15" cy="10" r="1.25" fill="currentColor" />
      <path
        d="M8.25 14.25c1.1 1.35 2.45 2.1 3.75 2.1s2.65-.75 3.75-2.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function EmojiPicker({ emojis, onSelect, disabled }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node) || !wrapRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function handleSelect(value: string) {
    onSelect(value);
    setOpen(false);
  }

  return (
    <div className="emoji-picker-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`emoji-picker-trigger${open ? " active" : ""}`}
        title="Insert emoji"
        aria-label="Insert emoji"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <EmojiIcon />
      </button>
      {open && (
        <div className="emoji-picker-popover" role="menu">
          <div className="emoji-picker-section">
            <span className="emoji-picker-label">Quick</span>
            <div className="emoji-picker-grid">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="emoji-picker-item"
                  role="menuitem"
                  onClick={() => handleSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          {emojis.length > 0 && (
            <div className="emoji-picker-section">
              <span className="emoji-picker-label">Server</span>
              <div className="emoji-picker-grid">
                {emojis.map((emoji) => (
                  <button
                    key={emoji.name}
                    type="button"
                    className="emoji-picker-item emoji-picker-item-custom"
                    role="menuitem"
                    title={`:${emoji.name}:`}
                    onClick={() => handleSelect(`:${emoji.name}:`)}
                  >
                    <img src={emoji.url} alt={`:${emoji.name}:`} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
