import { useId } from "react";
import { cn } from "@/lib/utils";

interface LogoSVGProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export default function LogoSVG({ className = "w-8 h-8", ...props }: LogoSVGProps) {
  const uid = useId().replace(/:/g, "");
  const gradTop = `fox-top-${uid}`;
  const gradMain = `fox-main-${uid}`;
  const gradEar = `fox-ear-${uid}`;
  const gradChest = `fox-chest-${uid}`;
  const gradBack = `fox-back-${uid}`;
  const gradSwoop = `fox-swoop-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Minnu Services Fox Logo"
      {...props}
    >
      <defs>
        <linearGradient id={gradTop} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffb703" />
          <stop offset="50%" stopColor="#ff7b00" />
          <stop offset="100%" stopColor="#e63900" />
        </linearGradient>

        <linearGradient id={gradMain} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff9d00" />
          <stop offset="50%" stopColor="#ff5500" />
          <stop offset="100%" stopColor="#cc2200" />
        </linearGradient>

        <linearGradient id={gradEar} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff2d6" />
          <stop offset="60%" stopColor="#ffb703" />
          <stop offset="100%" stopColor="#ff7b00" />
        </linearGradient>

        <linearGradient id={gradChest} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#ffede0" />
          <stop offset="100%" stopColor="#ffd4b3" />
        </linearGradient>

        <linearGradient id={gradBack} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9e2a00" />
          <stop offset="40%" stopColor="#d93800" />
          <stop offset="100%" stopColor="#ff6a00" />
        </linearGradient>

        <linearGradient id={gradSwoop} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffaa00" />
          <stop offset="40%" stopColor="#ff4400" />
          <stop offset="100%" stopColor="#990000" />
        </linearGradient>
      </defs>

      <g>
        {/* Back Ear */}
        <path d="M 32 8 L 47 32 C 41 33 34 25 32 8 Z" fill={`url(#${gradBack})`} />
        {/* Back Ear Inner Highlight */}
        <path d="M 34 11 L 43 29 C 39 29 35 23 34 11 Z" fill={`url(#${gradEar})`} />

        {/* Front Ear */}
        <path d="M 22 16 C 30 14 43 20 48 37 C 38 33 28 25 22 16 Z" fill={`url(#${gradTop})`} />

        {/* Back Head / Mane Layers */}
        <path d="M 45 26 C 60 22 78 30 87 52 C 80 49 73 46 66 42 C 75 49 83 60 82 72 C 70 54 58 44 45 40 Z" fill={`url(#${gradBack})`} />

        {/* Main Head / Forehead / Snout */}
        <path d="M 42 33 C 31 35 27 46 19 60 C 22 61 25 60 28 58 C 23 62 20 64 17 64 C 23 52 34 42 42 33 Z" fill={`url(#${gradTop})`} />

        {/* Muzzle / Upper Jaw */}
        <path d="M 46 36 C 37 39 32 48 24 59 C 28 62 35 56 42 52 C 48 49 52 48 60 52 C 54 43 49 38 46 36 Z" fill={`url(#${gradMain})`} />

        {/* Cream / Light Muzzle & Chin */}
        <path d="M 24 59 C 20 64 24 66 29 65 C 37 62 44 55 51 67 C 47 58 40 53 29 55 C 26 56 24 58 24 59 Z" fill={`url(#${gradChest})`} />

        {/* Dark Eye Slit */}
        <path d="M 31 44 C 35 42 38 43 40 46 C 37 46 34 46 31 44 Z" fill="#ffffff" opacity="0.9" />

        {/* Nose Tip */}
        <ellipse cx="19.5" cy="62.5" rx="2.2" ry="1.7" transform="rotate(-15 19.5 62.5)" fill="#ffffff" />

        {/* Graceful Lower Swoop (Tail / Neck Sweep) */}
        <path d="M 51 67 C 42 76 34 87 32 95 C 44 90 61 80 71 63 C 79 49 78 36 71 28 C 77 42 74 64 58 76 C 52 80 44 85 37 89 C 44 78 49 70 51 67 Z" fill={`url(#${gradSwoop})`} />
      </g>
    </svg>
  );
}
