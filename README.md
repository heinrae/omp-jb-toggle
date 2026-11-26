# omp-jb-toggle

Toggles a profile file into the [omp](https://github.com/can1357/oh-my-pi)
system prompt, one session at a time.

I wrote this because omp already reads `~/.omp/agent/APPEND_SYSTEM.md` at
startup, and that works until you want it off. The global file applies to
every session, every project, and every model. This does the same injection
but leaves the decision to you, per session, with a slash command you can flip
mid-conversation.

No network calls. The repo ships code only. You write the text file yourself,
it stays on your disk, and nothing is injected unless you ask for it.

## Install

```sh
omp plugin install github:heinrae/omp-jb-toggle
```

From a checkout instead:

```sh
git clone https://github.com/heinrae/omp-jb-toggle.git
cd omp-jb-toggle
omp plugin link .
```

Or skip registration and load the file directly:

```sh
omp --no-extensions -e ./extensions/jb.ts -p "Reply with exactly: ok"
```

`omp plugin list` shows whether it registered.

## Setup

Put your text where the extension looks for it:

```sh
mkdir -p ~/.omp/agent/jb
printf 'Your instructions here.\n' > ~/.omp/agent/jb/profile.md
```

Resolution order, first readable file wins:

1. `$OMP_JB_PROFILE`
2. `~/.omp/agent/jb/profile.md`
3. `~/.omp/agent/jb/deepseekv4.1 and v4.1-1017.md`, kept for installs that
   used the older name

If none can be read, `/jb on` prints an error and stays off. It will not
inject an empty block.

## Commands

`/jb` or `/jb status` shows whether it is on and which file it read. `/jb on`
enables it, `/jb off` disables it, `/jb reload` re-reads the file for the
session you are in. Type `/jb` and a space to get the list with descriptions.

## When the file is read

Once per session, then cached in memory. Editing the file does not change the
session that is already running; it changes the next one. That is deliberate,
and it matches how `APPEND_SYSTEM.md` behaves. If you need the new text right
now, use `/jb reload`.

The same cache is why resuming a session brings back the text it started with,
even if you rewrote the file in the meantime. State and text go into the
session through `pi.appendEntry`, under the custom type `jb-state`.

## What the model receives

A `before_agent_start` handler appends to the existing prompt array:

```ts
{ systemPrompt: [...event.systemPrompt, profileText] }
```

The default prompt, tool policy, skills, and rules stay where they are. Your
text goes in verbatim, no wrapper tags, no header, no timestamp. Keeping it
byte-identical between turns is what lets the provider cache the prefix.

Subagents do not get the block. Only the main session does.

## The status bar

`ctx.ui.setStatus()` feeds omp's hook-status list, and only the `status`
segment draws that list. The default preset does not include the segment, so
the padlock lands in the footer instead of the main bar. To get it inline:

```yaml
statusLine:
  preset: custom
  leftSegments: [pi, vim, model, mode, path, git, pr, context_pct, status]
  rightSegments: [session_name]
```

`statusLine.showHookStatus: false` hides it completely.

## Cost

An unchanged system prompt is served from the provider's prompt cache, so
leaving the toggle on is cheap. Flipping it mid-session changes the prompt,
the cached prefix goes stale, and the next turn is billed as fresh input.
Turn it on at the start and leave it alone.

## Limits

The extension changes what the model is told, not what it can do. If your file
asks for something the model would refuse anyway, this will not fix that.

Review whatever you put in the profile. Anything in there is sent on every
turn, and a file with private instructions should not live in a public repo.

Tested against omp 19.2.1 on Windows. The API surface is small:
`before_agent_start`, `registerCommand`, `appendEntry`, `setStatus`.

## Development

```sh
omp --no-extensions -e ./extensions/jb.ts -p "Reply with exactly: ok"
```

`OMP_JB=1` starts a session with the toggle already on, which helps when you
cannot type a slash command. Normal use is the slash command.

## License

MIT. Not affiliated with the upstream prompt repositories.
