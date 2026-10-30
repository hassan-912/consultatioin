import logoUrl from '../assets/mg-logo-white.webp'

/** Official MG International logo (white). Use on dark surfaces; `dark` tints it slate for light surfaces. */
export function Logo({ className = 'h-9', dark = false }: { className?: string; dark?: boolean }) {
  return (
    <img
      src={logoUrl}
      alt="MG International – Visa Consultancy"
      className={`w-auto ${className}`}
      style={dark ? { filter: 'brightness(0) saturate(100%) invert(19%) sepia(12%) saturate(1200%) hue-rotate(172deg)' } : undefined}
      width={1600}
      height={491}
    />
  )
}
