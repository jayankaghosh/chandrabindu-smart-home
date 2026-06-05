import { redirect } from "next/navigation";
import { isOnboarded } from "@/lib/config";
import OnboardingWizard from "@/components/OnboardingWizard";

export const dynamic = "force-dynamic";

export default function Page() {
  if (isOnboarded()) redirect("/login");
  return <OnboardingWizard />;
}
