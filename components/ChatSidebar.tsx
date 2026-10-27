"use client";

import { useState } from "react";
import {
  MessageSquare,
  Plus,
  Trash2,
  Pencil,
  Check,
  PanelLeftClose,
  X,
  Compass,
  Sparkles,
  LogOut,
  LogIn,
} from "lucide-react";
import type { Book, LadderStep, ReaderProfile, ReaderContext } from "@/lib/schemas";

export interface ChatTurn {
  id: string;
  userMessage: string;
  genre?: string | null;
  level?: string | null;
  notice?: string | null;
  profile?: ReaderProfile | null;
  context?: ReaderContext | null;
  books: Book[];
  ladder: LadderStep[];
  explanation: string;
  createdAt: string;
}

export interface UserChat {
  id: string;
  email: string;
  title: string;
  genre: string | null;
  level: string | null;
  user_message: string;
  books: Book[];
  ladder: LadderStep[];
  explanation: string;
  messages?: ChatTurn[];
  created_at: string;
}

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chats: UserChat[];
  activeChatId: string | null;
  onSelectChat: (chat: UserChat) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => Promise<void>;
  isLoading: boolean;
  userEmail: string | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

function formatDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 24 && now.getDate() === d.getDate()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diffHours < 48) {
      return "Yesterday";
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function ChatSidebar({
  isOpen,
  onClose,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  isLoading,
  userEmail,
  onOpenAuth,
  onLogout,
}: ChatSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isSubmittingRename, setIsSubmittingRename] = useState(false);

  const startRename = (chat: UserChat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(chat.id);
    setEditingTitle(chat.title);
  };

  const handleSaveRename = async (id: string, e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!editingTitle.trim() || isSubmittingRename) return;
    setIsSubmittingRename(true);
    try {
      await onRenameChat(id, editingTitle.trim());
      setEditingId(null);
    } finally {
      setIsSubmittingRename(false);
    }
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditingTitle("");
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-xs md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`
          fixed top-0 bottom-0 left-0 z-50 md:z-30
          w-72 sm:w-80 h-screen
          bg-card/95 md:bg-card/60 backdrop-blur-md
          border-r border-border/80
          flex flex-col
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Sidebar Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
              <Compass size={18} className="animate-spin-slow" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-foreground">
                BookCompass
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                AI Reading History
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <PanelLeftClose size={18} className="hidden md:block" />
            <X size={18} className="md:hidden" />
          </button>
        </div>

        {/* Action Button: New Chat */}
        <div className="p-3">
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) {
                onClose();
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus size={15} />
            <span>New Chat</span>
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1 scrollbar-thin">
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Conversations</span>
            {userEmail && chats.length > 0 && (
              <span className="text-[10px] opacity-70">({chats.length})</span>
            )}
          </div>

          {!userEmail ? (
            <div className="p-3.5 my-2 rounded-xl border border-primary/20 bg-primary/5 text-center space-y-2.5">
              <div className="w-8 h-8 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">Save your chats</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Sign in with your email to revisit recommendations, extend chats, and build your reading journey.
                </p>
              </div>
              <button
                onClick={onOpenAuth}
                className="w-full py-1.5 px-3 rounded-lg bg-card hover:bg-muted border border-border text-xs font-medium text-foreground transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogIn size={13} />
                <span>Sign In with Email</span>
              </button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2 py-2">
              <div className="h-12 rounded-xl skeleton" />
              <div className="h-12 rounded-xl skeleton" />
              <div className="h-12 rounded-xl skeleton" />
            </div>
          ) : chats.length === 0 ? (
            <div className="text-center py-8 px-3 space-y-2">
              <MessageSquare size={24} className="mx-auto text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                No conversations yet. Ask a question or pick a genre to start!
              </p>
            </div>
          ) : (
            chats.map((c) => {
              const isActive = c.id === activeChatId;
              const formattedDate = formatDate(c.created_at);
              const isEditing = editingId === c.id;

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (isEditing) return;
                    onSelectChat(c);
                    if (window.innerWidth < 768) {
                      onClose();
                    }
                  }}
                  className={`
                    group relative flex items-start gap-2.5 p-2.5 rounded-xl text-left cursor-pointer transition-all border
                    ${
                      isActive
                        ? "bg-primary/15 text-primary border-primary/30 shadow-2xs font-medium"
                        : "bg-transparent text-card-foreground border-transparent hover:bg-muted/80 hover:border-border/60"
                    }
                  `}
                >
                  <MessageSquare
                    size={15}
                    className={`mt-0.5 flex-shrink-0 ${
                      isActive ? "text-primary" : "text-muted-foreground/70"
                    }`}
                  />

                  {isEditing ? (
                    <div
                      className="flex-1 flex items-center gap-1 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRename(c.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        disabled={isSubmittingRename}
                        className="w-full px-2 py-0.5 text-xs rounded border border-primary/50 bg-background text-foreground focus:outline-none"
                      />
                      <button
                        onClick={(e) => handleSaveRename(c.id, e)}
                        className="p-1 rounded hover:bg-primary/20 text-primary cursor-pointer flex-shrink-0"
                        title="Save title"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        onClick={cancelRename}
                        className="p-1 rounded hover:bg-muted text-muted-foreground cursor-pointer flex-shrink-0"
                        title="Cancel"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0 pr-12">
                        <p className="text-xs truncate font-medium leading-snug">
                          {c.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                          {formattedDate && <span>{formattedDate}</span>}
                          {c.genre && (
                            <>
                              <span>&bull;</span>
                              <span className="capitalize">{c.genre}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action buttons (Rename & Delete) */}
                      <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => startRename(c, e)}
                          className="p-1 rounded-md hover:bg-primary/10 hover:text-primary text-muted-foreground cursor-pointer transition-colors"
                          title="Rename chat"
                          aria-label="Rename chat"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChat(c.id);
                          }}
                          className="p-1 rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground cursor-pointer transition-colors"
                          title="Delete chat"
                          aria-label="Delete chat"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer: User Status */}
        <div className="p-3 border-t border-border/60 bg-card/80">
          {userEmail ? (
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-muted/60">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-primary/20 text-primary font-bold text-xs flex items-center justify-center flex-shrink-0">
                  {userEmail.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate" title={userEmail}>
                    {userEmail}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Active Account</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-border bg-muted/50 hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
            >
              <LogIn size={14} />
              <span>Sign In with Email</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
