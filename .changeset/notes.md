---
'@ngpdf/core': minor
---

Adds `pdf-note`, a comment on the page that PDF viewers show as an icon opening a popup, like a sticky note. Put it where a `pdf-view` can go, with the note's text as its content: `<pdf-note author="Ana" icon="help">Is this before tax?</pdf-note>`. `author` is shown as the note's title, `icon` picks one of the standard icons (`comment` by default, `note`, `help`, `key`, `insert`, `paragraph`, `new-paragraph`), and `open` shows the popup when the file opens. The icon is sticky-note yellow unless the note sets its own `color`. A note takes no space in the layout and is not printed. Its icon sits where the next element starts, or anywhere with `position: absolute`, and it always lands on the same sheet as the content next to it. The text can hold any character, also ones the page fonts can't draw. A note takes plain text only, and a note inside a `pdf-text` fails the render.
