interface IconProps {
  className?: string;
}

const GEAR_PATH =
  "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.63-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.22-1.14.54-1.63.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.49.4 1.04.72 1.63.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.22 1.14-.54 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58ZM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5Z";

export function GearIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true" className={className}>
      <path fill="currentColor" d={GEAR_PATH} />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true" className={className}>
      <rect x="10" y="4" width="4" height="16" rx="1.25" fill="currentColor" />
      <rect x="4" y="10" width="16" height="4" rx="1.25" fill="currentColor" />
    </svg>
  );
}
