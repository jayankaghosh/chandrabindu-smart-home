import { redirect } from "next/navigation";
import { isOnboarded } from "@/lib/config";
import { getSession } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!isOnboarded()) redirect("/onboarding");
  const session = getSession();
  if (!session) redirect("/login");
  return <Dashboard role={session.role} username={session.username} />;
}
