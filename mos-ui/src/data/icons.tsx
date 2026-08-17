import type React from 'react';

const iconSvgs: Record<string, React.ReactNode> = {
  'file-manager': (
    <svg viewBox="0 0 64 64" fill="none" className="icon-svg-full">
      <rect
        x="6" y="10" width="52" height="42" rx="3"
        fill="#F7C948" stroke="#D4A017" strokeWidth="1.5"
      />
      <rect x="6" y="10" width="22" height="8" rx="3" fill="#FADB6B" />
      <rect x="6" y="18" width="22" height="2" fill="#F7C948" />
    </svg>
  ),

  'recycle-bin': (
    <svg viewBox="0 0 64 64" fill="none" className="icon-svg-full">
      <path
        d="M14 22 L16 54 C16 56 18 58 20 58 L44 58 C46 58 48 56 48 54 L50 22 Z"
        fill="#8899AA" stroke="#667788" strokeWidth="1.5"
      />
      <rect
        x="10" y="16" width="44" height="6" rx="2"
        fill="#99AABB" stroke="#778899" strokeWidth="1.5"
      />
      <rect
        x="26" y="12" width="12" height="6" rx="3"
        fill="#8899AA" stroke="#667788" strokeWidth="1"
      />
      <line x1="24" y1="26" x2="24" y2="52" stroke="#778899" strokeWidth="1" opacity="0.6" />
      <line x1="32" y1="26" x2="32" y2="52" stroke="#778899" strokeWidth="1" opacity="0.6" />
      <line x1="40" y1="26" x2="40" y2="52" stroke="#778899" strokeWidth="1" opacity="0.6" />
      <path
        d="M28 38 L32 34 L36 38 M32 34 L32 44"
        stroke="#DDEEFF" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.8"
      />
      <path
        d="M36 38 L32 34 L34 42"
        stroke="#DDEEFF" strokeWidth="1.2"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.5"
      />
    </svg>
  ),

  file: (
    <svg viewBox="0 0 64 64" fill="none" className="icon-svg-full">
      <path
        d="M16 6h22l14 14v36a2 2 0 01-2 2H16a2 2 0 01-2-2V8a2 2 0 012-2z"
        fill="#6b7280" stroke="#4b5563" strokeWidth="1.5"
      />
      <path d="M38 6v14h14" fill="none" stroke="#4b5563" strokeWidth="1.5" />
      <line x1="20" y1="30" x2="36" y2="30" stroke="#9ca3af" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="20" y1="36" x2="40" y2="36" stroke="#9ca3af" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="20" y1="42" x2="34" y2="42" stroke="#9ca3af" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),

  minio: (
    <svg viewBox="0 0 64 64" fill="none" className="icon-svg-full">
      <rect x="8" y="12" width="48" height="36" rx="3" stroke="#9ca3af" strokeWidth="2" fill="none" />
      <path d="M8 24h48M8 36h48" stroke="#9ca3af" strokeWidth="2" />
      <circle cx="22" cy="20" r="1.5" fill="#9ca3af" />
      <circle cx="28" cy="20" r="1.5" fill="#9ca3af" />
      <circle cx="34" cy="20" r="1.5" fill="#9ca3af" />
    </svg>
  ),

  settings: (
    <svg viewBox="0 0 64 64" fill="none" className="icon-svg-full">
      <path
        d="M32 40a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
        stroke="#9ca3af" strokeWidth="2.5" fill="none"
      />
      <path
        d="M51.7 40a4.4 4.4 0 0 0 .88 4.85l.16.16a5.33 5.33 0 1 1-7.54 7.54l-.16-.16a4.4 4.4 0 0 0-4.85-.88 4.4 4.4 0 0 0-2.67 4.03V56a5.33 5.33 0 0 1-10.66 0v-.24a4.4 4.4 0 0 0-2.67-4.03 4.4 4.4 0 0 0-4.85.88l-.16.16a5.33 5.33 0 1 1-7.54-7.54l.16-.16A4.4 4.4 0 0 0 12.46 40a4.4 4.4 0 0 0-4.03-2.67H8a5.33 5.33 0 0 1 0-10.66h.24a4.4 4.4 0 0 0 4.03-2.67 4.4 4.4 0 0 0-.88-4.85l-.16-.16a5.33 5.33 0 1 1 7.54-7.54l.16.16A4.4 4.4 0 0 0 24 12.46a4.4 4.4 0 0 0 2.67-4.03V8a5.33 5.33 0 0 1 10.66 0v.24a4.4 4.4 0 0 0 2.67 4.03 4.4 4.4 0 0 0 4.85-.88l.16-.16a5.33 5.33 0 1 1 7.54 7.54l-.16.16A4.4 4.4 0 0 0 51.7 24a4.4 4.4 0 0 0 4.03 2.67H56a5.33 5.33 0 0 1 0 10.66h-.24a4.4 4.4 0 0 0-4.03 2.67Z"
        stroke="#9ca3af" strokeWidth="2.5" fill="none"
      />
    </svg>
  ),

  chat: (
    <svg viewBox="0 0 64 64" fill="none" className="icon-svg-full">
      <rect x="24" y="30" width="34" height="28" rx="6" fill="#09b83e" stroke="#079836" strokeWidth="1.2" />
      <path d="M30 54l-6 6h10l-4-6z" fill="#09b83e" stroke="#079836" strokeWidth="1" />
      <line x1="32" y1="38" x2="50" y2="38" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="44" x2="44" y2="44" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <rect x="6" y="10" width="34" height="28" rx="6" fill="#fff" stroke="#d1d5db" strokeWidth="1.2" />
      <path d="M14 34l-5 5h8l-3-5z" fill="#fff" stroke="#d1d5db" strokeWidth="1" />
      <line x1="16" y1="20" x2="30" y2="20" stroke="#09b83e" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="26" x2="36" y2="26" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),

  user: (
    <svg viewBox="0 0 24 24" fill="none" className="icon-svg-full">
      <circle cx="12" cy="9" r="3.5" stroke="#9ca3af" strokeWidth="1.5" fill="none" />
      <path d="M5 20C5 16 8 14 12 14C16 14 19 16 19 20" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  ),
};

export default iconSvgs;
