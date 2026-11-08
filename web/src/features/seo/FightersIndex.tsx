// The list of all fighters inside the app, with a search box: it narrows the list as you type,
// and Enter opens the first match. The static copy of the page has the full list, for search
// engines.

import { Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { SeoArticle } from "./Articles";
import { type IndexPage, nameMatches } from "./content";

export function FightersIndex({ page }: { page: IndexPage }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const groups = useMemo(
    () => page.groups.map((g) => ({ ...g, links: g.links.filter((l) => nameMatches(l.name, query)) })).filter((g) => g.links.length > 0),
    [page, query],
  );
  const found = groups.reduce((n, g) => n + g.links.length, 0);
  const search = (
    <>
      <TextInput
        type="search"
        size="md"
        placeholder="Search fighters by name"
        aria-label="Search fighters by name"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          const first = groups[0]?.links[0];
          if (e.key === "Enter" && query.trim() && first) navigate(`/${first.path}/`);
        }}
      />
      {query.trim() && (
        <Text size="sm" c="dimmed" mt={6} aria-live="polite">
          {found ? `${found} ${found === 1 ? "fighter" : "fighters"}` : `No fighter matches "${query.trim()}". Only fighters from the last 5 years are listed.`}
        </Text>
      )}
    </>
  );
  return <SeoArticle page={{ ...page, groups }} search={search} />;
}
