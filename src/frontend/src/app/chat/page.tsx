'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { aiApi, type AiStatus, type ChatMessage } from '@/lib/api';
import { Send, Bot, User, Sparkles, Loader2 } from 'lucide-react';
import { MarkdownRenderer } from '@/components/markdown-renderer';

const SUGGESTED_PROMPTS = [
  'I have LKR 10,000 to invest this month — which Shariah-compliant stocks should I consider and why?',
  "Explain today's ASPI movement in simple terms — is this a good time to buy?",
  'What does Rupee Cost Averaging mean and how should I use it on the CSE as a beginner?',
  'Which sectors on the CSE are growing right now and which ones are Shariah-compliant?',
  'Show me the top 3 most actively traded Shariah-compliant stocks today — are they worth holding long term?',
  "I'm completely new to investing. What's the safest way to start with LKR 5,000–10,000 per month on CSE?",
  'How do global oil prices and Middle East tensions affect Sri Lankan stocks specifically?',
  'Explain the difference between buying a stock for short-term gains vs long-term wealth building — which is better for me?',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    aiApi.getStatus().then((res) => setAiStatus(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await aiApi.chat(
        text.trim(),
        messages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
      );
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.data.content,
          timestamp: res.data.timestamp,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Strategy Chat
          </h2>
          <p className="text-muted-foreground text-sm">
            Ask about CSE markets, stocks, sectors, and Shariah compliance
          </p>
        </div>
        {aiStatus && (
          <Badge
            variant={aiStatus.mode === 'live' ? 'default' : 'secondary'}
            className={
              aiStatus.mode === 'live'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-yellow-600/20 text-yellow-500 border-yellow-600/30'
            }
          >
            {aiStatus.mode === 'live' ? 'Live AI' : 'Mock Mode'}
          </Badge>
        )}
      </div>

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full space-y-6">
              <div className="rounded-full bg-primary/10 p-4">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">CSE AI Research Assistant</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  I can help you analyze stocks, understand market trends, and navigate
                  Shariah-compliant investing on the Colombo Stock Exchange.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 max-w-lg w-full">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="rounded-lg border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="rounded-full bg-primary/10 p-1.5">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <MarkdownRenderer content={msg.content} className="text-sm" />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="rounded-full bg-muted p-1.5">
                        <User className="h-4 w-4" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0 mt-1">
                    <div className="rounded-full bg-primary/10 p-1.5">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </CardContent>

        {/* Input Bar */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about CSE stocks, market trends, Shariah compliance..."
              className="flex-1 rounded-lg border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="rounded-lg bg-primary px-4 py-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
