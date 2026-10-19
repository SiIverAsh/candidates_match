import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, MessageSquare, Send, Square, Trash2, X, Sparkles, RefreshCw } from "lucide-react";
import { api } from "@/client/api";
import type { AiStatus, ChatMessage } from "../domain/models";

const SUGGESTIONS = ["如何判断匹配结果是否值得联系？", "怎样准备完整的候选人简历？", "帮我梳理一次候选人查询的步骤"];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    let active = true;
    api.aiStatus().then((value) => { if (active) { setStatus(value); setStatusError(false); } }).catch(() => { if (active) setStatusError(true); });
    input.current?.focus();
    return () => { active = false; };
  }, [open]);
  useEffect(() => { if (open) bottom.current?.scrollIntoView({ block: "end" }); }, [messages, pendingText, open, error]);

  function close() { setOpen(false); launcher.current?.focus(); }
  function stop() { controller.current?.abort(); controller.current = null; setPendingText(""); }
  async function refreshStatus() {
    setStatusError(false);
    try { setStatus(await api.aiStatus()); } catch { setStatusError(true); }
  }
  async function send(text = draft) {
    const content = text.trim();
    if (!content || controller.current || !status?.configured) return;
    const active = new AbortController();
    controller.current = active;
    const history = [...messages.slice(-18), { role: "user" as const, content }];
    setDraft(content); setPendingText(content); setError("");
    try {
      const answer = await api.askAi(history, active.signal);
      if (controller.current !== active) return;
      setMessages([...history, answer]); setDraft("");
    } catch (failure) {
      if (!active.signal.aborted) setError(failure instanceof Error ? failure.message : "消息发送失败，请重试。");
    } finally {
      if (controller.current === active) { controller.current = null; setPendingText(""); }
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(); }

  return <>
    <button ref={launcher} type="button" className="ai-launcher" aria-label="打开企业 AI 助手" aria-expanded={open} aria-controls="enterprise-ai-panel" onClick={() => setOpen((value) => !value)}><Sparkles size={21} /><span>企业 AI</span></button>
    {open ? <aside id="enterprise-ai-panel" className="ai-panel" role="dialog" aria-modal="false" aria-labelledby="ai-title" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      <header className="ai-heading"><div className="ai-heading-icon"><Bot size={23} /></div><div><h2 id="ai-title">企业 AI 助手</h2><small>{status?.configured ? "随时聊聊你的招聘问题" : "你的招聘工作助手"}</small></div><button type="button" className="ai-icon-button" title="清空对话" aria-label="清空对话" onClick={() => { stop(); setMessages([]); setDraft(""); setError(""); input.current?.focus(); }}><Trash2 size={16} /></button><button type="button" className="ai-icon-button" aria-label="关闭 AI 助手" onClick={close}><X size={20} /></button></header>
      <div className="ai-conversation" role="log" aria-live="polite" aria-relevant="additions text">
        {!messages.length && !pendingText ? <div className="ai-welcome"><div className="ai-welcome-icon"><MessageSquare size={28} /></div><h3>有什么可以帮你？</h3><p>一起理解匹配依据、整理简历信息，或讨论下一步联系思路。</p>{status?.configured ? <div className="ai-suggestions">{SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} onClick={() => void send(suggestion)}>{suggestion}<Send size={13} /></button>)}</div> : null}</div> : null}
        {statusError ? <div className="ai-config-notice" role="alert"><strong>服务状态获取失败</strong><button type="button" className="text-button" onClick={() => void refreshStatus()}><RefreshCw size={13} />重新检查</button></div> : status && !status.configured ? <div className="ai-config-notice"><strong>等待连接企业 AI</strong><p>管理员配置服务地址、模型和密钥后即可开始对话。</p><button type="button" className="text-button" onClick={() => void refreshStatus()}><RefreshCw size={13} />重新检查连接</button></div> : !status ? <p className="ai-status">正在检查服务状态…</p> : null}
        {messages.map((message, index) => <article key={index} className={`ai-message ${message.role}`}><span>{message.role === "user" ? "你" : "企业 AI"}</span><div>{message.content}</div></article>)}
        {pendingText ? <><article className="ai-message user"><span>你</span><div>{pendingText}</div></article><p className="ai-thinking" role="status"><span />正在思考…</p></> : null}
        {error ? <div className="ai-config-notice" role="alert"><p>{error}</p><button type="button" className="text-button" disabled={Boolean(pendingText)} onClick={() => void send()}>重新发送</button></div> : null}
        <div ref={bottom} />
      </div>
      <form className="ai-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="ai-message">向企业 AI 提问</label>
        <textarea ref={input} id="ai-message" placeholder={status?.configured ? "输入问题，Enter 发送，Shift+Enter 换行" : "企业 AI 配置完成后即可提问"} rows={3} maxLength={8000} value={draft} disabled={!status?.configured || Boolean(pendingText)} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
        <div className="ai-composer-actions"><small>{draft.length}/8000</small>{pendingText ? <button className="text-button" type="button" onClick={stop}><Square size={13} />停止回答</button> : <button className="primary-button" type="submit" disabled={!status?.configured || !draft.trim()}><Send size={14} />发送</button>}</div>
        <p className="ai-footnote">仅发送你输入的对话，不自动附带人才库资料。回答供参考，对话不保存到服务器。</p>
      </form>
    </aside> : null}
  </>;
}
