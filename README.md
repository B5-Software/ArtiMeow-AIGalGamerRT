# ArtiMeow AI GalGamer RT

一个实时AIGC的GalGame框架

## 项目介绍

ArtiMeow AI GalGamer RT 是一个基于Electron的交互式视觉小说游戏框架，利用AI技术实时生成故事内容和背景图像，为玩家提供无限可能的游戏体验。

## 主要特性

### 🎮 游戏功能
- **实时AI故事生成**：使用AI模型动态生成对话内容和剧情发展
- **智能图像生成**：根据故事情节自动生成匹配的背景图像
- **交互式选择系统**：支持鼠标和键盘操作的多选项交互
- **时间线系统**：以流程图形式展示游戏进程，支持任意节点回档
- **知识库管理**：AI自动维护和更新游戏世界观、角色、地点等信息

### 🤖 AI集成
- **多平台支持**：兼容OpenAI、Ollama、llama.cpp等多种AI服务
- **自定义API**：支持任何兼容OpenAI格式的自定义API
- **双模型架构**：分别配置文本生成和图像生成模型
- **智能重试**：AI响应格式验证，自动重新生成无效内容

### 📁 项目管理
- **项目系统**：所有游戏以独立项目形式管理
- **检查点机制**：每个重要节点自动创建检查点
- **导入导出**：支持项目的完整导入导出（包含所有数据）
- **备份系统**：回档时将后续章节移入备份而非删除

### 🎨 界面设计
- **精美UI**：现代化渐变设计，支持动画效果
- **响应式布局**：适配不同屏幕尺寸
- **自定义主题**：支持调整文字大小、透明度等
- **沉浸式体验**：全屏背景图像，半透明文本框

### ⚙️ 系统设置
- **窗口管理**：支持自定义分辨率和全屏模式
- **自动保存**：可配置的自动保存间隔
- **数据管理**：支持数据备份和恢复
- **快捷键**：完整的键盘快捷键支持

## 技术栈

- **前端框架**：Electron + HTML5 + CSS3 + JavaScript
- **数据存储**：JSON文件系统
- **AI集成**：RESTful API调用
- **文件处理**：fs-extra, yazl, yauzl
- **网络请求**：axios

## 项目结构

```
ArtiMeow-AIGalGamerRT/
├── src/
│   ├── main.js              # 主进程
│   ├── preload.js           # 预加载脚本
│   └── renderer/            # 渲染进程
│       ├── index.html       # 主页面
│       ├── settings.html    # 设置页面
│       ├── styles/          # 样式文件
│       │   ├── main.css     # 主样式
│       │   └── settings.css # 设置样式
│       └── js/              # JavaScript文件
│           ├── main.js      # 主页面逻辑
│           ├── settings.js  # 设置页面逻辑
│           ├── utils.js     # 工具函数
│           ├── project-manager.js # 项目管理
│           ├── ai-service.js      # AI服务
│           ├── game-engine.js     # 游戏引擎
│           └── timeline.js        # 时间线管理
├── assets/                  # 资源文件
└── package.json            # 项目配置
```

## 数据目录结构

游戏数据存储在用户目录下的 `~/ArtiMeow-AIGalGame-Data/` 中：

```
~/ArtiMeow-AIGalGame-Data/
├── project1/
│   ├── metadata.json        # 项目元数据
│   ├── knowledge-base.json  # 知识库
│   ├── timeline/           # 时间线节点
│   │   ├── node1.json
│   │   └── node2.json
│   ├── backup/             # 回档备份
│   └── assets/             # 项目资源
├── project2/
└── .trash/                 # 已删除项目
```

## 开发环境设置

### 环境要求
- Node.js 16+
- npm 7+

### 安装依赖
```bash
npm install
```

### 开发模式运行
```bash
npm run dev
```

### 构建应用
```bash
npm run build
```

### 打包发布
```bash
npm run dist
```

## 使用指南

### 首次使用
1. 启动应用
2. 点击"设置"配置AI服务
3. 配置文本生成模型（必需）
4. 配置图像生成模型（可选）
5. 返回主页创建新项目

### 创建项目
1. 点击"新建项目"
2. 填写项目信息：
   - 项目名称
   - 项目简介
   - 项目风格（影响AI生成内容的风格）
   - 故事大纲
3. 点击"创建"

### 游戏操作
- **空格键**：继续对话/确认选择
- **方向键**：选择选项
- **回车键**：确认当前选择
- **ESC键**：暂停游戏
- **时间线按钮**：查看和管理时间线

### AI配置说明

#### OpenAI配置
- API URL: `https://api.openai.com/v1`
- 需要有效的API Key
- 推荐模型：
  - 文本：`gpt-4o-mini` 或 `gpt-3.5-turbo`
  - 图像：`dall-e-3`

#### Ollama配置
- API URL: `http://localhost:11434`
- 无需API Key
- 需要本地运行Ollama服务

#### 自定义API配置
- 支持任何兼容OpenAI格式的API
- 需要相应的API Key和模型名称

## 故障排除

### 常见问题

**Q: AI生成失败**
A: 检查网络连接和API配置，确认API Key有效且有足够额度

**Q: 图像生成缓慢**
A: 图像生成通常比文本生成耗时更长，请耐心等待

**Q: 项目加载失败**
A: 检查数据目录权限，确认项目文件完整

**Q: 设置不生效**
A: 重启应用以确保设置生效

### 日志查看
开发模式下可以通过F12打开开发者工具查看详细日志。

## 许可证

B5-Software Free and Open Knowledge Public License Version 1.0-Permissive

## 作者

B5-Software

## 贡献

欢迎提交Issue和Pull Request！

## 更新日志

### v1.0.0 (初始版本)
- 基础游戏引擎
- AI集成系统
- 项目管理功能
- 时间线系统
- 用户界面设计

---

*让AI创造无限可能的交互式故事体验！* 🎮✨
