/**
 * A table column: points, a share of the free space (`2fr`), a percentage of the table, or `auto`
 * for the widest one-line content of its cells.
 */
export type TableColumn = number | `${number}fr` | `${number}%` | 'auto';
