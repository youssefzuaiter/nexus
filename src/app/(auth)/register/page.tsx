import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { registerAction } from "@/actions/auth";

export const metadata = { title: "Create account · Nexus" };

export default function RegisterPage() {
  return (
    <>
      <h2 className="mb-5 text-base font-semibold text-text">Create account</h2>
      <AuthForm action={registerAction} mode="register" />
      <p className="mt-5 text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
