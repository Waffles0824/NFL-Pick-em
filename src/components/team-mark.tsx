import { cn } from "cn";

const logoAbbrev: Record<string, string> = {
  WAS: "wsh",
  WSH: "wsh",
};

export function teamLogoSrc(abbreviation: string): string {
  const key = (logoAbbrev[abbreviation.toUpperCase()] ?? abbreviation).toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${key}.png`;
}

export function TeamMark({
  abbreviation,
  className,
}: {
  abbreviation: string;
  className?: string;
}) {
  return (
    // Team marks are small remote logos. A missing logo still leaves the city name beside it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={teamLogoSrc(abbreviation)}
      alt=""
      width={20}
      height={20}
      className={cn("size-5 shrink-0 object-contain", className)}
    />
  );
}
