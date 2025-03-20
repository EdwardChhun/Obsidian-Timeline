import { Plugin } from 'obsidian'

export default class ExamplePlugin extends Plugin {
	statusBarTextElement: HTMLSpanElement;

	onload() {
		this.statusBarTextElement = this.addStatusBarItem().createEl('span');
		this.statusBarTextElement.textContent = "Hello World";

		this.app.workspace.on('active-leaf-change', async () => {

			const file = this.app.workspace.getActiveFile();
			if (file) {
				const content = await this.app.vault.read(file)
				console.log(content)
			}
		});
	}
 }