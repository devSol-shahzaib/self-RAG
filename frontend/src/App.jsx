import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";

// In production the backend lives on its own origin (set VITE_API_URL at build
// time). In dev this stays empty so requests hit /api and Vite proxies them.
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

// Each session gets a quota of questions. A nudge shows at the halfway mark.
const MESSAGE_LIMIT = 10;
const HALFWAY = Math.floor(MESSAGE_LIMIT / 2);
const LIMIT_TEXT = `Alright, that's about ${MESSAGE_LIMIT} questions — I'm off to go water my plants now 🌱 Catch you later!`;

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
 * Full-screen goodbye shown when the user taps OK at the quota limit. The
 * avatar appears to lift off from the header and grow to the center of the
 * screen (a FLIP transition from `origin`), then winks (avatar_normal ->
 * avatar_wink). Falls back to emoji if the images are missing.
 */
function GoodbyeOverlay({ origin }) {
  const faceRef = useRef(null);
  const [imgOk, setImgOk] = useState(true);

  useLayoutEffect(() => {
    const el = faceRef.current;
    if (!el || !origin) return;
    // Where the face naturally sits (centered), then map it back to the header
    // avatar and animate the transform away so it grows into place.
    const r = el.getBoundingClientRect();
    const dx = origin.x - (r.left + r.width / 2);
    const dy = origin.y - (r.top + r.height / 2);
    const scale = origin.size / r.width;

    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    el.getBoundingClientRect(); // force reflow so the start transform sticks
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "translate(0px, 0px) scale(1)";
    });
  }, [origin]);

  return (
    <div className="goodbye-overlay">
      <div className="goodbye-card">
        <div
          className={`goodbye-face ${imgOk ? "" : "goodbye-face-emoji"}`}
          ref={faceRef}
        >
          {imgOk ? (
            <>
              <img
                className="gb-smile"
                src="/avatar_normal.png"
                alt="Shahzaib"
                onError={() => setImgOk(false)}
              />
              <img
                className="gb-wink"
                src="/avatar_wink.png"
                alt=""
                aria-hidden="true"
              />
            </>
          ) : (
            <>
              <span className="gb-smile">😊</span>
              <span className="gb-wink" aria-hidden="true">
                😉
              </span>
            </>
          )}
        </div>
        <p className="goodbye-text">See you next time! 👋</p>
        <p className="goodbye-hint">Refresh the page to start a new chat.</p>
      </div>
    </div>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [warned, setWarned] = useState(false);
  const [showGoodbye, setShowGoodbye] = useState(false);
  const [goodbyeOrigin, setGoodbyeOrigin] = useState(null);
  const listRef = useRef(null);

  // Capture the header avatar's position so the goodbye face can grow from it.
  function sayGoodbye() {
    const rect = document
      .querySelector(".header .avatar")
      ?.getBoundingClientRect();
    setGoodbyeOrigin(
      rect
        ? {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            size: rect.width,
          }
        : null,
    );
    setShowGoodbye(true);
  }

  useEffect(() => {
    // Keep the newest message in view.
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const userCount = messages.filter((m) => m.role === "user").length;
  const limitReached = userCount >= MESSAGE_LIMIT;
  const blocked = limitReached || sessionEnded;

  function reset() {
    setMessages([]);
    setInput("");
    setLoading(false);
    setMenuOpen(false);
    setSessionEnded(false);
    setWarned(false);
    setShowGoodbye(false);
    setGoodbyeOrigin(null);
  }

  async function send() {
    const question = input.trim();
    if (!question || loading || blocked) return;

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
        // This question's 1-based ordinal, so the agent knows how many are left.
        body: JSON.stringify({ question, history, warned, questionsUsed: userCount + 1 }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", text: data.answer }]);
      if (typeof data.warned === "boolean") setWarned(data.warned);
      if (data.sessionEnded) setSessionEnded(true);
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

  // Index of the message after which the halfway badge should appear.
  const halfwayIndex = (() => {
    if (userCount < HALFWAY) return -1;
    let count = 0;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === "user" && ++count === HALFWAY) return i;
    }
    return -1;
  })();

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
                Software Developer · Cricketer · Home Cook · Plant Parent · Cat
                Lover
              </span>
              <span className="subtitle-short">
                coding · cricket · cooking · cats · plants
              </span>
            </p>
          </div>

          {messages.length > 0 && !blocked && (
            <div className="header-actions">
              <button
                className="kebab-btn"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Menu"
                aria-expanded={menuOpen}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                >
                  <circle cx="12" cy="5" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="12" cy="19" r="1.7" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  <div
                    className="menu-backdrop"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="menu-popover">
                    <button className="menu-item" onClick={reset}>
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                      Reset chat
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
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
            <Fragment key={i}>
              <div className={`row row-${msg.role}`}>
                {msg.role !== "user" && <Avatar className="avatar-sm" />}
                <div className="msg">
                  <div className={`bubble bubble-${msg.role}`}>{msg.text}</div>
                </div>
              </div>

              {i === halfwayIndex && (
                <div className="halfway-badge">
                  🏁 Halfway there! {HALFWAY} of {MESSAGE_LIMIT} questions asked
                </div>
              )}
            </Fragment>
          ))}

          {loading && (
            <div className="row row-assistant">
              <Avatar className="avatar-sm" />
              <div className="msg">
                <div className="bubble bubble-assistant bubble-typing">
                  <TypingDots />
                </div>
              </div>
            </div>
          )}

          {limitReached && !loading && (
            <div className="row row-assistant">
              <Avatar className="avatar-sm" />
              <div className="msg">
                <div className="bubble bubble-assistant">{LIMIT_TEXT}</div>
                <button className="ok-btn ok-btn-inline" onClick={sayGoodbye}>
                  OK
                </button>
              </div>
            </div>
          )}
        </div>

        {limitReached ? null : sessionEnded ? (
          <div className="composer composer-blocked">
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
          </div>
        )}
      </div>

      {showGoodbye && <GoodbyeOverlay origin={goodbyeOrigin} />}
    </div>
  );
}
