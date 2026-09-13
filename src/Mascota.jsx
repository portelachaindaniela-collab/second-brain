export default function Mascota() {
  return (
        <div className="maria-mascot-art" aria-hidden="true">
          <svg viewBox="0 0 120 150">
            <defs>
              <linearGradient id="mascot-shell" x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#ffffff" /><stop offset="0.45" stopColor="#e0eaf2" /><stop offset="1" stopColor="#718ea8" />
              </linearGradient>
              <radialGradient id="mascot-visor" cx="35%" cy="20%" r="85%">
                <stop stopColor="#102333" /><stop offset="0.5" stopColor="#030912" /><stop offset="1" stopColor="#000208" />
              </radialGradient>
              <filter id="mascot-eye-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="1.5" result="glow" />
                <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <radialGradient id="mascot-jet">
                <stop stopColor="#bce9ff" stopOpacity="0.7" /><stop offset="1" stopColor="#64bbec" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g className="maria-mascot-float">
              <ellipse className="maria-mascot-jet" cx="60" cy="119" rx="14" ry="22" fill="url(#mascot-jet)" />
              <path d="M37 84 Q28 85 26 103 Q32 108 37 98" fill="url(#mascot-shell)" />
              <g className="maria-mascot-hand">
                <path d="M84 86 Q95 78 95 64 Q100 60 104 65 Q107 85 91 99Z" fill="url(#mascot-shell)" />
              </g>
              <path d="M40 79 Q60 72 81 79 L85 100 Q82 115 60 116 Q38 114 36 100Z" fill="url(#mascot-shell)" />
              <path d="M46 80 Q60 76 75 81 L68 99 Q60 106 53 98Z" fill="#008ded" />
              <path d="M42 111 Q35 118 39 128 L50 129 54 114 M67 114 70 129 82 127 Q84 116 78 110" fill="url(#mascot-shell)" />
              <path d="M38 125 Q43 122 51 126 L51 132 37 132Z M70 126 Q78 122 83 127 L84 132 70 132Z" fill="#008ded" />
              <path d="M51 108 H70 L67 113 H54Z" fill="#536b7a" />
              <circle className="maria-mascot-light" cx="60" cy="94" r="3" fill="#25cfff" />


              <rect x="23" y="46" width="9" height="22" rx="4" fill="#009cf0" />
              <rect x="88" y="46" width="9" height="22" rx="4" fill="#009cf0" />
              <rect x="23" y="29" width="74" height="53" rx="23" fill="url(#mascot-shell)" stroke="#a2edff" strokeWidth="0.8" />
              <rect x="29" y="35" width="62" height="40" rx="18" fill="url(#mascot-visor)" stroke="#0c9bd1" strokeWidth="1" />
              <path d="M42 44 Q58 40 74 44" fill="none" stroke="#dceef9" strokeOpacity="0.15" strokeWidth="2" />
              <g className="maria-mascot-eyes" fill="#35d9ff" filter="url(#mascot-eye-glow)">
                <path d="M43 57 Q43 45 53 49 L54 57Z" />
                <path d="M66 57 67 49 Q77 45 77 57Z" />
              </g>

              <g transform="rotate(-9 60 29)">
                <ellipse cx="60" cy="31" rx="44" ry="9" fill="#9f723c" />
                <ellipse cx="60" cy="28" rx="44" ry="8" fill="#dfbd78" stroke="#edce91" strokeWidth="1" />
                <path d="M36 28 40 8 Q48 3 58 9 Q70 2 79 10 L85 28Z" fill="#d8b16b" stroke="#a98146" strokeWidth="1" />
                <path d="M41 12 39 24 M48 10 46 25 M56 12 55 25 M64 10 65 25 M73 10 77 26" stroke="#f6dba1" strokeOpacity="0.5" strokeWidth="1" />
                <path d="M38 21 Q60 26 83 21 L85 28 Q61 34 36 28Z" fill="#297f80" />
                <path d="M43 25 48 28 M56 25 60 29 M69 25 74 28" stroke="#96c69b" strokeWidth="2" />
                <g transform="translate(78 24)" fill="#e7a188">
                  <ellipse rx="3" ry="6" /><ellipse rx="3" ry="6" transform="rotate(60)" /><ellipse rx="3" ry="6" transform="rotate(120)" /><circle r="2" fill="#f9da85" />
                </g>
              </g>
            </g>
          </svg>
        </div>

  )
}
