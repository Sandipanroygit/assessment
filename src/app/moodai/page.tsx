"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchCurriculumModuleById } from "@/lib/supabaseData";
import type { CurriculumModule } from "@/types";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const buildSentimentQuestions = (module?: CurriculumModule | null) => {
  const title = module?.title?.trim() || "this activity";
  const subject = module?.subject?.trim() || "your course";
  const desc = module?.description?.trim() || "";
  const topic = module?.subject ? `${title} (${subject})` : title;
  const spark = desc ? ` based on "${desc.slice(0, 120)}${desc.length > 120 ? "..." : ""}"` : "";

  return [
    `On a scale of 1-5, how excited are you to work on ${topic}? (1 = not at all, 5 = very excited)`,
    `Which option best matches your current mood about ${topic}? A) Pumped B) Calm C) Unsure D) Stressed`,
    `What part of ${title} sounds most interesting to you and why?`,
    `Which part of the plan feels most intimidating? A) Planning B) Coding C) Testing D) Presenting/Explaining`,
    `In one word, how would you describe your feelings when you read the activity description${spark}?`,
    `How confident are you about finishing ${title} on time? (1 = not confident, 5 = very confident)`,
    `If you hit a tricky bug in ${subject}, what emotion do you think you'll feel first?`,
    `How comfortable are you asking for help during this activity? (1 = not comfortable, 5 = very comfortable)`,
    `Thinking about ${subject}, what usually makes you feel proud or frustrated?`,
    `Which statement fits you best for ${title}? A) I love experimenting B) I prefer clear steps C) I feel a bit lost D) I'm worried about mistakes`,
    `After doing similar tasks, I usually feel... A) Accomplished B) Tired C) Indifferent D) Frustrated`,
    `What would make ${title} feel like a success for you emotionally?`,
    `If you could change one thing about the instructions to feel better, what would it be?`,
    `Which vibe matches you while working on ${title}? A) Focused B) Playful C) Neutral D) On edge`,
    `How supported do you feel by the resources provided? (1 = not supported, 5 = very supported)`,
    `Which emotion best fits you right now about ${topic}? A) Curious B) Confident C) Nervous D) Overwhelmed`,
    `What's one worry you have about the subject matter in this activity?`,
    `What kind of feedback helps you feel secure? A) Quick check-ins B) Detailed written notes C) None, I prefer space D) Encouragement and reassurance`,
    `When you picture yourself doing ${title}, what do you see yourself doing first?`,
    `How confident do you feel tweaking the provided code or tools for this activity? (1-5)`,
    `If you get stuck, how likely are you to keep pushing vs. take a short break? A) Keep pushing B) Short break then return C) Ask for help quickly D) Feel frozen`,
    `What outcome would disappoint you the most while working on ${title}?`,
    `How will you reward yourself after finishing this activity?`,
    `Who would you want to share your results or learnings from ${title} with? A) Teacher B) A classmate C) Family D) I'd keep it to myself`,
    `In one word, what is your overall vibe heading into ${title}?`,
  ];
};

function MoodAIPageContent() {
  const searchParams = useSearchParams();
  const moduleId = searchParams.get("module");
  const [module, setModule] = useState<CurriculumModule | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sentimentQuestions, setSentimentQuestions] = useState<string[]>([]);
  const [questionFlowActive, setQuestionFlowActive] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const totalQuestions = sentimentQuestions.length;
  const currentQuestionNumber =
    totalQuestions === 0 ? 0 : Math.min(questionFlowActive ? currentQuestionIdx + 1 : currentQuestionIdx, totalQuestions);

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
    if (moduleId && !module) return;
    const qs = buildSentimentQuestions(module);
    if (!qs.length) {
      setSentimentQuestions([]);
      setQuestionFlowActive(false);
      setMessages([]);
      return;
    }

    setSentimentQuestions(qs);
    setCurrentQuestionIdx(0);
    setQuestionFlowActive(true);
    setMessages([
      {
        role: "assistant",
        content: `I'll ask ${qs.length} quick questions to understand how you're feeling about ${module?.title ?? "this activity"}. There are no right or wrong answers - be honest so I can support you.`,
      },
      { role: "assistant", content: `Q1/${qs.length}: ${qs[0]}` },
    ]);
  }, [moduleId, module]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const appendAssistantMessage = (text: string) => {
    setSending(true);
    window.setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: text }]);
      setSending(false);
    }, 350);
  };

  const handleSend = () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInput("");

    if (questionFlowActive && sentimentQuestions.length > 0) {
      const nextIdx = currentQuestionIdx + 1;
      if (nextIdx < sentimentQuestions.length) {
        setCurrentQuestionIdx(nextIdx);
        appendAssistantMessage(`Q${nextIdx + 1}/${sentimentQuestions.length}: ${sentimentQuestions[nextIdx]}`);
      } else {
        setQuestionFlowActive(false);
        setCurrentQuestionIdx(sentimentQuestions.length);
        appendAssistantMessage("Thanks for sharing how you feel. That's all the sentiment questions for now.");
      }
      return;
    }

    appendAssistantMessage("The sentiment check is complete. If you want to revisit the activity, go back to the activity page.");
  };

  return (
    <main className="section-padding space-y-6 h-[calc(100vh-80px)] flex flex-col">
      <div className="glass-panel rounded-2xl border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">MoodAI Sentiment Check</p>
          <h1 className="text-2xl font-semibold text-white">25 Guided Questions</h1>
          <p className="text-sm text-slate-400">
            MoodAI will lead the conversation to understand how you feel about {module?.title ?? "this activity"}
            {module?.subject ? ` (${module.subject})` : ""}.
          </p>
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
            {totalQuestions > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Guided sentiment questions</span>
                <span>
                  {questionFlowActive
                    ? `Question ${currentQuestionNumber}/${totalQuestions}`
                    : `Completed ${totalQuestions}/${totalQuestions}`}
                </span>
              </div>
            )}
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
                <p className="text-lg font-semibold text-white">I'll guide you through a quick mood check.</p>
                <p className="text-sm text-slate-400 max-w-md mt-2">
                  Answer each question to share how you feel about {module?.title ?? "this activity"} - there are no right or wrong answers.
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
                placeholder={questionFlowActive ? "Type your answer..." : "Sentiment check complete"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || sending || totalQuestions === 0}
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
