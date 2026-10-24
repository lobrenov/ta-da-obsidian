import { describe, expect, it } from "vitest";
import { dailyNote, dateAtPath, defaultDailyNoteNames, openCheckboxCount, pathForDate, pathForWeek, weekAtPath, weekNote } from "../src/core/index/dailyNotes";
import * as q from "../src/core/index/queries";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { type Item, isLogged } from "../src/core/model/item";
import { ISOWeek, LocalDate } from "../src/core/model/localDate";
import { parseItem } from "../src/core/parsing/parseItem";
import { makeItem, titles } from "./support";

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const today = date("2026-10-02");

describe("VaultIndex", () => {
	const project = makeItem("projects/Ta Da MVP.md", "type: project\nstatus: Doing");
	const member = makeItem("tasks/Member.md", 'type: task\nstatus: Doing\nproject: "[[ta da mvp]]"', "See [[Ta Da MVP#Goals|goals]].");
	const folderLink = makeItem("tasks/Folder link.md", 'type: task\nstatus: Done\nproject: "[[projects/Ta Da MVP.md]]"');
	const toTask = makeItem("tasks/To a task.md", 'type: task\nstatus: Doing\nproject: "[[Member]]"');
	const missing = makeItem("tasks/Missing.md", 'type: task\nstatus: Doing\nproject: "[[Nowhere]]"', "[[Member]]");

	it("resolves projects by title, ignoring case and folders", () => {
		const index = new VaultIndex([project, member, folderLink, toTask, missing]);
		expect(index.projectOf(member)?.path).toBe(project.path);
		expect(index.projectOf(folderLink)?.path).toBe(project.path);
		expect(index.projectOf(toTask)).toBeNull();
		expect(index.projectOf(missing)).toBeNull();
		expect(titles(index.tasksIn(project))).toEqual(["Folder link", "Member"]);
	});

	it("warns on unresolved projects", () => {
		const index = new VaultIndex([project, member, toTask, missing]);
		expect(index.warnings(member)).toEqual([]);
		expect(index.warnings(missing)).toEqual([{ case: "unresolvedProject", value: "Nowhere" }]);
		expect(index.warnings(toTask)).toEqual([{ case: "unresolvedProject", value: "Member" }]);
	});

	it("finds backlinks", () => {
		const index = new VaultIndex([project, member, missing]);
		expect(titles(index.backlinks(project))).toEqual(["Member"]);
		expect(titles(index.backlinks(member))).toEqual(["Missing"]);
	});

	it("counts embeds and keeps them out of backlinks", () => {
		const photo = makeItem("tasks/Photograph the Kombi.md", "type: task\nstatus: Doing", "![[odometer.png]] ![[Member]]");
		const history = makeItem("tasks/Kombi service history.md", "type: task\nstatus: Doing", "![[attachments/Odometer.png]]\n\n![[odometer.png|200]] ![[front.jpg]]");
		const index = new VaultIndex([member, photo, history]);
		expect(index.embedders("ODOMETER.png").map((entry) => `${entry.item.title} ${entry.count}`)).toEqual(["Kombi service history 2", "Photograph the Kombi 1"]);
		expect(titles(index.embedders("front.jpg").map((entry) => entry.item))).toEqual(["Kombi service history"]);
		expect(index.backlinks(member)).toEqual([]);
		index.update(makeItem(history.path, "type: task\nstatus: Doing"));
		expect(titles(index.embedders("odometer.png").map((entry) => entry.item))).toEqual(["Photograph the Kombi"]);
		expect(index.embedders("front.jpg")).toEqual([]);
		index.remove(photo.path);
		expect(index.embedders("odometer.png")).toEqual([]);
	});

	it("prefers the first path when titles repeat", () => {
		const duplicate = makeItem("archive/Ta Da MVP.md", "type: project\nstatus: Done");
		const index = new VaultIndex([project, duplicate, member]);
		expect(index.itemsTitled("TA DA MVP").map((item) => item.path)).toEqual(["archive/Ta Da MVP.md", "projects/Ta Da MVP.md"]);
		expect(index.projectOf(member)?.path).toBe("archive/Ta Da MVP.md");
	});

	it("patches items", () => {
		const index = new VaultIndex([member]);
		expect(index.projectOf(member)).toBeNull();
		index.update(project);
		expect(titles(index.tasksIn(project))).toEqual(["Member"]);
		index.update(makeItem(member.path, "type: task\nstatus: Doing"));
		expect(index.tasksIn(project)).toEqual([]);
		index.remove(project.path);
		expect(index.get(project.path)).toBeUndefined();
		expect(index.items.size).toBe(1);
	});

	it("keeps lookups in step with the items", () => {
		const earlier = makeItem("archive/Ta Da MVP.md", "type: project\nstatus: Done");
		const nowhere = makeItem("projects/Nowhere.md", "type: project\nstatus: Doing");
		const index = new VaultIndex([member, missing]);
		index.update(project);
		expect(titles(index.tasksIn(project))).toEqual(["Member"]);
		expect(titles(index.backlinks(project))).toEqual(["Member"]);
		index.update(earlier);
		expect(titles(index.tasksIn(earlier))).toEqual(["Member"]);
		expect(index.tasksIn(project)).toEqual([]);
		index.update(makeItem(member.path, 'type: task\nstatus: Doing\nproject: "[[Nowhere]]"'));
		index.update(nowhere);
		expect(titles(index.tasksIn(nowhere))).toEqual(["Member", "Missing"]);
		expect(index.backlinks(project)).toEqual([]);
		index.update(makeItem(nowhere.path, "type: task\nstatus: Doing"));
		expect(index.tasksIn(nowhere)).toEqual([]);
		expect(index.projectOf(missing)).toBeNull();
		for (const path of [...index.items.keys()]) index.remove(path);
		expect(index.items.size).toBe(0);
		expect(index.itemsTitled("missing")).toEqual([]);
	});

	it("resolves logged files as links but keeps them out of the lists", () => {
		const completed = "status: Done\ncompletedDate: 2026-09-30";
		const index = new VaultIndex([
			makeItem("projects/Kombi.md", "type: project\nstatus: Doing"),
			makeItem(".logbook/2026-09/Kombi.md", `type: project\n${completed}`),
			makeItem(".logbook/2026-09/Sold.md", `type: project\n${completed}`),
			makeItem("tasks/Open.md", 'type: task\nstatus: Doing\nproject: "[[Kombi]]"'),
			makeItem("tasks/Closed.md", 'type: task\nstatus: Done\nproject: "[[Kombi]]"'),
			makeItem(".logbook/2026-09/Photos.md", `type: task\n${completed}\nproject: "[[Kombi]]"`),
			makeItem(".logbook/2026-09/Listing.md", `type: task\n${completed}\nproject: "[[Sold]]"`),
		]);
		expect(isLogged(index.get(".logbook/2026-09/Photos.md") as Item)).toBe(true);
		expect(index.itemsTitled("Kombi").map((item) => item.path)).toEqual(["projects/Kombi.md", ".logbook/2026-09/Kombi.md"]);
		expect(titles(index.projects)).toEqual(["Kombi"]);
		expect(new Set(titles(index.logged))).toEqual(new Set(["Kombi", "Sold", "Photos", "Listing"]));
		const kombi = index.get("projects/Kombi.md") as Item;
		const sold = index.get(".logbook/2026-09/Sold.md") as Item;
		expect(titles(index.tasksIn(kombi))).toEqual(["Closed", "Open"]);
		expect(titles(index.tasksIn(kombi, true))).toEqual(["Closed", "Open", "Photos"]);
		expect(titles(index.openTasksIn(kombi))).toEqual(["Open"]);
		expect(titles(index.tasksIn(sold, true))).toEqual(["Listing"]);
		expect(index.parentOf(index.get(".logbook/2026-09/Listing.md") as Item)?.path).toBe(sold.path);
		const progress = q.progress(index, kombi);
		expect([progress.done, progress.total]).toEqual([2, 3]);
		expect(q.search(index, "photos")).toEqual([]);
		expect(titles(q.search(index, "open"))).toEqual(["Open"]);
	});

	it("patches tags per item", () => {
		const a = makeItem("tasks/A.md", "type: task\nstatus: Doing\ntags: [Errands]", "#home/garden");
		const b = makeItem("tasks/B.md", "type: task\nstatus: Doing", "#errands");
		const index = new VaultIndex([a, b]);
		expect(index.carriedTags.map((tag) => tag.name).sort()).toEqual(["Errands", "home/garden"]);
		expect(index.pathsCarrying("errands")).toEqual(new Set([a.path, b.path]));
		expect(index.pathsCarrying("home").size).toBe(0);
		index.update(makeItem("tasks/A.md", "type: task\nstatus: Doing"));
		expect(index.pathsCarrying("errands")).toEqual(new Set([b.path]));
		expect(index.pathsCarrying("home/garden").size).toBe(0);
		expect(index.carriedTags.map((tag) => tag.name)).toEqual(["errands"]);
		index.update(a);
		expect(index.carriedTags.map((tag) => tag.name).sort()).toEqual(["Errands", "home/garden"]);
		index.remove(b.path);
		index.remove(a.path);
		expect(index.carriedTags).toEqual([]);
	});

	it("leaves logged files out of tags", () => {
		const logged = makeItem(".logbook/tasks/Old.md", "type: task\nstatus: Done\ntags: [old]");
		const index = new VaultIndex([logged]);
		expect(index.carriedTags).toEqual([]);
		index.remove(logged.path);
		index.update(makeItem("tasks/Old.md", "type: task\nstatus: Done\ntags: [old]"));
		expect(index.pathsCarrying("old")).toEqual(new Set(["tasks/Old.md"]));
	});

	it("resolves titles to Ta Da files before notes", () => {
		const index = new VaultIndex([
			makeItem("Ark.md", "tags: []"),
			makeItem("Meetings/Ark.md", "tags: []"),
			makeItem("projects/Ark.md", "type: project\nstatus: Doing"),
			makeItem(".logbook/2026-09/Ark.md", "type: task\nstatus: Done"),
		]);
		expect(index.itemsTitled("ark").map((item) => item.path)).toEqual(["projects/Ark.md", "Ark.md", "Meetings/Ark.md", ".logbook/2026-09/Ark.md"]);
		index.update(makeItem("Ark.md", "type: area"));
		expect(index.itemsTitled("Ark").map((item) => item.path)).toEqual(["Ark.md", "projects/Ark.md", "Meetings/Ark.md", ".logbook/2026-09/Ark.md"]);
	});

	it("never files notes or makes them parents", () => {
		const note = makeItem("Ark.md", 'project: "[[Ta Da MVP]]"\narea: "[[Work]]"');
		const area = makeItem("areas/Work.md", "type: area");
		const index = new VaultIndex([project, area, note]);
		expect([note.properties.kind, note.properties.project, note.properties.area]).toEqual(["note", null, null]);
		expect([index.parentOf(note), index.areaOf(note)]).toEqual([null, null]);
		expect([index.tasksIn(project), index.tasksIn(area), index.projectsIn(area)]).toEqual([[], [], []]);
		expect(index.notes.map((item) => item.path)).toEqual(["Ark.md"]);
	});
});

describe("queries", () => {
	const items = [
		makeItem("projects/Alpha.md", "type: project\nstatus: Doing\ndeadline: 2026-10-02"),
		makeItem("projects/Beta.md", "type: project\nstatus: Doing"),
		makeItem("projects/Shipped.md", "type: project\nstatus: Done"),
		makeItem("tasks/Overdue due.md", 'type: task\nstatus: Doing\ndueDate: 2026-09-30\nproject: "[[Alpha]]"'),
		makeItem("tasks/Overdue deadline.md", "type: task\nstatus: Blocked\ndueDate: 2026-10-09\ndeadline: 2026-10-01"),
		makeItem("tasks/Due today.md", 'type: task\nstatus: Not Started\ndueDate: 2026-10-02\nproject: "[[Beta]]"'),
		makeItem("tasks/Deadline today.md", "type: task\nstatus: Not Started\ndeadline: 2026-10-02"),
		makeItem("tasks/Done today.md", 'type: task\nstatus: Done\ncompletedDate: 2026-10-02\ndueDate: 2026-10-05\nproject: "[[Alpha]]"'),
		makeItem("tasks/Done earlier.md", 'type: task\nstatus: Done\ncompletedDate: 2026-10-01\ndueDate: 2026-10-01\nproject: "[[Alpha]]"'),
		makeItem("tasks/Same day.md", "type: task\nstatus: Doing\ndueDate: 2026-10-05\ndeadline: 2026-10-05"),
		makeItem("tasks/Tomorrow.md", 'type: task\nstatus: Not Started\ndueDate: 2026-10-03\ndeadline: 2026-10-08\nproject: "[[Beta]]"'),
		makeItem("tasks/Undated.md", 'type: task\nstatus: Not Started\nproject: "[[Unknown]]"'),
		makeItem("tasks/Shipped task.md", 'type: task\nstatus: Doing\nproject: "[[Shipped]]"'),
	];
	const index = new VaultIndex(items);

	it("lists open tasks due or at deadline and tasks done today in Today", () => {
		expect(titles(q.todayTasks(index, today))).toEqual(["Overdue due", "Overdue deadline", "Deadline today", "Due today", "Done today"]);
	});

	it("calls open items past either date overdue", () => {
		expect(titles(items.filter((item) => q.isOverdue(item, today)))).toEqual(["Overdue due", "Overdue deadline"]);
	});

	it("starts Upcoming tomorrow with one entry per date", () => {
		expect(q.upcoming(index, today).map((entry) => `${entry.date} ${entry.kind} ${entry.item.title}`)).toEqual([
			"2026-10-03 due Tomorrow",
			"2026-10-05 due Same day",
			"2026-10-05 deadline Same day",
			"2026-10-08 deadline Tomorrow",
			"2026-10-09 due Overdue deadline",
		]);
	});

	it("lists loose tasks", () => {
		expect(titles(q.looseTasks(index))).toEqual(["Deadline today", "Overdue deadline", "Same day", "Undated"]);
	});

	it("counts all of an active project's tasks", () => {
		const progress = q.activeProjects(index).map((entry) => `${entry.project.title} ${entry.done}/${entry.total}`);
		expect(progress).toEqual(["Alpha 2/3", "Beta 0/2"]);
	});

	it("counts the tasks of any project", () => {
		expect(q.progress(index, items[0] as Item)).toEqual(q.activeProjects(index)[0]);
		const shipped = q.progress(index, items[2] as Item);
		expect([shipped.done, shipped.total]).toEqual([0, 1]);
	});

	it("leaves cancelled tasks out of the total", () => {
		const tasks = [makeItem("tasks/A.md", "type: task\nstatus: Done"), makeItem("tasks/B.md", "type: task\nstatus: Cancelled"), makeItem("tasks/C.md", "type: task\nstatus: Doing")];
		const progress = q.projectProgress(items[0] as Item, tasks);
		expect([progress.done, progress.total]).toEqual([1, 2]);
	});

	it("agrees between per-item tests and lists", () => {
		for (const item of items) {
			expect(q.isInToday(item, today), item.title).toBe(q.todayTasks(index, today).includes(item));
			expect(q.upcomingEntries(item, today), item.title).toEqual(q.upcoming(index, today).filter((entry) => entry.item === item));
			expect(q.isLoose(index, item), item.title).toBe(q.looseTasks(index).includes(item));
		}
		const deadlineFirst = makeItem("tasks/Late.md", "type: task\nstatus: Doing\ndueDate: 2026-10-20\ndeadline: 2026-10-15");
		expect(q.upcomingEntries(deadlineFirst, today).map((entry) => entry.kind)).toEqual(["deadline", "due"]);
	});

	it("groups loose tasks first, then projects by title", () => {
		const groups = q.grouped(index, q.todayTasks(index, today));
		expect(groups.map((group) => group.parent?.title ?? "Loose")).toEqual(["Loose", "Alpha", "Beta"]);
		expect(groups.map((group) => titles(group.tasks))).toEqual([["Overdue deadline", "Deadline today"], ["Overdue due", "Done today"], ["Due today"]]);
		expect(q.grouped(index, [])).toEqual([]);
	});

	it("searches words ignoring case and diacritics", () => {
		const search = new VaultIndex([
			makeItem("tasks/Update Dan’s website.md", "type: task\nstatus: Doing\narea: Game Jams"),
			makeItem("tasks/Café run.md", 'type: task\nstatus: Doing\narea: "[[Errands]]"'),
			makeItem("tasks/Other.md", "type: task\nstatus: Doing", "Mentions the website."),
		]);
		expect(titles(q.search(search, "WEBSITE"))).toEqual(["Update Dan’s website", "Other"]);
		expect(titles(q.search(search, "cafe err"))).toEqual(["Café run"]);
		expect(titles(q.search(search, "gamejams dan"))).toEqual(["Update Dan’s website"]);
		expect(q.search(search, "  ")).toEqual([]);
	});

	it("closes cancelled tasks and leaves them out of progress", () => {
		const cancelled = new VaultIndex([
			makeItem("projects/Gamma.md", "type: project\nstatus: Doing"),
			makeItem("projects/Dropped.md", "type: project\nstatus: Cancelled"),
			makeItem("tasks/Cancelled today.md", 'type: task\nstatus: Cancelled\ncompletedDate: 2026-10-02\ndueDate: 2026-10-01\nproject: "[[Gamma]]"'),
			makeItem("tasks/Cancelled loose.md", "type: task\nstatus: Cancelled\ncompletedDate: 2026-10-01\ndeadline: 2026-10-05"),
			makeItem("tasks/Done.md", 'type: task\nstatus: Done\ncompletedDate: 2026-10-01\nproject: "[[Gamma]]"'),
			makeItem("tasks/Open.md", 'type: task\nstatus: Doing\nproject: "[[Gamma]]"'),
		]);
		expect(titles(q.todayTasks(cancelled, today))).toEqual(["Cancelled today"]);
		expect(q.upcoming(cancelled, today)).toEqual([]);
		expect(q.looseTasks(cancelled)).toEqual([]);
		expect(cancelled.tasks.filter((task) => q.isOverdue(task, today))).toEqual([]);
		expect(q.activeProjects(cancelled).map((entry) => `${entry.project.title} ${entry.done}/${entry.total}`)).toEqual(["Gamma 1/2"]);
	});

	it("lists today for today and dated tasks for other days", () => {
		expect(titles(q.agendaDay(index, today, today))).toEqual(titles(q.todayTasks(index, today)));
		expect(titles(q.agendaDay(index, date("2026-10-05"), today))).toEqual(["Done today", "Same day"]);
		expect(titles(q.agendaDay(index, date("2026-10-01"), today))).toEqual(["Done earlier", "Overdue deadline"]);
		expect(q.agendaDay(index, date("2026-10-04"), today)).toEqual([]);
		const dropped = new VaultIndex([makeItem("tasks/Dropped.md", "type: task\nstatus: Cancelled\ndueDate: 2026-10-03\ncompletedDate: 2026-10-01")]);
		expect(q.agendaDay(dropped, date("2026-10-03"), today)).toEqual([]);
	});

	it("lists a week's entries", () => {
		const entries = q.agendaWeek(index, new ISOWeek(2026, 41)).map((entry) => `${entry.date} ${entry.kind} ${entry.item.title}`);
		expect(entries).toEqual([
			"2026-10-05 due Done today",
			"2026-10-05 due Same day",
			"2026-10-05 deadline Same day",
			"2026-10-08 deadline Tomorrow",
			"2026-10-09 due Overdue deadline",
		]);
		expect(q.agendaWeek(index, new ISOWeek(2026, 42))).toEqual([]);
	});
});

describe("daily notes", () => {
	const daily = (path: string, body = ""): Item => parseItem(`---\ncreatedDate: 2026-10-02\ntags: []\n---\n${body}`, path) as Item;

	it("reads dates from paths straight in the folder, ignoring its case", () => {
		const names = defaultDailyNoteNames;
		expect(dateAtPath(names, "Periodic Notes/Daily Notes/2026-10-02.md")?.toString()).toBe("2026-10-02");
		expect(dateAtPath(names, "PERIODIC notes/daily NOTES/2026-10-02.md")?.toString()).toBe("2026-10-02");
		for (const path of [
			"Periodic Notes/Daily Notes/2026-10-02 standup.md", "Periodic Notes/Daily Notes/2026-10-32.md",
			"Periodic Notes/Daily Notes/Sub/2026-10-02.md", "Other/2026-10-02.md", "Periodic Notes/Daily Notes/2026-10-02.txt", "2026-10-02.md",
		]) {
			expect(dateAtPath(names, path), path).toBeNull();
		}
		expect(dateAtPath({ dailyFolder: "", weekFolder: "Weeks" }, "2026-10-02.md")?.toString()).toBe("2026-10-02");
	});

	it("finds the note at the exact path", () => {
		const names = { dailyFolder: "Journal", weekFolder: "Weeks" };
		const index = new VaultIndex([daily("Journal/2026-10-02.md"), daily("Journal/2026-10-03 renamed.md"), daily("Periodic Notes/Daily Notes/2026-10-01.md")]);
		expect(dailyNote(index, today, names)?.path).toBe("Journal/2026-10-02.md");
		expect(dailyNote(index, date("2026-10-03"), names)).toBeNull();
		expect(dailyNote(index, today)).toBeNull();
		expect(dailyNote(index, date("2026-10-01"))?.title).toBe("2026-10-01");
	});

	it("keeps the real path when the folder's case differs", () => {
		const index = new VaultIndex([daily("periodic notes/DAILY notes/2026-10-02.md")]);
		expect(dailyNote(index, today)?.path).toBe("periodic notes/DAILY notes/2026-10-02.md");
		expect(dailyNote(index, today, { dailyFolder: "PERIODIC notes/daily NOTES", weekFolder: "Weeks" })?.path).toBe("periodic notes/DAILY notes/2026-10-02.md");
		expect(dailyNote(index, today, { dailyFolder: "Other", weekFolder: "Weeks" })).toBeNull();
	});

	it("is never a typed file", () => {
		const task = makeItem("Periodic Notes/Daily Notes/2026-10-02.md", "type: task\nstatus: Doing");
		expect(dailyNote(new VaultIndex([task]), today)).toBeNull();
	});

	it("names the paths of days and weeks, from the default folders", () => {
		const names = defaultDailyNoteNames;
		expect(pathForDate(names, today)).toBe("Periodic Notes/Daily Notes/2026-10-02.md");
		expect(pathForWeek(names, new ISOWeek(2026, 40))).toBe("Periodic Notes/Weekly Notes/2026-W40.md");
		expect(pathForWeek(names, new ISOWeek(2026, 3))).toBe("Periodic Notes/Weekly Notes/2026-W03.md");
	});

	it("reads its own paths back in any folder, and no other", () => {
		const week = new ISOWeek(2026, 40);
		for (const names of [
			defaultDailyNoteNames,
			{ dailyFolder: "Journal/2026", weekFolder: "Weeks" },
			{ dailyFolder: "Notes", weekFolder: "Notes" },
			{ dailyFolder: "", weekFolder: "" },
		]) {
			expect(dateAtPath(names, pathForDate(names, today))?.equals(today)).toBe(true);
			expect(weekAtPath(names, pathForWeek(names, week))?.equals(week)).toBe(true);
			expect(weekAtPath(names, pathForDate(names, today))).toBeNull();
			expect(dateAtPath(names, pathForWeek(names, week))).toBeNull();
		}
	});

	it("reads only well-formed week names", () => {
		const names = defaultDailyNoteNames;
		for (const name of ["2027-W53", "2026-W00", "2026-W4", "2026-w40", "2026-W+1", "2026-10-02", "2026-W40 plan"]) {
			expect(weekAtPath(names, `Periodic Notes/Weekly Notes/${name}.md`), name).toBeNull();
		}
		expect(weekAtPath(names, "Periodic Notes/Weekly Notes/Sub/2026-W40.md")).toBeNull();
		expect(weekAtPath(names, "Other/2026-W40.md")).toBeNull();
		expect(weekAtPath(names, "PERIODIC NOTES/WEEKLY NOTES/2026-W40.md")?.week).toBe(40);
		expect(weekAtPath(names, "Periodic Notes/Weekly Notes/2026-W53.md")?.week).toBe(53);
	});

	it("finds a week note at the exact path, and a daily note beside it in the same folder", () => {
		const names = { dailyFolder: "Journal", weekFolder: "Journal" };
		const week = new ISOWeek(2026, 40);
		const index = new VaultIndex([daily("Journal/2026-10-02.md"), daily("Journal/2026-W40.md"), daily("Journal/2026-W41 renamed.md"), daily("Periodic Notes/Weekly Notes/2026-W39.md")]);
		expect(weekNote(index, week, names)?.path).toBe("Journal/2026-W40.md");
		expect(dailyNote(index, today, names)?.path).toBe("Journal/2026-10-02.md");
		expect(weekNote(index, new ISOWeek(2026, 41), names)).toBeNull();
		expect(weekNote(index, week)).toBeNull();
		expect(weekNote(index, new ISOWeek(2026, 39))?.title).toBe("2026-W39");
	});

	it("finds a week note in the folder in any case, and never a typed file", () => {
		const week = new ISOWeek(2026, 40);
		const index = new VaultIndex([daily("periodic NOTES/weekly notes/2026-W40.md")]);
		expect(weekNote(index, week)?.path).toBe("periodic NOTES/weekly notes/2026-W40.md");
		const task = makeItem("Periodic Notes/Weekly Notes/2026-W40.md", "type: task\nstatus: Doing");
		expect(weekNote(new VaultIndex([task]), week)).toBeNull();
	});

	it("counts unchecked boxes", () => {
		expect(openCheckboxCount(daily("a.md", "- [ ] a\n- [/] b\n- [>] c\n- [x] d\n- [X] e\n- [-] f\n- [?] g\n- plain\n"))).toBe(3);
	});

	it("marks open tasks and unchecked boxes", () => {
		const index = new VaultIndex([
			makeItem("tasks/Due.md", "type: task\nstatus: Doing\ndueDate: 2026-10-02"),
			makeItem("tasks/Deadline.md", "type: task\nstatus: Doing\ndeadline: 2026-10-04"),
			makeItem("tasks/Done.md", "type: task\nstatus: Done\ndueDate: 2026-10-03\ncompletedDate: 2026-10-03"),
			makeItem("tasks/Outside.md", "type: task\nstatus: Doing\ndueDate: 2026-10-20"),
			daily("Periodic Notes/Daily Notes/2026-10-02.md", "- [ ] a\n- [x] b\n"),
			daily("Periodic Notes/Daily Notes/2026-10-03.md", "- [/] a\n"),
			daily("Periodic Notes/Daily Notes/2026-10-05.md", "- [x] a\n- [-] b\n"),
			daily("Periodic Notes/Daily Notes/2026-10-06.md", "- [-] a\n"),
			daily("Periodic Notes/Daily Notes/2026-10-07.md"),
		]);
		const marks = q.dayMarks(index, today, date("2026-10-08"));
		expect(Object.fromEntries(marks)).toEqual({
			"2026-10-02": { hasOpenTasks: true, hasOpenBoxes: true },
			"2026-10-03": { hasOpenTasks: false, hasOpenBoxes: true },
			"2026-10-04": { hasOpenTasks: true, hasOpenBoxes: false },
		});
		expect(q.dayMarks(index, today, today.addingDays(-1)).size).toBe(0);
		const elsewhere = q.dayMarks(index, today, date("2026-10-08"), { dailyFolder: "Journal", weekFolder: "Weeks" });
		expect(Object.keys(Object.fromEntries(elsewhere))).toEqual(["2026-10-02", "2026-10-04"]);
		expect(elsewhere.get("2026-10-02")?.hasOpenBoxes).toBe(false);
	});
});

describe("identity and order", () => {
	it("orders lowercase before uppercase and unaccented before accented", async () => {
		const { compareTitles } = await import("../src/core/index/vaultIndex");
		expect(compareTitles("a", "A")).toBeLessThan(0);
		expect(compareTitles("Cafe", "Café")).toBeLessThan(0);
		expect(compareTitles("Task 2", "Task 10")).toBeLessThan(0);
	});

	it("matches canonically equivalent titles", () => {
		const project = makeItem("projects/Café.md", "type: project\nstatus: Doing");
		const task = makeItem("tasks/T.md", 'type: task\nstatus: Doing\nproject: "[[Café]]"');
		const index = new VaultIndex([project, task]);
		expect(index.projectOf(task)?.path).toBe(project.path);
		expect(titles(index.tasksIn(project))).toEqual(["T"]);
		expect(index.itemsTitled("CAFÉ")).toEqual([project]);
	});
});
