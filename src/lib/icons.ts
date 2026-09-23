/** Stroke icons for the tool rails (#22): 24×24 paths, drawn with the current colour. Each carries a caption, so they need not stand alone. */
export const ICONS: Record<string, string[]> = {
  mirror: ['M12 3v18', 'M8 8l-4 4 4 4', 'M16 8l4 4-4 4'],
  flip: ['M4 12a8 8 0 0 1 14-5', 'M18 3v4h-4', 'M20 12a8 8 0 0 1-14 5', 'M6 21v-4h4'],
  body: ['M12 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4', 'M12 7v7', 'M12 14l-3 7', 'M12 14l3 7', 'M12 9l-4 3', 'M12 9l4 3'],
  legs: ['M7 4h10', 'M8 4v8l-2 8', 'M16 4v8l2 8'],
  arms: ['M12 4v16', 'M4 8h16', 'M4 8l-1 8', 'M20 8l1 8'],
  head: ['M12 3a6 6 0 1 0 0 12a6 6 0 1 0 0-12', 'M9 21h6', 'M12 15v6'],
  torso: ['M7 3h10l2 9-2 9H7l-2-9z', 'M12 3v18'],
  brush: ['M15 4l5 5-9 9-5-5z', 'M6 13l-2 2c-1 1-1 3 0 4s3 1 4 0l2-2'],
  undo: ['M9 14L4 9l5-5', 'M4 9h9a6 6 0 0 1 0 12h-3'],
  clear: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  zoomIn: ['M12 5v14', 'M5 12h14'],
  zoomOut: ['M5 12h14'],
  fit: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
}
