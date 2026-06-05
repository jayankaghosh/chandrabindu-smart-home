import { redirect } from "next/navigation";
import { isOnboarded } from "@/lib/config";
import { getSession } from "@/lib/auth";
import Settings from "@/components/Settings";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!isOnboarded()) redirect("/onboarding");
  const session = getSession();
  if (!session) redirect("/login");
  // Admins see everything; standard users see only the password section.
  return <Settings isAdmin={session.role === "admin"} />;
}
