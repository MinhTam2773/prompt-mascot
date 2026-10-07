# Prompt Mascot

A little Claude that stands above the prompt in Claude Code. It thinks while the model thinks, pulls out a laptop while tools run, and reacts to each reply: happy, excited, curious, worried, sad or surprised. Left alone it settles down and eventually falls asleep.

In the desktop app it's an animated pixel-art figure with a speech bubble; in the terminal it's a small face with a status line.

> Unofficial fan project. Not made, endorsed or supported by Anthropic. Claude is a trademark of Anthropic.

## Install

In Claude Code:

```
/plugin marketplace add MinhTam2773/prompt-mascot
/plugin install prompt-mascot@prompt-mascot
```

Start a new session and the mascot appears above the prompt.

### Requirements

Prompt Mascot uses Claude Code's hooks-module plugin format, which needs a recent Claude Code. It's tested on 2.1.288; older builds (for example 2.1.97) reject the plugin. Run `claude --version` to check, and update if the install fails.

## Commands

| Command | What it does |
| --- | --- |
| `/mascot` | Show or hide the mascot |
| `/mascot show` / `/mascot hide` | Show or hide explicitly |
| `/mascot demo` | Play every emotion in turn (about 38 seconds) |
| `/mascot stop` | End the demo early |

## How it picks a mood

After each reply, the mascot sends the start and end of the reply (up to about 1,200 characters) to Claude's small, fast model to read its tone. That's one small extra model call per reply. If the call fails or takes longer than 6 seconds, it falls back to matching keywords in the reply. A reply ending in a question makes it curious; an interrupted turn surprises it.

It doesn't read or write your files, run commands, or make network requests of its own.

## Sharing the box with your own mods

The mascot lives in the box above the prompt (the `AbovePrompt` band), and other mods can draw there too. You don't have to choose between them:

- **The mascot keeps your mod.** It lets the other mods in the band draw first, then adds itself on its own row underneath what they drew.
- **Your mod should keep the mascot.** If your `AbovePrompt` hook returns its own tree without calling `next(e)`, everything beneath it in the chain is dropped, and that can include the mascot. Call `next(e)` and put its result in your tree:

```tsx
on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
  const below = await next(e) // the mascot, and any other mods in the band
  const { Box, Text } = $.ui.resolve(e)

  return (
    <Box flexDirection="column">
      <Text>Your mod's row</Text>
      {below}
    </Box>
  )
})
```

Keep `below` inside a plain column like this one. What `next(e)` returns can be the engine's own drawing, which Claude Code refuses to place inside a `Box` that sets sizing props such as `width`.

## Development

The plugin lives in [`plugins/prompt-mascot`](plugins/prompt-mascot). To try local changes, load it straight from disk:

```
claude --plugin-dir plugins/prompt-mascot
```

Validate and run the tests:

```
claude plugin validate plugins/prompt-mascot
claude plugin test plugins/prompt-mascot
```

## License

[MIT](LICENSE)
