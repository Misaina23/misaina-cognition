import { AppSidebar } from "@/components/AppSidebar";

export default async function SpaceDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  const decodedSpaceId = decodeURIComponent(spaceId || "");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar spaceId={decodedSpaceId} />
      <div className="min-w-0 lg:pl-64">{children}</div>
    </div>
  );
}
