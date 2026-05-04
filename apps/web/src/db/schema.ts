import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { LearningTreeResponse, NodeDetailResponse } from "@/types/learning";

export const learningTrees = sqliteTable("learning_trees", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  topic: text("topic").notNull(),
  summary: text("summary"),
  treeJson: text("tree_json", { mode: "json" })
    .notNull()
    .$type<LearningTreeResponse>(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const learningNodes = sqliteTable(
  "learning_nodes",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    treeId: text("tree_id")
      .notNull()
      .references(() => learningTrees.id, { onDelete: "cascade" }),
    nodeKey: text("node_key").notNull(),
    title: text("title").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    difficulty: integer("difficulty"),
    prerequisites: text("prerequisites", { mode: "json" })
      .notNull()
      .$type<string[]>(),
    children: text("children", { mode: "json" }).notNull().$type<string[]>(),
    detailJson: text("detail_json", { mode: "json" }).$type<NodeDetailResponse>(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("learning_nodes_tree_id_node_key_uidx").on(t.treeId, t.nodeKey),
  ],
);

export const userNodeProgress = sqliteTable(
  "user_node_progress",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    treeId: text("tree_id")
      .notNull()
      .references(() => learningTrees.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => learningNodes.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("unknown"),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    uniqueIndex("user_node_progress_user_id_node_id_uidx").on(
      t.userId,
      t.nodeId,
    ),
  ],
);
