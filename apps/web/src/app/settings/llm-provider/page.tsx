import { LlmProviderSettingsPanel } from "@/components/llm-provider-settings-panel";

export default function LlmProviderSettingsPage() {
  return (
    <div className="flex min-h-[calc(100dvh-3rem)] w-full flex-col items-center px-4 py-8">
      <div className="mb-5 w-full max-w-4xl">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Settings
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          LLM Provider
        </h1>
      </div>
      <LlmProviderSettingsPanel />
    </div>
  );
}

