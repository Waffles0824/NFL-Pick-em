import Link from "next/link";
import { cn } from "cn";

export function Logo({
  href = "/",
  compact = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="grid size-9 place-items-center rounded-full bg-primary text-[10px] font-semibold tracking-wide text-primary-foreground">
        NFL
      </span>
      {compact ? null : (
        <span className="font-heading text-xl leading-none tracking-tight">Pick&apos;em</span>
      )}
    </Link>
  );
}
