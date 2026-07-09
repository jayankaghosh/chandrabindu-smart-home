import { redirect } from "next/navigation";
import { isOnboarded } from "@/lib/config";
import { getSession } from "@/lib/auth";
import HomeRoot from "@/components/HomeRoot";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!isOnboarded()) redirect("/onboarding");
  const session = getSession();
  if (!session) redirect("/login");
  return <HomeRoot role={session.role} username={session.username} />;
}
