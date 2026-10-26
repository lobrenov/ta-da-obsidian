import type { LocalDate } from "../core/model/localDate";
import type { RepeatRule } from "../core/model/repeatRule";
import { firstDate } from "../core/model/repeatRuleNext";

/** What setting `rule` writes on a task: the rule's text, and the due date it starts on when the task has no date and no rule yet. */
export function repeatStart(
	rule: RepeatRule,
	task: { dueDate: LocalDate | null; deadline: LocalDate | null; hasRule: boolean },
	today: LocalDate,
): { text: string; dueDate: LocalDate | null } {
	const start = task.dueDate ?? task.deadline ?? firstDate(rule, today);
	return { text: rule.anchored(start ?? today).phrase, dueDate: !task.dueDate && !task.deadline && !task.hasRule ? start : null };
}
