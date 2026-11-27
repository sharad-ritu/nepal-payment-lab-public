"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  KeyRoundIcon,
} from "lucide-react";
import { EnvExample } from "@/components/env-example";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useClipboard } from "@/hooks/use-clipboard";
import type { ProviderDefinition } from "@/lib/providers";
import { cn } from "@/lib/utils";
import { CredentialActions } from "./credential-actions";

function ConnectionField({
  id,
  label,
  value,
  hint,
  copyable = true,
}: {
  id: string;
  label: string;
  value: string;
  hint: string;
  copyable?: boolean;
}) {
  const { copy, status } = useClipboard();

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          readOnly
          value={value}
          aria-describedby={`${id}-hint`}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-sm"
            disabled={!copyable}
            aria-label={`Copy ${label}`}
            onClick={() => void copy(value)}
          >
            {status === "copied" ? (
              <CheckIcon data-icon="inline-start" />
            ) : (
              <CopyIcon data-icon="inline-start" />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
      <span
        role="status"
        className={cn(
          status === "error" ? "text-xs text-destructive" : "sr-only",
        )}
      >
        {status === "error"
          ? "Clipboard unavailable. Select and copy the value."
          : status === "copied"
            ? `${label} copied.`
            : ""}
      </span>
    </Field>
  );
}

export function ProviderConnection({
  provider,
  baseUrl,
  credential,
  pending,
  generating,
  onGenerate,
  onRotate,
  onRevoke,
}: {
  provider: ProviderDefinition;
  baseUrl: string;
  credential: { prefix: string; secret: string | null } | null;
  pending: boolean;
  generating: boolean;
  onGenerate: () => void;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  const env = credential?.secret
    ? provider.envExample({
        baseUrl,
        secret: credential.secret,
        prefix: credential.prefix,
      })
    : null;

  const fields = (
    <FieldGroup>
      <ConnectionField
        id="connection-base-url"
        label={provider.endpointLabel}
        value={baseUrl}
        hint={provider.endpointHint}
      />
      {credential &&
        provider
          .extraFields({ prefix: credential.prefix })
          .map((field) => (
            <ConnectionField
              key={field.id}
              id={`connection-${field.id}`}
              label={field.label}
              value={field.value}
              hint={field.hint}
            />
          ))}
      {credential && (
        <ConnectionField
          id="provider-secret"
          label="Secret key"
          value={credential.secret ?? "Replace this key to reveal the secret"}
          copyable={Boolean(credential.secret)}
          hint={provider.secretHint}
        />
      )}
    </FieldGroup>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Connect your app</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-6">
        <p className="text-sm text-muted-foreground">
          Keep your {provider.name} integration code. Replace its environment
          values with these lab values.
        </p>
        {env ? (
          <>
            <EnvExample
              provider={provider.id}
              entries={env}
              note={provider.envNote}
            />
            <Collapsible>
              <CollapsibleTrigger
                render={
                  <Button variant="ghost" size="sm" className="group/trigger" />
                }
              >
                <ChevronDownIcon
                  data-icon="inline-start"
                  className="transition-transform group-aria-expanded/trigger:rotate-180"
                />
                Individual values
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">{fields}</CollapsibleContent>
            </Collapsible>
          </>
        ) : (
          fields
        )}
        {!credential && (
          <Empty className="border py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRoundIcon />
              </EmptyMedia>
              <EmptyTitle>Connect {provider.name}</EmptyTitle>
              <EmptyDescription>
                Generate a lab key, then copy the environment values into your
                app.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button disabled={pending} onClick={onGenerate}>
                {generating ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <KeyRoundIcon data-icon="inline-start" />
                )}
                {generating ? "Generating key..." : "Generate lab key"}
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3">
        <p className="text-xs text-muted-foreground">No real money moves.</p>
        {credential && (
          <CredentialActions
            provider={provider.id}
            pending={pending}
            onRotate={onRotate}
            onRevoke={onRevoke}
          />
        )}
      </CardFooter>
    </Card>
  );
}
