import { ItemView, MarkdownView, TFile, WorkspaceLeaf, moment, EventRef } from 'obsidian';
import TasksTimelinePlugin from './main';

export const TIMELINE_VIEW = 'tasks-timeline-view';

interface Task {
	id: string;
	text: string;
	completed: boolean;
	date: string;
	metadata: {
		due?: string;
		start?: string;
		end?: string;
		[key: string]: string | undefined;
	};
	subtasks: Task[];
	level: number;
}

interface DayGroup {
	date: string;
	formattedDate: string;
	tasks: Task[];
	isToday: boolean;
}

export class TimelineView extends ItemView {
	plugin: TasksTimelinePlugin;
	days: DayGroup[] = [];
	todayElement: HTMLElement | null = null;
	draggedTask: Task | null = null;
	draggedElement: HTMLElement | null = null;
	observer: IntersectionObserver | null = null;
	fileWatcher: EventRef | null = null;
	scrollPosition: number = 0;
	timelineFile: TFile | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TasksTimelinePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return TIMELINE_VIEW;
	}

	getDisplayText(): string {
		return 'Tasks Timeline';
	}

	getIcon(): string {
		return 'timeline';
	}

	async onOpen() {
		// Create the main container
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('tasks-timeline-view');

		// Create header
		const header = container.createEl('div', { cls: 'tasks-timeline-header' });
		header.createEl('h2', { text: 'Tasks Timeline' });

		// Create search bar
		const searchContainer = header.createEl('div', { cls: 'tasks-timeline-search' });
		const searchInput = searchContainer.createEl('input', { 
			type: 'text',
			placeholder: 'Search tasks...',
			cls: 'tasks-timeline-search-input'
		});
		searchInput.addEventListener('input', () => {
			this.filterTasks(searchInput.value);
		});

		// Create content area
		const content = container.createEl('div', { cls: 'tasks-timeline-content' });

		// Ensure timeline file exists
		await this.plugin.createTimelineFileIfNotExists();
		
		// Get the timeline file
		this.timelineFile = await this.plugin.getTimelineFile();

		// Set up file watcher for real-time updates
		this.setupFileWatcher();

		// Load and render tasks
		await this.loadTasks();
		this.renderTasks(content);

		// Set up intersection observer for today element
		this.setupTodayObserver();
		
		// Add status message
		const statusEl = container.createEl('div', { 
			cls: 'tasks-timeline-status',
			text: 'Timeline will update automatically when you edit the file'
		});
		setTimeout(() => {
			statusEl.addClass('fade-out');
			setTimeout(() => {
				statusEl.remove();
			}, 1000);
		}, 3000);
	}

	async onClose() {
		// Clean up observer
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		
		// Remove file watcher
		if (this.fileWatcher) {
			this.app.vault.offref(this.fileWatcher);
			this.fileWatcher = null;
		}
	}
	
	setupFileWatcher() {
		// Remove existing watcher if any
		if (this.fileWatcher) {
			this.app.vault.offref(this.fileWatcher);
		}
		
		// Set up file watcher for the timeline file
		this.fileWatcher = this.app.vault.on('modify', (file) => {
			if (this.timelineFile && file.path === this.timelineFile.path) {
				this.refreshView();
			}
		});
		
		// Also watch for file rename
		this.app.vault.on('rename', (file, oldPath) => {
			if (this.timelineFile && oldPath === this.timelineFile.path) {
				this.timelineFile = file as TFile;
				this.refreshView();
			}
		});
		
		// Watch for file deletion
		this.app.vault.on('delete', (file) => {
			if (this.timelineFile && file.path === this.timelineFile.path) {
				this.timelineFile = null;
				this.days = [];
				const content = this.containerEl.querySelector('.tasks-timeline-content');
				if (content) {
					content.empty();
					const message = content.createEl('div', { 
						cls: 'tasks-timeline-empty-state',
						text: 'Timeline file was deleted. Create a new one in settings.'
					});
				}
			}
		});
	}
	
	async refreshView() {
		// Save current scroll position
		const contentEl = this.containerEl.querySelector('.tasks-timeline-content') as HTMLElement;
		if (contentEl) {
			this.scrollPosition = contentEl.scrollTop;
		}
		
		// Reload tasks
		await this.loadTasks();
		
		// Re-render
		const content = this.containerEl.querySelector('.tasks-timeline-content') as HTMLElement;
		if (content) {
			this.renderTasks(content);
			
			// Restore scroll position
			setTimeout(() => {
				content.scrollTop = this.scrollPosition;
			}, 0);
		}
	}

	async loadTasks() {
		this.days = [];
		
		if (!this.timelineFile) {
			this.timelineFile = await this.plugin.getTimelineFile();
			if (!this.timelineFile) {
				return;
			}
		}

		// Read file content
		const content = await this.app.vault.read(this.timelineFile);
		const headerFormat = this.plugin.settings.headerFormat;
		const dateFormat = this.plugin.settings.dateFormat;

		// Parse content into days and tasks
		this.parseTasks(content, headerFormat, dateFormat);
	}

	// PASS HEADING and FORMAT
	parseTasks(content: string, headerFormat: string, dateFormat: string) {
		// Split content by lines
		const lines = content.split('\n');
		
		let currentDay: DayGroup | null = null;
		let currentTasks: Task[] = [];
		let taskStack: Task[] = [];
		
		// Today's date for comparison
		const today = moment().format(dateFormat);
		
		// Process each line
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			
			// Check if line is a day header (headerFormat)
			if (line.startsWith(headerFormat + " ")) {
				// If we were processing a day, save it
				if (currentDay) {
					currentDay.tasks = currentTasks;
					this.days.push(currentDay);
				}
				
				// Start a new day
				const dateText = line.substring(this.plugin.settings.headerFormat.length + 1).trim();
				let date = '';
				
				// Try to parse the date
				if (dateText.toLowerCase() === 'today') {
					date = today;
				} else if (dateText.toLowerCase() === 'tomorrow') {
					date = moment().add(1, 'day').format('YYYY-MM-DD');
				} else if (dateText.toLowerCase() === 'yesterday') {
					date = moment().subtract(1, 'day').format('YYYY-MM-DD');
				} else {
					// Try to parse as date
					const parsedDate = moment(dateText, [
						this.plugin.settings.dateFormat,
						'YYYY-MM-DD',
						'YYYY/MM/DD',
						'MM/DD/YYYY',
						'DD/MM/YYYY',
						'MMM D, YYYY'
					]);
					
					if (parsedDate.isValid()) {
						date = parsedDate.format('YYYY-MM-DD');
					} else {
						// If we can't parse, just use the text as is
						date = dateText;
					}
				}
				
				currentDay = {
					date: date,
					formattedDate: dateText,
					tasks: [],
					isToday: date === today
				};
				
				currentTasks = [];
				taskStack = [];
				
				continue;
			}
			
			// If we're not in a day yet, skip
			if (!currentDay) {
				continue;
			}
			
			// Check if line is a task or bullet
			const taskMatch = line.match(/^(\s*)- \[([ xX])\] (.*)$/);
			const bulletMatch = line.match(/^(\s*)- (.*)$/);
			
			if (taskMatch || bulletMatch) {
				let indentation = 0;
				let completed = false;
				let text = '';
				
				if (taskMatch) {
					indentation = taskMatch[1].length;
					completed = taskMatch[2].toLowerCase() === 'x';
					text = taskMatch[3];
				} else if (bulletMatch) {
					indentation = bulletMatch[1].length;
					text = bulletMatch[2];
				}
				
				// Calculate level based on indentation
				const level = Math.floor(indentation / 2);
				
				// Extract metadata
				const metadata: { [key: string]: string } = {};
				const metadataRegex = /\[([^:]+):: ([^\]]+)\]/g;
				let match;
				
				while ((match = metadataRegex.exec(text)) !== null) {
					metadata[match[1]] = match[2];
				}
				
				// Clean text by removing metadata
				const cleanText = text.replace(/\[[^\]]+:: [^\]]+\]/g, '').trim();
				
				// Create task object
				const task: Task = {
					id: `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
					text: cleanText,
					completed,
					date: currentDay.date,
					metadata,
					subtasks: [],
					level
				};
				
				// Find parent task based on indentation level
				while (taskStack.length > 0 && taskStack[taskStack.length - 1].level >= level) {
					taskStack.pop();
				}
				
				if (level === 0 || taskStack.length === 0) {
					// Top-level task
					currentTasks.push(task);
				} else {
					// Subtask
					taskStack[taskStack.length - 1].subtasks.push(task);
				}
				
				// Add to stack for potential children
				taskStack.push(task);
			}
		}
		
		// Add the last day if there is one
		if (currentDay) {
			currentDay.tasks = currentTasks;
			this.days.push(currentDay);
		}
	}

	renderTasks(container: HTMLElement) {
		container.empty();
		
		// Create days container
		const daysContainer = container.createEl('div', { cls: 'tasks-timeline-days' });
		
		// Render each day
		this.days.forEach(day => {
			const dayElement = this.renderDay(day);
			daysContainer.appendChild(dayElement);
			
			// Save reference to today's element for scrolling
			if (day.isToday) {
				this.todayElement = dayElement;
			}
		});
		
		// Scroll to today if this is the first load (scrollPosition = 0)
		if (this.scrollPosition === 0) {
			this.jumpToToday();
		}
	}

	renderDay(day: DayGroup): HTMLElement {
		const dayElement = document.createElement('div');
		dayElement.addClass('tasks-timeline-day');
		dayElement.dataset.date = day.date;
		
		if (day.isToday) {
			dayElement.addClass('is-today');
		}
		
		// Create day header
		const dayHeader = dayElement.createEl('div', { cls: 'tasks-timeline-day-header' });
		dayHeader.createEl('h3', { text: day.formattedDate });
		
		// Create tasks container
		const tasksContainer = dayElement.createEl('div', { cls: 'tasks-timeline-tasks' });
		
		// Render tasks
		day.tasks.forEach(task => {
			this.renderTaskItem(tasksContainer, task);
		});
		
		// Make day a drop target for drag and drop
		this.setupDayDropTarget(dayElement, day);
		
		return dayElement;
	}

	renderTaskItem(container: HTMLElement, task: Task, level = 0) {
		const taskElement = container.createEl('div', { cls: 'tasks-timeline-task' });
		taskElement.dataset.id = task.id;
		taskElement.dataset.level = level.toString();
		
		if (task.completed) {
			taskElement.addClass('is-completed');
		}
		
		// Indentation based on level
		taskElement.style.paddingLeft = `${level * 20}px`;
		
		// Create task content
		const taskContent = taskElement.createEl('div', { cls: 'tasks-timeline-task-content' });
		
		// Checkbox or bullet
		const taskType = taskContent.createEl('div', { cls: 'tasks-timeline-task-type' });
		if ('completed' in task) {
			// Checkbox
			const checkbox = taskType.createEl('input', { type: 'checkbox' });
			checkbox.checked = task.completed;
			checkbox.addEventListener('change', () => {
				this.toggleTaskCompletion(task, checkbox.checked);
			});
		} else {
			// Bullet
			taskType.createEl('span', { cls: 'tasks-timeline-bullet', text: '•' });
		}
		
		// Task text
		taskContent.createEl('div', { cls: 'tasks-timeline-task-text', text: task.text });
		
		// Metadata display
		if (Object.keys(task.metadata).length > 0) {
			const metadataEl = taskElement.createEl('div', { cls: 'tasks-timeline-task-metadata' });
			
			for (const [key, value] of Object.entries(task.metadata)) {
				metadataEl.createEl('span', { 
					cls: `tasks-timeline-metadata tasks-timeline-metadata-${key}`,
					text: `${key}: ${value}`
				});
			}
		}
		
		// Make task draggable
		this.setupTaskDraggable(taskElement, task);
		
		// Setup context menu
		this.setupTaskContextMenu(taskElement, task);
		
		// Render subtasks
		task.subtasks.forEach(subtask => {
			this.renderTaskItem(container, subtask, level + 1);
		});
	}

	setupTaskDraggable(element: HTMLElement, task: Task) {
		element.setAttribute('draggable', 'true');
		
		element.addEventListener('dragstart', (e) => {
			this.draggedTask = task;
			this.draggedElement = element;
			element.addClass('is-dragging');
			
			// Set data for drag operation
			if (e.dataTransfer) {
				e.dataTransfer.setData('text/plain', task.id);
				e.dataTransfer.effectAllowed = 'move';
			}
			
			// Create and add a drag placeholder to show where the task will be placed
			this.createDragPlaceholder();
		});
		
		element.addEventListener('dragend', () => {
			element.removeClass('is-dragging');
			this.draggedTask = null;
			this.draggedElement = null;
			
			// Remove any drag placeholders
			this.removeDragPlaceholder();
		});
	}

	createDragPlaceholder() {
		// Remove any existing placeholders
		this.removeDragPlaceholder();
		
		// Create a new placeholder
		const placeholder = document.createElement('div') as HTMLElement;
		placeholder.addClass('tasks-timeline-drag-placeholder');
		document.body.appendChild(placeholder);
	}
	
	removeDragPlaceholder() {
		const placeholder = document.querySelector('.tasks-timeline-drag-placeholder') as HTMLElement | null;
		if (placeholder) {
			placeholder.remove();
		}
	}
	
	updateDragPlaceholderPosition(e: DragEvent, dayElement: HTMLElement, day: DayGroup) {
		const placeholder = document.querySelector('.tasks-timeline-drag-placeholder') as HTMLElement | null;
		if (!placeholder) return;
		
		const tasksContainer = dayElement.querySelector('.tasks-timeline-tasks') as HTMLElement | null;
		if (!tasksContainer) return;
		
		// Get all task elements in this day
		const taskElements = Array.from(tasksContainer.querySelectorAll('.tasks-timeline-task'));
		
		// Get mouse position relative to the tasks container
		const containerRect = tasksContainer.getBoundingClientRect();
		const mouseY = e.clientY;
		
		// Find the task element the mouse is over or between
		let targetIndex = -1;
		let targetElement: HTMLElement | null = null;
		
		for (let i = 0; i < taskElements.length; i++) {
			const taskElement = taskElements[i] as HTMLElement;
			const rect = taskElement.getBoundingClientRect();
			
			// Skip the dragged element
			if (this.draggedElement && taskElement === this.draggedElement) {
				continue;
			}
			
			// If mouse is above the middle of this task
			if (mouseY < rect.top + rect.height / 2) {
				targetIndex = i;
				targetElement = taskElement;
				break;
			}
		}
		
		// If we didn't find a target, place at the end
		if (targetIndex === -1 && taskElements.length > 0) {
			targetIndex = taskElements.length;
			targetElement = taskElements[taskElements.length - 1] as HTMLElement;
		}
		
		// Position the placeholder
		if (targetElement) {
			const rect = targetElement.getBoundingClientRect();
			
			if (targetIndex === 0 || mouseY < rect.top + rect.height / 2) {
				// Position above the target
				placeholder.style.top = `${rect.top}px`;
			} else {
				// Position below the target
				placeholder.style.top = `${rect.bottom}px`;
			}
			
			placeholder.style.left = `${containerRect.left}px`;
			placeholder.style.width = `${containerRect.width}px`;
			placeholder.style.display = 'block';
		} else if (taskElements.length === 0) {
			// If there are no tasks, position at the top of the container
			placeholder.style.top = `${containerRect.top + 10}px`;
			placeholder.style.left = `${containerRect.left}px`;
			placeholder.style.width = `${containerRect.width}px`;
			placeholder.style.display = 'block';
		}
	}
	
	getDropTargetPosition(e: DragEvent, dayElement: HTMLElement, day: DayGroup): number {
		const tasksContainer = dayElement.querySelector('.tasks-timeline-tasks') as HTMLElement | null;
		if (!tasksContainer) return 0;
		
		// Get all task elements in this day
		const taskElements = Array.from(tasksContainer.querySelectorAll('.tasks-timeline-task'));
		
		// Get mouse position
		const mouseY = e.clientY;
		
		// Find the task element the mouse is over or between
		let targetIndex = 0;
		
		for (let i = 0; i < taskElements.length; i++) {
			const taskElement = taskElements[i] as HTMLElement;
			const rect = taskElement.getBoundingClientRect();
			
			// Skip the dragged element
			if (this.draggedElement && taskElement === this.draggedElement) {
				continue;
			}
			
			// If mouse is above the middle of this task
			if (mouseY < rect.top + rect.height / 2) {
				return i;
			}
			
			targetIndex = i + 1;
		}
		
		return targetIndex;
	}
	
	async moveTaskToPosition(task: Task, targetDay: DayGroup, position: number) {
		// Find the current day and remove task
		const sourceDay = this.days.find(d => d.date === task.date);
		if (sourceDay) {
			this.removeTaskFromDay(task, sourceDay);
		}
		
		// Update task date
		task.date = targetDay.date;
		
		// Insert at the specific position
		if (position >= 0 && position <= targetDay.tasks.length) {
			targetDay.tasks.splice(position, 0, task);
		} else {
			// Fallback to adding at the end
			targetDay.tasks.push(task);
		}
		
		// Save changes
		await this.saveTasksToFile();
	}

	setupDayDropTarget(element: HTMLElement, day: DayGroup) {
		// Make the entire day element a drop target
		element.addEventListener('dragover', (e) => {
			e.preventDefault();
			element.addClass('drag-over');
			
			// Update placeholder position
			this.updateDragPlaceholderPosition(e, element, day);
		});
		
		element.addEventListener('dragleave', () => {
			element.removeClass('drag-over');
		});
		
		element.addEventListener('drop', (e) => {
			e.preventDefault();
			element.removeClass('drag-over');
			
			if (this.draggedTask && this.draggedElement) {
				// Get the target position
				const targetPosition = this.getDropTargetPosition(e, element, day);
				
				// Move the task to the day at the specific position
				this.moveTaskToPosition(this.draggedTask, day, targetPosition);
			}
			
			// Remove placeholder
			this.removeDragPlaceholder();
		});
	}

	setupTaskContextMenu(element: HTMLElement, task: Task) {
		element.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			
			// Create context menu
			const menu = document.createElement('div') as HTMLElement;
			menu.addClass('tasks-timeline-context-menu');
			
			// Position menu
			menu.style.top = `${e.pageY}px`;
			menu.style.left = `${e.pageX}px`;
			
			// Add menu items
			const moveToToday = menu.createEl('div', { cls: 'tasks-timeline-menu-item', text: 'Move to Today' });
			moveToToday.addEventListener('click', () => {
				const today = this.days.find(d => d.isToday);
				if (today) {
					this.moveTaskToDay(task, today);
				}
				document.body.removeChild(menu);
			});
			
			const moveTomorrow = menu.createEl('div', { cls: 'tasks-timeline-menu-item', text: 'Move to Tomorrow' });
			moveTomorrow.addEventListener('click', () => {
				const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
				const tomorrowDay = this.days.find(d => d.date === tomorrow);
				if (tomorrowDay) {
					this.moveTaskToDay(task, tomorrowDay);
				}
				document.body.removeChild(menu);
			});
			
			// Add delete option
			const deleteTask = menu.createEl('div', { cls: 'tasks-timeline-menu-item tasks-timeline-menu-delete', text: 'Delete Task' });
			deleteTask.addEventListener('click', () => {
				this.deleteTask(task);
				document.body.removeChild(menu);
			});
			
			// Add to document
			document.body.appendChild(menu);
			
			// Close menu when clicking elsewhere
			const closeMenu = (e: MouseEvent) => {
				if (!menu.contains(e.target as Node)) {
					document.body.removeChild(menu);
					document.removeEventListener('click', closeMenu);
				}
			};
			
			// Use setTimeout to avoid immediate trigger
			setTimeout(() => {
				document.addEventListener('click', closeMenu);
			}, 0);
		});
	}

	async moveTaskToDay(task: Task, targetDay: DayGroup) {
		// Find the current day and remove task
		const sourceDay = this.days.find(d => d.date === task.date);
		if (sourceDay) {
			this.removeTaskFromDay(task, sourceDay);
		}
		
		// Update task date
		task.date = targetDay.date;
		
		// Add to target day
		targetDay.tasks.push(task);
		
		// Save changes
		await this.saveTasksToFile();
	}

	removeTaskFromDay(task: Task, day: DayGroup) {
		// Remove from top level
		day.tasks = day.tasks.filter(t => t.id !== task.id);
		
		// Check in subtasks
		day.tasks.forEach(t => {
			this.removeTaskFromSubtasks(task, t);
		});
	}

	removeTaskFromSubtasks(taskToRemove: Task, parentTask: Task) {
		parentTask.subtasks = parentTask.subtasks.filter(t => t.id !== taskToRemove.id);
		
		// Recursively check deeper subtasks
		parentTask.subtasks.forEach(t => {
			this.removeTaskFromSubtasks(taskToRemove, t);
		});
	}

	async toggleTaskCompletion(task: Task, completed: boolean) {
		task.completed = completed;
		
		// Update UI
		const taskElement = this.containerEl.querySelector(`[data-id="${task.id}"]`) as HTMLElement | null;
		if (taskElement) {
			if (completed) {
				taskElement.addClass('is-completed');
			} else {
				taskElement.removeClass('is-completed');
			}
		}
		
		// Save changes
		await this.saveTasksToFile();
	}

	async deleteTask(task: Task) {
		// Find the day containing this task
		const day = this.days.find(d => d.date === task.date);
		if (day) {
			this.removeTaskFromDay(task, day);
			
			// Save changes
			await this.saveTasksToFile();
		}
	}

	filterTasks(searchTerm: string) {
		const searchLower = searchTerm.toLowerCase();
		
		// Get all task elements
		const taskElements = this.containerEl.querySelectorAll('.tasks-timeline-task');
		
		taskElements.forEach(el => {
			const taskText = el.querySelector('.tasks-timeline-task-text');
			if (taskText) {
				const text = taskText.textContent?.toLowerCase() || '';
				
				if (searchTerm === '' || text.includes(searchLower)) {
					(el as HTMLElement).style.display = '';
				} else {
					(el as HTMLElement).style.display = 'none';
				}
			}
		});
	}

	jumpToToday() {
		if (this.todayElement) {
			this.todayElement.scrollIntoView({ behavior: 'smooth' });
		}
	}

	setupTodayObserver() {
		if (!this.todayElement) return;
		
		// Create intersection observer
		this.observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					// Today is visible, hide jump button
					this.plugin.hideJumpToTodayButton();
				} else {
					// Today is not visible, show jump button
					this.plugin.showJumpToTodayButton();
				}
			});
		}, { threshold: 0.1 });
		
		// Start observing today element
		this.observer.observe(this.todayElement);
	}

	async saveTasksToFile() {
		if (!this.timelineFile) return;
		
		let content = '# Timeline\n\n';
		
		// Generate content for each day
		this.days.forEach(day => {
			content += `## ${day.formattedDate}\n\n`;
			
			// Add tasks
			day.tasks.forEach(task => {
				content += this.formatTaskForSaving(task, 0);
			});
			
			content += '\n';
		});
		
		// Save to file
		await this.app.vault.modify(this.timelineFile, content);
	}

	formatTaskForSaving(task: Task, level: number): string {
		const indent = ' '.repeat(level * 2);
		let line = '';
		
		// Format as checkbox or bullet
		if ('completed' in task) {
			line = `${indent}- [${task.completed ? 'x' : ' '}] ${task.text}`;
		} else {
			line = `${indent}- ${task.text}`;
		}
		
		// Add metadata
		for (const [key, value] of Object.entries(task.metadata)) {
			line += ` [${key}:: ${value}]`;
		}
		
		line += '\n';
		
		// Add subtasks
		task.subtasks.forEach(subtask => {
			line += this.formatTaskForSaving(subtask, level + 1);
		});
		
		return line;
	}
}