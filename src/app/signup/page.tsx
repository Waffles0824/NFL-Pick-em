import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentProfile } from "@/lib/auth/current";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (profile) redirect("/dashboard");
  const query = await searchParams;
  return <AuthForm mode="signup" nextPath={query.next ?? "/dashboard"} />;
}
