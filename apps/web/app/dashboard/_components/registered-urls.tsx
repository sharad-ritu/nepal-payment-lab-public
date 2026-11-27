"use client";

import {
  merchantUrlSchema,
  type RegisteredUrlKey,
} from "@nepal-payment-lab/shared";
import { CheckIcon, Link2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ProviderDefinition } from "@/lib/providers";

type Urls = { [Key in RegisteredUrlKey]?: string | null | undefined };

const optionalUrlSchema = merchantUrlSchema.nullable();

export function RegisteredUrls({
  config,
  initial,
  pending,
  saving,
  onSave,
}: {
  config: NonNullable<ProviderDefinition["registeredUrls"]>;
  initial: Urls;
  pending: boolean;
  saving: boolean;
  onSave: (urls: Urls) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Urls | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Urls>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const values = draft ?? initial;
  const changed = config.fields.some(
    ({ key }) => (values[key] ?? null) !== (initial[key] ?? null),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2Icon aria-hidden="true" className="size-4 text-primary" />
          <h2>Registered URLs</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending || !changed) return;
            setError(null);
            setSaved(false);

            const urls: Urls = {};
            const issues: Urls = {};
            for (const { key } of config.fields) {
              const result = optionalUrlSchema.safeParse(values[key] ?? null);
              if (result.success) urls[key] = result.data;
              else issues[key] = result.error.issues[0]?.message ?? null;
            }
            setFieldErrors(issues);
            if (Object.keys(issues).length > 0) return;

            try {
              await onSave(urls);
              setDraft(null);
              setSaved(true);
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Could not save URLs.",
              );
            }
          }}
        >
          <FieldGroup>
            {config.fields.map((field) => {
              const fieldError = fieldErrors[field.key];
              return (
                <Field
                  key={field.key}
                  data-invalid={Boolean(fieldError)}
                  data-disabled={pending}
                >
                  <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
                  <Input
                    id={field.key}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={values[field.key] ?? ""}
                    disabled={pending}
                    placeholder={field.placeholder}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={`${field.key}-help`}
                    onChange={(event) => {
                      setDraft({
                        ...values,
                        [field.key]: event.target.value.trim() || null,
                      });
                      setFieldErrors({
                        ...fieldErrors,
                        [field.key]: null,
                      });
                      setSaved(false);
                      setError(null);
                    }}
                  />
                  <FieldDescription id={`${field.key}-help`}>
                    {field.help}
                  </FieldDescription>
                  {fieldError && <FieldError>{fieldError}</FieldError>}
                </Field>
              );
            })}
          </FieldGroup>
          <p className="text-xs leading-6 text-muted-foreground">
            {config.note}
          </p>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending || !changed}>
              {saving && <Spinner data-icon="inline-start" />}
              {saving ? "Saving..." : "Save URLs"}
            </Button>
            {changed && (
              <p className="text-xs text-muted-foreground">Unsaved changes</p>
            )}
            {saved && (
              <p
                role="status"
                className="flex items-center gap-1.5 text-xs text-primary"
              >
                <CheckIcon aria-hidden="true" className="size-3.5" />
                URLs saved
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
