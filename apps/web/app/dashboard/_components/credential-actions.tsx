"use client";

import type { Provider } from "@nepal-payment-lab/shared";
import { RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type CredentialActionsProps = {
  provider: Provider;
  pending: boolean;
  onRotate: () => void;
  onRevoke: () => void;
};

export function CredentialActions({
  provider,
  pending,
  onRotate,
  onRevoke,
}: CredentialActionsProps) {
  const [action, setAction] = useState<"rotate" | "revoke" | null>(null);

  return (
    <div className="flex flex-wrap gap-2">
      <AlertDialog
        open={action === "rotate"}
        onOpenChange={(open) => setAction(open ? "rotate" : null)}
      >
        <AlertDialogTrigger
          disabled={pending}
          render={<Button variant="outline" size="sm" />}
        >
          <RefreshCwIcon data-icon="inline-start" />
          Replace key
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this key?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current key will stop working. Every app using it will need
              the new key. Copy the replacement when it appears.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                setAction(null);
                onRotate();
              }}
            >
              Replace key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={action === "revoke"}
        onOpenChange={(open) => setAction(open ? "revoke" : null)}
      >
        <AlertDialogTrigger
          disabled={pending}
          render={<Button variant="destructive" size="sm" />}
        >
          <Trash2Icon data-icon="inline-start" />
          Revoke key
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
            <AlertDialogDescription>
              New payments using this key will stop working.
              {provider === "esewa"
                ? " Signed checkouts cannot finish, but unauthenticated status checks for retained payments stay available."
                : " Verification calls using this key will also stop working."}{" "}
              You can generate a new key to reconnect. Payment state is
              retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setAction(null);
                onRevoke();
              }}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
