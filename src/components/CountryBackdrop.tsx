/**
 * Faint landmark skyline behind the page: Egypt, UAE, France (Schengen), UK, USA and Canada.
 * Purely decorative: sits under every card and never takes pointer events.
 */
export function CountryBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[34vh] max-h-72 text-slate opacity-[0.11]">
      <svg viewBox="0 0 1440 240" preserveAspectRatio="xMidYMax slice" className="size-full" fill="currentColor">
        {/* Egypt — pyramids */}
        <path d="M30 240 L150 100 L270 240 Z M210 240 L290 150 L370 240 Z M330 240 L375 190 L420 240 Z" />
        {/* UAE — Burj Khalifa */}
        <path d="M470 240 V185 H479 V140 H486 V95 H492 V55 H497 L500 0 L503 55 H508 V95 H514 V140 H521 V185 H530 V240 Z" />
        {/* France / Schengen — Eiffel Tower */}
        <path
          fillRule="evenodd"
          d="M600 240 Q632 168 652 112 L656 62 L661 20 L664 62 L668 112 Q688 168 722 240 H698 Q680 196 661 196 Q642 196 624 240 Z M640 140 H682 V148 H640 Z"
        />
        {/* UK — Big Ben */}
        <path
          fillRule="evenodd"
          d="M790 240 V78 H782 L808 30 L812 6 L816 30 L842 78 H834 V240 Z M812 104 m-13 0 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0 Z"
        />
        {/* USA — Statue of Liberty */}
        <path d="M960 240 V196 H970 V176 H1030 V196 H1040 V240 Z M985 176 L991 104 H1006 L1013 176 Z" />
        <circle cx="998" cy="94" r="9" />
        <path d="M988 86 L984 74 L992 83 Z M998 84 L998 70 L1002 84 Z M1008 86 L1013 74 L1005 83 Z" />
        <path d="M1004 108 L1018 52 L1024 54 L1011 110 Z M1016 50 a6 8 0 1 0 12 0 a6 8 0 1 0 -12 0 Z" />
        {/* Canada — CN Tower */}
        <path d="M1150 240 L1154 70 L1158 8 L1162 70 L1166 240 Z" />
        <ellipse cx="1158" cy="110" rx="18" ry="9" />
        <ellipse cx="1158" cy="72" rx="7" ry="4" />
        {/* skyline base */}
        <path d="M0 236 H1440 V240 H0 Z" />
        <path d="M1220 240 V170 H1250 V240 Z M1260 240 V140 H1290 V240 Z M1300 240 V190 H1340 V240 Z M1350 240 V155 H1375 V240 Z M1385 240 V200 H1440 V240 Z M560 240 V200 H585 V240 Z M870 240 V205 H900 V240 Z M1060 240 V185 H1085 V240 Z" />
      </svg>
    </div>
  )
}
