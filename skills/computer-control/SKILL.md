---
name: computer-control
description: "Full computer control (keyboard, mouse, screen capture, vision, automation). Use for open, click, type, keyboard, mouse, screenshot, capture, browser, window, or any request to interact with UI/desktop."
---

# Computer Control

Full computer control facade: keyboard + mouse + screen capture + automation sequences + vision.

## When to invoke
- Trigger phrases: "mở Chrome", "click vào nút X", "gõ nội dung Y", "chụp màn hình", "thao tác trên UI", "tự động click", "open browser", "type text", "press shortcut", "take screenshot"
- Auto-routed from: capability-router (axis: `computer_control`, threshold 0.4)

## Inputs the router passes
- `request`: raw user input
- `context`: { projectPath, files, framework }
- `priority`: medium | high

## Outputs the module returns
- `success`: boolean
- `artifacts`: { screenshotPath?, actionSequence?, captureRegion? }
- `nextSuggestions`: ["screenshot đã chụp — verify?"]

## Hardened security contract
- SessionGuard: required level USER, max 100 req/min
- AuditLog: every input/action logged to `.cursor/autonomous-memory/logs/`
- InputValidator: all coordinates, strings, file paths via `security_utils.InputValidator`
- Rate limit: max 60 actions/minute per session

## Code references
- Entry: [computer-control/computer_control.ts](../../computer-control/computer_control.ts)
- Tests: [tests/computer-control.test.ts](../../tests/computer-control.test.ts)
- Facade: [computer-control/index.ts](../../computer-control/index.ts)
