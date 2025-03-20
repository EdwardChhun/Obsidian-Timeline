import * as moment from 'moment';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, addIcon } from 'obsidian';
import { TimelineView, TIMELINE_VIEW } from 'timeline-view';

interface TasksTimelineSettings {
	timelineFile: string;
	defaultView: string;
	showJumpToToday: boolean;
	dateFormat: string;
}

const DEFAULT_SETTINGS: TasksTimelineSettings = {
	timelineFile: 'Timeline.md',
	defaultView: 'timeline',
	showJumpToToday: true,
	dateFormat: 'YYYY-MM-DD'
}

export default class TasksTimelinePlugin extends Plugin {
	settings: TasksTimelineSettings;
	jumpToTodayButton: HTMLElement;

	async onload() {
		await this.loadSettings();

		// Register Timeline view
		this.registerView(
			TIMELINE_VIEW,
			(leaf) => new TimelineView(leaf, this)
		);

		// Add timeline icon
		addIcon('timeline', `<svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
			<line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" stroke-width="4"/>
			<circle cx="50" cy="20" r="8" fill="currentColor"/>
			<circle cx="50" cy="50" r="8" fill="currentColor"/>
			<circle cx="50" cy="80" r="8" fill="currentColor"/>
		</svg>`);

		// Add ribbon icon
		this.addRibbonIcon('timeline', 'Open Tasks Timeline', () => {
			this.activateView();
		});

		// Add command to open timeline view
		this.addCommand({
			id: 'open-tasks-timeline',
			name: 'Open Tasks Timeline',
			callback: () => {
				this.activateView();
			}
		});

		// Add command to jump to today
		this.addCommand({
			id: 'jump-to-today',
			name: 'Jump to Today',
			callback: () => {
				this.jumpToToday();
			}
		});

		// Add settings tab
		this.addSettingTab(new TasksTimelineSettingTab(this.app, this));

		// Create floating jump to today button (hidden initially)
		this.createJumpToTodayButton();
	}

	onunload() {
		// Unload views
		this.app.workspace.detachLeavesOfType(TIMELINE_VIEW);
		
		// Remove jump to today button
		if (this.jumpToTodayButton && this.jumpToTodayButton.parentNode) {
			this.jumpToTodayButton.parentNode.removeChild(this.jumpToTodayButton);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;
		
		// Check if view is already open
		let leaf = workspace.getLeavesOfType(TIMELINE_VIEW)[0];
		
		if (!leaf) {
			// Create new leaf for timeline view
			leaf = workspace.getLeaf('split', 'vertical');
			await leaf.setViewState({
				type: TIMELINE_VIEW,
				active: true,
			});
		}
		
		// Reveal and focus the leaf
		workspace.revealLeaf(leaf);
		
		// Also scroll to today in the editor if the timeline file is open
		this.scrollToTodayInEditor();
	}

	async getTimelineFile(): Promise<TFile | null> {
		const files = this.app.vault.getMarkdownFiles();
		return files.find(file => file.path === this.settings.timelineFile) || null;
	}

	async createTimelineFileIfNotExists() {
		const file = await this.getTimelineFile();
		if (!file) {
			try {
				await this.app.vault.create(this.settings.timelineFile, '# Timeline\n\n## Today\n\n- [ ] Your first task\n  - [start:: 9:00] [end:: 10:00]\n- [ ] Another task with [due:: tomorrow]\n');
				new Notice('Timeline file created successfully');
			} catch (error) {
				new Notice('Error creating timeline file');
				console.error(error);
			}
		}
	}

	jumpToToday() {
		// Find all timeline views
		const timelineLeaves = this.app.workspace.getLeavesOfType(TIMELINE_VIEW);
		
		// Trigger jump to today on all timeline views
		timelineLeaves.forEach(leaf => {
			if (leaf.view instanceof TimelineView) {
				leaf.view.jumpToToday();
			}
		});
	}

	async scrollToTodayInEditor() {
		// Get the timeline file
		const timelineFile = await this.getTimelineFile();
		if (!timelineFile) return;
		
		// Find an open editor for this file
		const leaves = this.app.workspace.getLeavesOfType('markdown');
		let leaf = leaves.find(leaf => {
			const view = leaf.view as MarkdownView;
			return view.file && view.file.path === timelineFile.path;
		});
		
		// If not open, open it
		if (!leaf) {
			leaf = this.app.workspace.getLeaf();
			await leaf.openFile(timelineFile);
		}
		
		// Get the editor
		const view = leaf.view as MarkdownView;
		const editor = view.editor;
		
		// Search for "## Today" heading
		const content = await this.app.vault.read(timelineFile);
		const lines = content.split('\n');
		let todayLineNumber = -1;
		
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].match(/^## Today$/i)) {
			todayLineNumber = i;
			break;
			}
		}
		
		// If not found, try to find today's date in other formats
		if (todayLineNumber === -1) {
			const today = moment().format('YYYY-MM-DD');
			const todayFormatted = moment().format(this.settings.dateFormat);
			
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].includes(today) || lines[i].includes(todayFormatted)) {
				todayLineNumber = i;
				break;
				}
			}
		}
		
		// If found, scroll to it
		if (todayLineNumber !== -1) {
			editor.setCursor({ line: todayLineNumber, ch: 0 });
			editor.scrollIntoView({ from: { line: todayLineNumber, ch: 0 }, to: { line: todayLineNumber, ch: 0 } }, true);
		}
	}

	createJumpToTodayButton() {
		// Create button element
		this.jumpToTodayButton = document.createElement('div');
		this.jumpToTodayButton.addClass('tasks-timeline-jump-today');
		this.jumpToTodayButton.innerHTML = `
			<button aria-label="Jump to Today">
				<svg viewBox="0 0 100 100" width="20" height="20">
					<rect x="30" y="30" width="40" height="40" fill="currentColor" />
				</svg>
				Today
			</button>
		`;
		
		// Add click handler
		this.jumpToTodayButton.addEventListener('click', () => {
			this.jumpToToday();
		});
		
		// Add to document but hide initially
		document.body.appendChild(this.jumpToTodayButton);
		this.jumpToTodayButton.style.display = 'none';
	}

	showJumpToTodayButton() {
		if (this.settings.showJumpToToday && this.jumpToTodayButton) {
			this.jumpToTodayButton.style.display = 'block';
		}
	}

	hideJumpToTodayButton() {
		if (this.jumpToTodayButton) {
			this.jumpToTodayButton.style.display = 'none';
		}
	}
}

class TasksTimelineSettingTab extends PluginSettingTab {
	plugin: TasksTimelinePlugin;

	constructor(app: App, plugin: TasksTimelinePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Tasks Timeline Settings'});

		new Setting(containerEl)
			.setName('Timeline file')
			.setDesc('The file where your timeline data will be stored')
			.addText(text => text
				.setPlaceholder('Timeline.md')
				.setValue(this.plugin.settings.timelineFile)
				.onChange(async (value) => {
					this.plugin.settings.timelineFile = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Default view')
			.setDesc('The default view to show when opening the plugin')
			.addDropdown(dropdown => dropdown
				.addOption('timeline', 'Timeline')
				.addOption('unsorted', 'Unsorted Items')
				.addOption('weekly', 'Weekly')
				.addOption('calendar', 'Calendar')
				.setValue(this.plugin.settings.defaultView)
				.onChange(async (value) => {
					this.plugin.settings.defaultView = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Show jump to today button')
			.setDesc('Show a button to jump to today when scrolling away from today')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showJumpToToday)
				.onChange(async (value) => {
					this.plugin.settings.showJumpToToday = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Date format')
			.setDesc('Format for displaying dates')
			.addText(text => text
				.setPlaceholder('YYYY-MM-DD')
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value;
					await this.plugin.saveSettings();
				}));
	}
}