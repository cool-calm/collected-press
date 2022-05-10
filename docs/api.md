# Collected.Press API

We serve a read-only transformation of public GitHub repos. It is provided with no warranty.

## View GitHub Repo

- `/github/{owner}/{repo}`
- `/github/{owner}/{repo}/{...path}`

Fetches the HEAD and redirects to include its SHA.

For example:

- https://collected.press/github/vuejs/vue
- https://collected.press/github/vuejs/vue/BACKERS.md
- https://collected.press/github/apple/swift/docs/OwnershipManifesto.md
- https://collected.press/github/facebook/react
- https://collected.press/github/facebook/react/CHANGELOG.md
- https://collected.press/github/tailwindlabs/tailwindcss
- https://collected.press/github/graphql/graphql-js
- https://collected.press/github/evanw/esbuild

----

## Styled GitHub Repo File

`/github/{owner}/{repo}@{sha}/{...path}`

Renders a file within a GitHub repo.

### Markdown (file extension `.md`)

If the file is Markdown, then it is rendered as HTML. Syntax highlighting is done using [highlight.js](https://highlightjs.org/). This HTML has no `<head>` or `<body>`, and is designed for you to provide your own CSS, meta tags, links, and so on.

### Images (MIME type `image/*`)

Images are presented within an HTML page, loading from their corresponding [jsdelivr URL][jsdelivr-github].

### Other file types

Other file types are wrapped in Markdown [fenced code blocks](https://www.markdownguide.org/extended-syntax/#fenced-code-blocks) using the file extension as the language. This is then rendered to HTML like any other Markdown.

For example a `style.css` file will get transformed into:
```markdown
~~~~~~~~~~~~css
CONTENTS OF style.css
~~~~~~~~~~~~
```

## GitHub Repo Directory

- `/github/{owner}/{repo}@{sha}/`
- `/github/{owner}/{repo}@{sha}/{...path}/`

Renders a list of files fetched from [jsdelivr](jsdelivr-github).

----

## Unstyled GitHub Repo File

`/1/github/{owner}/{repo}@{sha}/{...path}`

Renders a file within a GitHub repo without a `<head>` or any styles. This makes it a good fit for being loaded by an edge worker, where you can prepend your own `<head>` and styles.

----

## Get Latest GitHub HEAD Ref

`/1/github/{owner}/{repo}/refs/HEAD`

Get the latest SHA of the [default branch](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/changing-the-default-branch), which is usually main.

This is equivalent to running `git ls-remote https://github.com/owner/repo --symref HEAD` in your shell.

You can use this SHA in any collected.press route that accepts them.

For example, here is the [result for facebook/react](https://collected.press/1/github/facebook/react/refs/HEAD):

```json
{
  "sha": "a4bc8ae4c1db471bb34d908dd890a09d4c774303",
  "HEADRef": "refs/heads/main"
}
```

----

## Home

`/`

Renders the latest version of the collected.press [readme](https://github.com/RoyalIcing/collected-press/blob/main/README.md).

It does this by:

1. It reads the HEAD ref’s SHA from the RoyalIcing/collected-press GitHub repo.
1. It loads the Markdown for the README.md file at that SHA.
1. It renders that Markdown to HTML.
1. It links to CSS inside a HTML `<head>` with the rendered Markdown inside a `<body>`.


[jsdelivr-github]: https://www.jsdelivr.com/?docs=gh