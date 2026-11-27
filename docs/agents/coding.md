# TypeScript, formatting, and JSX

## TypeScript

- Validate external input with Zod and infer types from schemas. Keep unvalidated data `unknown`.
- Use strict types; avoid `any` and unsafe assertions when a concrete type is practical.
- Prefer discriminated unions for variants and narrowing over assertions.
- Brand identifiers when distinct domains need protection from accidental interchange.
- Use object arguments when parameter order is ambiguous.
- Follow nearby response and error-handling conventions.

## Multiline formatting

Biome owns indentation (2 spaces) and import order; these rules decide when to wrap. Apply them to code you add or edit without reformatting unrelated code.

- For two or more parameters or arguments, put each on its own line in function definitions, calls, and constructors, even when the whole expression fits on one line.
- For two or more entries in an object, collection, or destructuring pattern, put each property or element on its own line. Apply this to returned values and expressions nested inside calls as well.
- Put the opening delimiter before the item lines and the closing delimiter on its own line. Use trailing commas where the language permits them.
- Split long expressions at logical boundaries. Keep nested calls, callbacks, and return expressions multiline when they contain multiple items; wrapping only the outer expression is insufficient.
- Short expressions with zero or one simple item may remain on one line.

```ts
async function loadRuns(
  projectId: string,
  limit: number,
) {
  const runs = await findRuns(
    projectId,
    limit,
  );

  return {
    runs,
    count: runs.length,
  };
}
```

## JSX

- Use shadcn/ui components wherever an appropriate component exists. Read the [shadcn skill](../../.agents/skills/shadcn/SKILL.md) before changing UI.
- Use `Select` for interactive dropdowns, `InputGroup` for inputs with copy buttons, `Alert` for callouts, `Card` for panels, and `Table` for tables. Compose the subcomponents and prefer built-in variants.
- Keep text concise. Add subtitles and badges only when they help users take an action or understand a state.

- With two or more props, put each prop on its own line and put `>` or `/>` on a separate line.
- Expand JSX containing nested elements or long expressions into an indented tree. Put returned multiline JSX inside parentheses.
- A short element with zero or one simple prop and a short text child may stay on one line.

```tsx
function RunCard({
  title,
  onOpen,
}: RunCardProps) {
  return (
    <Card
      title={title}
      onClick={onOpen}
    >
      <RunDetails />
    </Card>
  );
}
```

## Blank lines and whitespace

- Use single blank lines to separate logical blocks: setup, validation, database operations, and the final response or return. Separate top-level declarations and main JSX/form sections. Keep related fields and short statement sequences together; do not space every line or add blank lines at block boundaries.
- No trailing whitespace; every file ends with a newline (enforced by `.editorconfig` and Biome).
- `bun run format` (`biome check --write .`) is the formatter. Run it only when formatting changes are intended; never hand-format what Biome owns.
