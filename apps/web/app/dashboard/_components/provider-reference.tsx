"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { EnvExample } from "@/components/env-example";
import { Button } from "@/components/ui/button";
import type { ProviderDefinition } from "@/lib/providers";

export function ProviderGuide({
  provider,
  baseUrl,
  credential,
}: {
  provider: ProviderDefinition;
  baseUrl: string;
  credential: { prefix: string; secret: string | null } | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="heading text-2xl">Use {provider.name} with the lab</h2>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <a
              href={provider.documentationUrl}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          Provider docs
          <ExternalLinkIcon data-icon="inline-end" />
        </Button>
      </header>
      {credential?.secret && (
        <EnvExample
          provider={provider.id}
          note={provider.envNote}
          entries={provider.envExample({
            baseUrl,
            secret: credential.secret,
            prefix: credential.prefix,
          })}
        />
      )}
      <ol className="flex flex-col gap-8">
        {provider.guide.map((section, index) => (
          <li
            key={section.title}
            className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-3"
          >
            <span className="text-base text-muted-foreground">{index + 1}</span>
            <section className="flex min-w-0 flex-col gap-3">
              <h3 className="text-base font-semibold">{section.title}</h3>
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="max-w-[72ch] text-sm leading-7 text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          </li>
        ))}
      </ol>
      <p className="max-w-prose text-sm text-muted-foreground">
        The lab follows documented provider contracts and includes intentional
        simulation differences. Validate with the provider's official sandbox
        before production. Read the{" "}
        <Link
          href="/how-it-works#disclaimer"
          className="text-primary underline underline-offset-4"
        >
          documentation and compatibility disclaimer
        </Link>
        .
      </p>
    </div>
  );
}
