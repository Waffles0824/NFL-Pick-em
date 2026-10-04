import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { isDemoMode } from "@/lib/config";
import { getCurrentProfile } from "@/lib/auth/current";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (profile) redirect("/dashboard");
  const query = await searchParams;
  return (
    <AuthForm
      mode="login"
      nextPath={query.next ?? "/dashboard"}
      demoMode={isDemoMode()}
      resetNotice={query.reset === "1"}
    />
  );
}
