import { TreePageClient } from "@/components/tree-page-client";

type Props = { params: Promise<{ treeId: string }> };

export default async function TreePage({ params }: Props) {
  const { treeId } = await params;
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 dark:bg-black">
      <TreePageClient treeId={treeId} />
    </div>
  );
}
