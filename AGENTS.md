# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## What This Is

A monorepo with two functionally identical implementations of the Personal Agent for Slack built with Bolt for JavaScript, each self-contained with its own `AGENTS.md`. The agent answers as its owner's agent, shaped by `soul.md`, and keeps runbooks current:

- `claude-agent-sdk/`: Claude Agent SDK
- `openai-agents-sdk/`: OpenAI Agents SDK

Work and run commands inside one of them. Keep the two in parity: a user-facing change to one usually belongs in the other.

## Slack Plugin

To install the Slack plugin for your coding agent, follow [Claude Code, Codex, Cursor, and Other Coding Agents](./README.md#claude-code-codex-cursor-and-other-coding-agents) in the README.

## Before you finish

Run `npm run lint`, `npm run check`, and `npm test` inside the app directory. CI runs the same on every PR.

## Code Style

- Kebab-case filenames
- No code comments. Make the code explain itself with clear names, tests, or types. Put the reason for a change in the PR description.
