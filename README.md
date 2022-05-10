# Collected Press

Render Markdown from the latest files in any public GitHub repo or gist.

## [View API Docs](https://collected.press/docs/api)

----

## Use Cases

- Zero-build websites. As soon as you push changes to GitHub, it’s available to be served. No CMS, no dependencies to keep up to date.
- Great for documentation websites. In fact, our own [API docs](https://collected.press/docs/api) use it.
- Create a home page for your open source project — just load the Markdown alongside the code in your repo.

## Principles

- Service is stateless. You pass in exactly what parameters you need: the GitHub repo, SHA, and path to the file you want to render.
- Just uses HTTP. Takes advantage of caching heads and other HTTP behaviour.
- Can be called from anywhere. Backends, frontends, JavaScript, Swift, Rust, C#, Golang.
- Runs on the edge, has low latency for end users which provides a great user experience.
- Responses (will soon) be heavily cached like a CDN.

## Examples

### Rendered

- React’s Changelog: https://collected.press/github/facebook/react/CHANGELOG.md
- Night Owl CSS: https://collected.press/github/highlightjs/highlight.js@4c1f2b7f9a13ba3263b140c11524bd934d3b93bf/src/styles/night-owl.css
- Really Long Readme: https://collected.press/github/avelino/awesome-go@8d309904a16bf60d2f4b30ecf99b226554580cdd/README.md

### Raw HTML

- Gist: https://collected.press/1/github/gist/gaearon/e7d97cdf38a2907924ea12e4ebdf3c85
- Repo Readme: https://collected.press/1/github/RoyalIcing/yieldmachine@4478530fc40c3bf1208f8ea477f455ad34da308d/readme.md

### Navigate Repos

- React: https://collected.press/github/facebook/react
- TailwindCSS: https://collected.press/github/tailwindlabs/tailwindcss

### Refs

- React’s latest SHA: https://collected.press/1/github/facebook/react/refs/HEAD
- React’s tags: https://collected.press/1/github/facebook/react/refs/tags

## Tech Stack

- Runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/).
- Fetches data from [GitHub](https://github.com/) and [jsDelivr](https://www.jsdelivr.com/?docs=gh).
- Uses [`markdown-it`](https://github.com/markdown-it/markdown-it) for Markdown parsing and rendering.
- Uses [`yieldparser`](https://github.com/RoyalIcing/yieldparser) for routing.
