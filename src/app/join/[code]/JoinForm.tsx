"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { joinAndRegister } from "../actions";

export default function JoinForm({ code }: { code: string }) {
  const [error, action, pending] = useActionState(joinAndRegister, null);
  // Submitted by hand so an error (such as a duplicate email) does not wipe what was typed.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  return (
    <form
      action={action}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-4"
    >
      <input type="hidden" name="code" value={code} />
      <div>
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="py-2.5 text-base sm:text-sm" />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="py-2.5 text-base sm:text-sm" />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="py-2.5 text-base sm:text-sm" />
        <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>
      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? "One moment..." : "Create student account and join"}
      </Button>
      <p className="text-center text-sm text-slate-600">
        I already have an account.{" "}
        <Link href={`/login?next=${encodeURIComponent(`/join/${code}`)}`} className="inline-block py-2 font-medium text-brand-600 hover:underline">
          Sign in to join
        </Link>
      </p>
    </form>
  );
}
