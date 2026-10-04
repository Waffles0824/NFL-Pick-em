import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-3xl tracking-tight">That page is not on the sheet.</h1>
      <Button asChild>
        <Link href="/dashboard">Back to your leagues</Link>
      </Button>
    </main>
  );
}
