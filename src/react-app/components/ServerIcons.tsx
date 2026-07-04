export function GamepadIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 9h2v2H6V9zm10 0h2v2h-2V9zM8 11h2v2H8v-2zm6 0h2v2h-2v-2zM7.5 14.5c.83 0 1.5-.67 1.5-1.5h-3c0 .83.67 1.5 1.5 1.5zm9 0c.83 0 1.5-.67 1.5-1.5h-3c0 .83.67 1.5 1.5 1.5zM21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 10H4V8h16v8z"
      />
    </svg>
  );
}

export function CommhubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.25" />
      <circle cx="12" cy="12" r="5" fill="currentColor" />
    </svg>
  );
}
