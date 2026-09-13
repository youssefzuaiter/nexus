import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { loginAction } from "@/actions/auth";

export const metadata = { title: "Sign in · Nexus" };

export default function LoginPage() {
  return (
    <>
      <h2 className="mb-5 text-base font-semibold text-text">Sign in</h2>
      <AuthForm action={loginAction} mode="login" />
      <p className="mt-5 text-center text-sm text-text-muted">
        No account yet?{" "}
        <Link
          href="/register"
          className="font-medium text-accent hover:underline"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
