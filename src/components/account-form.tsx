"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction, type ActionState } from "@/server/actions";

const initial: ActionState = {};

export function AccountForm({ displayName, email }: { displayName: string; email: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, initial);
  return (
    <form action={action} className="mt-6 max-w-md space-y-4">
      <div>
        <Label htmlFor="displayName">Display name</Label>
        <Input id="displayName" name="displayName" defaultValue={displayName} className="mt-1 h-11" />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} readOnly className="mt-1 h-11" />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.message ? <p className="text-sm">{state.message}</p> : null}
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
