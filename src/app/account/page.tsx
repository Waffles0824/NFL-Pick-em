import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountForm } from "@/components/account-form";
import { Logo } from "@/components/logo";
import { getCurrentProfile } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return (
    <main className="mx-auto min-h-full max-w-3xl px-4 py-6">
      <Logo />
      <h1 className="mt-8 text-4xl tracking-tight">Profile</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your display name is what the league sees on the sheet.
      </p>
      <AccountForm displayName={profile.displayName} email={profile.email} />
      <p className="mt-6 text-sm">
        <Link href="/dashboard" className="underline">
          Back to leagues
        </Link>
      </p>
    </main>
  );
}
