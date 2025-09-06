const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { parseFile } = require('music-metadata');
const os = require('os');
const yauzl = require('yauzl');
const yazl = require('yazl');

// 数据目录路径
const DATA_DIR = path.join(os.homedir(), 'Documents', 'ArtiMeow-AIGalGame-Data');

class MainProcess {
  constructor() {
    this.mainWindow = null;
    this.settingsWindow = null;
    this.init();
  }

  async init() {
    // 确保数据目录存在
    await fs.ensureDir(DATA_DIR);
    
    // 单实例锁，二次启动时前置已有窗口
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      app.quit();
      return;
    }
    app.on('second-instance', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    });

    // 应用准备就绪时创建窗口
    app.whenReady().then(() => {
      this.createMainWindow();
      this.setupMenu();
      this.setupIPC();
      
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      minWidth: 800,
      minHeight: 600,
      frame: false, // 无边框窗口
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      show: false,
      backgroundColor: '#1a1a2e',
      icon: path.join(__dirname, '..', 'assets', 'icon.png')
    });

    this.mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
    });

    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  createSettingsWindow() {
    if (this.settingsWindow) {
      this.settingsWindow.focus();
      return;
    }

    this.settingsWindow = new BrowserWindow({
      width: 800,
      height: 600,
      parent: this.mainWindow,
      modal: true,
      frame: false, // 无边框窗口
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      show: false
    });

    this.settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
    
    this.settingsWindow.once('ready-to-show', () => {
      this.settingsWindow.show();
    });

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
    });
  }

  setupMenu() {
    const template = [
      {
        label: '文件',
        submenu: [
          {
            label: '新建项目',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              this.mainWindow.webContents.send('menu-new-project');
            }
          },
          {
            label: '打开项目',
            accelerator: 'CmdOrCtrl+O',
            click: () => {
              this.mainWindow.webContents.send('menu-open-project');
            }
          },
          { type: 'separator' },
          {
            label: '设置',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.createSettingsWindow();
            }
          },
          { type: 'separator' },
          {
            label: '退出',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            }
          }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
          { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
          { type: 'separator' },
          { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
          { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
          { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' }
        ]
      },
      {
        label: '视图',
        submenu: [
          { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
          { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
          { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
          { type: 'separator' },
          { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
          { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
          { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
          { type: 'separator' },
          { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' }
        ]
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '关于',
            click: () => {
              this.mainWindow.webContents.send('menu-about');
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  setupIPC() {
    // 获取数据目录路径
    ipcMain.handle('get-data-dir', () => {
      return DATA_DIR;
    });

    // 获取应用版本
    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });

    // 获取版本信息
    ipcMain.handle('get-versions', () => {
      return {
        node: process.versions.node,
        electron: process.versions.electron,
        chrome: process.versions.chrome
      };
    });

    // 获取应用路径
    ipcMain.handle('get-app-path', () => {
      return app.getAppPath();
    });

    // Shell操作
    ipcMain.handle('shell-open-external', (event, url) => {
      return shell.openExternal(url);
    });

    // 设置系统壁纸
    ipcMain.handle('shell-set-wallpaper', async (event, imagePath) => {
      try {
        const os = require('os');
        const path = require('path');
        const { spawn, exec } = require('child_process');
        const platform = os.platform();

        // 验证文件是否存在
        if (!await fs.exists(imagePath)) {
          throw new Error(`Image file does not exist: ${imagePath}`);
        }

        // 验证文件是否为图片格式
        const ext = path.extname(imagePath).toLowerCase();
        const validExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'];
        if (!validExtensions.includes(ext)) {
          throw new Error(`Unsupported image format: ${ext}. Supported formats: ${validExtensions.join(', ')}`);
        }

        console.log(`Setting wallpaper: ${imagePath} on platform: ${platform}`);

        if (platform === 'win32') {
          // Windows: 首先尝试简单的方法，如果失败再使用C#方法
          return new Promise((resolve, reject) => {
            // 方法1: 使用Registry设置壁纸（更简单可靠）
            const simpleScript = `
              Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "Wallpaper" -Value "${imagePath.replace(/\\/g, '\\\\')}"
              RUNDLL32.EXE user32.dll,UpdatePerUserSystemParameters
            `;
            
            const simpleProcess = spawn('powershell', [
              '-ExecutionPolicy', 'Bypass',
              '-NoProfile',
              '-Command', simpleScript
            ], { 
              windowsHide: true,
              stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            simpleProcess.stdout.on('data', (data) => {
              stdout += data.toString();
            });
            
            simpleProcess.stderr.on('data', (data) => {
              stderr += data.toString();
            });
            
            simpleProcess.on('close', (code) => {
              if (code === 0) {
                resolve({ success: true });
              } else {
                console.log('Simple method failed, trying C# method...');
                console.log('stdout:', stdout);
                console.log('stderr:', stderr);
                
                // 方法2: 使用C#代码（备用方案）
                const csharpScript = `
$source = @"
using System;
using System.Runtime.InteropServices;
public class Wallpaper {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
    public static void SetWallpaper(string thePath) {
        SystemParametersInfo(20, 0, thePath, 3);
    }
}
"@
Add-Type -TypeDefinition $source
[Wallpaper]::SetWallpaper("${imagePath.replace(/\\/g, '\\\\')}")
                `;
                
                const csharpProcess = spawn('powershell', [
                  '-ExecutionPolicy', 'Bypass',
                  '-NoProfile',
                  '-Command', csharpScript
                ], { 
                  windowsHide: true,
                  stdio: ['pipe', 'pipe', 'pipe']
                });
                
                let csharpStdout = '';
                let csharpStderr = '';
                
                csharpProcess.stdout.on('data', (data) => {
                  csharpStdout += data.toString();
                });
                
                csharpProcess.stderr.on('data', (data) => {
                  csharpStderr += data.toString();
                });
                
                csharpProcess.on('close', (csharpCode) => {
                  if (csharpCode === 0) {
                    resolve({ success: true });
                  } else {
                    console.error('C# method also failed, trying final fallback...');
                    console.error('stdout:', csharpStdout);
                    console.error('stderr:', csharpStderr);
                    
                    // 方法3: 使用bitsadmin作为最终备用方案（Windows内置）
                    const fallbackScript = `
$regPath = "HKCU:\\Control Panel\\Desktop"
Set-ItemProperty -Path $regPath -Name "Wallpaper" -Value "${imagePath.replace(/\\/g, '\\\\')}"
Set-ItemProperty -Path $regPath -Name "WallpaperStyle" -Value "10"
Set-ItemProperty -Path $regPath -Name "TileWallpaper" -Value "0"
& rundll32.exe user32.dll,UpdatePerUserSystemParameters ,1 ,True
                    `;
                    
                    const fallbackProcess = spawn('powershell', [
                      '-ExecutionPolicy', 'Bypass',
                      '-WindowStyle', 'Hidden',
                      '-Command', fallbackScript
                    ], { 
                      windowsHide: true,
                      stdio: ['pipe', 'pipe', 'pipe']
                    });
                    
                    let fallbackStdout = '';
                    let fallbackStderr = '';
                    
                    fallbackProcess.stdout.on('data', (data) => {
                      fallbackStdout += data.toString();
                    });
                    
                    fallbackProcess.stderr.on('data', (data) => {
                      fallbackStderr += data.toString();
                    });
                    
                    fallbackProcess.on('close', (fallbackCode) => {
                      if (fallbackCode === 0) {
                        resolve({ success: true });
                      } else {
                        console.error('All methods failed:');
                        console.error('Fallback stdout:', fallbackStdout);
                        console.error('Fallback stderr:', fallbackStderr);
                        reject(new Error(`All wallpaper setting methods failed. Image path: ${imagePath}. Please ensure the image file exists and is accessible.`));
                      }
                    });
                    
                    fallbackProcess.on('error', (fallbackError) => {
                      reject(new Error(`Fallback method error: ${fallbackError.message}`));
                    });
                  }
                });
                
                csharpProcess.on('error', (csharpError) => {
                  reject(new Error(`C# method error: ${csharpError.message}`));
                });
              }
            });
            
            simpleProcess.on('error', (error) => {
              reject(new Error(`PowerShell process error: ${error.message}`));
            });
          });
        } else if (platform === 'darwin') {
          // macOS: 使用AppleScript设置壁纸
          return new Promise((resolve, reject) => {
            const script = `tell application "System Events" to tell every desktop to set picture to "${imagePath}"`;
            const process = spawn('osascript', ['-e', script]);
            
            process.on('close', (code) => {
              if (code === 0) {
                resolve({ success: true });
              } else {
                reject(new Error(`osascript exited with code ${code}`));
              }
            });
            
            process.on('error', (error) => {
              reject(error);
            });
          });
        } else if (platform === 'linux') {
          // Linux: 尝试多种桌面环境的壁纸设置方法
          return new Promise((resolve, reject) => {
            // 尝试GNOME
            const gnomeProcess = spawn('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri', `file://${imagePath}`]);
            
            gnomeProcess.on('close', (code) => {
              if (code === 0) {
                resolve({ success: true });
                return;
              }
              
              // 如果GNOME失败，尝试KDE
              const kdeProcess = spawn('qdbus', ['org.kde.plasmashell', '/PlasmaShell', 'org.kde.PlasmaShell.evaluateScript', `
                var allDesktops = desktops();
                for (i=0;i<allDesktops.length;i++) {
                  d = allDesktops[i];
                  d.wallpaperPlugin = "org.kde.image";
                  d.currentConfigGroup = Array("Wallpaper", "org.kde.image", "General");
                  d.writeConfig("Image", "file://${imagePath}");
                }
              `]);
              
              kdeProcess.on('close', (kdeCode) => {
                if (kdeCode === 0) {
                  resolve({ success: true });
                } else {
                  reject(new Error('Unsupported desktop environment'));
                }
              });
              
              kdeProcess.on('error', () => {
                reject(new Error('Unsupported desktop environment'));
              });
            });
            
            gnomeProcess.on('error', () => {
              reject(new Error('Unsupported desktop environment'));
            });
          });
        } else {
          throw new Error(`Unsupported platform: ${platform}`);
        }
      } catch (error) {
        throw error;
      }
    });

    // 检查是否支持设置壁纸
    ipcMain.handle('shell-can-set-wallpaper', () => {
      const os = require('os');
      const platform = os.platform();
      return ['win32', 'darwin', 'linux'].includes(platform);
    });

    // 在文件管理器中显示文件/文件夹
    ipcMain.handle('shell-show-in-folder', async (event, folderPath) => {
      try {
        return shell.showItemInFolder(folderPath);
      } catch (error) {
        console.error('打开文件夹失败:', error);
        throw error;
      }
    });

    // 打开设置窗口
    ipcMain.handle('open-settings', () => {
      this.createSettingsWindow();
    });

    // 文件选择对话框
    ipcMain.handle('show-open-dialog', async (event, options) => {
      const result = await dialog.showOpenDialog(this.mainWindow, options);
      return result;
    });

    ipcMain.handle('show-save-dialog', async (event, options) => {
      const result = await dialog.showSaveDialog(this.mainWindow, options);
      return result;
    });

    // 文件系统操作
    ipcMain.handle('fs-exists', async (event, path) => {
      return fs.exists(path);
    });

    ipcMain.handle('fs-read-json', async (event, path) => {
      try {
        return await fs.readJson(path);
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle('fs-write-json', async (event, path, data) => {
      try {
        await fs.writeJson(path, data, { spaces: 2 });
        return true;
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle('fs-write-file', async (event, path, data) => {
      try {
        await fs.writeFile(path, data);
        return true;
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle('fs-read-file', async (event, filePath, encoding = 'utf8') => {
      try {
        return await fs.readFile(filePath, encoding);
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle('fs-ensure-dir', async (event, path) => {
      try {
        await fs.ensureDir(path);
        return true;
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle('fs-readdir', async (event, path) => {
      try {
        return await fs.readdir(path);
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle('fs-stat', async (event, path) => {
      try {
        const stat = await fs.stat(path);
        return {
          isFile: stat.isFile(),
          isDirectory: stat.isDirectory(),
          size: stat.size,
          mtime: stat.mtime
        };
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle('fs-copy', async (event, src, dest) => {
      try {
        await fs.copy(src, dest);
        return true;
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle('fs-move', async (event, src, dest) => {
      try {
        await fs.move(src, dest);
        return true;
      } catch (error) {
        throw error;
      }
    });

    ipcMain.handle('fs-remove', async (event, path) => {
      try {
        await fs.remove(path);
        return true;
      } catch (error) {
        throw error;
      }
    });

    // 音频元数据分析
    ipcMain.handle('audio-get-metadata', async (event, filePath) => {
      try {
        const metadata = await parseFile(filePath);
        
        return {
          success: true,
          data: {
            // 基本信息
            duration: metadata.format.duration || 0,
            bitrate: metadata.format.bitrate || 0,
            sampleRate: metadata.format.sampleRate || 44100,
            bitsPerSample: metadata.format.bitsPerSample || 16,
            numberOfChannels: metadata.format.numberOfChannels || 2,
            
            // 编码信息
            codec: metadata.format.codec || 'unknown',
            codecProfile: metadata.format.codecProfile,
            container: metadata.format.container || 'unknown',
            
            // 标签信息
            title: metadata.common.title,
            artist: metadata.common.artist,
            album: metadata.common.album,
            year: metadata.common.year,
            genre: metadata.common.genre ? metadata.common.genre.join(', ') : null,
            
            // 文件信息
            fileSize: metadata.format.size || 0
          }
        };
      } catch (error) {
        console.error('获取音频元数据失败:', error);
        return {
          success: false,
          error: error.message,
          data: null
        };
      }
    });

    // 窗口控制
    ipcMain.handle('window-minimize', () => {
      this.mainWindow.minimize();
    });

    ipcMain.handle('window-maximize', () => {
      if (this.mainWindow.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow.maximize();
      }
    });

    ipcMain.handle('window-close', () => {
      this.mainWindow.close();
    });

    ipcMain.handle('window-set-fullscreen', (event, fullscreen) => {
      this.mainWindow.setFullScreen(fullscreen);
      // 控制标题栏显示
      this.mainWindow.setMenuBarVisibility(!fullscreen);
    });

    ipcMain.handle('window-set-size', (event, width, height) => {
      // 验证参数
      const minWidth = 800;
      const minHeight = 600;
      const maxWidth = 4096;
      const maxHeight = 2160;
      
      const validWidth = Math.max(minWidth, Math.min(maxWidth, parseInt(width) || minWidth));
      const validHeight = Math.max(minHeight, Math.min(maxHeight, parseInt(height) || minHeight));
      
      this.mainWindow.setSize(validWidth, validHeight);
      this.mainWindow.center(); // 居中显示
      
      return { width: validWidth, height: validHeight };
    });

    // 获取窗口状态
    ipcMain.handle('window-get-size', () => {
      return this.mainWindow.getSize();
    });

    ipcMain.handle('window-is-fullscreen', () => {
      return this.mainWindow.isFullScreen();
    });

    // ZIP操作
    ipcMain.handle('zip-export-project', async (event, projectPath, exportPath) => {
      return this.exportProjectToZip(projectPath, exportPath);
    });

    ipcMain.handle('zip-import-project', async (event, zipPath, extractPath) => {
      return this.importProjectFromZip(zipPath, extractPath);
    });

    // 备份恢复操作
    ipcMain.handle('zip-backup-data', async (event, backupPath) => {
      return this.backupDataToZip(backupPath);
    });

    ipcMain.handle('zip-restore-data', async (event, zipPath) => {
      return this.restoreDataFromZip(zipPath);
    });

    // 主题实时预览广播
    ipcMain.on('theme-update', (event, payload) => {
      // 将主题更新广播到所有渲染进程（包括主窗口和设置窗口）
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('theme-update', payload);
        }
      });
    });

    // 简易存储（以 userData/settings.json 持久化）
    const settingsFile = path.join(app.getPath('userData'), 'settings.json');
    ipcMain.handle('storage-get', async (_evt, key) => {
      try {
        const exists = await fs.pathExists(settingsFile);
        if (!exists) return null;
        const all = await fs.readJson(settingsFile);
        return all ? all[key] : null;
      } catch (e) {
        return null;
      }
    });

    ipcMain.handle('storage-set', async (_evt, key, value) => {
      try {
        const exists = await fs.pathExists(settingsFile);
        const all = exists ? (await fs.readJson(settingsFile)) : {};
        all[key] = value;
        await fs.outputJson(settingsFile, all, { spaces: 2 });
        // 若是应用设置，广播主题/渐变更新以便其他窗口即时同步
        if (key === 'appSettings' && value) {
          const payload = {};
          if (value.themeMode) payload.mode = value.themeMode;
          if (value.themeColor) payload.color = value.themeColor;
          if (value.backgroundGradient && value.backgroundGradient.startColor && value.backgroundGradient.endColor) {
            const dir = value.backgroundGradient.direction || '135deg';
            payload.backgroundGradient = `linear-gradient(${dir}, ${value.backgroundGradient.startColor}, ${value.backgroundGradient.endColor})`;
          }
          if (Object.keys(payload).length > 0) {
            BrowserWindow.getAllWindows().forEach(win => {
              if (!win.isDestroyed()) {
                win.webContents.send('theme-update', payload);
              }
            });
          }
        }
        return true;
      } catch (e) {
        throw e;
      }
    });
  }

  /**
   * 导出项目为ZIP文件
   */
  async exportProjectToZip(projectPath, exportPath) {
    return new Promise((resolve, reject) => {
      const zipFile = new yazl.ZipFile();
      
  // 递归添加文件到zip，跳过 .trash 目录
  const addDirectoryToZip = async (dirPath, zipDirPath = '') => {
        try {
          const items = await fs.readdir(dirPath);
          
          for (const item of items) {
            // 跳过回收站目录
            if (item && item.toLowerCase() === '.trash') continue;
            const itemPath = path.join(dirPath, item);
            const stat = await fs.stat(itemPath);
            const zipItemPath = zipDirPath ? `${zipDirPath}/${item}` : item;
            
            if (stat.isDirectory()) {
              await addDirectoryToZip(itemPath, zipItemPath);
            } else {
              zipFile.addFile(itemPath, zipItemPath);
            }
          }
        } catch (error) {
          throw error;
        }
      };

      addDirectoryToZip(projectPath)
        .then(() => {
          zipFile.end();
          
          const outputStream = fs.createWriteStream(exportPath);
          zipFile.outputStream.pipe(outputStream);
          
          outputStream.on('close', () => {
            resolve({ success: true, path: exportPath });
          });
          
          outputStream.on('error', (error) => {
            reject(error);
          });
        })
        .catch(reject);
    });
  }

  /**
   * 从ZIP文件导入项目
   */
  async importProjectFromZip(zipPath, extractPath) {
    return new Promise((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            // 目录条目
            const dirPath = path.join(extractPath, entry.fileName);
            fs.ensureDir(dirPath)
              .then(() => zipfile.readEntry())
              .catch(reject);
          } else {
            // 文件条目
            const filePath = path.join(extractPath, entry.fileName);
            
            // 确保父目录存在
            fs.ensureDir(path.dirname(filePath))
              .then(() => {
                zipfile.openReadStream(entry, (err, readStream) => {
                  if (err) {
                    reject(err);
                    return;
                  }

                  const writeStream = fs.createWriteStream(filePath);
                  readStream.pipe(writeStream);

                  writeStream.on('close', () => {
                    zipfile.readEntry();
                  });

                  writeStream.on('error', reject);
                });
              })
              .catch(reject);
          }
        });

        zipfile.on('end', () => {
          resolve({ success: true, path: extractPath });
        });

        zipfile.on('error', reject);
      });
    });
  }

  /**
   * 备份数据到ZIP文件
   */
  async backupDataToZip(backupPath) {
    return new Promise(async (resolve, reject) => {
      try {
        const yazl = require('yazl');
        const zipfile = new yazl.ZipFile();
        const dataDir = path.join(app.getPath('documents'), 'ArtiMeow-AIGalGame-Data');

        // 检查数据目录是否存在
        if (!await fs.pathExists(dataDir)) {
          resolve({ success: false, message: '数据目录不存在' });
          return;
        }

        // 递归添加目录中的所有文件，跳过 .trash
        const addDirectoryToZip = async (dirPath, zipPath = '') => {
              const items = await fs.readdir(dirPath);
          
              for (const item of items) {
                // 跳过回收站目录
                if (item && item.toLowerCase() === '.trash') continue;
                const itemPath = path.join(dirPath, item);
                const zipItemPath = zipPath ? `${zipPath}/${item}` : item;
                const stat = await fs.stat(itemPath);

                if (stat.isDirectory()) {
                  await addDirectoryToZip(itemPath, zipItemPath);
                } else {
                  zipfile.addFile(itemPath, zipItemPath);
                }
              }
            };

        await addDirectoryToZip(dataDir);

        // 添加设置文件
        const settingsFile = path.join(app.getPath('userData'), 'settings.json');
        if (await fs.pathExists(settingsFile)) {
          zipfile.addFile(settingsFile, 'settings.json');
        }

        zipfile.end();

        const writeStream = fs.createWriteStream(backupPath);
        zipfile.outputStream.pipe(writeStream);

        writeStream.on('close', () => {
          resolve({ success: true, path: backupPath });
        });

        writeStream.on('error', reject);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 从ZIP文件恢复数据
   */
  async restoreDataFromZip(zipPath) {
    return new Promise((resolve, reject) => {
      const yauzl = require('yauzl');
      const dataDir = path.join(app.getPath('documents'), 'ArtiMeow-AIGalGame-Data');
      
      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            // 目录条目
            const dirPath = entry.fileName === 'settings.json' ? 
              app.getPath('userData') : 
              path.join(dataDir, entry.fileName);
            fs.ensureDir(dirPath)
              .then(() => zipfile.readEntry())
              .catch(reject);
          } else {
            // 文件条目
            const filePath = entry.fileName === 'settings.json' ?
              path.join(app.getPath('userData'), entry.fileName) :
              path.join(dataDir, entry.fileName);
            
            // 确保父目录存在
            fs.ensureDir(path.dirname(filePath))
              .then(() => {
                zipfile.openReadStream(entry, (err, readStream) => {
                  if (err) {
                    reject(err);
                    return;
                  }

                  const writeStream = fs.createWriteStream(filePath);
                  readStream.pipe(writeStream);

                  writeStream.on('close', () => {
                    zipfile.readEntry();
                  });

                  writeStream.on('error', reject);
                });
              })
              .catch(reject);
          }
        });

        zipfile.on('end', () => {
          resolve({ success: true, path: dataDir });
        });

        zipfile.on('error', reject);
      });
    });
  }
}

new MainProcess();
