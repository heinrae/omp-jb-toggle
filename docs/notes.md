# Notes

Why this is an extension and not something simpler.

## The problem

`APPEND_SYSTEM.md` is read once when a session starts and applies to every
model and every project. That is fine for a general preference, not fine for a
prompt you only want in some sessions. There is no way to switch it off
without restarting.

## What this does instead

`before_agent_start` returns a new prompt array with the file appended:

```ts
{ systemPrompt: [...event.systemPrompt, profileText] }
```

Appending rather than replacing means the bundled prompt, tool policy, skills
and rules stay intact. The text is inserted verbatim, so the prefix stays
byte-stable between turns and the provider can cache it.

## Things that bit me

Resume re-read the file at first. Session state lives in memory, so a resumed
session had no flag and reloaded whatever was on disk, which is not how
`APPEND_SYSTEM.md` behaves. Fixed by writing the flag and the text into the
session with `pi.appendEntry` under `jb-state`.

The padlock landed in the footer instead of the status bar. `setStatus` feeds
the hook-status list, and only the `status` segment renders that list. The
default preset has no such segment. The README shows the custom preset if you
want it inline.

Toggling mid-session invalidates the provider prompt cache once, because the
prompt changes. Turn it on at the start instead of flipping it.

## Not done

The slash command was never exercised in a TUI. Print mode cannot run slash
commands, so the injection path is tested but the command handler is not.
