import { redirect } from "next/navigation";
import { isOnboarded } from "@/lib/config";
import { hasValidSession } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!isOnboarded()) redirect("/onboarding");
  if (hasValidSession()) redirect("/");
  return <LoginForm />;
}
