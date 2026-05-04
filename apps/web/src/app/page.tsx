import { StartTopicForm } from "@/components/start-topic-form";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 flex-col">
        <StartTopicForm />
      </main>
    </div>
  );
}
