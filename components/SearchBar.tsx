"use client";
import { useState } from "react";
import { Search, X } from "lucide-react";

export function SearchBar({
  onSearch,
  placeholder,
}: {
  onSearch: (q: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");

  function handleChange(v: string) {
    setValue(v);
    onSearch(v);
  }

  function handleClear() {
    setValue("");
    onSearch("");
  }

  return (
    <div className="relative flex items-center w-full rounded-xl border border-border bg-background px-3 py-2 text-sm shadow-sm transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <Search size={16} className="text-muted-foreground shrink-0 mr-2" />
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder ?? "Rechercher par titre, catégorie ou mot-clé…"}
        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
      />
      {value && (
        <button
          onClick={handleClear}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded-md"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
