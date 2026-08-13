import { useEffect, useRef, useState } from "react";

// In production the backend lives on its own origin (set VITE_API_URL at build
// time). In dev this stays empty so requests hit /api and Vite proxies them.
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

// Cap the conversation so a single session can't run forever.
const MESSAGE_LIMIT = 10;
const SIGN_OFF =
  "Alright, that's about 10 questions, I'm off to go water my plants now 🌱 Catch you later! Tap New chat if you want another round.";

/** Circular avatar: shows /avatar.png, falls back to an emoji until it exists. */
function Avatar({ className = "" }) {
  const [ok, setOk] = useState(true);
  return (
    <div className={`avatar ${className}`}>
      {ok ? (
        <img src="/avatar.png" alt="Shahzaib" onError={() => setOk(false)} />
      ) : (
        <span className="avatar-fallback" role="img" aria-label="avatar">
          🧑‍💻
        </span>
      )}
    </div>
  );
}

/** Animated three-dot typing indicator. */
function TypingDots() {
  return (
    <span className="typing-dots" aria-label="Thinking">
      <span></span>
      <span></span>
      <span></span>
    </span>
  );
}

/**
 * Single-page chat UI. Each assistant message carries the source filenames that
 * backed it, and a note when the answer was produced without retrieval.
 */
export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    // Keep the newest message in view.
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const userCount = messages.filter((m) => m.role === "user").length;
  const limitReached = userCount >= MESSAGE_LIMIT;

  function reset() {
    setMessages([]);
    setInput("");
    setLoading(false);
  }

  async function send() {
    const question = input.trim();
    if (!question || loading || limitReached) return;

    // Prior turns (before this question) give the agent conversational context.
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", text: data.answer }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "error", text: err.message || "Something went wrong." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const suggestions = [
    "What have you worked on?",
    "What are your strongest skills?",
    "Tell me about your experience",
  ];

  return (
    <div className="app">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="chat-card">
        <header className="header">
          <Avatar className="avatar-lg" />
          <div className="header-text">
            <h1>Shahzaib Ali</h1>
            <p>
              <span className="dot-online" />
              <span className="subtitle-full">
                Software Developer · Cricketer · Home Cook · Plant Parent · Cat Lover
              </span>
              <span className="subtitle-short">
                coding · cricket · cooking · cats · plants
              </span>
            </p>
          </div>
        </header>

        <div className="messages" ref={listRef}>
          {messages.length === 0 && (
            <div className="empty">
              <div className="empty-emoji">👋</div>
              <p>
                Hi, <strong>Welcome!</strong>
                <br /> You can ask me anything about me or my work
              </p>
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s} className="chip" onClick={() => setInput(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`row row-${msg.role}`}>
              {msg.role !== "user" && <Avatar className="avatar-sm" />}
              <div className="msg">
                <div className={`bubble bubble-${msg.role}`}>{msg.text}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="row row-assistant">
              <Avatar className="avatar-sm" />
              <div className="msg">
                <div className="bubble bubble-assistant">
                  <TypingDots />
                </div>
              </div>
            </div>
          )}

          {limitReached && !loading && (
            <div className="row row-assistant">
              <Avatar className="avatar-sm" />
              <div className="msg">
                <div className="bubble bubble-assistant">{SIGN_OFF}</div>
              </div>
            </div>
          )}
        </div>

        {limitReached ? (
          <div className="composer composer-limit">
            <button className="reset-cta" onClick={reset}>
              Start a new chat
            </button>
          </div>
        ) : (
          <div className="composer">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask something ..."
              rows={1}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path
                  d="M4 12l16-8-6 8 6 8-16-8z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  fill="currentColor"
                />
              </svg>
            </button>
            {messages.length > 0 && (
              <button
                className="reset-btn"
                onClick={reset}
                title="New chat"
                aria-label="New chat"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
