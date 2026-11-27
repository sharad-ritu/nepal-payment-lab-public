"use client";

import type { Provider } from "@nepal-payment-lab/shared";
import { RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { CodeBlock } from "@/components/code-block";
import { Button } from "@/components/ui/button";
import type { EnvEntry } from "@/lib/providers";

const envName = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Only renamed variable names are kept, keyed by their default name. Values
// include secrets, so they never reach browser storage.
const storedNamesSchema = z.record(z.string(), z.string().regex(envName));
type Names = z.infer<typeof storedNamesSchema>;

function storageKey(provider: Provider) {
  return `nepal-payment-lab:env-names:${provider}`;
}

function readNames(provider: Provider): Names {
  try {
    const parsed = storedNamesSchema.safeParse(
      JSON.parse(localStorage.getItem(storageKey(provider)) ?? "{}"),
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeNames(provider: Provider, names: Names) {
  const saved = Object.entries(names).filter(
    ([fallback, name]) => envName.test(name) && name !== fallback,
  );

  try {
    if (saved.length === 0) {
      localStorage.removeItem(storageKey(provider));
    } else {
      localStorage.setItem(
        storageKey(provider),
        JSON.stringify(Object.fromEntries(saved)),
      );
    }
  } catch {
    // Storage can be unavailable; renames then last for this visit only.
  }
}

export function EnvExample({
  provider,
  entries,
  note,
}: {
  provider: Provider;
  entries: EnvEntry[];
  note?: string | undefined;
}) {
  const [names, setNames] = useState<Names>({});

  useEffect(() => {
    setNames(readNames(provider));
  }, [provider]);

  function draftFor(entry: EnvEntry) {
    return names[entry.name] ?? entry.name;
  }

  function nameFor(entry: EnvEntry) {
    const draft = draftFor(entry);
    return envName.test(draft) ? draft : entry.name;
  }

  function update(next: Names) {
    setNames(next);
    writeNames(provider, next);
  }

  function settle(entry: EnvEntry) {
    if (nameFor(entry) !== entry.name) return;
    const { [entry.name]: _, ...rest } = names;
    update(rest);
  }

  const code = entries
    .flatMap((entry) => [
      ...(entry.comment ? [`# ${entry.comment}`] : []),
      `${nameFor(entry)}="${entry.value}"`,
    ])
    .join("\n");
  const renamed = entries.some((entry) => nameFor(entry) !== entry.name);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <CodeBlock
        code={code}
        label="Example .env"
        actions={
          renamed && (
            <Button variant="secondary" size="xs" onClick={() => update({})}>
              <RotateCcwIcon data-icon="inline-start" />
              Reset names
            </Button>
          )
        }
      >
        {entries.map((entry) => (
          <span key={entry.name} className="block">
            {entry.comment && (
              <span className="block text-code-muted"># {entry.comment}</span>
            )}
            <input
              className="env-name"
              value={draftFor(entry)}
              aria-label={`Variable name for ${entry.name}`}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              style={{ width: `${Math.max(draftFor(entry).length, 1)}ch` }}
              onChange={(event) =>
                update({
                  ...names,
                  [entry.name]: event.target.value.replace(
                    /[^A-Za-z0-9_]/g,
                    "",
                  ),
                })
              }
              onBlur={() => settle(entry)}
            />
            ="{entry.value}"
          </span>
        ))}
      </CodeBlock>
      <p className="text-xs text-muted-foreground">
        Click a variable name to match the one your app already uses.
      </p>
      {note && (
        <p className="text-xs leading-5 text-muted-foreground">{note}</p>
      )}
    </div>
  );
}
