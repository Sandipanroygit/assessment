"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchCurriculumModuleById } from "@/lib/supabaseData";
import type { CurriculumModule } from "@/types";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const decodeDataUrl = (url?: string) => {
  if (!url || !url.startsWith("data:")) return null;
  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) return null;
  try {
    const base64 = url.slice(commaIndex + 1);
    return atob(base64);
  } catch {
    return null;
  }
};

function MoodAIPageContent() {
  const searchParams = useSearchParams();
  const moduleId = searchParams.get("module");
  const [module, setModule] = useState<CurriculumModule | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [codeDisplay, setCodeDisplay] = useState("Loading code...");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadCode = useCallback(
    async (currentModule: CurriculumModule | null) => {
      if (!currentModule) {
        setCodeDisplay("No activity selected yet.");
        return;
      }
      if (currentModule.codeSnippet) {
        setCodeDisplay(currentModule.codeSnippet);
        return;
      }
      const codeAsset = currentModule.assets.find((a) => a.type === "code");
      if (codeAsset?.url) {
        const decoded = decodeDataUrl(codeAsset.url);
        if (decoded) {
          setCodeDisplay(decoded);
          return;
        }
        const canFetch =
          codeAsset.url.startsWith("http://") ||
          codeAsset.url.startsWith("https://") ||
          codeAsset.url.startsWith("data:") ||
          codeAsset.url.startsWith("blob:");
        if (canFetch) {
          try {
            const res = await fetch(codeAsset.url);
            const txt = await res.text();
            setCodeDisplay(txt || "Code file is empty.");
            return;
          } catch {
            setCodeDisplay("Unable to load code file.");
            return;
          }
        }
        setCodeDisplay(codeAsset.label || "Code file available.");
        return;
      }
      setCodeDisplay("No code snippet available.");
    },
    [],
  );

  const context = useMemo(() => {
    const codeSnippet = codeDisplay?.slice(0, 2400) ?? "";
    return {
      subject: module?.subject ?? "",
      title: module?.title ?? "",
      description: module?.description ?? "",
      code: codeSnippet,
    };
  }, [codeDisplay, module]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!moduleId) {
        setStatus("Select an activity to load context.");
        return;
      }
      setStatus("Loading activity context...");
      try {
        const row = await fetchCurriculumModuleById(moduleId);
        if (cancelled) return;
        if (!row) {
          setStatus("Activity not found.");
          return;
        }
        setModule(row);
        setStatus(null);
      } catch {
        if (!cancelled) setStatus("Unable to load activity.");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  useEffect(() => {
    void loadCode(module);
  }, [loadCode, module]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          context: module ? context : undefined,
        }),
      });
      const data = await res.json();
      const reply = data.reply || "I'm sorry, I couldn't process that.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="section-padding space-y-6 h-[calc(100vh-80px)] flex flex-col">
      <div className="glass-panel rounded-2xl border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">MoodAI Assistant</p>
          <h1 className="text-2xl font-semibold text-white">Chat with MoodAI</h1>
          {module && (
            <p className="text-sm text-slate-400">
              Context: {module.title} • {module.subject}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href="/customer"
            className="px-3 py-2 rounded-xl border border-white/10 text-sm text-slate-200 hover:border-accent-strong"
          >
            Back to activities
          </Link>
          {module && (
            <Link
              href={`/customer/activity/${module.id}`}
              className="px-3 py-2 rounded-xl bg-accent text-true-white text-sm font-semibold shadow-glow"
            >
              View activity
            </Link>
          )}
        </div>
      </div>

      {status && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 flex-shrink-0">
          {status}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 glass-panel rounded-2xl border border-white/10 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
                <p className="text-lg font-semibold text-white">How can I help you today?</p>
                <p className="text-sm text-slate-400 max-w-md mt-2">
                  Ask me about {module ? `"${module.title}"` : "any drone activity"}, coding concepts, or general curriculum questions.
                </p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-accent text-true-white shadow-glow rounded-br-none"
                      : "bg-white/10 text-slate-100 rounded-bl-none border border-white/5"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white/5 text-slate-400 rounded-2xl rounded-bl-none px-4 py-3 text-sm">
                  Typing...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-white/10 bg-white/5">
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-slate-500 focus:border-accent focus:outline-none transition-colors"
                placeholder="Type your message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="px-5 rounded-xl bg-accent text-true-white font-semibold shadow-glow disabled:opacity-50 hover:translate-y-[-1px] transition-all"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function MoodAIPage() {
  return (
    <Suspense fallback={<div className="section-padding text-slate-200">Loading chat...</div>}>
      <MoodAIPageContent />
    </Suspense>
  );
}
