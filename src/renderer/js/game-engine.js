/**
 * 游戏引擎
 */

class GameEngine {
  constructor() {
    this.currentProject = null;
    this.currentTimeline = null;
    this.currentChoices = [];
    this.selectedChoiceIndex = -1;
    this.isWaitingForChoice = false;
    this.isGenerating = false;
    this.gameState = 'menu'; // 'menu', 'playing', 'paused'
    this.autoMode = false;
    this.skipMode = false;
    this.keyboardHandler = null;
    this.projectManager = window.projectManager; // 引用全局项目管理器
    this.hasCompletedFirstTypewriter = false; // 标记是否完成第一次打字机效果
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupKeyboardControls();
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 返回主页按钮
    const backBtn = document.getElementById('back-to-main-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.exitGame());
    }

    // 游戏设置按钮
    const settingsBtn = document.getElementById('game-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        window.electronAPI.openSettings();
      });
    }

    // IoT面板按钮
    // IoT面板按钮（游戏界面专用）
    const iotPanelBtn = document.getElementById('game-iot-panel-btn');
    console.log('🔍 查找 game-iot-panel-btn:', iotPanelBtn ? '找到' : '未找到');
    if (iotPanelBtn) {
      console.log('✅ 为 game-iot-panel-btn 添加点击事件监听器');
      
      // 测试：添加一个简单的点击测试
      iotPanelBtn.onclick = (e) => {
        console.log('🖱️ onclick 触发！', e);
      };
      
      iotPanelBtn.addEventListener('click', async (e) => {
        console.log('🖱️ addEventListener click 触发！', e);
        e.stopPropagation(); // 防止事件冒泡
        
        if (window.electronAPI && window.electronAPI.window && window.electronAPI.window.openIoTPanel) {
          console.log('📞 调用 openIoTPanel API');
          try {
            await window.electronAPI.window.openIoTPanel();
            console.log('✅ IoT面板打开成功');
          } catch (error) {
            console.error('❌ 打开IoT面板失败:', error);
          }
        } else {
          console.error('❌ IoT面板API未找到', {
            electronAPI: !!window.electronAPI,
            window: !!(window.electronAPI && window.electronAPI.window),
            openIoTPanel: !!(window.electronAPI && window.electronAPI.window && window.electronAPI.window.openIoTPanel)
          });
        }
      }, true); // 使用捕获阶段
    } else {
      console.error('❌ 未找到 game-iot-panel-btn 元素');
    }

    // HR实时显示按钮（游戏界面专用） - 监听 IoT 管理器的心率事件
    const hrBtn = document.getElementById('game-heart-rate-btn');
    console.log('🔍 查找 game-heart-rate-btn:', hrBtn ? '找到' : '未找到', hrBtn);
    console.log('🔍 查找 window.iotManager:', window.iotManager ? '存在' : '不存在');
    
    if (hrBtn && window.iotManager) {
      console.log('🎮 游戏引擎: 开始设置心率监听器');
      // 等待 IoT 管理器初始化完成
      window.iotManager.waitUntilReady().then(() => {
        console.log('✅ IoT管理器已准备就绪，注册心率事件监听器');
        
        // 监听心率数据更新
        window.iotManager.on('heartrate', (data) => {
          console.log('🎮 游戏引擎收到心率数据:', data);
          if (data.bpm > 0) {
            const hrValue = document.getElementById('game-hr-value');
            if (hrValue) {
              hrValue.textContent = data.bpm;
              hrBtn.classList.add('active');
              console.log(`✅ 更新游戏界面心率显示: ${data.bpm}`);
            }
          } else {
            const hrValue = document.getElementById('game-hr-value');
            if (hrValue) {
              hrValue.textContent = '--';
              hrBtn.classList.remove('active');
            }
          }
        });

        // 监听断开连接
        window.iotManager.on('disconnect', () => {
          console.log('🎮 IoT设备已断开，重置心率显示');
          const hrValue = document.getElementById('game-hr-value');
          if (hrValue) {
            hrValue.textContent = '--';
          }
          hrBtn.classList.remove('active');
        });

        // 初始化显示当前状态
        const status = window.iotManager.getStatus();
        console.log('🎮 当前IoT状态:', status);
        if (status.connected && status.heartRate > 0) {
          const hrValue = document.getElementById('game-hr-value');
          if (hrValue) {
            hrValue.textContent = status.heartRate;
            hrBtn.classList.add('active');
            console.log(`✅ 初始化显示当前心率: ${status.heartRate}`);
          }
        }
      }).catch(err => {
        console.error('❌ IoT管理器初始化失败:', err);
      });
    } else {
      console.warn('⚠️ 心率按钮或IoT管理器未找到', { hrBtn: !!hrBtn, iotManager: !!window.iotManager });
    }

    // 体感控制监听
    if (window.iotManager) {
      window.iotManager.waitUntilReady().then(() => {
        console.log('🎮 注册体感控制监听器');
        
        window.iotManager.on('gesture', (data) => {
          console.log('🎮 游戏引擎收到体感事件:', data);
          this.handleGestureControl(data);
        });
      }).catch(err => {
        console.error('❌ 注册体感监听器失败:', err);
      });
    }

    // HUD 控制: CUSTOM 输入
    const btnCustom = document.getElementById('btn-custom');
    const customBox = document.getElementById('custom-input');
    const customText = document.getElementById('custom-text');
    const customSubmit = document.getElementById('custom-submit');
    if (btnCustom && customBox && customText && customSubmit) {
      btnCustom.addEventListener('click', () => {
        customBox.classList.toggle('hidden');
        if (!customBox.classList.contains('hidden')) {
          customText.focus();
        }
      });
      const submitFn = async () => {
        const val = (customText.value || '').trim();
        if (!val) return;
        customText.value = '';
        customBox.classList.add('hidden');
        // 作为用户选择推进
        await this.generateNextContent(val);
      };
      customSubmit.addEventListener('click', submitFn);
      customText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitFn();
        }
      });
    }

    const btnSkip = document.getElementById('btn-skip');
    if (btnSkip) {
      btnSkip.addEventListener('click', async () => {
        this.skipMode = !this.skipMode;
        btnSkip.classList.toggle('active', this.skipMode);
        if (this.skipMode) {
          // 快进：优先选择第一个选项并快速推进，设定上限避免无限循环
          let steps = 0;
          while (this.skipMode && this.gameState==='playing' && steps < 10) {
            // 若正在打字，立即完成
            const dialogueText = document.getElementById('dialogue-text');
            if (dialogueText && dialogueText.dataset.typing === 'true') {
              dialogueText.textContent = dialogueText.dataset.fullText || '';
              dialogueText.dataset.typing = 'false';
            }
            if (this.isWaitingForChoice && this.currentChoices.length>0) {
              await this.selectChoice(0);
            } else if (!this.isGenerating) {
              await this.continueStory();
            }
            steps++;
          }
          this.skipMode = false;
          btnSkip.classList.remove('active');
        }
      });
    }
  }

  /**
   * 设置键盘控制
   */
  setupKeyboardControls() {
    this.keyboardHandler = (e) => {
      if (this.gameState !== 'playing') return;

      switch (e.key) {
        case ' ': // 空格键
          e.preventDefault();
          e.stopPropagation(); // 阻止事件传播
          console.log('空格键按下 - 当前状态:', {
            isWaitingForChoice: this.isWaitingForChoice,
            isGenerating: this.isGenerating,
            typing: document.getElementById('dialogue-text')?.dataset.typing
          });
          
          if (this.isWaitingForChoice) {
            this.selectCurrentChoice();
          } else if (!this.isGenerating) {
            // 空格跳过打字机：若正在打字，瞬间填满文本并显示选项
            const dialogueText = document.getElementById('dialogue-text');
            if (dialogueText && dialogueText.dataset.typing === 'true') {
              console.log('中断打字机效果，填充完整文本');
              const full = dialogueText.dataset.fullText || '';
              dialogueText.textContent = full;
              dialogueText.dataset.typing = 'false';
              
              // 若存在选择，立即展示
              if (this.currentTimeline?.content?.choices?.length > 0) {
                console.log('显示选择选项');
                this.currentChoices = this.currentTimeline.content.choices;
                this.displayChoices(this.currentChoices);
                this.isWaitingForChoice = true;
              }
            } else {
              console.log('继续故事');
              this.continueStory();
            }
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          if (this.isWaitingForChoice) {
            this.navigateChoices(-1);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          if (this.isWaitingForChoice) {
            this.navigateChoices(1);
          }
          break;

        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (this.isWaitingForChoice) {
            this.selectCurrentChoice();
          }
          break;

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          this.pauseGame();
          break;
      }
    };

    // 使用捕获模式，确保事件被优先处理
    document.addEventListener('keydown', this.keyboardHandler, true);
  }

  /**
   * 启动游戏
   * @param {string} projectId - 项目ID
   */
  async startGame(projectId) {
    try {
      // 验证参数
      if (!projectId) {
        throw new Error('项目ID不能为空');
      }

      // 禁用返回主页按钮，防止打字机效果进行中返回导致问题
      const backBtn = document.getElementById('back-to-main-btn');
      if (backBtn) {
        backBtn.disabled = true;
        backBtn.style.opacity = '0.5';
        backBtn.style.cursor = 'not-allowed';
      }

      // 切换到游戏界面
      this.switchToGameScreen();

      // 加载项目
      this.currentProject = await window.projectManager.loadProject(projectId);
      
      if (!this.currentProject) {
        throw new Error('项目加载失败');
      }

      // 加载时间线
      await window.timeline.loadTimeline(projectId);

  // 预加载知识库与角色库
  this.currentProject.knowledgeBase = await window.projectManager.readKnowledgeBase(this.currentProject);
  this.currentProject.characters = await window.projectManager.readCharacters(this.currentProject);

  // 加载当前检查点
      await this.loadCurrentCheckpoint();

      // 更新游戏状态
      this.gameState = 'playing';

      Utils.showNotification(`开始游戏：${this.currentProject.name}`, 'success');

    } catch (error) {
      console.error('启动游戏失败:', error);
      Utils.showNotification(`启动游戏失败: ${error.message}`, 'error');
      this.exitGame();
    }
  }

  /**
   * 加载当前检查点
   */
  async loadCurrentCheckpoint() {
    try {
      if (!this.currentProject.currentTimeline) {
        throw new Error('没有可用的时间线数据');
      }

      this.currentTimeline = this.currentProject.currentTimeline;
      
      // 设置背景：若检查点缓存了背景图则直接显示，否则使用默认主题背景
      if (this.currentTimeline.content.backgroundUrl) {
        console.log('加载背景图片:', this.currentTimeline.content.backgroundUrl);
        // 检查是否是本地资源路径
        let backgroundPath = this.currentTimeline.content.backgroundUrl;
        if (backgroundPath.startsWith('assets/')) {
          // 转换为项目资源路径
          const filename = backgroundPath.replace('assets/', '');
          console.log('转换资源文件名:', filename);
          backgroundPath = await this.projectManager.getAssetPath(this.currentProject, filename);
          console.log('获取完整路径:', backgroundPath);
          // 使用PathUtils转换为file://协议路径
          backgroundPath = window.PathUtils.toFileUrl(backgroundPath);
          console.log('转换file://路径:', backgroundPath);
        }
        this.setBackgroundImage(backgroundPath);
      } else {
        console.log('没有背景图片，使用默认背景');
        this.setDefaultBackground();
      }
      await this.displayContent(this.currentTimeline.content);

  // 首帧不调用图片API，避免浪费；仅当后续继续时再生成

    } catch (error) {
      console.error('加载检查点失败:', error);
      Utils.showNotification('加载游戏进度失败', 'error');
    }
  }

  /**
   * 显示内容
   * @param {Object} content - 内容对象
   */
  async displayContent(content) {
    const dialogueText = document.getElementById('dialogue-text');
  const nameplate = document.getElementById('nameplate');
    const choicesContainer = document.getElementById('choices-container');
    const spaceHint = document.getElementById('space-hint');
    const choiceHint = document.getElementById('choice-hint');

    if (!dialogueText || !choicesContainer) {
      throw new Error('游戏UI元素未找到');
    }

    // 清空之前的内容
    choicesContainer.innerHTML = '';
    this.currentChoices = [];
    this.selectedChoiceIndex = -1;

    // 显示角色名牌（若有）
    if (nameplate) {
      if (content.speaker) {
        nameplate.classList.remove('hidden');
        nameplate.textContent = content.speaker;
      } else {
        nameplate.classList.add('hidden');
      }
    }

    // 显示对话内容（打字机效果）
    await this.typewriterEffect(dialogueText, content.dialogue || '无内容');

    // 显示选择项
    if (content.choices && content.choices.length > 0) {
      this.currentChoices = content.choices;
      this.displayChoices(content.choices);
      this.isWaitingForChoice = true;
      
      // 更新提示
      spaceHint.classList.add('hidden');
      choiceHint.classList.remove('hidden');
    } else {
      this.isWaitingForChoice = false;
      spaceHint.classList.remove('hidden');
      choiceHint.classList.add('hidden');
    }
  }

  /**
   * 打字机效果显示文本
   * @param {HTMLElement} element - 目标元素
   * @param {string} text - 要显示的文本
   */
  async typewriterEffect(element, text) {
  element.textContent = '';
  element.style.opacity = '1';
  element.dataset.fullText = text;
  element.dataset.typing = 'true';

  const speed = this.skipMode ? 0 : 50; // 毫秒，跳过时为0
    let i = 0;
    
    // 标记这是第一次打字机效果
    const isFirstTypewriter = !this.hasCompletedFirstTypewriter;

    return new Promise((resolve) => {
      const timer = setInterval(() => {
        // 检查是否被中断（用户按空格键跳过）
        if (element.dataset.typing === 'false') {
          clearInterval(timer);
          
          // 第一次打字机完成，启用返回按钮
          if (isFirstTypewriter) {
            this.hasCompletedFirstTypewriter = true;
            this.enableBackButton();
          }
          
          resolve();
          return;
        }
        
        if (i < text.length) {
          element.textContent += text.charAt(i);
          i++;
        } else {
          clearInterval(timer);
          element.dataset.typing = 'false';
          
          // 第一次打字机完成，启用返回按钮
          if (isFirstTypewriter) {
            this.hasCompletedFirstTypewriter = true;
            this.enableBackButton();
          }
          
          // 自动模式：文本结束后根据状态继续
          if (this.autoMode && !this.isWaitingForChoice) {
            setTimeout(() => { if (this.autoMode && !this.isGenerating) this.continueStory(); }, 700);
          }
          resolve();
        }
      }, speed);
    });
  }

  /**
   * 启用返回主页按钮
   */
  enableBackButton() {
    const backBtn = document.getElementById('back-to-main-btn');
    if (backBtn) {
      backBtn.disabled = false;
      backBtn.style.opacity = '1';
      backBtn.style.cursor = 'pointer';
      console.log('✅ 返回主页按钮已启用');
    }
  }

  /**
   * 显示选择项
   * @param {Array} choices - 选择项数组
   */
  displayChoices(choices) {
    const container = document.getElementById('choices-container');
    container.classList.remove('hidden');

    choices.forEach((choice, index) => {
      const choiceDiv = document.createElement('div');
      choiceDiv.className = 'choice-option';
      choiceDiv.textContent = choice.text;
      choiceDiv.setAttribute('data-choice-id', choice.id);
      choiceDiv.setAttribute('data-choice-index', index);

      // 点击事件
      choiceDiv.addEventListener('click', () => {
        this.selectChoice(index);
      });

      // 鼠标悬停事件
      choiceDiv.addEventListener('mouseenter', () => {
        this.highlightChoice(index);
      });

      container.appendChild(choiceDiv);
    });

    // 不预先高亮任何选项，只有键盘或鼠标操作时才高亮
    this.selectedChoiceIndex = -1;
  }

  /**
   * 导航选择项
   * @param {number} direction - 方向（-1上，1下）
   */
  navigateChoices(direction) {
    if (!this.isWaitingForChoice || this.currentChoices.length === 0) return;

    const newIndex = this.selectedChoiceIndex + direction;
    
    if (newIndex >= 0 && newIndex < this.currentChoices.length) {
      this.highlightChoice(newIndex);
    }
  }

  /**
   * 高亮选择项
   * @param {number} index - 选择项索引
   */
  highlightChoice(index) {
    this.selectedChoiceIndex = index;

    const choices = document.querySelectorAll('.choice-option');
    choices.forEach((choice, i) => {
      if (i === index) {
        choice.classList.add('selected');
      } else {
        choice.classList.remove('selected');
      }
    });
  }

  /**
   * 选择当前高亮的选择项
   */
  selectCurrentChoice() {
    if (this.selectedChoiceIndex >= 0) {
      this.selectChoice(this.selectedChoiceIndex);
    }
  }

  /**
   * 选择特定选择项
   * @param {number} index - 选择项索引
   */
  async selectChoice(index) {
    if (!this.isWaitingForChoice || 
        index < 0 || 
        index >= this.currentChoices.length ||
        this.isGenerating) {
      return;
    }

    const selectedChoice = this.currentChoices[index];
    
    try {
      // 隐藏选择项
      this.hideChoices();
      this.isWaitingForChoice = false;

      // 根据选择行为执行相应操作
  if (selectedChoice.action === 'continue') {
        await this.generateNextContent(selectedChoice.text);
      } else if (selectedChoice.action === 'end') {
        this.endGame();
      } else {
        // 其他自定义行为
        await this.handleCustomAction(selectedChoice);
      }

    } catch (error) {
      console.error('处理选择失败:', error);
      Utils.showNotification('处理选择失败', 'error');
      this.isWaitingForChoice = true;
      this.displayChoices(this.currentChoices);
    }
  }

  /**
   * 隐藏选择项
   */
  hideChoices() {
    const container = document.getElementById('choices-container');
    const spaceHint = document.getElementById('space-hint');
    const choiceHint = document.getElementById('choice-hint');

    container.classList.add('hidden');
    spaceHint.classList.remove('hidden');
    choiceHint.classList.add('hidden');
  }

  /**
   * 处理体感控制
   * @param {Object} gestureData - 体感数据 { type: 'single'|'double', magnitude, timestamp }
   */
  handleGestureControl(gestureData) {
    console.log('🎮 处理体感控制:', gestureData);

    // 检查体感控制是否启用
    if (window.iotManager) {
      const status = window.iotManager.getStatus();
      if (!status.gestureEnabled) {
        console.log('⚠️ 体感控制未启用，忽略体感事件');
        return;
      }
    }

    // 只在游戏进行中且等待选择时响应
    if (this.gameState !== 'playing' || !this.isWaitingForChoice) {
      console.log('⚠️ 当前状态不支持体感控制', {
        gameState: this.gameState,
        isWaitingForChoice: this.isWaitingForChoice
      });
      return;
    }

    if (gestureData.type === 'single') {
      // 单次摇动 - 切换到下一个选项(循环)
      this.switchToNextChoice();
    } else if (gestureData.type === 'double') {
      // 连续两次摇动 - 确认当前选项
      this.confirmCurrentChoice();
    }
  }

  /**
   * 切换到下一个选项(循环)
   */
  switchToNextChoice() {
    if (!this.isWaitingForChoice || this.currentChoices.length === 0) {
      return;
    }

    // 计算下一个索引(循环)
    const nextIndex = (this.selectedChoiceIndex + 1) % this.currentChoices.length;
    
    console.log(`🎮 体感切换选项: ${this.selectedChoiceIndex} → ${nextIndex}`);
    
    // 更新高亮
    this.highlightChoice(nextIndex);
    this.selectedChoiceIndex = nextIndex;

    // 视觉反馈
    Utils.showNotification(`切换至选项 ${nextIndex + 1}`, 'info');
  }

  /**
   * 确认当前选项
   */
  async confirmCurrentChoice() {
    if (!this.isWaitingForChoice || this.selectedChoiceIndex < 0) {
      console.log('⚠️ 没有可确认的选项');
      return;
    }

    console.log(`🎮 体感确认选项: ${this.selectedChoiceIndex}`);
    
    // 视觉反馈
    Utils.showNotification(`确认选项 ${this.selectedChoiceIndex + 1}`, 'success');
    
    // 执行选择
    await this.selectChoice(this.selectedChoiceIndex);
  }

  /**
   * 继续故事（无选择时）
   */
  async continueStory() {
  if (this.isWaitingForChoice || this.isGenerating) return;

    try {
      await this.generateNextContent('');
    } catch (error) {
      console.error('继续故事失败:', error);
      Utils.showNotification('继续故事失败', 'error');
    }
  }

  /**
   * 生成下一段内容
   * @param {string} userChoice - 用户选择
   */
  async generateNextContent(userChoice) {
    if (this.isGenerating) return;

    this.isGenerating = true;
    
    // 创建 AbortController 用于请求中断
    const abortController = new AbortController();
    
    // 定义重试函数
    const retryGeneration = () => {
      console.log('用户请求重试内容生成');
      this.isGenerating = false;
      this.hideLoadingOverlay();
      // 延迟一点时间后重新开始
      setTimeout(() => {
        this.generateNextContent(userChoice);
      }, 500);
    };
    
    this.showLoadingOverlay('正在生成故事内容...', '文本生成中', retryGeneration, abortController);

    try {
      // 获取当前知识库
  const knowledgeBase = this.currentProject.knowledgeBase || this.currentTimeline.knowledgeBase || {};

      // 构建上下文
      const context = {
        projectName: this.currentProject.name,
        projectStyle: this.currentProject.style,
        currentContent: this.currentTimeline.content.dialogue,
        knowledgeBase: knowledgeBase,
        characters: this.currentProject.characters
      };

      // 生成新内容 - 传递 AbortController 信号
      const aiResponse = await window.aiService.generateStoryContent(
        context,
        knowledgeBase,
        userChoice,
        abortController.signal
      );

      // 更新知识库
      const updatedKnowledgeBase = window.aiService.applyKnowledgeUpdates(
        knowledgeBase,
        aiResponse.knowledgeUpdates
      );
      // 持久化知识库
      this.currentProject.knowledgeBase = updatedKnowledgeBase;
      await window.projectManager.writeKnowledgeBase(this.currentProject, updatedKnowledgeBase);

      // 角色库更新
      if (aiResponse.charactersDelta) {
        const updatedCharacters = window.aiService.applyCharacterUpdates(this.currentProject.characters, aiResponse.charactersDelta);
        this.currentProject.characters = updatedCharacters;
        await window.projectManager.writeCharacters(this.currentProject, updatedCharacters);
      }

      // 图像生成：生成时应用背景高斯模糊与实时日志
      let backgroundUrl = null;
      let imagePromise = null;
      let filename = null; // 在外部定义filename变量
      const bgEl = document.getElementById('game-background');
      if (bgEl) {
        bgEl.style.filter = 'blur(12px) brightness(0.85)';
      }
      if (aiResponse.imagePrompt) {
        this.updateLoadingStage('图像生成中');
        // 若之前无背景，联动首页卡片占位状态（通过事件广播）
        const hadBg = !!this.currentTimeline.content.backgroundUrl;
        
        // 生成唯一文件名
        const timestamp = Date.now();
        filename = `background_${timestamp}.png`;

        imagePromise = window.aiService.generateImage(aiResponse.imagePrompt, {
          projectId: this.currentProject.id,
          filename: filename,
          signal: abortController.signal, // 传递中断信号
          onProgress: (progress) => {
            if (progress) {
              this.updateLoadingStage(progress.stage);
              if (!hadBg) {
                window.dispatchEvent(new CustomEvent('image-progress', { 
                  detail: { 
                    projectId: this.currentProject.id, 
                    stage: progress.stage, 
                    done: false, 
                    percent: progress.percent 
                  } 
                }));
              }
            }
          }
        })
          .then(localPath => { 
            backgroundUrl = localPath; // 保存本地相对路径
            return localPath; 
          })
          .catch(err => { 
            console.warn('图像生成失败:', err); 
            return null; 
          });
      }

      // 创建新的时间线节点（先不包含backgroundUrl）
      const newTimeline = {
        id: Utils.generateId(),
        timestamp: Date.now(),
        content: {
          dialogue: aiResponse.dialogue,
          choices: aiResponse.choices || [],
          imagePrompt: aiResponse.imagePrompt,
          knowledgeUpdates: aiResponse.knowledgeUpdates || {},
          chapterSummary: aiResponse.chapterSummary,
          backgroundUrl: backgroundUrl, // 初始为null
          userChoice: userChoice // 保存用户的选择
        },
        knowledgeBase: updatedKnowledgeBase,
        isCheckpoint: true
      };

      // 等待图像完成后，更新backgroundUrl并重新保存
      if (imagePromise) {
        const localPath = await imagePromise;
        if (localPath) {
          // 更新时间线节点的背景URL
          backgroundUrl = `assets/${filename}`; // 存储相对路径
          newTimeline.content.backgroundUrl = backgroundUrl;
          console.log('更新时间线背景URL:', backgroundUrl);
          
          // 使用本地文件路径设置背景 - 使用路径工具
          const fullLocalPath = `${this.currentProject.path}/${localPath}`;
          const fileUrl = window.PathUtils.toFileUrl(fullLocalPath);
          this.setBackgroundImage(fileUrl);
          // 广播完成，更新封面（传递本地路径用于封面显示）
          window.dispatchEvent(new CustomEvent('image-progress', { 
            detail: { 
              projectId: this.currentProject.id, 
              stage: '完成', 
              done: true, 
              url: `file://${fullLocalPath}` 
            } 
          }));
        }
      }

      // 保存时间线节点（在图像处理完成后）
      await window.projectManager.saveTimelineNode(newTimeline);

      // 更新当前状态
      this.currentTimeline = newTimeline;
      this.currentProject.currentTimeline = newTimeline;

      // 更新时间线管理器
      window.timeline.addNode(newTimeline);
      this.hideLoadingOverlay();
      if (bgEl) bgEl.style.filter = '';
      await this.displayContent(newTimeline.content);

    } catch (error) {
      console.error('生成内容失败:', error);
      
      // 检查是否是用户主动中断
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        console.log('用户中断了内容生成');
        this.isGenerating = false;
        return; // 不显示错误，因为是用户主动中断
      }
      
      Utils.showNotification('生成内容失败，请稍后重试', 'error');
      this.hideLoadingOverlay();
      
      // 恢复之前的状态
      if (this.currentChoices.length > 0) {
        this.isWaitingForChoice = true;
        this.displayChoices(this.currentChoices);
      }
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * 生成背景图像
   * @param {string} prompt - 图像提示词
   */
  async generateBackgroundImage(prompt) {
    try {
      const currentProject = window.projectManager.getCurrentProject();
      if (!currentProject) {
        throw new Error('没有当前项目');
      }

      // 生成唯一文件名
      const timestamp = Date.now();
      const filename = `background_${timestamp}.png`;

      const localPath = await window.aiService.generateImage(prompt, {
        projectId: currentProject.id,
        filename: filename,
        onProgress: (progress) => {
          // 可以在这里更新加载进度UI
          console.log(`背景图生成进度: ${progress.stage} - ${progress.percent}%`);
        }
      });

      // 使用本地路径设置背景 - 使用路径工具
      const fullLocalPath = `${currentProject.path}/${localPath}`;
      const fileUrl = window.PathUtils.toFileUrl(fullLocalPath);
      this.setBackgroundImage(fileUrl);
      
      // 返回本地路径供保存到时间线
      return localPath;
    } catch (error) {
      console.warn('生成背景图像失败:', error);
      // 设置默认背景
      this.setDefaultBackground();
      return null;
    }
  }

  /**
   * 设置背景图像
   * @param {string} imageUrl - 图像URL
   */
  setBackgroundImage(imageUrl) {
    const background = document.getElementById('game-background');
    if (background && imageUrl) {
  // 不清空当前背景，轻微降不透明度作为加载提示
  background.style.opacity = '0.6';
      
      // 创建图像对象预加载
      const img = new Image();
      img.onload = () => {
        // 图像加载完成后再替换背景，避免空白
        background.style.backgroundImage = `url(${imageUrl})`;
        background.style.opacity = '0';
        setTimeout(() => {
          background.style.transition = 'opacity 0.8s ease';
          background.style.opacity = '1';
        }, 20);
      };
      
      img.onerror = () => {
  // 加载失败，保持当前背景
        console.warn('背景图像加载失败:', imageUrl);
        background.style.opacity = '1';
      };
      
      // 开始加载图像
      img.src = imageUrl;
    }
  }

  /**
   * 设置默认背景
   */
  setDefaultBackground() {
    const background = document.getElementById('game-background');
    if (background) {
  // 设置主题渐变背景作为默认
  background.style.backgroundImage = 'var(--gradient-primary)';
    }
  }

  /**
   * 显示加载覆盖层
   * @param {string} text - 加载文本
   * @param {string} stage - 当前阶段
   */
  showLoadingOverlay(text, stage, onRetry = null, abortController = null) {
    // 使用科幻霓虹加载器
    if (window.Loader) {
      window.Loader.show(onRetry, abortController);
      window.Loader.setProgress(0);
      window.Loader.setStage(stage || '准备中');
    }
    // 场景转场
    const trans = document.getElementById('scene-transition');
    if (trans) { trans.classList.remove('hidden'); trans.classList.add('active'); setTimeout(()=>trans.classList.remove('active'), 400); }
  }

  /**
   * 更新加载阶段
   * @param {string} stage - 新阶段
   */
  updateLoadingStage(stage) {
    // 可在不同阶段更新大致进度（示例：文本阶段30%，图像阶段80%）
    if (window.Loader) {
  const p = stage && stage.includes('下载') ? 90 : (stage && stage.includes('图像') ? 80 : 30);
      window.Loader.setProgress(p);
  window.Loader.setStage(stage || '处理中');
    }
  }

  /**
   * 隐藏加载覆盖层
   */
  hideLoadingOverlay() {
    if (window.Loader) {
      window.Loader.setProgress(100);
      window.Loader.hide();
    }
  const trans = document.getElementById('scene-transition');
  if (trans) { setTimeout(()=>trans.classList.add('hidden'), 450); }
  }

  /**
   * 处理自定义动作
   * @param {Object} choice - 选择对象
   */
  async handleCustomAction(choice) {
    // 这里可以处理其他类型的选择，如：
    // - 查看物品
    // - 角色互动
    // - 场景切换等
    
    console.log('处理自定义动作:', choice);
    
    // 默认行为：继续故事
    await this.generateNextContent(choice.text);
  }

  /**
   * 暂停游戏
   */
  pauseGame() {
    this.gameState = 'paused';
    // 可以显示暂停菜单
    Utils.showNotification('游戏已暂停，按ESC继续', 'info', 2000);
    
    setTimeout(() => {
      if (this.gameState === 'paused') {
        this.gameState = 'playing';
      }
    }, 2000);
  }

  /**
   * 结束游戏
   */
  endGame() {
    this.gameState = 'menu';
    Utils.showNotification('游戏结束', 'info');
    this.exitGame();
  }

  /**
   * 退出游戏回到主菜单
   */
  exitGame() {
    // 清理游戏状态
    this.gameState = 'menu';
    this.currentProject = null;
    this.currentTimeline = null;
    this.currentChoices = [];
    this.selectedChoiceIndex = -1;
    this.isWaitingForChoice = false;
    this.isGenerating = false;

    // 隐藏加载界面
    this.hideLoadingOverlay();

    // 隐藏时间线面板
    window.timeline.hide();

    // 切换到主界面
    this.switchToMainScreen();

    // 重新加载项目列表
    window.projectManager.loadProjects().then(() => {
      if (window.renderProjectsList) {
        window.renderProjectsList();
      }
    });
  }

  /**
   * 切换到游戏界面
   */
  switchToGameScreen() {
    const mainScreen = document.getElementById('main-screen');
    const gameScreen = document.getElementById('game-screen');

    if (mainScreen) mainScreen.classList.remove('active');
    if (gameScreen) gameScreen.classList.add('active');
  }

  /**
   * 切换到主界面
   */
  switchToMainScreen() {
    const mainScreen = document.getElementById('main-screen');
    const gameScreen = document.getElementById('game-screen');

    if (gameScreen) gameScreen.classList.remove('active');
    if (mainScreen) mainScreen.classList.add('active');
  }

  /**
   * 检查游戏是否活跃
   */
  isGameActive() {
    return this.gameState === 'playing';
  }

  /**
   * 获取游戏状态
   */
  getGameState() {
    return {
      state: this.gameState,
      project: this.currentProject?.name || null,
      isGenerating: this.isGenerating,
      isWaitingForChoice: this.isWaitingForChoice,
      choicesCount: this.currentChoices.length
    };
  }

  /**
   * 销毁游戏引擎
   */
  destroy() {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler, true);
    }
    
    this.exitGame();
  }
}

// 创建全局游戏引擎实例
window.gameEngine = new GameEngine();
