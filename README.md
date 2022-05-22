# Collected Press

Render Markdown from the latest files in any public GitHub repo or gist.

- [View API Docs](https://collected.press/docs/api)
- [View Source on GitHub](https://github.com/ThatCollected/collected-press)

----

## Use Cases

- Zero-build websites. As soon as you push changes to GitHub, it’s available to be served. No CMS, no dependencies to keep up to date.
- Great for documentation websites. In fact, our own [API docs](https://collected.press/docs/api) use it.
- Create a home page for your open source project — just load the Markdown alongside the code in your repo.

## Principles

- Service is stateless. Just uses HTTP. You pass in exactly what parameters you need: the GitHub repo, SHA, and path to the file you want to render.
- Can be called from anywhere. Backends, frontends, JavaScript, Swift, Rust, C#, Golang…
- Runs on the edge which means very low latency for end users so they get a great user experience.
- Renders syntax highlighting for code blocks on the server. No need to run highlight.js in your user’s browser.
- Responses (will soon) be heavily cached like a CDN.
- Unique git tags or SHA must be used in URLs, as we can confidently cache those forever. Links like `https://collected.press/github/facebook/react` are redirected to a URL with the latest SHA like `https://collected.press/github/facebook/react@6e2f38f3a4d58f11bbe86ca6f938c27767366967/`. We do the equivalent of `git fetch` to get the `HEAD` SHA.

## Examples

### Rendered

- React: https://collected.press/github/facebook/react
    - React’s Changelog: https://collected.press/github/facebook/react/CHANGELOG.md
- Night Owl CSS: https://collected.press/github/highlightjs/highlight.js@4c1f2b7f9a13ba3263b140c11524bd934d3b93bf/src/styles/night-owl.css
- Really Long Readme: https://collected.press/github/avelino/awesome-go@8d309904a16bf60d2f4b30ecf99b226554580cdd/README.md
- TailwindCSS: https://collected.press/github/tailwindlabs/tailwindcss
    - Tailwind’s Colors: https://collected.press/github/tailwindlabs/tailwindcss@b49dc7cafafd9b5d1070ef512a6a1a403d74627c/src/public/colors.js

These routes are conveniently short, and redirect to the latest SHA. Markdown and source code files are rendered as styled HTML.

### Raw HTML

- Repo Readme: https://collected.press/1/github/RoyalIcing/yieldmachine@4478530fc40c3bf1208f8ea477f455ad34da308d/readme.md
- Gist: https://collected.press/1/github/gist/gaearon/e7d97cdf38a2907924ea12e4ebdf3c85

These routes have the prefix `1`, and require a specific SHA. Markdown files are rendered as HTML without styles or any `<head>`.

### Refs

- React’s latest SHA: https://collected.press/1/github/facebook/react/refs/HEAD
- React’s tags: https://collected.press/1/github/facebook/react/refs/tags

## Tech Stack

- Runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/).
- Fetches data from [GitHub](https://github.com/) and [jsDelivr](https://www.jsdelivr.com/?docs=gh).
- Uses [`markdown-it`](https://github.com/markdown-it/markdown-it) for Markdown parsing and rendering.
- Uses [`yieldparser`](https://github.com/RoyalIcing/yieldparser) for routing.

## Local Development

```bash
npm ci
make dev
# Open http://localhost:4321
```
