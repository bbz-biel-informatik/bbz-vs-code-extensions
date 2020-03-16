// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';

// import * as http from 'http';
import { DownloaderHelper } from 'node-downloader-helper';
import * as zip from 'adm-zip';

const PHP_VERSION = '7.4.3';
const PHP_OSX_VERSION = '7.3';

function download_PHP_OSX(context: vscode.ExtensionContext) {
	vscode.window.setStatusBarMessage('Starting php installation...', 10000);
	const downloadExec = promisify(exec);
	const configExec = promisify(exec);
	return Promise.resolve(vscode.window.showInputBox({ password: true, prompt: 'Password (used for the mac login)' }))
		.then((password) => {
			if (!password) {
				return;
			}
			return downloadExec(`cat -s ${`${context.extensionPath}/bin/install_osx.sh`} | bash -s ${PHP_OSX_VERSION} "${password}"`)
		}).then((value) => {
			if (!value || !value.stdout.endsWith('Finished.\n')) {
				vscode.window.showErrorMessage(`Could not install PHP Version ${PHP_OSX_VERSION}: ${value ? value.stderr : ''}`);
				return;
			}

			return configExec('touch ~/.profile && echo "export PATH=/usr/local/php5/bin:$PATH" >> ~/.profile && . ~/.profile')
		}).then((value) => {
			if (!value || value.stderr.length > 0) {
				vscode.window.showErrorMessage(`Could not install PHP Version ${PHP_OSX_VERSION}: ${value ? value.stderr : ''}`);
				return;
			} else {
				vscode.window.showInformationMessage(`Successful installed and configured PHP Version ${PHP_OSX_VERSION}`);
			}
		});
}

function download_PHP_Windows(context: vscode.ExtensionContext) {
	const extensionsFolder = context.extensionPath;
	if (!fs.existsSync(extensionsFolder)) {
		fs.mkdirSync(extensionsFolder);
	}
	const src = `http://windows.php.net/downloads/releases/php-${PHP_VERSION}-Win32-vc15-x64.zip`;
	const tempFileName = `PHP_${PHP_VERSION}_${Date.now()}.zip`;
	var tmpFilePath = `${extensionsFolder}\\${tempFileName}`;
	vscode.window.showInformationMessage(`[BBZ Config] ${tmpFilePath}`);
	const dl = new DownloaderHelper(
		src,
		extensionsFolder,
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
		var archive = new zip(tmpFilePath);
		const phpFolder = `php_${PHP_VERSION.replace('.', '_')}`;
		archive.extractAllTo(`${extensionsFolder}\\${phpFolder}`, true);
		fs.unlink(tmpFilePath, () => { console.log('error'); });
		const config = vscode.workspace.getConfiguration();
		config.update('phpserver.phpPath', `${extensionsFolder}\\${phpFolder}\\php.exe`, vscode.ConfigurationTarget.Global)
			.then(() => {
				config.update('php.validate.executablePath', `${extensionsFolder}\\${phpFolder}\\php.exe`, vscode.ConfigurationTarget.Global);
			}).then(() => {
				config.update('php.executablePath', `${extensionsFolder}\\${phpFolder}\\php.exe`, vscode.ConfigurationTarget.Global);
			}).then(() => {
				vscode.window.showInformationMessage(`[BBZ Config] Successfully configured php`);
			});
	});

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

function checkAndInstallPHP(context: vscode.ExtensionContext, force: boolean = false) {
	if (force || !checkPhpInstallation()) {
		if (process.platform === 'win32') {
			vscode.window.showInformationMessage('[BBZ Config] Download PHP Version 7.4.3');
			return download_PHP_Windows(context);
		} else if (process.platform === 'darwin') {
			return download_PHP_OSX(context);
		} else {
			return new Promise(
				() => vscode.window.showErrorMessage('[BBZ Config] Can not configure PHP for you, do it courself.')
			);
		}
	}
}


function configure(context: vscode.ExtensionContext, force: boolean = false) {
	checkAndInstallPHP(context, force)?.then(() => {
		const phpVersion = systemPhpVersion() || { versionString: PHP_VERSION };
		const configuration = vscode.workspace.getConfiguration();
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
		configure(context);
	});
	context.subscriptions.push(configDisposable);
	const forceConfigDisposable = vscode.commands.registerCommand('extension.forceConfigure', () => {
		configure(context, true);
	});
	context.subscriptions.push(forceConfigDisposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }
