import { AuthForm } from "@/components/auth-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const query = await searchParams;
  return <AuthForm mode="reset" token={query.token ?? ""} />;
}
