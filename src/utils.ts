export const clampNumber = (
  value: number,
  min: number,
  max: number,
): number => {
  return Math.min(Math.max(value, min), max);
};

export const makeKey = (event: KeyboardEvent): string => {
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.metaKey) modifiers.push("Meta");
  modifiers.push(event.key);
  return modifiers.join("+");
};
