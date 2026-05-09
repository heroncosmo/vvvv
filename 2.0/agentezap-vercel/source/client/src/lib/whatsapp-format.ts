import { repairMojibakeText } from "@shared/mojibake";

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatWhatsAppTextForHtml(value?: string | null): string {
  const escaped = escapeHtml(repairMojibakeText(value || ""));

  return escaped
    .replace(/```([\s\S]*?)```/g, '<code class="block bg-black/5 px-2 py-1 rounded my-1 text-xs font-mono whitespace-pre-wrap">$1</code>')
    .replace(/`([^`]+)`/g, '<code class="bg-black/5 px-1 rounded text-xs font-mono">$1</code>')
    .replace(/\[(https?:\/\/[^\]]+)\]\(\1\)/gi, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, "$1: $2")
    .replace(/\*\*\*(?!\*)(.+?)\*\*\*(?!\*)/g, "<strong>$1</strong>")
    .replace(/\*\*(?!\*)(.+?)\*\*(?!\*)/g, "<strong>$1</strong>")
    .replace(/\*(?!\s)(.+?)(?<!\s)\*/g, "<strong>$1</strong>")
    .replace(/_(?!\s)(.+?)(?<!\s)_/g, "<em>$1</em>")
    .replace(/~(?!\s)(.+?)(?<!\s)~/g, "<del>$1</del>")
    .replace(/^([^\n<]*https?:\/\/[^\n<]+)$/gm, (line) => line.replace(/\*/g, ""))
    .replace(/(https?:\/\/[^\s:<]+):\s*\1/gi, "$1")
    .replace(/\n/g, "<br />");
}
