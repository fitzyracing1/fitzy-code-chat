"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Citation = {
  repo: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  preview: string;
};

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

function uid() { return Math.random().toString(36).slice(2); }

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([{
    id: "welcome",
    role: "assistant",
    content: "Ask about any fitzyracing1 repository. Answers include citations (repo + file path).",
  }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const canSend = useMemo(() => input.trim().length > 0 && !busy, [input, busy]);

  async function send() {
    if (!canSend) return;
    const question = input.trim();
    setInput("");
    setError(null);
    const userMsg: Msg = { id: uid(), role: "user", content: question };
    const asstId = uid();
    setMessages((m) => [...m, userMsg, { id: asstId, role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Chat request failed (" + res.status + ")");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let citations: Citation[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() || "";
        for (const line of parts) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as { type: string; text?: string; citations?: Citation[]; error?: string };
          if (evt.type === "meta" && evt.citations) citations = evt.citations;
          if (evt.type === "token" && evt.text) {
            setMessages((m) => m.map((x) => x.id === asstId ? { ...x, content: x.content + evt.text } : x));
          }
          if (evt.type === "error") throw new Error(evt.error || "stream error");
          if (evt.type === "done") {
            setMessages((m) => m.map((x) => x.id === asstId ? { ...x, citations } : x));
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setMessages((m) => m.map((x) => x.id === asstId && !x.content ? { ...x, content: "Error: " + msg } : x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <div>
          <h1>Fitzy Code Chat</h1>
          <p>RAG over fitzyracing1 GitHub repositories</p>
        </div>
      </header>
      <main className="chat-messages">
        {messages.map((m) => (
          <article key={m.id} className={"bubble " + m.role}>
            <div className="bubble-meta">{m.role === "user" ? "You" : "Assistant"}</div>
            <div className="bubble-body">
              {m.role === "assistant" ? <ReactMarkdown>{m.content || (busy ? "..." : "")}</ReactMarkdown> : m.content}
            </div>
            {m.citations && m.citations.length > 0 && (
              <div className="citations">
                <div className="citations-title">Citations</div>
                <ul>
                  {m.citations.map((c, i) => (
                    <li key={c.repo + c.path + c.startLine + i}>
                      <span className="cite-idx">[{i + 1}]</span>{" "}
                      <strong>{c.repo}</strong>
                      <span className="cite-path"> / {c.path}:{c.startLine}-{c.endLine}</span>
                      <span className="cite-score"> score {c.score.toFixed(3)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
        <div ref={bottomRef} />
      </main>
      {error && <div className="chat-error">{error}</div>}
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the codebase..."
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
        />
        <button type="submit" disabled={!canSend}>{busy ? "Thinking..." : "Send"}</button>
      </form>
    </div>
  );
}
