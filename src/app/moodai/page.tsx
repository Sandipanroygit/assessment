"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchCurriculumModuleById, uploadFileToBucket } from "@/lib/supabaseData";
import { supabase } from "@/lib/supabaseClient";
import type { CurriculumModule } from "@/types";

type Message = {
  role: "user" | "assistant";
  content: string;
  variant?: "intro";
  introTitle?: string;
  introSections?: IntroSection[];
};

const getAudioContextCtor = () => {
  if (typeof window === "undefined") return null;
  const win = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return win.AudioContext || win.webkitAudioContext || null;
};

const createTonePlayer = () => {
  const AudioContextCtor = getAudioContextCtor();
  let ctx: AudioContext | null = null;

  const getContext = async () => {
    if (!AudioContextCtor) return null;
    if (!ctx) ctx = new AudioContextCtor();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // ignore autoplay blocks
      }
    }
    return ctx;
  };

  const playTone = async (frequency: number, durationMs = 140) => {
    const audioCtx = await getContext();
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.12;
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    oscillator.start(now);
    oscillator.stop(now + durationMs / 1000);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  };

  const close = () => {
    if (ctx && ctx.state !== "closed") {
      void ctx.close();
    }
    ctx = null;
  };

  return { playTone, close };
};

type SentimentQuestion = {
  id: string;
  prompt: string;
  type: "scale" | "mcq" | "text";
  options?: Array<{ label: string; text: string; value?: number }>;
  helper?: string;
};

type IntroSection = {
  title: string;
  paragraph?: string;
  bullets?: string[];
};

const buildSentimentQuestions = (module?: CurriculumModule | null) => {
  const title = module?.title?.trim() || "this activity";
  const subject = module?.subject?.trim() || "real-world skills";
  const desc = module?.description?.trim() || "";
  const descSnippet = desc ? `"${desc.slice(0, 120)}${desc.length > 120 ? "..." : ""}"` : "the activity goals";
  const subjectLower = subject.toLowerCase();

  const questions: SentimentQuestion[] = [
    {
      id: "relevance_world",
      type: "mcq",
      prompt: `Which statement best describes why ${title} matters beyond class?`,
      options: [
        { label: "A", text: `${title} links directly to real-world needs in ${subjectLower}.`, value: 5 },
        { label: "B", text: "I see how these ideas could help in projects or hobbies I care about.", value: 4 },
        { label: "C", text: "I'm still figuring out the real-world link but I'm open to it.", value: 3 },
        { label: "D", text: "I don't yet see why this is useful outside assignments.", value: 1 },
      ],
    },
    {
      id: "personal_connection",
      type: "mcq",
      prompt: `How strongly can you connect ${title} to something in your life right now?`,
      options: [
        { label: "A", text: "I see a clear connection to something I'm doing or want to build.", value: 5 },
        { label: "B", text: "I have a rough idea of how it relates to me.", value: 4 },
        { label: "C", text: "Maybe tangentially, but it's fuzzy.", value: 3 },
        { label: "D", text: "I don't see a connection yet.", value: 1 },
      ],
    },
    {
      id: "confidence_apply",
      type: "mcq",
      prompt: `How confident are you that you could apply what you learn in ${title} to a real scenario?`,
      options: [
        { label: "A", text: "Very confident—I can picture specific uses.", value: 5 },
        { label: "B", text: "Fairly confident with a bit of guidance.", value: 4 },
        { label: "C", text: "Somewhat unsure but willing to try.", value: 3 },
        { label: "D", text: "Not confident about applying it yet.", value: 1 },
      ],
    },
    {
      id: "curiosity_description",
      type: "mcq",
      prompt: desc ? `The description mentions ${descSnippet}. Which matches your curiosity level?` : `How curious are you to explore this activity?`,
      options: [
        { label: "A", text: "I'm excited to dive deep and experiment.", value: 5 },
        { label: "B", text: "Curious but I need a bit more clarity first.", value: 4 },
        { label: "C", text: "Neutral but willing to try it out.", value: 3 },
        { label: "D", text: "Not very curious right now.", value: 1 },
      ],
    },
    {
      id: "skills_focus",
      type: "mcq",
      prompt: `Which outcome are you most excited about while doing ${title}?`,
      options: [
        { label: "A", text: "Building practical skills I can reuse quickly.", value: 5 },
        { label: "B", text: `Understanding the key ideas behind ${subjectLower}.`, value: 4 },
        { label: "C", text: "Gaining confidence by finishing the task.", value: 3 },
        { label: "D", text: "Just completing it to meet requirements.", value: 1 },
      ],
    },
    {
      id: "challenge_area",
      type: "mcq",
      prompt: desc ? "Based on the activity description, what feels most challenging?" : "What feels most challenging about this activity?",
      options: [
        { label: "A", text: "Understanding the concepts in the description.", value: 2 },
        { label: "B", text: "Designing and organizing my approach.", value: 3 },
        { label: "C", text: "Building or testing the solution.", value: 4 },
        { label: "D", text: "Staying motivated through the steps.", value: 2 },
      ],
    },
    {
      id: "support_mindset",
      type: "mcq",
      prompt: "How likely are you to reach out if you get stuck during this activity?",
      options: [
        { label: "A", text: "Very likely—I know who or where to ask.", value: 5 },
        { label: "B", text: "Likely after I try a few things first.", value: 4 },
        { label: "C", text: "Maybe, but I'd hesitate.", value: 3 },
        { label: "D", text: "Unlikely; I'd mostly work alone.", value: 2 },
      ],
    },
    {
      id: "impact_goal",
      type: "mcq",
      prompt: `What impact do you most want from completing ${title}?`,
      options: [
        { label: "A", text: "Create something useful I can show or share.", value: 5 },
        { label: "B", text: `See how ${subjectLower} fits into real problems.`, value: 4 },
        { label: "C", text: "Tick off the requirement and learn a bit.", value: 3 },
        { label: "D", text: "Just get it done quickly.", value: 2 },
      ],
    },
    {
      id: "energy_state",
      type: "mcq",
      prompt: "Which best matches your current energy for this activity?",
      options: [
        { label: "A", text: "Energized and ready to start.", value: 5 },
        { label: "B", text: "Steady and focused.", value: 4 },
        { label: "C", text: "Warming up and need direction.", value: 3 },
        { label: "D", text: "Running low on energy right now.", value: 1 },
      ],
    },
    {
      id: "reflection_style",
      type: "mcq",
      prompt: "How do you prefer to reflect on progress while doing this?",
      options: [
        { label: "A", text: "Sharing quick takeaways with someone else.", value: 5 },
        { label: "B", text: "Jotting notes or snapshots as I go.", value: 4 },
        { label: "C", text: "Thinking quietly about what worked.", value: 3 },
        { label: "D", text: "I don't usually reflect until the end.", value: 2 },
      ],
    },
  ];

  return questions.slice(0, 10);
};

const buildIntroPayload = (module?: CurriculumModule | null, questionCount = 10) => {
  const title = module?.title?.trim() || "this activity";
  const subject = module?.subject?.trim() || "real-world skills";
  const desc = module?.description?.trim();
  const descriptionSnippet = desc ? `${desc.slice(0, 280)}${desc.length > 280 ? "..." : ""}` : "Hands-on practice to build your skills before using real hardware.";
  const subjectLower = subject.toLowerCase();

  const sections: IntroSection[] = [
    {
      title: "Why You Are Doing This Activity",
      paragraph: `See ${title} in action before you touch hardware, so you can visualize the ideas and tweak inputs safely.`,
      bullets: [
        `Experiment by adjusting variables to see immediate effects without risk.`,
        `Build intuition first, so later lab time is confident and efficient.`,
      ],
    },
    {
      title: "What Concept This Activity Helps You Understand",
      paragraph: descriptionSnippet,
      bullets: [
        `Connect ${title} to the core ideas of ${subjectLower}.`,
        "Notice how changing inputs shifts outcomes and forces at play.",
      ],
    },
    {
      title: "Real Problems This Concept Helps You Solve",
      bullets: [
        `Design safer, more reliable solutions that depend on ${subjectLower}.`,
        "Explain why systems behave the way they do under different conditions.",
        "Spot risks early (instability, inefficiency, safety issues) and fix them.",
      ],
    },
    {
      title: "How You Can Relate This to Your Life",
      bullets: [
        "Map what you learn to a project, hobby, or workflow you already care about.",
        "See the same principles in everyday tools, movement, or devices around you.",
        "Use these insights to predict what happens when speed, scale, or load changes.",
      ],
    },
    {
      title: "What This Prepares You For",
      bullets: [
        "Moving from simulation to real builds with fewer surprises.",
        "Applying formulas with meaning instead of guesswork.",
        "Thinking like an engineer—connecting theory, safety, and design choices.",
      ],
    },
  ];

  return {
    headline: `Activity Orientation: ${title}`,
    summary: `Here's a quick orientation for ${title}. After this, you'll answer ${questionCount} quick multiple-choice questions.`,
    sections,
  };
};

const TYPING_DELAY_MS = 2000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const likertFromResponse = (response: string) => {
  const match = response.match(/([1-5])/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  if (Number.isNaN(value)) return null;
  return clamp(value, 1, 5);
};

const mcqValueFromResponse = (response: string, question: SentimentQuestion) => {
  const letter = response.trim().charAt(0).toUpperCase();
  const option = question.options?.find((opt) => opt.label.toUpperCase() === letter);
  return option?.value ?? null;
};

const textToneScore = (response: string) => {
  const text = response.toLowerCase();
  const positiveWords = ["excited", "pumped", "curious", "confident", "ready", "interested", "calm", "happy"];
  const negativeWords = ["stressed", "worried", "anxious", "nervous", "overwhelmed", "tired", "frustrated"];
  let score = 0;
  positiveWords.forEach((word) => {
    if (text.includes(word)) score += 1;
  });
  negativeWords.forEach((word) => {
    if (text.includes(word)) score -= 1;
  });
  if (score > 2) return 5;
  if (score > 0) return 4;
  if (score === 0) return 3;
  if (score === -1) return 2;
  return 1;
};

const sanitizeSegment = (value: string) => value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "item";

const buildSentimentAnalysis = ({
  module,
  questions,
  responses,
  studentName,
  userId,
}: {
  module: CurriculumModule | null;
  questions: SentimentQuestion[];
  responses: Array<{ questionId: string; prompt: string; response: string; createdAt: string }>;
  studentName: string;
  userId: string | null;
}) => {
  const questionMap = new Map<string, SentimentQuestion>();
  questions.forEach((q) => questionMap.set(q.id, q));

  const scoredDetails = responses.map((entry) => {
    const question = questionMap.get(entry.questionId);
    let score: number | null = null;
    if (question?.type === "scale") score = likertFromResponse(entry.response);
    if (question?.type === "mcq") score = mcqValueFromResponse(entry.response, question);
    if (question?.type === "text") score = textToneScore(entry.response);
    return { ...entry, score, questionType: question?.type ?? "unknown" };
  });

  const numericScores = scoredDetails.map((item) => item.score).filter((v): v is number => typeof v === "number");
  const averageScore =
    numericScores.length > 0 ? Number((numericScores.reduce((acc, val) => acc + val, 0) / numericScores.length).toFixed(2)) : null;

  const positiveCount = scoredDetails.filter((item) => (item.score ?? 0) >= 4).length;
  const neutralCount = scoredDetails.filter((item) => item.score === 3).length;
  const negativeCount = scoredDetails.filter((item) => (item.score ?? 0) <= 2).length;

  return {
    meta: {
      moduleId: module?.id ?? null,
      moduleTitle: module?.title ?? null,
      subject: module?.subject ?? null,
      description: module?.description ?? null,
      studentId: userId,
      studentName,
      totalQuestions: questions.length,
      answered: responses.length,
      completed: responses.length >= questions.length,
      completedAt: new Date().toISOString(),
    },
    metrics: {
      averageScore,
      scoredResponses: numericScores.length,
      positiveCount,
      neutralCount,
      negativeCount,
    },
    responses: scoredDetails,
  };
};

const initialFromName = (value?: string | null) => {
  if (!value) return "U";
  const trimmed = value.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "U";
};

const includesIdentifier = (name: string, identifiers: string[]) =>
  identifiers.some((id) => id && name.toLowerCase().includes(id.toLowerCase()));

function MoodAIPageContent() {
  const searchParams = useSearchParams();
  const moduleId = searchParams.get("module");
  const [module, setModule] = useState<CurriculumModule | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sentimentQuestions, setSentimentQuestions] = useState<SentimentQuestion[]>([]);
  const [questionFlowActive, setQuestionFlowActive] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [responses, setResponses] = useState<
    Array<{ questionId: string; prompt: string; response: string; createdAt: string }>
  >([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("Student");
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const tonePlayerRef = useRef(createTonePlayer());
  const totalQuestions = sentimentQuestions.length;
  const currentQuestionNumber =
    totalQuestions === 0 ? 0 : Math.min(questionFlowActive ? currentQuestionIdx + 1 : currentQuestionIdx, totalQuestions);
  const currentQuestion = sentimentQuestions[currentQuestionIdx] ?? null;

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
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data?.user || cancelled) return;
        setUserId(data.user.id);
        const { data: profile } = await supabase.from("profiles").select("full_name,email").eq("id", data.user.id).maybeSingle();
        if (cancelled) return;
        const name = (profile as { full_name?: string; email?: string } | null)?.full_name || data.user.email || "Student";
        setStudentName(name);
      } catch {
        if (!cancelled) setStudentName("Student");
      }
    };
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkExisting = async () => {
      if (!module || !userId) return;
      try {
        const moduleSegment = sanitizeSegment(module.title);
        const moduleKey = sanitizeSegment(module.id);
        const folder = `sentiment-metrics/${moduleSegment}-${moduleKey}`;
        const idSegment = sanitizeSegment(userId);
        const studentSegment = sanitizeSegment(studentName || userId);
        const identifiers = [idSegment, studentSegment];
        const { data, error } = await supabase.storage
          .from("curriculum-assets")
          .list(folder, { limit: 100, offset: 0, sortBy: { column: "name", order: "desc" } });
        if (error || !data) return;
        const hasExisting = data.some((item) => includesIdentifier(item.name, identifiers));
        if (cancelled) return;
        if (hasExisting) {
          setAlreadyCompleted(true);
          setQuestionFlowActive(false);
          setSentimentQuestions([]);
          setMessages([{ role: "assistant", content: "You've already completed this MoodAI check for this activity." }]);
        }
      } catch {
        // ignore failures
      }
    };
    void checkExisting();
    return () => {
      cancelled = true;
    };
  }, [module, userId, studentName]);

  useEffect(() => {
    if (moduleId && !module) return;
    if (alreadyCompleted) {
      setSentimentQuestions([]);
      setQuestionFlowActive(false);
      setMessages([
        { role: "assistant", content: "You've already completed this MoodAI check for this activity." },
      ]);
      return;
    }
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
    const intro = buildIntroPayload(module, qs.length);
    setMessages([
      {
        role: "assistant",
        content: intro.summary,
        variant: "intro",
        introTitle: intro.headline,
        introSections: intro.sections,
      },
      { role: "assistant", content: `Q1/${qs.length}: ${qs[0].prompt}` },
    ]);
    setResponses([]);
    setAnalysisStatus(null);
    setSavingAnalysis(false);
  }, [moduleId, module, alreadyCompleted]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(
    () => () => {
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
      }
      tonePlayerRef.current.close();
    },
    [],
  );

  const appendAssistantMessage = (text: string) => {
    setSending(true);
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: text }]);
      setSending(false);
      void tonePlayerRef.current.playTone(520, 120);
      typingTimerRef.current = null;
    }, TYPING_DELAY_MS);
  };

  const saveAnalysisToStorage = async (analysis: ReturnType<typeof buildSentimentAnalysis>) => {
    if (!analysis.meta.moduleId && !analysis.meta.moduleTitle) {
      setAnalysisStatus("Missing activity context; unable to save sentiment analysis.");
      return null;
    }
    setSavingAnalysis(true);
    setAnalysisStatus("Saving sentiment analysis for admin review...");
    try {
      const moduleSegment = sanitizeSegment(analysis.meta.moduleTitle || analysis.meta.moduleId || "activity");
      const moduleKey = sanitizeSegment(analysis.meta.moduleId || "activity");
      const studentSegment = sanitizeSegment(studentName || userId || "student");
      const userSegment = sanitizeSegment(userId || "anonymous");
      const fileName = `${studentSegment}-${userSegment}-${Date.now()}.json`;
      const pathPrefix = `sentiment-metrics/${moduleSegment}-${moduleKey}`;
      const payload = {
        ...analysis,
        storage: {
          bucket: "curriculum-assets",
          path: `${pathPrefix}/${fileName}`,
        },
      };
      const file = new File([JSON.stringify(payload, null, 2)], fileName, { type: "application/json" });
      await uploadFileToBucket({
        bucket: "curriculum-assets",
        file,
        pathPrefix,
        fileName,
      });
      setAnalysisStatus("End of chat.");
      return payload.storage.path;
    } catch (error) {
      console.error("Sentiment save failed", error);
      setAnalysisStatus("Unable to save sentiment analysis right now.");
      return null;
    } finally {
      setSavingAnalysis(false);
    }
  };

  const handleSend = async (provided?: string) => {
    const value = (provided ?? input).trim();
    if (!value || sending) return;
    setMessages((prev) => [...prev, { role: "user", content: value }]);
    void tonePlayerRef.current.playTone(760, 120);
    setInput("");

    if (questionFlowActive && sentimentQuestions.length > 0) {
      const question = sentimentQuestions[currentQuestionIdx];
      setResponses((prev) => [
        ...prev,
        {
          questionId: question.id,
          prompt: question.prompt,
          response: value,
          createdAt: new Date().toISOString(),
        },
      ]);

      const nextIdx = currentQuestionIdx + 1;
      if (nextIdx < sentimentQuestions.length) {
        setCurrentQuestionIdx(nextIdx);
        appendAssistantMessage(`Q${nextIdx + 1}/${sentimentQuestions.length}: ${sentimentQuestions[nextIdx].prompt}`);
      } else {
        setQuestionFlowActive(false);
        setCurrentQuestionIdx(sentimentQuestions.length);
        appendAssistantMessage("Thanks for sharing how you feel. That's all the sentiment questions for now.");
        const analysis = buildSentimentAnalysis({
          module,
          questions: sentimentQuestions,
          responses: [
            ...responses,
            {
              questionId: question.id,
              prompt: question.prompt,
              response: value,
              createdAt: new Date().toISOString(),
            },
          ],
          studentName,
          userId,
        });
        await saveAnalysisToStorage(analysis);
      }
      return;
    }

    appendAssistantMessage("The sentiment check is complete. If you want to revisit the activity, go back to the activity page.");
  };

  return (
    <main className="section-padding space-y-6 h-[calc(100vh-80px)] flex flex-col">
      <div className="glass-panel rounded-2xl border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-white">MoodAI Sentiment Check</h1>
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
                <p className="text-lg font-semibold text-white">I will guide you through a quick mood check.</p>
                <p className="text-sm text-slate-400 max-w-md mt-2">
                  Answer each question to share how you feel about {module?.title ?? "this activity"} - there are no right or wrong answers.
                </p>
              </div>
            )}
            {messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              const avatarLetter = isUser ? initialFromName(studentName) : "M";
              const isIntro = msg.variant === "intro" && Array.isArray(msg.introSections) && msg.introSections.length > 0;
              return (
                <div
                  key={idx}
                  className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="h-8 w-8 rounded-full bg-accent text-true-white grid place-items-center text-xs font-semibold shadow-glow">
                      {avatarLetter}
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] rounded-[22px] px-4 py-3 text-sm leading-relaxed shadow-md ${
                      isUser
                        ? "bg-accent text-true-white border border-accent/60"
                        : "bg-white/5 text-slate-100 border border-white/10"
                    } ${isUser ? "self-end" : ""}`}
                  >
                    {isIntro ? (
                      <div className="space-y-4">
                        {msg.introTitle && (
                          <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-900/80 via-emerald-800/80 to-emerald-900/60 px-4 py-3 shadow-lg shadow-emerald-900/40">
                            <h2 className="text-2xl md:text-3xl font-bold text-emerald-50 tracking-tight">{msg.introTitle}</h2>
                            <p className="text-emerald-100 mt-1">{msg.content}</p>
                          </div>
                        )}
                        <div className="grid gap-3">
                          {msg.introSections?.map((section, sectionIdx) => (
                            <div
                              key={`${section.title}-${sectionIdx}`}
                              className="rounded-xl border border-emerald-500/35 bg-emerald-950/70 px-4 py-3 shadow-md shadow-emerald-950/50"
                            >
                              <h3 className="text-lg md:text-xl font-semibold text-emerald-50">{section.title}</h3>
                              {section.paragraph && <p className="text-emerald-100 mt-2">{section.paragraph}</p>}
                              {section.bullets && section.bullets.length > 0 && (
                                <ul className="mt-3 space-y-2 text-emerald-50">
                                  {section.bullets.map((bullet, bulletIdx) => (
                                    <li key={`${section.title}-bullet-${bulletIdx}`} className="flex gap-3 items-start">
                                      <span className="mt-[9px] h-2 w-2 rounded-full bg-emerald-400 shadow-glow" aria-hidden />
                                      <span>{bullet}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {isUser && (
                    <div className="h-8 w-8 rounded-full border border-emerald-500/60 bg-emerald-500 text-xs text-white grid place-items-center font-semibold shadow-md">
                      {avatarLetter}
                    </div>
                  )}
                </div>
              );
            })}
            {sending && (
              <div className="flex items-end gap-2 justify-start">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent to-accent-strong text-true-white grid place-items-center text-xs font-semibold shadow-glow">
                  M
                </div>
                <div className="rounded-[18px] px-4 py-3 border border-white/10 shadow-md bg-gradient-to-r from-white/20 via-white/10 to-white/5">
                    <div className="flex items-center gap-2 text-slate-200">
                      <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-300">Typing</span>
                      <div className="flex items-center gap-1">
                        {[0, 1, 2].map((dot) => (
                          <span
                            key={dot}
                            className="h-2 w-2 rounded-full bg-accent animate-bounce shadow-glow"
                            style={{ animationDelay: `${dot * 0.18}s` }}
                          />
                        ))}
                      </div>
                    </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-white/10 bg-white/5">
            {analysisStatus && (
              <div className="text-xs text-slate-400 mb-2 flex items-center gap-2">
                <span>{analysisStatus}</span>
                {savingAnalysis && <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />}
              </div>
            )}
            {currentQuestion && questionFlowActive && (
              <div className="mb-3 space-y-2">
                {currentQuestion.type === "scale" && (
                  <div className="flex gap-2 flex-wrap">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => void handleSend(String(value))}
                        className="h-10 w-10 rounded-full border border-accent/40 bg-accent/10 text-white font-semibold hover:border-accent hover:bg-accent/20 transition"
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                )}
                {currentQuestion.type === "mcq" && currentQuestion.options && (
                  <div className="grid grid-cols-2 gap-2">
                    {currentQuestion.options.map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => void handleSend(opt.label)}
                        className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-left text-white hover:border-accent hover:bg-accent/20 transition"
                      >
                        <span className="font-semibold mr-2">{opt.label})</span>
                        {opt.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                onClick={() => void handleSend()}
                disabled={
                  !input.trim() || sending || totalQuestions === 0 || !questionFlowActive || savingAnalysis
                }
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
