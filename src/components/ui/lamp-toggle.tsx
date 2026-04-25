/**
 * LampToggle â€” pull-string pendant lamp theme switcher
 *
 * Lamp ON  (isOn = isDark = true)  â†’ dark mode  Â· bulb glows warm amber
 * Lamp OFF (isOn = isDark = false) â†’ light mode Â· bulb is dim / unlit
 *
 * Interaction: pull the string â€” it stretches down 8 px (ease-in 200 ms),
 * springs back after 600 ms, bulb transitions with a soft glow.
 */
import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

export function LampToggle() {
  const { isDark, toggle } = useTheme();
  const [isPulling, setIsPulling] = useState(false);

  // lamp ON = dark room (the lamp illuminates it)
  const isOn = isDark;

  function handleToggle() {
    setIsPulling(true);
    toggle();
    setTimeout(() => setIsPulling(false), 600);
  }

  return (
    <div className="relative flex items-center gap-1.5">
      {/* Mode label + chevron arrow */}
      <div className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground select-none">
        <span>{isOn ? 'Dark' : 'Light'}</span>
        <svg
          className="w-2.5 h-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Button */}
      <button
        onClick={handleToggle}
        title={isOn ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={isOn ? 'Switch to light mode' : 'Switch to dark mode'}
        className="relative w-10 h-12 flex flex-col items-center justify-start group
                   cursor-pointer focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-ring rounded-lg
                   transition-transform duration-150 hover:scale-[1.05] active:scale-[0.95]"
      >
        {/* â”€â”€ Pull string â”€â”€ */}
        <div
          className="relative z-10 transition-transform duration-200 ease-out"
          style={{ transform: isPulling ? 'translateY(8px)' : 'translateY(0)' }}
        >
          {/* Cord */}
          <div
            className="w-px bg-gradient-to-b from-muted-foreground/60 to-muted-foreground/25
                       mx-auto transition-all duration-200 ease-out"
            style={{ height: isPulling ? '20px' : '14px' }}
          />
          {/* Pull bead */}
          <div
            className="w-2 h-2 rounded-full mx-auto shadow-md
                       bg-gradient-to-br from-muted-foreground to-muted-foreground/60
                       transition-transform duration-200 ease-out"
            style={{ transform: isPulling ? 'scale(0.82)' : 'scale(1)' }}
          />
        </div>

        {/* â”€â”€ Ceiling canopy / fixture â”€â”€ */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2
                     w-6 h-1.5 rounded-t-sm
                     bg-muted border border-border/50
                     transition-transform duration-200 ease-out"
          style={{ transform: isPulling ? 'translateY(1.5px)' : 'translateY(0)' }}
        />

        {/* â”€â”€ Bulb + rays â”€â”€ */}
        <div
          className="relative mt-0.5 transition-transform duration-200 ease-out"
          style={{ transform: isPulling ? 'translateY(1.5px)' : 'translateY(0)' }}
        >
          {/* Bulb glass */}
          <div
            className={`w-8 h-9 rounded-full relative overflow-hidden border-2
                        transition-all duration-300 ${
                          isOn
                            ? 'border-yellow-300/80 bg-gradient-to-b from-yellow-200 to-yellow-100'
                            : 'border-border bg-gradient-to-b from-muted/40 to-muted/10'
                        }`}
            style={{
              boxShadow: isOn
                ? '0 0 14px rgba(250,204,21,0.5), 0 0 28px rgba(250,204,21,0.22)'
                : 'none',
            }}
          >
            {/* Inner radial glow */}
            <div
              className="absolute inset-0 transition-opacity duration-300"
              style={{
                background:
                  'radial-gradient(circle at 50% 45%, rgba(253,224,71,0.85) 0%, rgba(253,224,71,0.38) 42%, transparent 70%)',
                opacity: isOn ? 1 : 0,
              }}
            />

            {/* Bulb base collar */}
            <div className="absolute bottom-0 left-0 right-0 h-2
                            bg-gradient-to-b from-muted to-muted-foreground/35
                            border-t border-border/25">
              <div className="h-px bg-border/40 mt-0.5" />
            </div>
          </div>

          {/* Light rays â€” 6 spokes, visible only when ON */}
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute top-1/2 left-1/2 w-px h-6
                         bg-gradient-to-t from-yellow-400/0 to-yellow-300/55
                         transition-opacity duration-300 pointer-events-none"
              style={{
                transform: `translate(-50%, -50%) rotate(${i * 60}deg)`,
                transformOrigin: 'center',
                opacity: isOn ? 0.45 : 0,
              }}
            />
          ))}
        </div>

        {/* Hover tooltip */}
        <div
          className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap
                     text-[10px] font-medium text-muted-foreground pointer-events-none
                     opacity-0 translate-y-1
                     group-hover:opacity-100 group-hover:translate-y-0
                     transition-all duration-200"
        >
          {isOn ? 'Light mode' : 'Dark mode'}
        </div>
      </button>
    </div>
  );
}

