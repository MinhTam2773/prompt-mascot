# Spark Mascot

A little Claude that stands above the prompt in Claude Code. It thinks while the model thinks, pulls out a laptop while tools run, and reacts to each reply: happy, excited, curious, worried, sad or surprised. Left alone it settles down and eventually falls asleep.

In the desktop app it's an animated pixel-art figure with a speech bubble; in the terminal it's a small face with a status line.

## Install

In Claude Code:

```
/plugin marketplace add MinhTam2773/spark-mascot
/plugin install spark-mascot@spark-mascot
```

Start a new session and Spark appears above the prompt.

### Requirements

Spark uses Claude Code's hooks-module plugin format, which needs a recent Claude Code. It's tested on 2.1.288; older builds (for example 2.1.97) reject the plugin. Run `claude --version` to check, and update if the install fails.

## Commands

| Command | What it does |
| --- | --- |
| `/mascot` | Show or hide Spark |
| `/mascot show` / `/mascot hide` | Show or hide explicitly |
| `/mascot demo` | Play every emotion in turn (about 38 seconds) |
| `/mascot stop` | End the demo early |

## How it picks a mood

After each reply, Spark sends the start and end of the reply (up to about 1,200 characters) to Claude's small, fast model to read its tone. That's one small extra model call per reply. If the call fails or takes longer than 6 seconds, it falls back to matching keywords in the reply. A reply ending in a question makes Spark curious; an interrupted turn surprises it.

Spark doesn't read or write your files, run commands, or make network requests of its own.

## Development

The plugin lives in [`plugins/spark-mascot`](plugins/spark-mascot). To try local changes, load it straight from disk:

```
claude --plugin-dir plugins/spark-mascot
```

Validate and run the tests:

```
claude plugin validate plugins/spark-mascot
claude plugin test plugins/spark-mascot
```

## License

[MIT](LICENSE)
