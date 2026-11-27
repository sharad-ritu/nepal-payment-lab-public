"use client";

import {
  type InitiationMode,
  initiationModeSchema,
  initiationModes,
} from "@nepal-payment-lab/shared";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const options = initiationModeSchema.options.map((value) => ({
  value,
  label: initiationModes[value].name,
  description: initiationModes[value].description,
}));

export function ProviderSettingsForm({
  initial,
  onSave,
  pending,
  saving,
}: {
  initial: InitiationMode;
  onSave: (mode: InitiationMode) => Promise<void>;
  pending: boolean;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<InitiationMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mode = draft ?? initial;
  const changed = mode !== initial;
  const modeDescription = options.find(
    (option) => option.value === mode,
  )?.description;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || !changed) return;
        setError(null);
        setSaved(false);
        try {
          await onSave(mode);
          setDraft(null);
          setSaved(true);
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Could not save settings.",
          );
        }
      }}
    >
      <FieldGroup>
        <Field data-disabled={pending}>
          <FieldLabel htmlFor="initiation-mode">
            Response for new payments
          </FieldLabel>
          <Select
            items={options}
            value={mode}
            disabled={pending}
            onValueChange={(value) => {
              if (value === null) return;
              setDraft(initiationModeSchema.parse(value));
              setSaved(false);
              setError(null);
            }}
          >
            <SelectTrigger
              id="initiation-mode"
              aria-describedby="initiation-help"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription id="initiation-help">
            {modeDescription}
          </FieldDescription>
        </Field>
      </FieldGroup>
      <p className="text-xs leading-6 text-muted-foreground">
        Applies to every new request using this provider account until you
        change it.
      </p>
      {error && <FieldError>{error}</FieldError>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !changed}>
          {saving && <Spinner data-icon="inline-start" />}
          {saving ? "Saving..." : "Save response"}
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
            Response saved
          </p>
        )}
      </div>
    </form>
  );
}
