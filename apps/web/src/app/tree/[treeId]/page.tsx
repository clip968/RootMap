import { TreePageClient } from "@/components/tree-page-client";
import { DEFAULT_USER_ID } from "@/db/constants";
import { getDocumentTreeContextForUser } from "@/lib/repository/document-repository";
import { getLearningTree } from "@/lib/repository/learning-repository";
import { bundleToApiTreeResponse } from "@/lib/tree/bundle-to-api";

type Props = { params: Promise<{ treeId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TreePage({ params }: Props) {
  const { treeId } = await params;
  const bundle = await getLearningTree(treeId, DEFAULT_USER_ID);
  const documentContext =
    bundle ? await getDocumentTreeContextForUser(treeId, DEFAULT_USER_ID) : null;
  const initialTree =
    bundle ? bundleToApiTreeResponse(bundle, { documentContext }) : null;

  return <TreePageClient treeId={treeId} initialTree={initialTree} />;
}
