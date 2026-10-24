import { LocalDate } from "../../core/model/localDate";

/** The current local day. */
export function today(): LocalDate {
	const now = new Date();
	return LocalDate.of(now.getFullYear(), now.getMonth() + 1, now.getDate()) as LocalDate;
}
