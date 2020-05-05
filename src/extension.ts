// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';

// import * as http from 'http';
import { DownloaderHelper } from 'node-downloader-helper';
import * as zip from 'adm-zip';
import { fileURLToPath } from 'url';

const PHP_VERSION = '7.4.3';
const PHP_OSX_VERSION = '7.3';

type Progress = vscode.Progress<{
	message?: string | undefined;
	increment?: number | undefined;
}>;

function download_PHP_OSX(context: vscode.ExtensionContext, progress: Progress) {
	const downloadExec = promisify(exec);
	const configExec = promisify(exec);
	return Promise.resolve(vscode.window.showInputBox({ password: true, prompt: 'Root Password (used for your mac login)' }))
		.then((password) => {
			if (!password) {
				return;
			}
			progress.report({ increment: 15, message: "Downloading PHP source..." });

			return downloadExec(`cat -s ${`${context.extensionPath}/bin/install_osx.sh`} | bash -s ${PHP_OSX_VERSION} "${password}" && echo "${password}" | sudo -S cp ${`${context.extensionPath}/bin/php.ini`} /usr/local/php5/lib/php.ini && echo "Success."`);
		}).then((value) => {
			if (!value || !value.stdout.endsWith('Success.\n')) {
				vscode.window.showErrorMessage(`Could not install PHP Version ${PHP_OSX_VERSION}: ${value ? value.stderr : ''}`);
				return;
			}
			progress.report({ increment: 70, message: "Configure PHP..." });

			const exportPath = 'export PATH=/usr/local/php5/bin:$PATH';
			return configExec(`touch ~/.bashrc && echo "${exportPath}" >> ~/.bashrc && . ~/.bashrc && touch ~/.zshrc && echo ""${exportPath}"" >> ~/.zshrc && . ~/.zshrc`);
		}).then((value) => {
			if (!value || value.stderr.length > 0) {
				vscode.window.showErrorMessage(`Could not install PHP Version ${PHP_OSX_VERSION}: ${value ? value.stderr : ''}`);
				return;
			} else {
				vscode.window.showInformationMessage(`Installed and configured PHP Version ${PHP_OSX_VERSION}`);
			}
		});
}

function download_PHP_Windows(context: vscode.ExtensionContext, progress: Progress) {
	const phpSrcFolder = `${context.extensionPath.split('\\').slice(0, -1).join('\\')}\\php`;
	if (!fs.existsSync(phpSrcFolder)) {
		fs.mkdirSync(phpSrcFolder, { recursive: true });
	}

	const src = `http://windows.php.net/downloads/releases/archives/php-${PHP_VERSION}-Win32-vc15-x64.zip`;
	const tempFileName = `PHP_${PHP_VERSION}_${Date.now()}.zip`;
	var tmpFilePath = `${phpSrcFolder}\\${tempFileName}`;

	const dl = new DownloaderHelper(
		src,
		phpSrcFolder,
		{
			fileName: tempFileName,
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36 Edg/80.0.361.66',
				'Sec-Fetch-Dest': 'document',
				'Upgrade-Insecure-Requests': 1
			}
		}
	);

	dl.on('end', () => {
		progress.report({ increment: 40, message: "Extracting PHP..." });

		var archive = new zip(tmpFilePath);

		const phpFolder = `php_${PHP_VERSION.replace(/\./g, '_')}`;
		archive.extractAllTo(`${phpSrcFolder}\\${phpFolder}`, true);
		fs.unlink(tmpFilePath, () => { console.log('error'); });

		progress.report({ increment: 60, message: "Copy php.ini..." });
		fs.copyFileSync(`${context.extensionPath}\\bin\\php.ini`, `${phpSrcFolder}\\${phpFolder}\\php.ini`);


		const config = vscode.workspace.getConfiguration();
		progress.report({ increment: 70, message: "Configure PHP..." });
		config.update('phpserver.phpPath', `${phpSrcFolder}\\${phpFolder}\\php.exe`, vscode.ConfigurationTarget.Global)
			.then(() => {
				config.update('php.validate.executablePath', `${phpSrcFolder}\\${phpFolder}\\php.exe`, vscode.ConfigurationTarget.Global);
			}).then(() => {
				config.update('php.executablePath', `${phpSrcFolder}\\${phpFolder}\\php.exe`, vscode.ConfigurationTarget.Global);
			}).then(() => {
				vscode.window.showInformationMessage(`[BBZ] Successfully configured php`);
			});
	});
	progress.report({ increment: 10, message: "Download PHP source..." });

	return dl.start();
}

function systemPhpVersion() {
	try {
		const rawOutput = execSync('php -v').toString();
		const versionRegex = rawOutput.match(/PHP (?<major_version>\d)\.(?<minor_version>\d).(?<patch_version>\d))/i);
		if (!versionRegex || !versionRegex.groups) {
			return;
		}
		const majorVersion = Number.parseInt(versionRegex.groups['major_version']);
		const minorVersion = Number.parseInt(versionRegex.groups['minor_version']);
		const patchVersion = Number.parseInt(versionRegex.groups['patch_version']);
		return {
			majorVersion: majorVersion,
			minorVersion: minorVersion,
			patchVersion: patchVersion,
			versionString: `${majorVersion}.${minorVersion}.${patchVersion}`
		};
	} catch (error) {
		return;
	}
}

function checkPhpInstallation() {
	const phpLocation = vscode.workspace.getConfiguration('phpserver')['phpPath'];
	if (phpLocation && fs.existsSync(phpLocation)) {
		return true;
	}

	try {
		const systemPhp = systemPhpVersion();
		if (!systemPhp || systemPhp.majorVersion < 7) {
			return false;
		}
		return true;
	} catch (error) {
		return false;
	}
}

function checkAndInstallPHP(context: vscode.ExtensionContext, progress: Progress, force: boolean = false) {
	if (force || !checkPhpInstallation()) {
		progress.report({ increment: 10, message: "Start PHP installation..." });

		if (process.platform === 'win32') {
			vscode.window.showInformationMessage('[BBZ] Download PHP Version 7.4.3');
			return download_PHP_Windows(context, progress);
		} else if (process.platform === 'darwin') {
			return download_PHP_OSX(context, progress);
		} else {
			progress.report({ increment: 70, message: "Install PHP yourself..." });
			return new Promise(
				() => vscode.window.showErrorMessage('[BBZ] Can not configure PHP for you, do it courself.')
			);
		}
	}
	progress.report({ increment: 70, message: "PHP installed..." });
	return new Promise(() => false);
}


function configure(context: vscode.ExtensionContext, progress: Progress, force: boolean = false) {
	progress.report({ increment: 0 });
	return checkAndInstallPHP(context, progress, force)?.then(() => {
		const phpVersion = systemPhpVersion() || { versionString: PHP_VERSION };
		const configuration = vscode.workspace.getConfiguration();
		progress.report({ increment: 80, message: "Configure VS Code Settings..." });

		configuration.update('workbench.settings.useSplitJSON', true, vscode.ConfigurationTarget.Global)
			.then(() => {
				configuration.update('php.validate.run', 'onType', vscode.ConfigurationTarget.Global);
			})
			.then(() => {
				configuration.update('intelephense.environment.phpVersion', phpVersion.versionString, vscode.ConfigurationTarget.Global);
			})
			.then(() => {
				configuration.update('[html]', { 'editor.defaultFormatter': 'vscode.html-language-features' }, vscode.ConfigurationTarget.Global);
			})
			.then(() => {
				configuration.update('telemetry.enableTelemetry', false, vscode.ConfigurationTarget.Global);
			})
			.then(() => {
				configuration.update('telemetry.enableCrashReporter', false, vscode.ConfigurationTarget.Global);
			})
			.then(() => {
				configuration.update('php.suggest.basic', false, vscode.ConfigurationTarget.Global);
			})
			.then(() => {
				vscode.window.showInformationMessage('BBZ configuration successfully updated');
			});
	});
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const configDisposable = vscode.commands.registerCommand('extension.configure', () => {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: '[BBZ]: Configure VS Code',
			cancellable: false
		}, (progress, _token) => {
			return configure(context, progress);
		})
	});
	context.subscriptions.push(configDisposable);
	const forceConfigDisposable = vscode.commands.registerCommand('extension.forceConfigure', () => {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: '[BBZ]: Configure VS Code (forcing PHP download)',
			cancellable: false
		}, (progress, _token) => {
			return configure(context, progress, true);
		})
	});
	context.subscriptions.push(forceConfigDisposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }
