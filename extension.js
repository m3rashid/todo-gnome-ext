'use strict';

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const STORAGE_DIR = GLib.build_filenamev([GLib.get_home_dir(), '.todo-manager']);
const STORAGE_FILES = {
	TASKS: GLib.build_filenamev([STORAGE_DIR, 'daily.json']),
	DAILY_ROUTINES: GLib.build_filenamev([STORAGE_DIR, 'daily-routine.json']),
	WEEKLY_ROUTINES: GLib.build_filenamev([STORAGE_DIR, 'weekly-routine.json']),
	DAILY_LOGS: GLib.build_filenamev([STORAGE_DIR, 'daily-routine-log.json']),
	WEEKLY_LOGS: GLib.build_filenamev([STORAGE_DIR, 'weekly-routine-log.json'])
};
const TaskType = { TASK: 'task', DAILY: 'daily', WEEKLY: 'weekly' };

let taskManager = null;

const TaskManager = GObject.registerClass(
	class TaskManager extends PanelMenu.Button {
		_init() {
			super._init(0.0, 'Task Manager');
			let buttonBox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
			let icon = new St.Icon({ icon_name: 'view-list-symbolic', style_class: 'system-status-icon', icon_size: 16 });

			buttonBox.add_child(icon);
			this.add_child(buttonBox);

			this._data = { tasks: [], dailyHabits: [], weeklyHabits: [] };
			this._activeTab = TaskType.TASK;
			this._showAddForm = false;
			this._editingItem = null;
			this._loadData();
			this._buildMenu();
		}

		_loadData() {
			try {
				// Create storage directory if it doesn't exist
				if (!GLib.file_test(STORAGE_DIR, GLib.FileTest.EXISTS)) {
					GLib.mkdir_with_parents(STORAGE_DIR, 0o755);
				}

				// Initialize empty data structure
				this._data = { tasks: [], dailyHabits: [], weeklyHabits: [] };

				// Load tasks
				if (GLib.file_test(STORAGE_FILES.TASKS, GLib.FileTest.EXISTS)) {
					let [success, contents] = GLib.file_get_contents(STORAGE_FILES.TASKS);
					if (success) this._data.tasks = JSON.parse(new TextDecoder().decode(contents));
				}

				// Load daily routines
				if (GLib.file_test(STORAGE_FILES.DAILY_ROUTINES, GLib.FileTest.EXISTS)) {
					let [success, contents] = GLib.file_get_contents(STORAGE_FILES.DAILY_ROUTINES);
					if (success) this._data.dailyHabits = JSON.parse(new TextDecoder().decode(contents));
				}

				// Load weekly routines
				if (GLib.file_test(STORAGE_FILES.WEEKLY_ROUTINES, GLib.FileTest.EXISTS)) {
					let [success, contents] = GLib.file_get_contents(STORAGE_FILES.WEEKLY_ROUTINES);
					if (success) this._data.weeklyHabits = JSON.parse(new TextDecoder().decode(contents));
				}

				// Load routine logs
				if (GLib.file_test(STORAGE_FILES.DAILY_LOGS, GLib.FileTest.EXISTS)) {
					let [success, contents] = GLib.file_get_contents(STORAGE_FILES.DAILY_LOGS);
					if (success) {
						const logs = JSON.parse(new TextDecoder().decode(contents));
						this._data.dailyHabits.forEach(habit => {
							habit.completions = logs[habit.id] || [];
						});
					}
				}

				if (GLib.file_test(STORAGE_FILES.WEEKLY_LOGS, GLib.FileTest.EXISTS)) {
					let [success, contents] = GLib.file_get_contents(STORAGE_FILES.WEEKLY_LOGS);
					if (success) {
						const logs = JSON.parse(new TextDecoder().decode(contents));
						this._data.weeklyHabits.forEach(habit => {
							habit.completions = logs[habit.id] || [];
						});
					}
				}
			} catch (e) {
				log('Failed to load data: ' + e);
				this._data = { tasks: [], dailyHabits: [], weeklyHabits: [] };
			}
		}

		_saveData() {
			try {
				// Save tasks
				let tasksContent = JSON.stringify(this._data.tasks, null, 2);
				GLib.file_set_contents(STORAGE_FILES.TASKS, tasksContent);

				// Save daily routines (without completions)
				let dailyRoutines = this._data.dailyHabits.map(({ completions, ...habit }) => habit);
				let dailyRoutinesContent = JSON.stringify(dailyRoutines, null, 2);
				GLib.file_set_contents(STORAGE_FILES.DAILY_ROUTINES, dailyRoutinesContent);

				// Save weekly routines (without completions)
				let weeklyRoutines = this._data.weeklyHabits.map(({ completions, ...habit }) => habit);
				let weeklyRoutinesContent = JSON.stringify(weeklyRoutines, null, 2);
				GLib.file_set_contents(STORAGE_FILES.WEEKLY_ROUTINES, weeklyRoutinesContent);

				// Save routine logs
				let dailyLogs = {};
				this._data.dailyHabits.forEach(habit => {
					dailyLogs[habit.id] = habit.completions;
				});
				let dailyLogsContent = JSON.stringify(dailyLogs, null, 2);
				GLib.file_set_contents(STORAGE_FILES.DAILY_LOGS, dailyLogsContent);

				let weeklyLogs = {};
				this._data.weeklyHabits.forEach(habit => {
					weeklyLogs[habit.id] = habit.completions;
				});
				let weeklyLogsContent = JSON.stringify(weeklyLogs, null, 2);
				GLib.file_set_contents(STORAGE_FILES.WEEKLY_LOGS, weeklyLogsContent);
			} catch (e) {
				log('Failed to save data: ' + e);
			}
		}

		_validateInput(title, description) {
			title = title.trim();
			description = description.trim();

			if (!title) return { valid: false, error: 'Title is required' };
			if (title.length < 3) return { valid: false, error: 'Title must be at least 3 characters' };
			if (title.length > 100) return { valid: false, error: 'Title must be less than 100 characters' };
			if (description && description.length > 500) {
				return { valid: false, error: 'Description must be less than 500 characters' };
			}

			return { valid: true, title, description };
		}

		_buildMenu() {
			this.menu.box.destroy_all_children();
			let tabBar = new St.BoxLayout({ style_class: 'tab-bar' });

			let tasksTab = this._createTabButton('Tasks', TaskType.TASK);
			let dailyTab = this._createTabButton('Daily Habits', TaskType.DAILY);
			let weeklyTab = this._createTabButton('Weekly Habits', TaskType.WEEKLY);

			tabBar.add_child(tasksTab);
			tabBar.add_child(dailyTab);
			tabBar.add_child(weeklyTab);

			let tabItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
			tabItem.add_child(tabBar);
			this.menu.addMenuItem(tabItem);

			switch (this._activeTab) {
				case TaskType.TASK:
					this._buildTasksSection();
					break;
				case TaskType.DAILY:
					this._buildHabitsSection(TaskType.DAILY);
					break;
				case TaskType.WEEKLY:
					this._buildHabitsSection(TaskType.WEEKLY);
					break;
			}
		}

		_createTabButton(text, type) {
			let button = new St.Button({
				label: text,
				style_class: 'tab-button' + (this._activeTab === type ? ' active' : ''),
			});

			button.connect('clicked', () => {
				this._activeTab = type;
				this._showAddForm = false;
				this._buildMenu();
			});

			return button;
		}

		_buildAddButton(type) {
			let addButtonBox = new St.BoxLayout({ style_class: 'add-button-box' });

			let label = type === TaskType.TASK ?
				'+ Add a new task' :
				`+ Create a new ${type === TaskType.DAILY ? 'daily' : 'weekly'} routine`;

			let addButton = new St.Button({ style_class: 'add-button', label: label, });

			addButton.connect('clicked', () => {
				this._showAddForm = !this._showAddForm;
				this._buildMenu();
			});

			addButtonBox.add_child(addButton);
			return addButtonBox;
		}

		_buildAddForm(type, item = null) {
			let addBox = new St.BoxLayout({ style_class: 'add-task-box', vertical: true });

			let titleEntry = new St.Entry({
				hint_text: type === TaskType.TASK ? 'Task title...' :
					type === TaskType.DAILY ? 'Daily habit title...' : 'Weekly habit title...',
				style_class: 'task-title-entry',
				text: item ? item.title : ''
			});

			let descEntry = new St.Entry({
				hint_text: 'Description (optional)...',
				style_class: 'task-description-entry',
				text: item ? item.description : '',
			});

			let buttonBox = new St.BoxLayout({ style_class: 'form-button-box', x_expand: true });

			let saveButton = new St.Button({
				can_focus: true,
				label: item ? 'Update' : 'Save',
				style_class: 'form-button save-button disabled',
			});

			let cancelButton = new St.Button({ label: 'Cancel', style_class: 'form-button cancel-button' });

			buttonBox.add_child(cancelButton);
			buttonBox.add_child(saveButton);

			addBox.add_child(titleEntry);
			addBox.add_child(descEntry);
			addBox.add_child(buttonBox);

			// Validation and save function
			const saveItem = () => {
				let title = titleEntry.get_text();
				let description = descEntry.get_text();
				let validation = this._validateInput(title, description);

				if (validation.valid) {
					if (item) {
						// Update existing item
						item.title = validation.title;
						item.description = validation.description;
						this._editingItem = null;
					} else {
						let newItem = {
							id: Date.now().toString(),
							title: validation.title,
							description: validation.description,
							createdAt: new Date().toISOString()
						};

						if (type === TaskType.TASK) {
							newItem.completed = false;
							this._data.tasks.push(newItem);
						} else if (type === TaskType.DAILY) {
							newItem.completions = [];
							this._data.dailyHabits.push(newItem);
						} else {
							newItem.completions = [];
							this._data.weeklyHabits.push(newItem);
						}
					}

					this._saveData();
					this._showAddForm = false;
					this._buildMenu();
				}
			};

			// Update save button state based on input
			const updateSaveButton = () => {
				let validation = this._validateInput(titleEntry.get_text(), descEntry.get_text());
				if (validation.valid) saveButton.remove_style_class_name('disabled');
				else saveButton.add_style_class_name('disabled');
			};

			// Add input handlers
			titleEntry.clutter_text.connect('text-changed', () => {
				updateSaveButton();
			});

			descEntry.clutter_text.connect('text-changed', () => {
				updateSaveButton();
			});

			// Add enter key handler
			titleEntry.clutter_text.connect('activate', () => {
				if (!saveButton.has_style_class_name('disabled')) saveItem();
			});

			descEntry.clutter_text.connect('activate', () => {
				if (!saveButton.has_style_class_name('disabled')) saveItem();
			});

			saveButton.connect('clicked', () => {
				if (!saveButton.has_style_class_name('disabled')) saveItem();
			});

			cancelButton.connect('clicked', () => {
				this._showAddForm = false;
				this._editingItem = null;
				this._buildMenu();
			});

			// Initialize save button state
			updateSaveButton();

			return addBox;
		}

		_buildTasksSection() {
			let container = new St.BoxLayout({ vertical: true, style_class: 'tasks-container' });

			// Add the "+" button at the top
			container.add_child(this._buildAddButton(TaskType.TASK));

			// Add form if shown
			if (this._showAddForm) container.add_child(this._buildAddForm(TaskType.TASK));

			let tasksContainer = new St.BoxLayout({ style_class: 'items-container', vertical: true });

			if (this._data.tasks.length === 0) this._addEmptyState(tasksContainer, 'No tasks yet');
			else {
				this._data.tasks.forEach((task) => {
					tasksContainer.add_child(this._createTaskItem(task));
				});
			}

			container.add_child(tasksContainer);

			let containerItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
			containerItem.add_child(container);
			this.menu.addMenuItem(containerItem);
		}

		_buildHabitsSection(type) {
			let habits = type === TaskType.DAILY ? this._data.dailyHabits : this._data.weeklyHabits;
			let title = type === TaskType.DAILY ? 'Daily' : 'Weekly';

			let container = new St.BoxLayout({ vertical: true, style_class: 'habits-container' });

			// Add the "+" button at the top
			container.add_child(this._buildAddButton(type));

			// Add form if shown
			if (this._showAddForm) container.add_child(this._buildAddForm(type));

			// Add habits list
			let habitsContainer = new St.BoxLayout({ style_class: 'items-container', vertical: true });

			if (habits.length === 0) {
				this._addEmptyState(habitsContainer, `No ${title.toLowerCase()} habits yet`);
			} else {
				habits.forEach((habit) => {
					habitsContainer.add_child(this._createHabitItem(habit, type));
				});
			}

			container.add_child(habitsContainer);

			let containerItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
			containerItem.add_child(container);
			this.menu.addMenuItem(containerItem);
		}

		_createTaskItem(task) {
			let box = new St.BoxLayout({
				vertical: true,
				style_class: 'task-item' + (this._editingItem === task ? ' editing' : ''),
			});

			let headerBox = new St.BoxLayout({ style_class: 'task-header' });
			let checkbox = new St.Button({ style_class: 'checkbox' + (task.completed ? ' checked' : '') });

			let title = new St.Label({
				text: task.title,
				style_class: 'task-title',
				x_align: Clutter.ActorAlign.START,
				y_align: Clutter.ActorAlign.START,
			});
			// Enable line wrap
			title.clutter_text.line_wrap = true;
			title.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR; // or WORD
			title.set_width(400)

			let editButton = new St.Button({ label: '✎', style_class: 'edit-button' });
			let deleteButton = new St.Button({ label: '×', style_class: 'delete-button' });

			headerBox.add_child(checkbox);
			headerBox.add_child(title);
			headerBox.add_child(editButton);
			headerBox.add_child(deleteButton);
			box.add_child(headerBox);

			if (task.description) {
				let description = new St.Label({ text: task.description, style_class: 'task-description' });
				box.add_child(description);
			}

			if (this._editingItem === task) box.add_child(this._buildAddForm(TaskType.TASK, task));

			checkbox.connect('clicked', () => {
				task.completed = !task.completed;
				this._saveData();
				this._buildMenu();
			});

			editButton.connect('clicked', () => {
				this._editingItem = task;
				this._showAddForm = false;
				this._buildMenu();
			});

			deleteButton.connect('clicked', () => {
				this._data.tasks = this._data.tasks.filter(t => t.id !== task.id);
				this._saveData();
				this._buildMenu();
			});

			return box;
		}

		_createHabitItem(habit, type) {
			let box = new St.BoxLayout({
				vertical: true,
				style_class: 'task-item' + (this._editingItem === habit ? ' editing' : ''),
			});

			let headerBox = new St.BoxLayout({ style_class: 'task-header' });

			let checkbox = new St.Button({
				style_class: 'checkbox' + (this._isHabitCompletedToday(habit) ? ' checked' : '')
			});

			let title = new St.Label({
				text: habit.title,
				style_class: 'task-title',
				x_align: Clutter.ActorAlign.START,
				y_align: Clutter.ActorAlign.START,
			});
			title.clutter_text.line_wrap = true;
			title.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR; // or WORD
			title.set_width(400)

			let editButton = new St.Button({ label: '✎', style_class: 'edit-button' });

			let deleteButton = new St.Button({ label: '×', style_class: 'delete-button' });

			headerBox.add_child(checkbox);
			headerBox.add_child(title);
			headerBox.add_child(editButton);
			headerBox.add_child(deleteButton);
			box.add_child(headerBox);

			if (habit.description) {
				let description = new St.Label({
					text: habit.description,
					style_class: 'task-description',
					x_align: Clutter.ActorAlign.START,
					y_align: Clutter.ActorAlign.START,
				});
				description.clutter_text.line_wrap = true;
				description.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR; // or WORD
				description.set_width(400)
				box.add_child(description);
			}

			if (this._editingItem === habit) box.add_child(this._buildAddForm(type, habit));

			let stats = this._calculateHabitStats(habit, type);
			let statsBox = new St.BoxLayout({ style_class: 'habit-stats', vertical: true });

			let streakLabel = new St.Label({
				text: `Current streak: ${stats.currentStreak} ${type === TaskType.DAILY ? 'days' : 'weeks'}`,
				style_class: 'habit-streak'
			});

			let completionLabel = new St.Label({
				text: `Completion rate: ${stats.completionRate}%`,
				style_class: 'habit-completion'
			});

			let progressBar = new St.Bin({ style_class: 'habit-progress' });

			let progressFill = new St.Bin({
				x_expand: true,
				style_class: 'progress-bar',
				width: Math.floor(stats.completionRate) + '%'
			});

			progressBar.add_child(progressFill);

			statsBox.add_child(streakLabel);
			statsBox.add_child(completionLabel);
			statsBox.add_child(progressBar);
			box.add_child(statsBox);

			// Add handlers
			checkbox.connect('clicked', () => {
				let today = new Date().toISOString().split('T')[0];
				let index = habit.completions.indexOf(today);

				if (index === -1) habit.completions.push(today);
				else habit.completions.splice(index, 1);

				this._saveData();
				this._buildMenu();
			});

			editButton.connect('clicked', () => {
				this._editingItem = habit;
				this._showAddForm = false;
				this._buildMenu();
			});

			deleteButton.connect('clicked', () => {
				if (type === TaskType.DAILY) {
					this._data.dailyHabits = this._data.dailyHabits.filter(h => h.id !== habit.id);
				} else {
					this._data.weeklyHabits = this._data.weeklyHabits.filter(h => h.id !== habit.id);
				}
				this._saveData();
				this._buildMenu();
			});

			return box;
		}

		_isHabitCompletedToday(habit) {
			let today = new Date().toISOString().split('T')[0];
			return habit.completions.includes(today);
		}

		_calculateHabitStats(habit, type) {
			let today = new Date();
			let stats = { currentStreak: 0, completionRate: 0 };

			if (type === TaskType.DAILY) {
				// Calculate daily stats
				let currentDate = new Date(today);
				currentDate.setHours(0, 0, 0, 0);

				while (true) {
					let dateStr = currentDate.toISOString().split('T')[0];
					if (!habit.completions.includes(dateStr)) {
						break;
					}
					stats.currentStreak++;
					currentDate.setDate(currentDate.getDate() - 1);
				}

				// Calculate completion rate for the last 30 days
				let completions = 0;
				for (let i = 0; i < 30; i++) {
					let date = new Date(today);
					date.setDate(date.getDate() - i);
					let dateStr = date.toISOString().split('T')[0];
					if (habit.completions.includes(dateStr)) completions++;
				}
				stats.completionRate = Math.round((completions / 30) * 100);

			} else {
				// Calculate weekly stats
				let currentWeek = this._getWeekNumber(today);
				let currentYear = today.getFullYear();
				let streak = 0;

				while (true) {
					let weekCompletions = habit.completions.filter(date => {
						let [year, week] = this._getYearAndWeekNumber(new Date(date));
						return year === currentYear && week === currentWeek;
					});

					if (weekCompletions.length === 0) break;

					streak++;
					currentWeek--;
					if (currentWeek === 0) {
						currentWeek = 52;
						currentYear--;
					}
				}
				stats.currentStreak = streak;

				// Calculate completion rate for the last 12 weeks
				let completions = 0;
				for (let i = 0; i < 12; i++) {
					let weekDate = new Date(today);
					weekDate.setDate(weekDate.getDate() - (i * 7));
					let [year, week] = this._getYearAndWeekNumber(weekDate);

					let weekCompletions = habit.completions.filter(date => {
						let [y, w] = this._getYearAndWeekNumber(new Date(date));
						return y === year && w === week;
					});

					if (weekCompletions.length > 0) completions++;
				}
				stats.completionRate = Math.round((completions / 12) * 100);
			}

			return stats;
		}

		_getWeekNumber(date) {
			let d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
			let dayNum = d.getUTCDay() || 7;
			d.setUTCDate(d.getUTCDate() + 4 - dayNum);
			let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
			return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
		}

		_getYearAndWeekNumber(date) {
			let d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
			let dayNum = d.getUTCDay() || 7;
			d.setUTCDate(d.getUTCDate() + 4 - dayNum);
			let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
			let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
			return [d.getUTCFullYear(), weekNo];
		}

		_addEmptyState(container, message) {
			let emptyBox = new St.BoxLayout({ style_class: 'empty-state', vertical: true });
			let icon = new St.Icon({ icon_name: 'checkbox-checked-symbolic', style_class: 'empty-state-icon' });
			let label = new St.Label({ text: message, style_class: 'empty-state-text' });

			emptyBox.add_child(icon);
			emptyBox.add_child(label);
			container.add_child(emptyBox);
		}
	}
);

export default class Extension {
	enable() {
		taskManager = new TaskManager();
		Main.panel.addToStatusArea('task-manager', taskManager);
	}

	disable() {
		if (taskManager) {
			taskManager.destroy();
			taskManager = null;
		}
	}
}
