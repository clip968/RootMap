import { TreePageClient } from "@/components/tree-page-client";

type Props = { params: Promise<{ treeId: string }> };

export default async function TreePage({ params }: Props) {
  const { treeId } = await params;
  return <TreePageClient treeId={treeId} />;
}
