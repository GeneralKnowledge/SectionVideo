import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getCurrentCurator } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const curator = await getCurrentCurator();
  if (!curator) redirect("/sign-in");
  return <Shell curator={curator}>{children}</Shell>;
}
