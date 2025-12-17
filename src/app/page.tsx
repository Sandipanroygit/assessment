"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import heroSlide1 from "../../image/image1.jpg";
import heroSlide2 from "../../image/image2.jpg";
import heroSlide3 from "../../image/image3.jpg";
import logo from "../../image/logo.jpg";
import { supabase } from "@/lib/supabaseClient";

const features = [
  {
    title: "Interactive learning",
    description: "Videos, Python files, and lesson plans that keep students engaged.",
  },
  {
    title: "Drone mastery",
    description: "Flight fundamentals, safety checklists, and mission planning by grade.",
  },
  {
    title: "Hands-on learning",
    description: "Modules with headset-ready projects and spatial walkthroughs.",
  },
  {
    title: "Hands-on labs",
    description: "Stepwise builds, kit-friendly projects, and maintenance recipes.",
  },
  {
    title: "Customizable by grade",
    description: "Curate by grade, subject, and module with one click.",
  },
  {
    title: "Ready for commerce",
    description: "Built-in shopping for drones, immersive kits, and printer bundles.",
  },
];


const testimonials = [
  {
    name: "Aditi, STEM Coordinator",
    school: "Delhi Public School",
    quote:
      "Students shipped their first drone mission in 3 weeks. The ready-to-teach flow saved our team countless hours.",
  },
  {
    name: "Mr. Johnson, Principal",
    school: "Greenfield Academy",
    quote:
      "The immersive modules help us pitch innovation to parents—and the analytics help me see real engagement.",
  },
  {
    name: "Ravi, Robotics Lead",
    school: "Springfield High",
    quote:
      "Procurement is seamless. We bundle curriculum, drone kits, and hands-on learning tools in one checkout.",
  },
];


const heroSlides = [heroSlide1, heroSlide2, heroSlide3];

const productHighlights = [
  {
    name: "Classroom Drone Kit",
    price: "₹24,999",
    note: "Includes spare rotors, batteries, and STEM challenges.",
  },
  {
    name: "Hands-on Starter Pack",
    price: "₹18,499",
    note: "Headsets, controllers, and classroom-ready onboarding.",
  },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [isAuthed, setIsAuthed] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const defaultAdminEmail = process.env.NEXT_PUBLIC_DEFAULT_ADMIN_EMAIL?.toLowerCase?.() ?? "";
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: "Hi! Ask me about the curriculum dashboard, shopping page, or how to get started.",
    },
  ]);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    school: "",
    message: "",
  });
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setHeroSlideIndex((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      setIsAuthed(Boolean(user));
      if (user) {
        const role = user.user_metadata?.role || null;
        const isDefaultAdmin = user.email?.toLowerCase() === defaultAdminEmail;
        setUserRole(isDefaultAdmin ? "admin" : role);
      } else {
        setUserRole(null);
      }
    };
    checkUser();
  }, [defaultAdminEmail]);

  const openPanel = () => {
    setPanelVisible(true);
    requestAnimationFrame(() => setPanelOpen(true));
  };

  const closePanel = () => {
    setPanelOpen(false);
    setTimeout(() => setPanelVisible(false), 350);
  };

  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      const assistantReply = data.reply ?? data.error ?? "Assistant unavailable.";
      setMessages((prev) => [...prev, { role: "assistant", content: assistantReply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const submitContact = () => {
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      return;
    }
    setContactSubmitted(true);
    setContactForm({ name: "", email: "", school: "", message: "" });
  };

  useEffect(() => {
    if (faqOpen) {
      const timer = setTimeout(() => setFaqOpen(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [faqOpen]);


  return (
    <main className="min-h-screen text-foreground">
      <header className="relative px-6 md:px-9 py-6 flex items-center justify-between sticky top-0 z-40 bg-gradient-to-r from-white/40 via-white/20 to-white/40 supports-[backdrop-filter]:bg-white/10 border border-white/20 shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur-3xl backdrop-saturate-200">
        <div className="flex items-center gap-3">
          <div className="relative h-[70px] w-[250px] md:w-[300px] p-3">
            <Image
              src={logo}
              alt="Curriculum Dashboard logo"
              fill
              sizes="144px"
              className="object-contain"
              priority
            />
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-4 text-sm">
          <Link href="/shop" className="hover:text-white transition-colors">
            Shopping Page
          </Link>
          <Link href="#features" className="hover:text-white transition-colors">
            Features
          </Link>
          <button
            onClick={() => {
              setContactOpen(true);
              setFaqOpen(false);
            }}
            className="hover:text-white transition-colors text-sm font-semibold"
          >
            Talk to sales
          </button>
          <div className="hidden md:flex flex-col items-start gap-1">
            {!isAuthed ? (
              <Link
                href="/login"
                className="bg-accent text-slate-50 font-semibold px-4 py-2 rounded-full shadow-glow hover:translate-y-[-1px] transition-transform"
              >
                Login / Sign In
              </Link>
            ) : (
              <Link
                href={userRole === "admin" ? "/admin" : "/customer"}
                className="bg-accent text-slate-50 font-semibold px-4 py-2 rounded-full shadow-glow hover:translate-y-[-1px] transition-transform"
              >
                Go to dashboard
              </Link>
            )}
          </div>
          <button
            onClick={openPanel}
            className="h-11 w-11 rounded-full border border-accent/20 bg-white/70 flex flex-col items-center justify-center gap-1 hover:border-accent-strong hover:bg-white shadow-glow transition"
            aria-label="Open quick panel"
          >
            <span className="block w-5 h-0.5 bg-foreground rounded-full"></span>
            <span className="block w-5 h-0.5 bg-foreground rounded-full"></span>
            <span className="block w-5 h-0.5 bg-foreground rounded-full"></span>
          </button>
        </nav>
        <button
          className="md:hidden h-10 w-10 rounded-full border border-accent/20 bg-white/80 grid place-items-center shadow z-50"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Toggle menu"
        >
          <span className="block w-6 h-0.5 bg-foreground mb-1.5"></span>
          <span className="block w-6 h-0.5 bg-foreground mb-1.5"></span>
          <span className="block w-6 h-0.5 bg-foreground"></span>
        </button>
        {menuOpen && (
          <div className="absolute left-4 right-4 top-full mt-3 z-50 rounded-2xl border border-accent/20 bg-white/95 backdrop-blur-lg shadow-2xl p-4 flex flex-col gap-3 md:hidden text-foreground">
            <Link href="/shop" className="hover:text-accent-strong transition-colors">
              Shopping Page
            </Link>
            <Link href="#features" className="hover:text-accent-strong transition-colors">
              Features
            </Link>
            <button
              onClick={() => {
                setContactOpen(true);
                setMenuOpen(false);
                setFaqOpen(false);
              }}
              className="hover:text-accent-strong text-left transition-colors"
            >
              Talk to sales
            </button>
            {!isAuthed ? (
              <Link
                href="/login"
                className="bg-accent text-slate-50 font-semibold px-4 py-2 rounded-xl text-center"
              >
                Login / Sign In
              </Link>
            ) : (
              <Link
                href="/customer"
                className="bg-accent text-slate-50 font-semibold px-4 py-2 rounded-xl text-center"
              >
                Go to dashboard
              </Link>
            )}
            <button
              onClick={openPanel}
              className="px-4 py-2 rounded-xl border border-accent/30 text-foreground"
            >
              Open Panel
            </button>
          </div>
        )}
      </header>

      <section className="section-padding relative overflow-hidden">
        <div className="absolute inset-0 opacity-60 bg-hero-grid [background-size:50px_50px]" />
        <div className="relative grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 px-3 py-1 rounded-full text-sm text-white">
              <span className="h-2 w-2 rounded-full bg-accent-strong shadow-glow" />
              Brewed for modern classrooms
            </div>
            <h1 className="text-4xl lg:text-5xl font-semibold leading-tight text-white">
              Redefining Education through Drone-Powered Experiential Learning
            </h1>
            <p className="text-lg text-accent-strong max-w-2xl">
              A future-focused learning ecosystem where students explore real-world concepts through
              guided drone experiments, inquiry, and experiential discovery.
            </p>
            <div className="flex flex-wrap gap-4">
              {!isAuthed ? (
                <Link
                  href="/login"
                  className="bg-accent text-slate-50 px-6 py-3 rounded-full font-semibold shadow-glow hover:translate-y-[-1px] transition-transform"
                >
                  Login / Sign In
                </Link>
              ) : (
                <Link
                  href="/customer"
                  className="bg-accent text-slate-50 px-6 py-3 rounded-full font-semibold shadow-glow hover:translate-y-[-1px] transition-transform"
                >
                  Go to dashboard
                </Link>
              )}
              <Link
                href="/shop"
                className="border border-accent/30 px-6 py-3 rounded-full font-semibold text-white hover:border-accent-strong transition bg-white/70"
              >
                Browse Products
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm text-slate-200">
              {[
                ["120+", "Curriculum modules"],
                ["80+", "Schools onboarded"],
                ["24/7", "Support & analytics"],
              ].map(([stat, label]) => (
                <div key={label} className="glass-panel rounded-2xl p-4">
                  <p className="text-2xl font-semibold text-white">{stat}</p>
                  <p className="text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel relative rounded-3xl overflow-hidden border border-accent/15">
            <Image
              key={heroSlides[heroSlideIndex].src}
              src={heroSlides[heroSlideIndex]}
              alt="Drone and hands-on learning in a classroom"
              width={1200}
              height={900}
              className="h-full w-full object-cover opacity-90 transition-opacity duration-700"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 space-y-3 bg-gradient-to-t from-white/80 via-white/40 to-transparent text-foreground backdrop-blur-[2px]">
              <div className="flex flex-wrap gap-2">
                {["Drones", "Hands-on learning", "Self Assessment"].map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full bg-white/70 text-sm text-accent-strong border border-accent/20 shadow-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-slate-800 text-sm">
                Purpose-built content with videos, code files, and printable docs. Ready for admins
                to manage and for learners to explore.
              </p>
              <div className="flex gap-2 pt-1">
                {heroSlides.map((slide, index) => (
                  <span
                    key={slide.src}
                    className={`h-1.5 w-6 rounded-full border border-accent/20 transition-colors ${
                      index === heroSlideIndex ? "bg-accent-strong" : "bg-accent/25"
                    }`}
                    aria-label={`Slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="section-padding space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-accent-strong uppercase text-xs tracking-[0.2em]">Platform</p>
            <h2 className="text-3xl font-semibold text-white">What makes us different</h2>
          </div>
          {!isAuthed && (
            <Link href="/login" className="text-sm text-slate-300 hover:text-white underline">
              Sign in to see your dashboard
            </Link>
          )}
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div key={feature.title} className="glass-panel rounded-2xl p-6 space-y-3">
              <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/20 grid place-items-center text-accent-strong">
                ✦
              </div>
              <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
              <p className="text-slate-300 text-sm">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section-padding space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-accent-strong uppercase text-xs tracking-[0.2em]">Testimonials</p>
            <h2 className="text-3xl font-semibold text-white">Schools seeing results</h2>
          </div>
          <Link href="/customer" className="text-sm text-slate-300 hover:text-white underline">
            Explore modules
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((item) => (
            <div key={item.name} className="glass-panel rounded-2xl p-6 space-y-3">
              <p className="text-slate-300 text-sm leading-relaxed">“{item.quote}”</p>
              <div className="pt-2 text-sm">
                <p className="text-white font-semibold">{item.name}</p>
                <p className="text-slate-400">{item.school}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section-padding space-y-6">
        <div className="glass-panel rounded-3xl p-6 grid md:grid-cols-2 gap-6 items-center">
          <div>
            <p className="text-accent-strong uppercase text-xs tracking-[0.2em]">Bundles</p>
            <h3 className="text-2xl font-semibold text-white">Shopping made for schools</h3>
            <p className="text-slate-300 text-sm mt-3">
              Browse hardware that pairs with your curriculum. Add to cart, checkout, and track
              orders with Supabase-powered fulfillment.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {productHighlights.map((product) => (
              <div key={product.name} className="rounded-2xl border border-accent/20 p-4 bg-white">
                <p className="text-sm text-accent-strong">Featured</p>
                <h4 className="text-white font-semibold mt-1">{product.name}</h4>
                <p className="text-lg font-semibold text-white mt-2">{product.price}</p>
                <p className="text-slate-400 text-sm mt-1">{product.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer id="contact" className="section-padding border-t border-accent/15 mt-12 text-sm text-slate-400">
        <div className="grid md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <p className="text-white font-semibold">Curriculum Dashboard</p>
            <p>Made for STEM programs focused on drones and hands-on learning.</p>
          </div>
          <div className="space-y-2">
            <p className="text-white font-semibold">Company</p>
            <Link href="#" className="block hover:text-white">
              About Us
            </Link>
            <Link href="#" className="block hover:text-white">
              Contact
            </Link>
          </div>
          <div className="space-y-2">
            <p className="text-white font-semibold">Legal</p>
            <Link href="#" className="block hover:text-white">
              Privacy Policy
            </Link>
            <Link href="#" className="block hover:text-white">
              Terms of Service
            </Link>
          </div>
          <div className="space-y-2">
            <p className="text-white font-semibold">Social</p>
            <Link href="#" className="block hover:text-white">
              LinkedIn
            </Link>
            <Link href="#" className="block hover:text-white">
              YouTube
            </Link>
          </div>
        </div>
      </footer>

      <button
        className="fixed bottom-6 right-6 h-12 px-5 rounded-full bg-accent text-slate-50 font-semibold ring-2 ring-accent/30 shadow-[0_12px_30px_rgba(0,98,65,0.35)] hover:ring-accent/50 hover:shadow-[0_16px_40px_rgba(0,98,65,0.45)] hover:-translate-y-1 transition-transform transition-shadow flex items-center gap-2 z-50"
        onClick={() => setChatOpen(true)}
      >
        Need help?
      </button>

      {faqOpen && (
        <div className="fixed top-1/2 right-14 -translate-y-1/2 w-72 rounded-2xl border border-accent/20 bg-white/95 backdrop-blur-md shadow-2xl p-4 space-y-3 z-50">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-accent-strong">Quick FAQ</p>
            <button
              className="h-8 w-8 rounded-full border border-accent/20 text-accent-strong grid place-items-center bg-white"
              onClick={() => setFaqOpen(false)}
              aria-label="Close FAQ"
            >
              ×
            </button>
          </div>
          <div className="space-y-2 text-sm text-slate-700">
            <div>
              <p className="font-semibold text-foreground">How do I get a demo?</p>
              <p>Use “Talk to sales” and we’ll share a guided walkthrough.</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Can students self-learn?</p>
              <p>Yes. Modules include videos, docs, and code for independent practice.</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Do you support schools?</p>
              <p>We onboard districts with admin controls and class-ready kits.</p>
            </div>
          </div>
        </div>
      )}

      <button
        className="fixed top-1/2 right-1 -translate-y-1/2 h-24 w-10 border border-accent-strong/30 bg-[#0b1d36] text-slate-50 text-sm shadow-[0_10px_24px_rgba(11,29,54,0.28)] hover:-translate-y-[55%] transition-transform z-50 rotate-180 [writing-mode:vertical-rl] tracking-wide rounded-xl"
        onClick={() => {
          setFaqOpen((v) => !v);
          setChatOpen(false);
        }}
      >
        Quick FAQ
      </button>

      {chatOpen && (
        <div className="fixed bottom-24 right-6 w-80 rounded-2xl border border-accent/20 bg-white p-3 z-40 space-y-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-accent-strong uppercase tracking-[0.2em]">Assistant</p>
              <p className="text-white font-semibold">How may I help you today?</p>
            </div>
            <button
              className="h-8 w-8 rounded-full border border-accent/30 text-accent-strong grid place-items-center bg-white"
              onClick={() => setChatOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </div>
          <div className="h-56 overflow-auto space-y-2 pr-1">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`rounded-xl px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-accent text-slate-50 ml-auto max-w-[85%]"
                    : "bg-white text-slate-900 mr-auto max-w-[90%] border border-accent/20"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {chatLoading && <p className="text-xs text-slate-400">Thinking...</p>}
          </div>
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              className="flex-1 rounded-lg bg-white border border-accent/20 px-3 py-2 text-sm text-slate-900"
              placeholder="Ask about curriculum, shopping, dashboards..."
            />
            <button
              className="px-3 py-2 rounded-lg bg-accent text-slate-50 font-semibold shadow-glow disabled:opacity-60"
              onClick={sendMessage}
              disabled={chatLoading}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {contactOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setContactOpen(false)}
            aria-label="Close contact form"
          />
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[420px] bg-white border-l border-accent/20 shadow-2xl p-6 flex flex-col gap-4 transition-transform duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-accent-strong uppercase tracking-[0.2em]">Talk to sales</p>
                <p className="text-lg font-semibold text-foreground">We’ll reach out within a day</p>
              </div>
              <button
                className="h-9 w-9 rounded-full border border-accent/20 text-accent-strong grid place-items-center bg-white"
                onClick={() => setContactOpen(false)}
                aria-label="Close contact form"
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={contactForm.name}
                onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-xl border border-accent/20 bg-white/80 px-3 py-2 text-sm text-foreground placeholder:text-slate-400 focus:border-accent-strong outline-none"
                placeholder="Your name"
              />
              <input
                value={contactForm.email}
                onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-xl border border-accent/20 bg-white/80 px-3 py-2 text-sm text-foreground placeholder:text-slate-400 focus:border-accent-strong outline-none"
                placeholder="Work email"
              />
              <input
                value={contactForm.school}
                onChange={(e) => setContactForm((prev) => ({ ...prev, school: e.target.value }))}
                className="w-full rounded-xl border border-accent/20 bg-white/80 px-3 py-2 text-sm text-foreground placeholder:text-slate-400 focus:border-accent-strong outline-none"
                placeholder="School / organization (optional)"
              />
              <textarea
                value={contactForm.message}
                onChange={(e) => setContactForm((prev) => ({ ...prev, message: e.target.value }))}
                className="w-full rounded-xl border border-accent/20 bg-white/80 px-3 py-2 text-sm text-foreground placeholder:text-slate-400 focus:border-accent-strong outline-none h-28 resize-none"
                placeholder="What do you need? e.g., curriculum demo, pricing, onboarding..."
              />
            </div>
            {contactSubmitted && (
              <div className="rounded-xl bg-accent/10 border border-accent/20 px-3 py-2 text-sm text-accent-strong">
                Got it! We’ll email you with next steps.
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">We respond within 1 business day.</p>
              <button
                className="px-4 py-2 rounded-full bg-accent text-slate-50 font-semibold shadow-glow disabled:opacity-60"
                onClick={submitContact}
                disabled={contactSubmitted}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {panelVisible && (
        <div className="fixed inset-0 z-50">
          <div
            className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
              panelOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={closePanel}
          />
          <div
            className={`absolute right-0 top-0 bottom-0 w-72 bg-surface border-l border-accent/20 shadow-2xl p-6 flex flex-col gap-4 transition-transform duration-400 ${
              panelOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-white">Quick Access</p>
              <button
                aria-label="Close panel"
                onClick={closePanel}
                className="h-9 w-9 rounded-full border border-accent/20 grid place-items-center text-white"
              >
                ✕
              </button>
            </div>
            <Link
              href="/shop"
              className="w-full px-4 py-3 rounded-xl bg-accent text-slate-50 font-semibold text-center"
              onClick={closePanel}
            >
              Shopping
            </Link>
            <Link
              href="/settings"
              className="w-full px-4 py-3 rounded-xl border border-accent/20 text-white text-center hover:border-accent-strong"
              onClick={closePanel}
            >
              Settings
            </Link>
            <Link
              href="#contact"
              className="w-full px-4 py-3 rounded-xl border border-accent/20 text-white text-center hover:border-accent-strong"
              onClick={closePanel}
            >
              Contact
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}












