# Repository Guidelines

## Project Structure & Module Organization

PlaySpace is a client-side p5.js poster kiosk. `index.html` is the entry point and loads scripts in dependency order. Shared `scene`, `data`, and `inout` state lives in `js/common_custom.js`; rendering is centered in `js/main_graphic.js`, input in `js/basic_inputs.js`, and controls in `js/gui_elements.js`. Feature modules such as `color_panel.js`, `sound_engine.js`, and `print_preview.js` remain browser globals rather than ES modules. GLSL sources are under `shader/`, while fonts, SVG glyphs, and the app icon are under `assets/`. There is currently no automated test directory.

## Build, Test, and Development Commands

- `npm exec vite -- --host 127.0.0.1` starts a local Vite server without requiring project scripts.
- `git status --short` checks the working tree before and after a change.
- `git diff -- creators/louism/PlaySpace` reviews changes when run from the repository root.

No build step is required: production serves the HTML, JavaScript, shaders, and assets directly.

## Coding Style & Naming Conventions

Match surrounding code: two-space indentation in JavaScript, four-space indentation in HTML, semicolons, double-quoted strings, and trailing commas in multiline objects. Use `camelCase` for variables and functions, descriptive nested keys for shared state, and existing `snake_case.js` filenames for new feature modules. Keep dependencies explicit through script order and direct global calls. Do not introduce a framework or module bundler unless the change clearly requires it.

## Testing Guidelines

There is no test framework or coverage target. Manually verify each change in desktop, iPad portrait, and a narrow mobile viewport. Exercise touch and mouse input, text editing, one-path-per-word behavior, color, texture, and layer controls, audio startup, loading retirement, persistence, and print preview as relevant. Check the browser console for errors. Buttons must commit on pointer release and cancel when the pointer is dragged outside.

## Commit & Pull Request Guidelines

Follow the history’s concise imperative subjects, for example `Add kiosk session reset` or `Fix print preview margins`. Keep commits focused. Pull requests should explain user-visible behavior, list manual checks and viewports, and include screenshots or a short recording for visual or interaction changes. Link an issue when one exists.

## Agent-Specific Instructions

Read `PROJECT_CONTEXT.json` before substantial work. Inspect existing diffs and preserve uncommitted changes. Limit edits to this PlaySpace directory unless explicitly requested, and do not commit or push without approval.
