"use client";
import { Search } from "lucide-react";

export function SearchBar({ onSearch, placeholder }: { onSearch: (q: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <Search size={16} className="text-muted-foreground" />
      <input
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder ?? "Rechercher…"}
        className="w-full bg-transparent text-sm outline-none"
      />
    </div>
  );
}
