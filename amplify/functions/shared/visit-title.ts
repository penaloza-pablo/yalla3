export const appendUrgentTaskTitles = (
  visitTitle: string,
  taskTitles: string[],
) => {
  let next = visitTitle.trim();
  for (const raw of taskTitles) {
    const taskTitle = raw.trim();
    if (!taskTitle) {
      continue;
    }
    const marker = ` + ${taskTitle}`;
    if (next.includes(marker) || next === taskTitle) {
      continue;
    }
    next = next ? `${next}${marker}` : taskTitle;
  }
  return next;
};
